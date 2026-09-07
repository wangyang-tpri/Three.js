<script setup lang="ts">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { highlightCode } from '../../../utils/codeHighlight';

const containerRef = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let resizeObserver: ResizeObserver | null = null;
let modelRoot: THREE.Object3D | null = null;
let mixer: THREE.AnimationMixer | null = null;
let lastTime = 0;

type ModelType = 'glb' | 'gltf' | 'fbx' | 'draco';
type Feature = ModelType | 'upload';

const activeFeature = ref<Feature>('glb');
const loading = ref(false);
const uploading = ref(false);
const loadProgress = ref(0); // 0-100
const error = ref('');
const modelInfo = ref<{
  name: string;
  vertices: number;
  triangles: number;
  animations: number;
  ms: number;
} | null>(null);

/* ================= 模型资源（位于 public/Model 目录） ================= */
const MODEL_URLS: Record<ModelType, { label: string; url: string }> = {
  glb: { label: 'GLB 模型', url: '/Model/glb/Soldier.glb' },
  gltf: { label: 'GLTF 模型', url: '/Model/gltf/Box.gltf' },
  fbx: { label: 'FBX 模型', url: '/Model/fbx/Samba Dancing.fbx' },
  draco: { label: 'Draco 压缩', url: '/Model/draco/LittlestTokyo.glb' },
};

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
  camera.position.set(3, 2.5, 5);
  camera.lookAt(0, 1, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);
  controls.update();

  const grid = new THREE.GridHelper(8, 16, 0xcbd5e1, 0xe2e8f0);
  scene.add(grid);
  scene.add(new THREE.AxesHelper(3));

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 10, 7);
  dir.castShadow = true;
  scene.add(dir);

  renderer.setAnimationLoop((time: number) => {
    const delta = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    mixer?.update(delta);
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

/* ================= 模型适配：包围盒缩放 + 居中 + 贴地 ================= */
function fitModel(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.2 / maxDim; // 缩放到最长边约 2.2
  obj.scale.setScalar(scale);
  obj.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(obj);
  const center = box2.getCenter(new THREE.Vector3());
  obj.position.sub(center); // 水平居中
  obj.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box3.min.y; // 底部贴到 y=0
}

/* ================= 统计模型信息 ================= */
function collectInfo(root: THREE.Object3D, name: string, ms: number) {
  let vertices = 0;
  let triangles = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if ((mesh as THREE.Mesh).isMesh && mesh.geometry) {
      const g = mesh.geometry;
      if (g.index) triangles += g.index.count / 3;
      else if (g.attributes.position) triangles += g.attributes.position.count / 3;
      vertices += g.attributes.position ? g.attributes.position.count : 0;
    }
  });
  const anims = (root as unknown as { animations?: THREE.AnimationClip[] }).animations?.length ?? 0;
  modelInfo.value = { name, vertices, triangles, animations: anims, ms: Math.round(ms) };
}

/* ================= 加载完成统一处理 ================= */
function finishLoad(root: THREE.Object3D, anims: THREE.AnimationClip[], name: string, ms: number) {
  fitModel(root);
  scene!.add(root);
  modelRoot = root;
  const firstClip = anims[0];
  if (firstClip) {
    mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(firstClip).play();
  }
  loading.value = false;
  uploading.value = false;
  loadProgress.value = 100;
  collectInfo(root, name, ms);
}

/* ================= 加载预设模型 ================= */
function loadModel(type: ModelType) {
  const cfg = MODEL_URLS[type]!;
  activeFeature.value = type;
  error.value = '';
  clearModel();
  loading.value = true;
  loadProgress.value = 0;
  const t0 = performance.now();

  const onProgress = (e: ProgressEvent) => {
    loadProgress.value = e.total > 0 ? Math.round((e.loaded / e.total) * 100) : 0;
  };
  const onError = (e: unknown) => {
    loading.value = false;
    loadProgress.value = 0;
    error.value = `加载失败：${(e as Error)?.message ?? String(e)}`;
    modelInfo.value = null;
    console.error(e);
  };

  if (type === 'fbx') {
    const loader = new FBXLoader();
    loader.load(
      cfg.url,
      (obj) => finishLoad(obj, obj.animations, cfg.label, performance.now() - t0),
      onProgress,
      onError
    );
    return;
  }
  const loader = new GLTFLoader();
  if (type === 'draco') {
    // Draco 压缩：注册解码器（decoder 位于 public/draco）
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    loader.setDRACOLoader(draco);
  }
  loader.load(
    cfg.url,
    (gltf) => finishLoad(gltf.scene, gltf.animations, cfg.label, performance.now() - t0),
    onProgress,
    onError
  );
}

/* ================= 上传本地模型 ================= */
function triggerUpload() {
  fileInputRef.value?.click();
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // 允许重复选择同一个文件
  if (!file) return;

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['glb', 'gltf', 'fbx'].includes(ext)) {
    error.value = '不支持的文件类型，请选择 .glb / .gltf / .fbx';
    modelInfo.value = null;
    return;
  }

  activeFeature.value = 'upload';
  error.value = '';
  clearModel();
  uploading.value = true;
  loadProgress.value = 0;
  const t0 = performance.now();

  try {
    const buffer = await file.arrayBuffer();
    if (ext === 'fbx') {
      const loader = new FBXLoader();
      const obj = loader.parse(buffer, '');
      finishLoad(obj, obj.animations, file.name, performance.now() - t0);
    } else {
      const loader = new GLTFLoader();
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(buffer, '', resolve, reject);
      });
      finishLoad(gltf.scene, gltf.animations, file.name, performance.now() - t0);
    }
  } catch (err) {
    uploading.value = false;
    loadProgress.value = 0;
    error.value = `解析失败：${(err as Error)?.message ?? String(err)}`;
    modelInfo.value = null;
    console.error(err);
  }
}

/* ================= 清理 ================= */
function clearModel() {
  if (modelRoot && scene) scene.remove(modelRoot);
  modelRoot = null;
  mixer = null;
  modelInfo.value = null;
}

function disposeScene() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  controls?.dispose();
  controls = null;
  renderer?.setAnimationLoop(null);
  renderer?.dispose();
  renderer?.domElement.remove();
  clearModel();
  renderer = null;
  scene = null;
  camera = null;
}

/* ================= 代码与讲解（函数式动态生成） ================= */
const codeMap: Record<Feature, () => string> = {
  glb: () => `// ① 加载 GLB 模型（GLTFLoader 同时支持 .gltf / .glb）
const loader = new GLTFLoader()
loader.load('Model/glb/Soldier.glb', (gltf) => {
  scene.add(gltf.scene)   // 模型根节点
  // gltf.animations 动画剪辑，可交给 AnimationMixer 播放
})`,
  gltf: () => `// ② 加载 GLTF 模型（文本格式，可引用外部 .bin / 贴图）
const loader = new GLTFLoader()
loader.load('Model/gltf/Box.gltf', (gltf) => {
  scene.add(gltf.scene)
})`,
  fbx: () => `// ③ 加载 FBX 模型（Autodesk 格式，常用于动画角色）
const loader = new FBXLoader()
loader.load('Model/fbx/Samba Dancing.fbx', (object) => {
  scene.add(object)
  // object.animations 含骨骼动画，可播放
})`,
  draco: () => `// ④ 加载 Draco 压缩模型（mesh 数据更小，需解码）
const loader = new GLTFLoader()
const draco = new DRACOLoader()
draco.setDecoderPath('/draco/')   // 解码器目录
loader.setDRACOLoader(draco)
loader.load('Model/draco/LittlestTokyo.glb', (gltf) => {
  scene.add(gltf.scene)
})`,
  upload: () => `// ⑤ 上传本地模型（.glb / .gltf / .fbx）
const buffer = await file.arrayBuffer()
if (ext === 'fbx') {
  const obj = new FBXLoader().parse(buffer, '')
  scene.add(obj)
} else {
  new GLTFLoader().parse(buffer, '', (gltf) => {
    scene.add(gltf.scene)
  })
}`,
};

const explainMap: Record<Feature, () => string> = {
  glb: () =>
    `【原理】GLB 是 glTF 的二进制封装，几何、材质、纹理、动画打包在单个文件里，体积小、加载快。\n【加载器】GLTFLoader 同时支持 .gltf 与 .glb。\n【要点】返回的 gltf.scene 可直接加入场景；gltf.animations 可交给 AnimationMixer 播放动画。\n${infoLine()}`,
  gltf: () =>
    `【原理】GLTF 是 glTF 的文本（JSON）格式，用 URI 引用外部的 .bin 二进制和图片贴图，便于阅读与版本管理。\n【加载器】GLTFLoader 加载后结构与 GLB 完全一致。\n【要点】本地 .gltf 需与 .bin / 贴图放在一起；这里演示的 Box.gltf 是单文件（buffer 内联 base64）。\n${infoLine()}`,
  fbx: () =>
    `【原理】FBX 是 Autodesk 的通用交换格式，广泛用于角色、骨骼动画和 DCC 软件（3ds Max / Maya）间流转。\n【加载器】FBXLoader 直接解析为 THREE.Group。\n【要点】object.animations 内含骨骼动画剪辑，可创建 AnimationMixer 播放。\n${infoLine()}`,
  draco: () =>
    `【原理】Draco 是 Google 的网格压缩算法，可大幅减小几何数据体积（可达 1/10）。\n【加载器】GLTFLoader + DRACOLoader 组合：GLTF 中的压缩数据交给 Draco 解码后还原网格。\n【要点】必须用 setDecoderPath() 指定解码器目录（此处为 /draco/），解码过程在 Web Worker 中异步进行。\n${infoLine()}`,
  upload: () =>
    `【原理】通过 File 读取本地模型的 ArrayBuffer，交给对应 Loader 直接解析，无需服务端。\n【加载器】.glb / .gltf → GLTFLoader.parse(buffer)；.fbx → FBXLoader.parse(buffer)。\n【要点】注意校验扩展名与文件大小；若 .gltf 引用外部 .bin / 贴图，单文件上传会解析失败。\n${infoLine()}`,
};

function infoLine() {
  const info = modelInfo.value;
  if (loading.value) return '【状态】正在加载模型…';
  if (uploading.value) return '【状态】正在解析本地模型…';
  if (error.value) return `【状态】${error.value}`;
  if (!info) return '【状态】点击上方按钮加载模型，或上传本地模型';
  return `【当前】${info.name}｜顶点 ${info.vertices}｜三角面 ${info.triangles}｜动画 ${info.animations} 段｜耗时 ${info.ms}ms`;
}

const code = computed(() => highlightCode(codeMap[activeFeature.value]()));
const explanation = computed(() => explainMap[activeFeature.value]());

/* ================= 生命周期 ================= */
onMounted(() => {
  initScene();
  loadModel('glb');
});
onBeforeUnmount(disposeScene);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <!-- 功能按钮区 -->
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        v-for="(item, key) in MODEL_URLS"
        :key="key"
        size="small"
        :loading="loading && activeFeature === key"
        :type="activeFeature === key ? 'primary' : 'default'"
        @click="loadModel(key)"
        >{{ item.label }}</n-button
      >
      <n-button
        size="small"
        :type="activeFeature === 'upload' ? 'primary' : 'default'"
        @click="triggerUpload"
      >
        上传本地模型
      </n-button>
      <n-button size="small" quaternary @click="clearModel">清除模型</n-button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".glb,.gltf,.fbx"
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
          {{ activeFeature }} · 示例代码
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
      v-if="loading || uploading"
      class="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white/95 p-5 shadow-xl"
    >
      <div class="mb-2 text-center text-sm font-medium text-gray-700">
        {{ uploading ? '正在解析本地模型…' : '正在加载模型…' }}
      </div>
      <n-progress
        type="line"
        :percentage="loadProgress"
        :show-indicator="true"
        :processing="loading || uploading"
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
