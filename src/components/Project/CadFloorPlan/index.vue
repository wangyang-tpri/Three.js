<script setup lang="ts">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { highlightCode } from '../../../utils/codeHighlight';

const containerRef = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let resizeObserver: ResizeObserver | null = null;
let floorGroup: THREE.Object3D | null = null;

type Feature = '2d' | '3d' | 'upload';
const activeFeature = ref<Feature>('2d');
const uploading = ref(false);
const loadProgress = ref(0);
const error = ref('');
const dxfInfo = ref<{ name: string; walls: number } | null>(null);

type Wall = [[number, number], [number, number]];

/* ================= 内置示例户型（模拟 CAD 解析后的墙体线段） ================= */
const SAMPLE_WALLS: Wall[] = [
  [
    [0, 0],
    [10, 0],
  ],
  [
    [10, 0],
    [10, 8],
  ],
  [
    [10, 8],
    [0, 8],
  ],
  [
    [0, 8],
    [0, 0],
  ],
  [
    [5, 0],
    [5, 4],
  ],
  [
    [5, 4],
    [10, 4],
  ],
  [
    [0, 5],
    [3, 5],
  ],
  [
    [3, 5],
    [3, 8],
  ],
];

/* ================= 轻量 DXF 解析器 ================= */
function parseDXF(text: string): Wall[] {
  const rawLines = text.split(/\r?\n/);
  const tokens: { code: string; value: string }[] = [];
  for (let i = 0; i < rawLines.length - 1; i += 2) {
    tokens.push({ code: rawLines[i]!.trim(), value: rawLines[i + 1]?.trim() ?? '' });
  }

  const walls: Wall[] = [];
  let idx = 0;
  const peek = () => tokens[idx];
  const next = () => tokens[idx++];

  // 定位 ENTITIES 段
  while (idx < tokens.length) {
    const t = next();
    if (!t) break;
    if (t.code === '0' && t.value === 'SECTION') {
      const t2 = next();
      if (t2 && t2.code === '2' && t2.value === 'ENTITIES') break;
    }
  }

  // 解析实体
  while (idx < tokens.length) {
    const t = peek();
    if (!t) break;
    if (t.code === '0' && t.value === 'ENDSEC') break;
    if (t.code === '0') {
      const type = t.value;
      idx++;
      // 收集该实体的所有组码
      const entityTokens: { code: string; value: string }[] = [];
      while (idx < tokens.length) {
        const et = peek();
        if (!et || et.code === '0') break;
        entityTokens.push(next()!);
      }
      const get = (code: string) => entityTokens.find((e) => e.code === code)?.value;

      if (type === 'LINE') {
        const x1 = parseFloat(get('10') ?? '0');
        const y1 = parseFloat(get('20') ?? '0');
        const x2 = parseFloat(get('11') ?? '0');
        const y2 = parseFloat(get('21') ?? '0');
        walls.push([
          [x1, y1],
          [x2, y2],
        ]);
      } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
        const pts: [number, number][] = [];
        const closed = (parseInt(get('70') ?? '0') & 1) === 1;
        let curPt: [number, number] | null = null;
        for (const et of entityTokens) {
          if (et.code === '10') {
            curPt = [parseFloat(et.value), 0];
            pts.push(curPt);
          } else if (et.code === '20' && curPt) {
            curPt[1] = parseFloat(et.value);
          }
        }
        for (let i = 0; i < pts.length - 1; i++) walls.push([pts[i]!, pts[i + 1]!]);
        if (closed && pts.length > 2) walls.push([pts[pts.length - 1]!, pts[0]!]);
      } else if (type === 'CIRCLE') {
        const cx = parseFloat(get('10') ?? '0');
        const cy = parseFloat(get('20') ?? '0');
        const r = parseFloat(get('40') ?? '0');
        if (r > 0) {
          const segs = 32;
          for (let i = 0; i < segs; i++) {
            const a1 = (i / segs) * Math.PI * 2;
            const a2 = ((i + 1) / segs) * Math.PI * 2;
            walls.push([
              [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r],
              [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r],
            ]);
          }
        }
      } else if (type === 'ARC') {
        const cx = parseFloat(get('10') ?? '0');
        const cy = parseFloat(get('20') ?? '0');
        const r = parseFloat(get('40') ?? '0');
        const a1 = (parseFloat(get('50') ?? '0') * Math.PI) / 180;
        const a2 = (parseFloat(get('51') ?? '360') * Math.PI) / 180;
        if (r > 0) {
          const segs = 16;
          for (let i = 0; i < segs; i++) {
            const t1 = a1 + (a2 - a1) * (i / segs);
            const t2 = a1 + (a2 - a1) * ((i + 1) / segs);
            walls.push([
              [cx + Math.cos(t1) * r, cy + Math.sin(t1) * r],
              [cx + Math.cos(t2) * r, cy + Math.sin(t2) * r],
            ]);
          }
        }
      }
    } else {
      idx++;
    }
  }
  return walls;
}

/* ================= 坐标归一化（DXF 毫米单位 → 合理范围） ================= */
function normalizeWalls(walls: Wall[]): Wall[] {
  if (walls.length === 0) return walls;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [p1, p2] of walls) {
    minX = Math.min(minX, p1[0], p2[0]);
    minY = Math.min(minY, p1[1], p2[1]);
    maxX = Math.max(maxX, p1[0], p2[0]);
    maxY = Math.max(maxY, p1[1], p2[1]);
  }
  const maxDim = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = 10 / maxDim;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return walls.map(([p1, p2]) => [
    [(p1[0] - cx) * scale, (p1[1] - cy) * scale],
    [(p2[0] - cx) * scale, (p2[1] - cy) * scale],
  ]);
}

/* ================= 2D 线框 ================= */
function wallsTo2D(walls: Wall[]): THREE.LineSegments {
  const pts: THREE.Vector3[] = [];
  for (const [p1, p2] of walls) {
    pts.push(new THREE.Vector3(p1[0], 0.02, p1[1]));
    pts.push(new THREE.Vector3(p2[0], 0.02, p2[1]));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x2563eb }));
}

/* ================= 3D 墙体（线段 → Box 拉伸） ================= */
function wallsTo3D(walls: Wall[], height = 2.8, thickness = 0.24): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.85 });
  for (const [p1, p2] of walls) {
    const dx = p2[0] - p1[0];
    const dz = p2[1] - p1[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, height, thickness), mat);
    mesh.position.set((p1[0] + p2[0]) / 2, height / 2, (p1[1] + p2[1]) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/* ================= 场景初始化 ================= */
function initScene() {
  const container = containerRef.value;
  if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);

  camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(8, 10, 12);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.update();

  const grid = new THREE.GridHelper(20, 20, 0xcbd5e1, 0xe2e8f0);
  scene.add(grid);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(10, 15, 8);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  scene.add(dir);

  renderer.setAnimationLoop(() => {
    controls?.update();
    renderer?.render(scene!, camera!);
  });

  resizeObserver = new ResizeObserver(() => {
    if (!container || !camera || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(container);
}

/* ================= 相机适配到户型 ================= */
function fitCameraToObject(obj: THREE.Object3D) {
  if (!camera || !controls) return;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, 1);
  camera.position.set(center.x + maxDim * 0.9, maxDim * 1.3, center.z + maxDim * 0.9);
  controls.target.copy(center);
  controls.update();
}

/* ================= 显示户型 ================= */
function showFloorPlan(walls: Wall[], mode: '2d' | '3d', name: string) {
  clearFloor();
  const normalized = normalizeWalls(walls);
  const group = new THREE.Group();

  if (mode === '2d') {
    group.add(wallsTo2D(normalized));
  } else {
    group.add(wallsTo3D(normalized));
    // 动态地板
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [p1, p2] of normalized) {
      minX = Math.min(minX, p1[0], p2[0]);
      minY = Math.min(minY, p1[1], p2[1]);
      maxX = Math.max(maxX, p1[0], p2[0]);
      maxY = Math.max(maxY, p1[1], p2[1]);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX + 2, maxY - minY + 2),
      new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((minX + maxX) / 2, 0, (minY + maxY) / 2);
    floor.receiveShadow = true;
    group.add(floor);
  }

  floorGroup = group;
  scene!.add(group);
  fitCameraToObject(group);
  dxfInfo.value = { name, walls: normalized.length };
}

function clearFloor() {
  if (floorGroup && scene) scene.remove(floorGroup);
  floorGroup = null;
}

/* ================= 按钮功能 ================= */
function showSample2D() {
  activeFeature.value = '2d';
  error.value = '';
  showFloorPlan(SAMPLE_WALLS, '2d', '示例户型');
}

function showSample3D() {
  activeFeature.value = '3d';
  error.value = '';
  showFloorPlan(SAMPLE_WALLS, '3d', '示例户型');
}

function triggerUpload() {
  fileInputRef.value?.click();
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'dxf') {
    error.value = '请选择 .dxf 格式的 CAD 图纸文件';
    dxfInfo.value = null;
    return;
  }

  activeFeature.value = 'upload';
  error.value = '';
  uploading.value = true;
  loadProgress.value = 0;

  try {
    const text = await file.text();
    loadProgress.value = 40;
    const walls = parseDXF(text);
    loadProgress.value = 80;
    if (walls.length === 0) {
      error.value = '未解析到有效图形实体（支持 LINE / LWPOLYLINE / CIRCLE / ARC）';
      dxfInfo.value = null;
      clearFloor();
    } else {
      showFloorPlan(walls, '2d', file.name);
    }
    loadProgress.value = 100;
  } catch (err) {
    error.value = `解析失败：${(err as Error)?.message ?? String(err)}`;
    dxfInfo.value = null;
    console.error(err);
  }
  uploading.value = false;
}

function resetAll() {
  clearFloor();
  dxfInfo.value = null;
  error.value = '';
  activeFeature.value = '2d';
}

/* ================= 代码与讲解（函数式动态生成） ================= */
const codeMap: Record<Feature, () => string> = {
  '2d': () => `// ① CAD 图纸解析为 2D 线框
const walls = parseDXF(dxfText)   // 提取 LINE / LWPOLYLINE / CIRCLE / ARC
const pts = []
for (const [p1, p2] of walls) {
  pts.push(new THREE.Vector3(p1[0], 0, p1[1]))
  pts.push(new THREE.Vector3(p2[0], 0, p2[1]))
}
const geo = new THREE.BufferGeometry().setFromPoints(pts)
scene.add(new THREE.LineSegments(geo,
  new THREE.LineBasicMaterial({ color: 0x2563eb })))`,
  '3d': () => `// ② 2D 线框转换为 3D 墙体场景
for (const [p1, p2] of walls) {
  const dx = p2[0] - p1[0], dz = p2[1] - p1[1]
  const len = Math.hypot(dx, dz)
  // 每段线 → 一个 Box（长 × 层高 × 墙厚）
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(len, 2.8, 0.24),
    wallMaterial
  )
  mesh.position.set((p1[0]+p2[0])/2, 1.4, (p1[1]+p2[1])/2)
  mesh.rotation.y = -Math.atan2(dz, dx)   // 沿线段方向
  scene.add(mesh)
}`,
  upload: () => `// ③ 上传 DXF 文件解析
const text = await file.text()
const walls = parseDXF(text)   // 轻量 DXF 解析器
// walls: [[[x1,y1],[x2,y2]], ...]
showFloorPlan(walls, '2d', file.name)`,
};

const explainMap: Record<Feature, () => string> = {
  '2d': () =>
    `【原理】CAD 图纸（DXF 格式）本质是文本文件，由"组码 + 值"对描述图形实体。\n【解析】提取 LINE（直线）、LWPOLYLINE（多段线）、CIRCLE（圆）、ARC（圆弧）的顶点，转为统一线段列表。\n【渲染】在 XZ 平面用 LineSegments 绘制所有线段，还原 CAD 图纸的 2D 线框。\n【归一化】DXF 常用毫米单位，自动平移+缩放到合理范围。\n${infoLine()}`,
  '3d': () =>
    `【原理】将 2D 线段逐段"拉伸"为 3D 墙体：每段线段对应一个 BoxGeometry（长度 × 层高 2.8m × 墙厚 0.24m）。\n【关键】计算线段长度 len=√(dx²+dz²)，中点定位，rotation.y = -atan2(dz,dx) 使 Box 沿线段方向。\n【场景】墙体 + 动态地板（PlaneGeometry）+ 平行光阴影，构成可漫游的三维户型。\n${infoLine()}`,
  upload: () =>
    `【原理】用户上传 .dxf 文件，用 file.text() 读取文本，交给轻量 DXF 解析器提取图形实体。\n【解析器】支持 LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC，输出统一的线段列表。\n【限制】复杂 DXF（块引用 INSERT、标注、填充 HATCH）可能解析不全，建议用仅含墙体的简单图层测试。\n${infoLine()}`,
};

function infoLine() {
  if (uploading.value) return '【状态】正在解析 DXF 文件…';
  if (error.value) return `【状态】${error.value}`;
  if (!dxfInfo.value) return '【状态】点击按钮查看示例户型，或上传 DXF 文件';
  const mode = activeFeature.value === '3d' ? '3D 墙体' : '2D 线框';
  return `【当前】${dxfInfo.value.name}｜墙体线段 ${dxfInfo.value.walls} 段｜模式 ${mode}`;
}

const code = computed(() => highlightCode(codeMap[activeFeature.value]()));
const explanation = computed(() => explainMap[activeFeature.value]());

/* ================= 生命周期 ================= */
onMounted(() => {
  initScene();
  showSample2D();
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  controls?.dispose();
  controls = null;
  renderer?.setAnimationLoop(null);
  renderer?.dispose();
  renderer?.domElement.remove();
  clearFloor();
  renderer = null;
  scene = null;
  camera = null;
});
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <!-- 功能按钮区 -->
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === '2d' ? 'primary' : 'default'"
        @click="showSample2D"
      >
        示例户型（2D）
      </n-button>
      <n-button
        size="small"
        :type="activeFeature === '3d' ? 'primary' : 'default'"
        @click="showSample3D"
      >
        转换 3D 场景
      </n-button>
      <n-button
        size="small"
        :type="activeFeature === 'upload' ? 'primary' : 'default'"
        @click="triggerUpload"
      >
        上传 DXF
      </n-button>
      <n-button size="small" quaternary @click="resetAll">重置</n-button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".dxf"
        class="hidden"
        @change="handleFileChange"
      />
    </div>

    <!-- 主体：左 3D 场景 / 右 代码+讲解 -->
    <div class="flex min-h-0 flex-1 gap-3">
      <div
        ref="containerRef"
        class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm"
      ></div>

      <div
        class="flex w-[420px] shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <div
          class="border-b border-l-[3px] border-l-solid border-l-green-500 border-gray-100 py-2 pl-3 pr-4 text-sm font-semibold text-gray-600"
        >
          {{ activeFeature === '2d' ? '2D 线框' : activeFeature === '3d' ? '3D 转换' : 'DXF 上传' }}
          · 示例代码
        </div>
        <pre
          class="m-0 flex-1 overflow-auto bg-gray-50 p-4 text-[13px] leading-relaxed"
        ><code v-html="code"></code></pre>
        <div
          class="max-h-[46%] overflow-auto border-t border-gray-100 px-4 py-3 text-[13px] leading-relaxed text-gray-600"
        >
          <div class="mb-1 text-xs font-semibold text-gray-400">原理讲解</div>
          <div class="whitespace-pre-wrap">{{ explanation }}</div>
        </div>
      </div>
    </div>

    <!-- 加载进度条（屏幕正中间，宽度 400px） -->
    <div
      v-if="uploading"
      class="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white/95 p-5 shadow-xl"
    >
      <div class="mb-2 text-center text-sm font-medium text-gray-700">正在解析 DXF 文件…</div>
      <n-progress
        type="line"
        :percentage="loadProgress"
        :show-indicator="true"
        :processing="uploading"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.c-code-comment) {
  color: #9ca3af;
  font-style: italic;
}
:deep(.c-code-string) {
  color: #d97706;
}
:deep(.c-code-num) {
  color: #2563eb;
}
:deep(.c-code-keyword) {
  color: #7c3aed;
  font-weight: 600;
}
:deep(.c-code-class) {
  color: #0891b2;
}
:deep(.c-code-camera) {
  color: #db2777;
  font-weight: 600;
}
</style>
