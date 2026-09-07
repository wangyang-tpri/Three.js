<script setup lang="ts">
import * as THREE from 'three';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useThreeScene } from '@/hooks/useThreeScene';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

const containerRef = ref<HTMLDivElement | null>(null);

let mallGroup: THREE.Object3D | null = null;

type FloorKey = 'all' | '1F' | '2F' | '3F';
const activeFloor = ref<FloorKey>('all');
const exploded = ref(false);
interface FloorRef {
  root: THREE.Group;
  slab: THREE.Group;
  walls: THREE.Group;
  sprite: THREE.Sprite;
  spriteBaseY: number;
}
let floorRefs: FloorRef[] = [];
let explodeProgress = 0;
let explodeTarget = 0;
let explodeRaf = 0;
const EXPLODE_GAP = 2.8;

const { scene, camera, controls } = useThreeScene(containerRef, {
  background: 0xf5f7fa,
  camera: { fov: 55, near: 0.1, far: 1000, position: [18, 16, 22] },
  controls: { target: [0, 4.5, 0] },
  grid: { size: 30, divisions: 30 },
  axes: false,
  lights: { ambient: 0.65, directional: 1.1, dirPosition: [15, 25, 12] },
  shadow: { enabled: true, mapSize: 2048, cameraBounds: 25 },
  onDispose: () => {
    if (explodeRaf) cancelAnimationFrame(explodeRaf);
    explodeRaf = 0;
    floorRefs = [];
    mallGroup = null;
  },
});

type Wall = [[number, number], [number, number]];

interface FloorData {
  name: string;
  label: string;
  slabColor: number;
  walls: Wall[];
}

/* ================= 商场多楼层平面图数据（模拟每层 CAD 图纸） ================= */
const FLOORS: FloorData[] = [
  {
    name: '1F',
    label: '一层 · 大堂商铺',
    slabColor: 0xe8f5e9,
    walls: [
      // 外墙 20×15
      [
        [-10, -7.5],
        [10, -7.5],
      ],
      [
        [10, -7.5],
        [10, 7.5],
      ],
      [
        [10, 7.5],
        [-10, 7.5],
      ],
      [
        [-10, 7.5],
        [-10, -7.5],
      ],
      // 横向主走廊
      [
        [-10, 0],
        [10, 0],
      ],
      // 北侧店铺分隔
      [
        [-6, 0],
        [-6, 7.5],
      ],
      [
        [0, 0],
        [0, 7.5],
      ],
      [
        [6, 0],
        [6, 7.5],
      ],
      // 南侧店铺分隔
      [
        [-6, -7.5],
        [-6, 0],
      ],
      [
        [0, -7.5],
        [0, 0],
      ],
      [
        [6, -7.5],
        [6, 0],
      ],
    ],
  },
  {
    name: '2F',
    label: '二层 · 餐饮美食',
    slabColor: 0xfff3e0,
    walls: [
      [
        [-10, -7.5],
        [10, -7.5],
      ],
      [
        [10, -7.5],
        [10, 7.5],
      ],
      [
        [10, 7.5],
        [-10, 7.5],
      ],
      [
        [-10, 7.5],
        [-10, -7.5],
      ],
      // 中央美食广场
      [
        [-5, -3],
        [5, -3],
      ],
      [
        [5, -3],
        [5, 3],
      ],
      [
        [5, 3],
        [-5, 3],
      ],
      [
        [-5, 3],
        [-5, -3],
      ],
      // 周边餐厅
      [
        [-7.5, -7.5],
        [-7.5, -3],
      ],
      [
        [-2.5, -7.5],
        [-2.5, -3],
      ],
      [
        [2.5, -7.5],
        [2.5, -3],
      ],
      [
        [7.5, -7.5],
        [7.5, -3],
      ],
      [
        [-7.5, 3],
        [-7.5, 7.5],
      ],
      [
        [-2.5, 3],
        [-2.5, 7.5],
      ],
      [
        [2.5, 3],
        [2.5, 7.5],
      ],
      [
        [7.5, 3],
        [7.5, 7.5],
      ],
    ],
  },
  {
    name: '3F',
    label: '三层 · 影院娱乐',
    slabColor: 0xe3f2fd,
    walls: [
      [
        [-10, -7.5],
        [10, -7.5],
      ],
      [
        [10, -7.5],
        [10, 7.5],
      ],
      [
        [10, 7.5],
        [-10, 7.5],
      ],
      [
        [-10, 7.5],
        [-10, -7.5],
      ],
      // 三个影厅
      [
        [-10, 2],
        [-3, 2],
      ],
      [
        [-3, 2],
        [-3, 7.5],
      ],
      [
        [-3, 2],
        [4, 2],
      ],
      [
        [4, 2],
        [4, 7.5],
      ],
      [
        [4, 2],
        [10, 2],
      ],
      // 下层娱乐区
      [
        [-10, -2],
        [-10, 2],
      ],
      [
        [0, -7.5],
        [0, -2],
      ],
      [
        [-5, -7.5],
        [-5, -2],
      ],
      [
        [5, -7.5],
        [5, -2],
      ],
    ],
  },
];

const FLOOR_HEIGHT = 3;

/* ================= 构建商场三维场景 ================= */
function buildMall(floorKey: FloorKey) {
  clearMall();
  floorRefs = [];
  const group = new THREE.Group();
  const floors = floorKey === 'all' ? FLOORS : FLOORS.filter((f) => f.name === floorKey);

  for (const floor of floors) {
    const idx = FLOORS.indexOf(floor);
    const yBase = idx * FLOOR_HEIGHT;
    const fg = new THREE.Group();
    const slabG = new THREE.Group();
    const wallG = new THREE.Group();

    // 楼板
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(20.5, 0.15, 15.5),
      new THREE.MeshStandardMaterial({ color: floor.slabColor, roughness: 0.9 })
    );
    slab.position.y = yBase;
    slab.receiveShadow = true;
    slabG.add(slab);

    // 墙体
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.85 });
    for (const [p1, p2] of floor.walls) {
      const dx = p2[0] - p1[0];
      const dz = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.01) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, FLOOR_HEIGHT - 0.15, 0.2), wallMat);
      mesh.position.set((p1[0] + p2[0]) / 2, yBase + FLOOR_HEIGHT / 2, (p1[1] + p2[1]) / 2);
      mesh.rotation.y = -Math.atan2(dz, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wallG.add(mesh);
    }

    // 楼层标签（Sprite）
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(30, 64, 175, 0.85)';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(floor.name, 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    const spriteBaseY = yBase + FLOOR_HEIGHT + 0.6;
    sprite.position.set(0, spriteBaseY, 0);
    sprite.scale.set(2.2, 1.1, 1);

    fg.add(slabG);
    fg.add(wallG);
    fg.add(sprite);

    fg.position.y = idx * explodeProgress * EXPLODE_GAP;
    group.add(fg);
    floorRefs.push({ root: fg, slab: slabG, walls: wallG, sprite, spriteBaseY });
  }

  mallGroup = group;
  scene.value!.add(group);
  fitCamera(floorKey);
}

function fitCamera(floorKey: FloorKey) {
  const cam = camera.value;
  const ctl = controls.value;
  if (!cam || !ctl) return;
  if (floorKey === 'all') {
    cam.position.set(20, 18, 24);
    ctl.target.set(0, 4.5, 0);
  } else {
    const idx = FLOORS.findIndex((f) => f.name === floorKey);
    const yCenter = idx * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
    cam.position.set(15, 11, 17);
    ctl.target.set(0, yCenter, 0);
  }
  ctl.update();
}

function clearMall() {
  const s = scene.value;
  if (mallGroup && s) s.remove(mallGroup);
  mallGroup = null;
}

/* ================= 楼层爆炸动画 ================= */
function toggleExplode() {
  explodeTarget = explodeTarget === 0 ? 1 : 0;
  exploded.value = explodeTarget === 1;
  startExplodeAnimation();
}

function startExplodeAnimation() {
  if (explodeRaf) cancelAnimationFrame(explodeRaf);
  const start = explodeProgress;
  const end = explodeTarget;
  const duration = 800;
  const t0 = performance.now();
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (now: number) => {
    const t = Math.min((now - t0) / duration, 1);
    explodeProgress = start + (end - start) * ease(t);
    updateFloorPositions();
    if (t < 1) explodeRaf = requestAnimationFrame(step);
  };
  explodeRaf = requestAnimationFrame(step);
}

function updateFloorPositions() {
  const single = floorRefs.length === 1;
  floorRefs.forEach((ref, i) => {
    if (single) {
      // 单楼层：层内拆解——墙体上浮，楼板下沉，标签跟随
      ref.walls.position.y = explodeProgress * 2.5;
      ref.slab.position.y = -explodeProgress * 0.5;
      ref.sprite.position.y = ref.spriteBaseY + explodeProgress * 2.5;
      ref.root.position.y = 0;
    } else {
      // 多楼层：层间阶梯式分离
      ref.root.position.y = i * explodeProgress * EXPLODE_GAP;
      ref.walls.position.y = 0;
      ref.slab.position.y = 0;
      ref.sprite.position.y = ref.spriteBaseY;
    }
  });
}

function resetExplodeState() {
  if (explodeRaf) cancelAnimationFrame(explodeRaf);
  explodeRaf = 0;
  explodeTarget = 0;
  explodeProgress = 0;
  exploded.value = false;
}

/* ================= 楼层切换 ================= */
function selectFloor(key: FloorKey) {
  resetExplodeState();
  activeFloor.value = key;
  buildMall(key);
}

function resetAll() {
  resetExplodeState();
  activeFloor.value = 'all';
  buildMall('all');
}

/* ================= 代码与讲解（函数式动态生成） ================= */
const codeMap: Record<FloorKey, () => string> = {
  all: () => `// ① 多楼层数据 → 三维商场
const FLOORS = [
  { name: '1F', walls: [...], slabColor: 0xe8f5e9 },
  { name: '2F', walls: [...], slabColor: 0xfff3e0 },
  { name: '3F', walls: [...], slabColor: 0xe3f2fd },
]
for (let i = 0; i < FLOORS.length; i++) {
  const yBase = i * FLOOR_HEIGHT   // 每层 Y 偏移
  // 楼板 + 墙体 + 楼层标签
  scene.add(createSlab(yBase, FLOORS[i]))
  scene.add(createWalls(yBase, FLOORS[i].walls))
}`,
  '1F': () => `// ② 抽取指定楼层（以 1F 为例）
const floor = FLOORS.find(f => f.name === '1F')
const yBase = 0   // 1F 在底层
scene.add(createSlab(yBase, floor))
scene.add(createWalls(yBase, floor.walls))
// 相机适配到该层中心
controls.target.set(0, yBase + FLOOR_HEIGHT/2, 0)`,
  '2F': () => `// ② 抽取指定楼层（以 2F 为例）
const floor = FLOORS.find(f => f.name === '2F')
const yBase = 1 * FLOOR_HEIGHT   // 二层偏移
scene.add(createSlab(yBase, floor))
scene.add(createWalls(yBase, floor.walls))
controls.target.set(0, yBase + FLOOR_HEIGHT/2, 0)`,
  '3F': () => `// ② 抽取指定楼层（以 3F 为例）
const floor = FLOORS.find(f => f.name === '3F')
const yBase = 2 * FLOOR_HEIGHT   // 三层偏移
scene.add(createSlab(yBase, floor))
scene.add(createWalls(yBase, floor.walls))
controls.target.set(0, yBase + FLOOR_HEIGHT/2, 0)`,
};

const explainMap: Record<FloorKey, () => string> = {
  all: () =>
    `【原理】商场每层平面图（墙体线段）独立存储，按楼层索引计算 Y 轴偏移（每层高 3m），循环创建楼板+墙体+标签。\n【数据】FLOORS 数组：1F 大堂商铺、2F 餐饮美食、3F 影院娱乐，每层墙体布局不同。\n【渲染】楼板用 BoxGeometry（浅色区分楼层），墙体用 BoxGeometry 沿线段方向旋转，楼层标签用 CanvasTexture Sprite。\n【当前】显示全部 3 层，总高 9m。`,
  '1F': () =>
    `【原理】点击楼层按钮后，按 name 过滤 FLOORS 数组，只构建匹配楼层的 3D 对象，其他楼层不渲染——即"抽取"。\n【1F 布局】大堂 + 南北两侧商铺，中间横向走廊，6 个店铺单元。\n【相机】自动适配到一层中心（y=1.5），视角更近便于查看细节。\n【当前】仅显示 1F（一层 · 大堂商铺）。`,
  '2F': () =>
    `【原理】楼层抽取：FLOORS.filter(f => f.name === '2F')，只渲染二层，Y 偏移 = 1×3m。\n【2F 布局】中央美食广场（大空间）+ 周边 8 间独立餐厅，环形动线。\n【相机】适配到二层中心（y=4.5）。\n【当前】仅显示 2F（二层 · 餐饮美食）。`,
  '3F': () =>
    `【原理】楼层抽取：只构建 3F 对象，Y 偏移 = 2×3m，其他楼层从场景中移除。\n【3F 布局】北侧三个影厅（大房间）+ 南侧娱乐区（游戏/游乐），分区明确。\n【相机】适配到三层中心（y=7.5）。\n【当前】仅显示 3F（三层 · 影院娱乐）。`,
};

const panelTitle = computed(() => (activeFloor.value === 'all' ? '全部楼层' : activeFloor.value));

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFloor);

/* ================= 生命周期 ================= */
onMounted(() => {
  buildMall('all');
});
onBeforeUnmount(() => {
  if (explodeRaf) cancelAnimationFrame(explodeRaf);
  explodeRaf = 0;
  clearMall();
});
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <!-- 顶部功能按钮区 -->
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFloor === 'all' ? 'primary' : 'default'"
        @click="selectFloor('all')"
      >
        全部楼层
      </n-button>
      <n-button size="small" :type="exploded ? 'warning' : 'default'" @click="toggleExplode">
        {{ exploded ? '合拢楼层' : '楼层爆炸' }}
      </n-button>
      <n-button size="small" quaternary @click="resetAll">重置</n-button>
      <span class="ml-2 text-xs text-gray-400">点击场景左侧楼层按钮可抽取对应楼层</span>
    </div>

    <!-- 主体：左 3D 场景（含楼层按钮） / 右 代码+讲解 -->
    <div class="flex min-h-0 flex-1 gap-3">
      <div
        ref="containerRef"
        class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm"
      >
        <!-- 场景左侧：楼层抽取按钮 -->
        <div class="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
          <n-button
            v-for="floor in FLOORS"
            :key="floor.name"
            size="small"
            :type="activeFloor === floor.name ? 'primary' : 'default'"
            @click="selectFloor(floor.name as FloorKey)"
          >
            {{ floor.name }}
          </n-button>
        </div>
      </div>

      <CodePanel :title="panelTitle" :code="code" :explanation="explanation" />
    </div>
  </div>
</template>
