<script setup lang="ts">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computed, onMounted, ref } from 'vue';
import { useThreeScene } from '@/hooks/useThreeScene';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

/* ================= 状态 ================= */
const containerRef = ref<HTMLDivElement | null>(null);

// 场景物体
let ball: THREE.Mesh | null = null;
let cube: THREE.Mesh | null = null;
let ground: THREE.Mesh | null = null;

// 各功能子状态
const activeFeature = ref('renderer'); // 当前展示的功能
const aaIndex = ref(0); // 0:开 1:关（抗锯齿）
const shadowOn = ref(true); // 阴影开关
const loopIndex = ref(0); // 0:动态(逐帧) 1:静态(单帧)
const bgIndex = ref(0); // 背景色档位
const pixelIndex = ref(0); // 0:1x 1:2x

const AA_LABELS = ['开', '关'];
const LOOP_LABELS = ['动态（逐帧渲染）', '静态（单帧渲染）'];
const BG_COLORS = [0xf5f7fa, 0x1e293b, 0xcfe8ff];
const BG_LABELS = ['浅灰', '深色', '浅蓝'];
const PIXEL_LABELS = ['1x（低清）', '2x（高清）'];

const { scene, camera, renderer, controls } = useThreeScene(containerRef, {
  background: BG_COLORS[0],
  camera: { fov: 50, near: 0.1, far: 100, position: [5, 4, 6], lookAt: [0, 1, 0] },
  controls: { target: [0, 1, 0] },
  grid: false,
  axes: 2,
  lights: { ambient: 0.45, directional: 1.2, dirPosition: [5, 8, 4] },
  shadow: { enabled: true, mapSize: 1024, cameraBounds: 10 },
  loop: false, // 渲染器页演示渲染循环，由页面自行控制
  onDispose: () => {
    ball = null;
    cube = null;
    ground = null;
  },
});

/* ================= 渲染器创建（可重建） ================= */
function createRenderer(antialias: boolean) {
  const container = containerRef.value;
  const s = scene.value;
  const cam = camera.value;
  if (!container || !s || !cam) return;

  const old = renderer.value;
  const newRenderer = new THREE.WebGLRenderer({ antialias });
  newRenderer.setSize(container.clientWidth, container.clientHeight);
  newRenderer.setPixelRatio(pixelIndex.value === 0 ? 1 : 2);
  newRenderer.shadowMap.enabled = shadowOn.value;

  if (old) {
    container.replaceChild(newRenderer.domElement, old.domElement);
    old.setAnimationLoop(null);
    old.dispose();
  } else {
    container.appendChild(newRenderer.domElement);
  }
  renderer.value = newRenderer;

  // 重建轨道控制器（它绑定在渲染器 canvas 上）
  controls.value?.dispose();
  controls.value = new OrbitControls(cam, newRenderer.domElement);
  controls.value.enableDamping = true;
  controls.value.target.set(0, 1, 0);
  controls.value.update();

  // 渲染循环
  startLoop();
}

/** 动态逐帧渲染（物体旋转） */
function startLoop() {
  const rdr = renderer.value;
  if (!rdr) return;
  rdr.setAnimationLoop(() => {
    if (loopIndex.value === 0) {
      if (ball) ball.rotation.y += 0.012;
      if (cube) cube.rotation.y += 0.012;
    }
    controls.value?.update();
    rdr.render(scene.value!, camera.value!);
  });
}

/** 静态单帧渲染（只在需要时手动渲染一次） */
function renderOnce() {
  const rdr = renderer.value;
  if (!rdr) return;
  rdr.render(scene.value!, camera.value!);
}

/* ================= 场景内容（hook 已初始化，此处添加演示物体） ================= */
onMounted(() => {
  const s = scene.value;
  if (!s) return;

  // 地面（接收阴影）
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  s.add(ground);

  // 蓝色球体（投射阴影，曲面边缘用于展示抗锯齿）
  ball = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 48),
    new THREE.MeshStandardMaterial({ color: 0x4a9eff, roughness: 0.4 })
  );
  ball.position.set(0, 1.2, 0);
  ball.castShadow = true;
  s.add(ball);

  // 橙色立方体（投射阴影）
  cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xff9f43, roughness: 0.5 })
  );
  cube.position.set(2.2, 0.6, 0);
  cube.castShadow = true;
  s.add(cube);

  createRenderer(true); // 默认抗锯齿开
});

/* ================= 各功能按钮 ================= */

// 1. 基础渲染器（恢复默认）
function applyRenderer() {
  activeFeature.value = 'renderer';
  applyReset();
}

// 2. 抗锯齿（需重建渲染器）
function applyAA() {
  aaIndex.value = aaIndex.value === 0 ? 1 : 0;
  activeFeature.value = 'aa';
  createRenderer(aaIndex.value === 0);
}

// 3. 阴影（切换 shadowMap.enabled）
function applyShadow() {
  shadowOn.value = !shadowOn.value;
  activeFeature.value = 'shadow';
  const rdr = renderer.value;
  if (!rdr) return;
  rdr.shadowMap.enabled = shadowOn.value;
  if (loopIndex.value === 1) renderOnce();
}

// 4. 渲染循环（动态逐帧 ↔ 静态单帧）
function applyLoop() {
  loopIndex.value = loopIndex.value === 0 ? 1 : 0;
  activeFeature.value = 'loop';
  if (loopIndex.value === 1) {
    // 静态：停止动画循环，只渲染一帧
    renderer.value?.setAnimationLoop(null);
    renderOnce();
  } else {
    startLoop();
  }
}

// 5. 背景颜色（循环切换）
function applyBg() {
  bgIndex.value = (bgIndex.value + 1) % BG_LABELS.length;
  activeFeature.value = 'bg';
  const s = scene.value;
  if (s) s.background = new THREE.Color(BG_COLORS[bgIndex.value]!);
  if (loopIndex.value === 1) renderOnce();
}

// 6. 像素比（切换清晰度）
function applyPixel() {
  pixelIndex.value = pixelIndex.value === 0 ? 1 : 0;
  activeFeature.value = 'pixel';
  const rdr = renderer.value;
  if (!rdr) return;
  rdr.setPixelRatio(pixelIndex.value === 0 ? 1 : 2);
  if (loopIndex.value === 1) renderOnce();
}

// 重置
function applyReset() {
  aaIndex.value = 0;
  shadowOn.value = true;
  loopIndex.value = 0;
  bgIndex.value = 0;
  pixelIndex.value = 0;
  activeFeature.value = 'renderer';
  createRenderer(true);
  const s = scene.value;
  if (s) s.background = new THREE.Color(BG_COLORS[0]!);
  const rdr = renderer.value;
  if (rdr) rdr.shadowMap.enabled = true;
  startLoop();
}

/* ================= 代码与讲解（函数式动态生成） ================= */
const codeMap: Record<string, () => string> = {
  renderer: () => `// ① 创建 WebGL 渲染器：three.js 渲染核心
const renderer = new THREE.WebGLRenderer({
  antialias: true,          // 抗锯齿
})
renderer.setSize(w, h)                  // 画布尺寸
renderer.setPixelRatio(devicePixelRatio) // 适配高清屏
container.appendChild(renderer.domElement)
// 每一帧把「场景 + 相机」画到 canvas 上
renderer.render(scene, camera)`,

  aa: () => `// ② 抗锯齿 antialias（当前 ${AA_LABELS[aaIndex.value]}）
const renderer = new THREE.WebGLRenderer({
  antialias: ${aaIndex.value === 0},   // true 平滑边缘锯齿
})
// ★ antialias 是创建时的硬件参数，
//   运行时无法修改，必须重建渲染器
// 对比：看球体曲面边缘是否出现"锯齿/马赛克"`,

  shadow: () => `// ③ 阴影：三层缺一不可
renderer.shadowMap.enabled = true  // 1️⃣ 渲染器开启阴影
dirLight.castShadow = true         // 2️⃣ 灯光投射阴影
mesh.castShadow = true             // 3️⃣ 物体投射阴影
ground.receiveShadow = true        //    地面接收阴影
// 当前阴影：${shadowOn.value ? '开' : '关'}`,

  loop: () => `// ④ 渲染模式：静态单帧 vs 动态逐帧
renderer.render(scene, camera)   // 静态：只渲染一帧
                                 // （拖拽相机不会自动刷新！）

renderer.setAnimationLoop(() => { // 动态：浏览器每帧调用
  mesh.rotation.y += 0.01        // 每帧更新物体
  renderer.render(scene, camera)
})
// 当前：${LOOP_LABELS[loopIndex.value]}`,

  bg: () => `// ⑤ 背景颜色（当前 ${BG_LABELS[bgIndex.value]}）
scene.background = new THREE.Color(0x${BG_COLORS[bgIndex.value]!.toString(16).padStart(6, '0')})
// 透明背景则用：
// renderer.setClearColor(0x000000, 0)`,

  pixel: () => `// ⑥ 像素比：适配高清屏（Retina）
renderer.setPixelRatio(1)   // 1x：低清，边缘有颗粒感
renderer.setPixelRatio(2)   // 2x：高清，边缘更细腻
// devicePixelRatio 物理像素/逻辑像素比，
// 普通屏=1，Retina/高清屏=2
// 当前：${PIXEL_LABELS[pixelIndex.value]}`,
};

const explainMap: Record<string, () => string> = {
  renderer:
    () => `【原理】WebGLRenderer 是 three.js 的渲染核心，负责把「场景(Scene) + 相机(Camera)」绘制到页面 canvas 上。

【参数】
• antialias：抗锯齿，平滑多边形边缘。
• setSize(w, h)：设置画布像素尺寸。
• setPixelRatio(n)：适配高 DPI 屏幕，防止画面模糊。

【要点】render(scene, camera) 是渲染入口，动画场景下要在每一帧调用。`,

  aa: () => `【原理】antialias 是 WebGL 硬件的多重采样抗锯齿（MSAA），开启后多边形边缘更平滑。

【对比】当前抗锯齿 ${AA_LABELS[aaIndex.value]}。点击按钮切换，观察球体曲面边缘：
• 开 → 边缘平滑圆润
• 关 → 边缘出现明显锯齿（折线感）

【要点】antialias 只在创建渲染器时生效，运行时不能修改，切换必须重建 WebGLRenderer。`,

  shadow: () => `【原理】阴影需要「渲染器 + 灯光 + 物体」三层配合：
1️⃣ renderer.shadowMap.enabled = true — 渲染器开启阴影映射
2️⃣ 灯光 castShadow = true — 光源产生阴影
3️⃣ 物体 castShadow = true — 物体投射阴影；地面 receiveShadow = true — 接收阴影

【当前】阴影已${shadowOn.value ? '开启（球和立方体在地面有投影）' : '关闭（投影消失）'}。

【要点】缺任何一层阴影都不会显示，这是新手最常见的坑。`,

  loop: () => `【原理】渲染器有两种驱动方式：
• render()：手动渲染一帧，适合静态画面。切到静态模式后，拖拽相机也不会自动刷新——这正是"单帧渲染"的特征。
• setAnimationLoop()：由浏览器动画帧驱动，每帧回调，适合动画/交互场景。

【当前】${LOOP_LABELS[loopIndex.value]}${loopIndex.value === 0 ? '（球和立方体在持续旋转）' : '（画面冻结，拖拽不刷新）'}。

【要点】setAnimationLoop 比传统 requestAnimationFrame 更简单，且能自动适配 WebXR。`,

  bg: () => `【原理】scene.background 设置场景背景色，本质是一张始终渲染的纯色背景。

【当前】${BG_LABELS[bgIndex.value]}。点击按钮循环切换：浅灰 → 深色 → 浅蓝。

【要点】需要透明背景时用 renderer.setClearColor(0x000000, 0) + alpha: true，常用于把 3D 合成到网页背景上。`,

  pixel:
    () => `【原理】devicePixelRatio 是物理像素 ÷ 逻辑像素（CSS 像素）。Retina/高清屏为 2，普通屏为 1。

• setPixelRatio(1)：按逻辑像素渲染，在高清屏上边缘发虚、有颗粒感。
• setPixelRatio(2)：按物理像素渲染，画面更细腻，但 GPU 开销更大。

【当前】${PIXEL_LABELS[pixelIndex.value]}。切换后观察边缘清晰度变化。

【要点】生产环境通常用 Math.min(devicePixelRatio, 2) 兼顾清晰度与性能。`,
};

const aaLabel = computed(() => AA_LABELS[aaIndex.value]!);
const loopLabel = computed(() => LOOP_LABELS[loopIndex.value]!);
const bgLabel = computed(() => BG_LABELS[bgIndex.value]!);
const pixelLabel = computed(() => PIXEL_LABELS[pixelIndex.value]!);

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <!-- 功能按钮区 -->
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        size="small"
        :type="activeFeature === 'renderer' ? 'primary' : 'default'"
        @click="applyRenderer"
        >基础渲染器</n-button
      >
      <n-button size="small" :type="activeFeature === 'aa' ? 'primary' : 'default'" @click="applyAA"
        >抗锯齿：{{ aaLabel }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'shadow' ? 'primary' : 'default'"
        @click="applyShadow"
        >阴影：{{ shadowOn ? '开' : '关' }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'loop' ? 'primary' : 'default'"
        @click="applyLoop"
        >渲染循环：{{ loopLabel }}</n-button
      >
      <n-button size="small" :type="activeFeature === 'bg' ? 'primary' : 'default'" @click="applyBg"
        >背景颜色：{{ bgLabel }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'pixel' ? 'primary' : 'default'"
        @click="applyPixel"
        >像素比：{{ pixelLabel }}</n-button
      >
      <n-button size="small" quaternary @click="applyReset">重置</n-button>
    </div>

    <!-- 主体：左 3D 场景 / 右 代码+讲解 -->
    <div class="flex min-h-0 flex-1 gap-3">
      <div
        ref="containerRef"
        class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm"
      ></div>

      <CodePanel :title="activeFeature" :code="code" :explanation="explanation" />
    </div>
  </div>
</template>
