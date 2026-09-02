<script setup lang="ts">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { highlightCode } from '../../../utils/codeHighlight';

/* ================= 状态 ================= */
const containerRef = ref<HTMLDivElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
let controls: OrbitControls | null = null;
let resizeObserver: ResizeObserver | null = null;

// 演示场景里的辅助物体（用于裁剪/透视对比）
let farBall: THREE.Mesh | null = null;
let cube: THREE.Mesh | null = null;

// 相机动画（位置/朝向/fov 平滑过渡）
let anim: {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startFov: number;
  endFov: number;
  t: number;
  duration: number;
} | null = null;
let lastTime = 0;

// 各功能子状态
const activeFeature = ref('perspective'); // 当前展示的功能
const fovIndex = ref(0); // 0:50° 1:100° 2:20°
const posIndex = ref(0); // 0:正面 1:俯视 2:侧面
const clipIndex = ref(0); // 0:正常 1:far=4 2:near=7
const rotateOn = ref(false); // 环绕开关

const FOV_VALUES = [50, 100, 20];
const FOV_LABELS = ['标准 50°', '广角 100°', '长焦 20°'];
const POS_SETUPS = [
  { label: '正面', pos: [3, 2, 5] },
  { label: '俯视', pos: [0, 6, 4] },
  { label: '侧面', pos: [4, 1.5, 1] },
];
const CLIP_LABELS = ['正常 near 0.1 / far 100', 'far=6.5（远处球被裁）', 'near=4（近处方块被裁）'];

/* ================= 工具函数 ================= */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** 相机平滑过渡到目标状态 */
function animateCameraTo(opts: {
  pos?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  duration?: number;
}) {
  if (!camera || !controls) return;
  const duration = opts.duration ?? 900;
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startFov =
    camera instanceof THREE.PerspectiveCamera ? camera.fov : (FOV_VALUES[fovIndex.value] ?? 50);
  anim = {
    startPos,
    endPos: new THREE.Vector3(...(opts.pos ?? [startPos.x, startPos.y, startPos.z])),
    startTarget,
    endTarget: new THREE.Vector3(...(opts.target ?? [startTarget.x, startTarget.y, startTarget.z])),
    startFov,
    endFov: opts.fov ?? startFov,
    t: 0,
    duration,
  };
  if (controls) controls.enabled = false; // 动画期间禁用手动拖拽
}

/* ================= 场景初始化 ================= */
function initScene() {
  const container = containerRef.value;
  if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

  // 场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);

  // 相机：默认透视 50°
  camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(3, 2, 5);
  camera.lookAt(0, 0.5, 0);

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // 轨道控制器（保留鼠标交互，便于自由观察）
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.5, 0);
  controls.update();

  // ---- 场景内容：便于对比相机特性 ----
  // 地面网格
  const grid = new THREE.GridHelper(12, 12, 0xbfc6d4, 0xe2e6ee);
  scene.add(grid);
  // 坐标轴
  const axes = new THREE.AxesHelper(2);
  scene.add(axes);

  // 中央立方体（近处）
  cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4a9eff })
  );
  cube.position.y = 0.5;
  scene.add(cube);

  // 远处的橙色球（距离相机约 8.6，用于 far 裁剪演示）
  farBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xff9f43 })
  );
  farBall.position.set(0, 1.5, -3);
  scene.add(farBall);

  // 近处绿色小方块（距离相机约 3.1，用于 near 裁剪演示）
  const nearBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2ed573 })
  );
  nearBox.position.set(1.5, 1, 2.5);
  scene.add(nearBox);

  // 灯光
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // 渲染循环
  renderer.setAnimationLoop((time: number) => {
    const delta = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;

    // 相机动画插值
    if (anim && camera && controls) {
      anim.t += delta;
      const k = easeInOutCubic(Math.min(anim.t / anim.duration, 1));
      camera.position.lerpVectors(anim.startPos, anim.endPos, k);
      controls.target.lerpVectors(anim.startTarget, anim.endTarget, k);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = lerp(anim.startFov, anim.endFov, k);
        camera.updateProjectionMatrix();
      }
      controls.update();
      if (anim.t >= anim.duration) {
        anim = null;
        if (controls) controls.enabled = true;
      }
    }

    controls?.update();
    renderer?.render(scene!, camera!);
  });

  // 窗口尺寸同步
  resizeObserver = new ResizeObserver(() => {
    if (!container || !camera || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    } else if (camera instanceof THREE.OrthographicCamera) {
      const aspect = w / h;
      camera.left = (-3 * aspect) / 2;
      camera.right = (3 * aspect) / 2;
      camera.top = 1.5;
      camera.bottom = -1.5;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);
}

/* ================= 各功能按钮的 apply ================= */

// 1. 透视相机（完整重置回默认透视视角：位置/朝向/fov/裁剪/环绕全还原）
function applyPerspective() {
  posIndex.value = 0;
  fovIndex.value = 0;
  clipIndex.value = 0;
  rotateOn.value = false;
  activeFeature.value = 'perspective';
  if (controls) controls.autoRotate = false; // 关闭自动环绕，避免场景持续自转
  switchToPerspective(true);
}

function switchToPerspective(animate = true) {
  if (!camera || !controls || !scene || !renderer) return;
  const aspect =
    camera instanceof THREE.PerspectiveCamera
      ? camera.aspect
      : (renderer.domElement.clientWidth || 1) / (renderer.domElement.clientHeight || 1);
  const newCam = new THREE.PerspectiveCamera(FOV_VALUES[fovIndex.value], aspect, 0.1, 100);
  newCam.position.copy(camera.position);
  controls.object = newCam;
  camera = newCam;
  if (animate) {
    animateCameraTo({
      pos: [3, 2, 5],
      target: [0, 0.5, 0],
      fov: FOV_VALUES[fovIndex.value],
    });
  }
}

// 2. 正交相机
function applyOrthographic() {
  activeFeature.value = 'orthographic';
  if (!camera || !controls || !scene || !renderer) return;
  const aspect = (renderer.domElement.clientWidth || 1) / (renderer.domElement.clientHeight || 1);
  const newCam = new THREE.OrthographicCamera(
    (-3 * aspect) / 2,
    (3 * aspect) / 2,
    1.5,
    -1.5,
    0.1,
    100
  );
  newCam.position.copy(camera.position);
  newCam.lookAt(controls.target);
  controls.object = newCam;
  camera = newCam;
  anim = null; // 中断可能存在的透视动画
  if (controls) controls.enabled = true;
}

// 3. 相机位置（循环切换视角）
function applyPosition() {
  posIndex.value = (posIndex.value + 1) % POS_SETUPS.length;
  activeFeature.value = 'position';
  const s = POS_SETUPS[posIndex.value]!;
  animateCameraTo({
    pos: s.pos as [number, number, number],
    target: [0, 0.5, 0],
    fov: camera instanceof THREE.PerspectiveCamera ? FOV_VALUES[fovIndex.value] : undefined,
  });
}

// 4. 视野角度（循环切换 fov）
function applyFov() {
  fovIndex.value = (fovIndex.value + 1) % FOV_VALUES.length;
  activeFeature.value = 'fov';
  // 确保是透视相机
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    switchToPerspective(false);
  }
  animateCameraTo({ fov: FOV_VALUES[fovIndex.value] });
}

// 5. 远近裁剪（循环切换，near/far 由 three.js 自动裁剪）
function applyClip() {
  clipIndex.value = (clipIndex.value + 1) % CLIP_LABELS.length;
  activeFeature.value = 'clip';
  if (!camera) return;
  switch (clipIndex.value) {
    case 0: // 正常
      camera.near = 0.1;
      camera.far = 100;
      break;
    case 1: // far = 6.5：远球(≈8.6)被裁，近处保留
      camera.near = 0.1;
      camera.far = 6.5;
      break;
    case 2: // near = 4：近方块(≈3.1)被裁
      camera.near = 4;
      camera.far = 100;
      break;
  }
  camera.updateProjectionMatrix();
}

// 6. 环绕旋转（开关）
function applyRotate() {
  rotateOn.value = !rotateOn.value;
  activeFeature.value = 'rotate';
  if (controls) controls.autoRotate = rotateOn.value;
}

// 重置
function applyReset() {
  posIndex.value = 0;
  fovIndex.value = 0;
  clipIndex.value = 0;
  rotateOn.value = false;
  activeFeature.value = 'perspective';
  if (controls) controls.autoRotate = false;
  switchToPerspective(true);
}

/* ================= 代码与讲解（动态生成，代入当前档位） ================= */

const codeMap: Record<string, () => string> = {
  perspective: () => `// ① 透视相机：模拟人眼，近大远小
const camera = new THREE.PerspectiveCamera(
  ${FOV_VALUES[fovIndex.value]},       // fov    垂直视野角度(度)
  width / height,      // aspect 画布宽高比
  0.1,                 // near   近裁剪面
  100                  // far    远裁剪面
)
camera.position.set(3, 2, 5)   // 相机位置
camera.lookAt(0, 0.5, 0)       // 看向目标`,

  orthographic: () => `// ② 正交相机：平行投影，无近大远小
const camera = new THREE.OrthographicCamera(
  -3 * aspect / 2,  // left   左边界(世界单位)
   3 * aspect / 2,  // right  右边界
   1.5,             // top    上边界
  -1.5,             // bottom 下边界
  0.1,              // near
  100               // far
)
// 物体大小不随距离变化，适合 2D/图纸/俯视图`,

  position: () => {
    const s = POS_SETUPS[posIndex.value]!;
    return `// ③ 相机位置 + 朝向：决定从哪个角度看
camera.position.set(${s.pos.join(', ')})  // ${s.label}视角
camera.lookAt(0, 0.5, 0)                  // 始终看向目标点
// position → 观察点；lookAt → 观察方向`;
  },

  fov: () => `// ④ 视野角度 fov（当前 ${FOV_LABELS[fovIndex.value]}）
camera.fov = ${FOV_VALUES[fovIndex.value]}  // ${FOV_LABELS[fovIndex.value]}
camera.updateProjectionMatrix()
// ★ fov 越大视野越宽、物体越小（广角）
// ★ fov 越小越像长焦、物体被拉近放大
// ★ 修改后必须调用 updateProjectionMatrix()！`,

  clip: () => {
    const s =
      clipIndex.value === 0
        ? `camera.near = 0.1
camera.far  = 100`
        : clipIndex.value === 1
          ? `camera.far = 6.5   // 远处橙色球(距离≈8.6)超出 far → 被裁剪`
          : `camera.near = 4    // 近处绿色方块(距离≈3.1)小于 near → 被裁剪`;
    return `// ⑤ 远近裁剪面 near / far
// 相机只渲染距离在 [near, far] 之间的物体
${s}
camera.updateProjectionMatrix()
// ★ 修改后必须调用 updateProjectionMatrix()！`;
  },

  rotate: () => `// ⑥ 轨道控制器：环绕观察
const controls = new OrbitControls(camera, renderer.domElement)
controls.autoRotate = ${rotateOn.value}   // 自动环绕旋转
controls.enableDamping = true   // 阻尼惯性
controls.update()              // ★ 渲染循环中每帧调用`,
};

const explainMap: Record<string, () => string> = {
  perspective:
    () => `【原理】透视相机模拟人眼，遵循“近大远小”：离相机越远的物体在画面中越小。这是 3D 场景最常用的相机。

【参数】
• fov：垂直视野角度（度）。越大视野越宽、物体越小；越小越像长焦。
• aspect：画布宽高比（宽/高）。不对会被拉伸。
• near / far：近/远裁剪面，只渲染该范围内的物体。

【要点】修改 fov / near / far 后必须调用 updateProjectionMatrix() 重算投影矩阵，否则不生效。`,

  orthographic:
    () => `【原理】正交相机采用平行投影，物体大小与距离无关，没有“近大远小”，画面更像工程图纸 / CAD 视图。

【对比】看画面中近处立方体与远处橙色球——正交相机下二者一样大，透视相机下近大远小。

【参数】left / right / top / bottom 是世界单位的取景范围；near / far 是裁剪面。

【适用】2D 游戏、UI、俯视图、需要精确比例的图纸。`,

  position:
    () => `【原理】camera.position 是相机在世界坐标中的位置 (x, y, z)，决定“从哪个角度看”；camera.lookAt() 决定“看向哪个点”。

【当前视角】${POS_SETUPS[posIndex.value]!.label}：(${POS_SETUPS[posIndex.value]!.pos.join(', ')})
点击按钮依次切换 正面 → 俯视 → 侧面，观察同一个场景在不同角度下的画面。

【要点】position 只管位置，lookAt 管朝向，二者共同决定视角。`,
  fov: () => `【原理】fov 是透视相机的垂直视野角度：
• 越大 → 视野越开阔、容纳更多场景，物体显得更小（广角镜头）。
• 越小 → 视野越窄、物体被拉近放大（长焦 / 望远镜）。

【当前】${FOV_LABELS[fovIndex.value]}，点击按钮循环切换，观察立方体大小变化。

【要点】修改 fov 后必须调用 camera.updateProjectionMatrix()！`,

  clip: () => `【原理】相机只渲染距离在 [near, far] 区间内的物体，区间外的被“裁剪掉”：
• far 太小 → 远处的物体消失（当前 far=6.5，远处橙色球距离≈8.6 被裁掉，近处保留）。
• near 太大 → 近处的物体消失（当前 near=4，近处绿色方块距离≈3.1 被裁掉，远处保留）。

【当前】${CLIP_LABELS[clipIndex.value]}，点击按钮循环切换，观察哪个物体消失了。

【要点】near 过大会穿模、far 过小看不到远景；修改后必须调用 updateProjectionMatrix()！`,

  rotate: () => `【原理】OrbitControls 是 three.js 官方轨道控制器，提供两种观察方式：
• 自动环绕：autoRotate = true，相机绕目标点持续旋转，便于观察模型全貌。
• 鼠标交互：左键拖拽旋转 / 滚轮缩放 / 右键平移。

【当前】自动环绕已${rotateOn.value ? '开启' : '关闭'}，可再用鼠标拖拽对比。

【要点】开启阻尼 enableDamping 后，渲染循环中每帧必须调用 controls.update() 才生效。`,
};

// 供模板显示的当前档位标签（避免模板里数组索引可能为 undefined）
const posLabel = computed(() => POS_SETUPS[posIndex.value]!.label);
const fovLabel = computed(() => FOV_LABELS[fovIndex.value]!);
const clipLabel = computed(() => CLIP_LABELS[clipIndex.value]!);

const code = computed(() => {
  const fn = codeMap[activeFeature.value];
  return fn ? highlightCode(fn()) : '';
});
const explanation = computed(() => explainMap[activeFeature.value]?.() ?? '');

/* ================= 生命周期 ================= */
onMounted(initScene);
onBeforeUnmount(() => {
  anim = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  controls?.dispose();
  controls = null;
  renderer?.setAnimationLoop(null);
  renderer?.dispose();
  renderer?.domElement.remove();
  scene = null;
  camera = null;
  farBall = null;
  cube = null;
});
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <!-- 功能按钮区 -->
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === 'perspective' ? 'primary' : 'default'"
        @click="applyPerspective"
        >透视相机</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'orthographic' ? 'primary' : 'default'"
        @click="applyOrthographic"
        >正交相机</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'position' ? 'primary' : 'default'"
        @click="applyPosition"
        >相机位置：{{ posLabel }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'fov' ? 'primary' : 'default'"
        @click="applyFov"
        >视野角度：{{ fovLabel }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'clip' ? 'primary' : 'default'"
        @click="applyClip"
        >远近裁剪：{{ clipLabel }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'rotate' ? 'primary' : 'default'"
        @click="applyRotate"
        >环绕旋转：{{ rotateOn ? '开' : '关' }}</n-button
      >
      <n-button size="small" quaternary @click="applyReset">重置</n-button>
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
          {{ activeFeature }} · 示例代码
        </div>
        <pre
          class="m-0 flex-1 overflow-auto bg-gray-50 p-4 text-[13px] leading-relaxed"
        ><code v-html="code"></code></pre>
        <div
          class="max-h-[46%] overflow-auto border-t border-gray-100 px-4 py-3 text-[13px] leading-relaxed text-gray-600"
        >
          <div class="mb-1 text-xs font-semibold text-gray-400">原理讲解</div>
          <div v-html="explanation" class="whitespace-pre-wrap"></div>
        </div>
      </div>
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
