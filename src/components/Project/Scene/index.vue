<script setup lang="ts">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const containerRef = ref<HTMLDivElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let cubeGeometry: THREE.BoxGeometry | null = null;
let cubeMaterial: THREE.MeshStandardMaterial | null = null;
let resizeObserver: ResizeObserver | null = null;

function initScene() {
  const container = containerRef.value;
  if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

  // 场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  // 相机
  camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(3, 3, 5);

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // 轨道控制器：左键拖动旋转视角 / 滚轮缩放 / 右键拖动平移
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 阻尼惯性效果
  controls.target.set(0, 0.5, 0); // 围绕立方体中心旋转
  controls.update();

  // 辅助线：坐标网格（中心线与普通线同色）
  const grid = new THREE.GridHelper(6, 12, 0xcbd5e1, 0xe2e8f0);
  grid.position.y = 0;
  scene.add(grid);

  // 辅助线：坐标轴（X 红 / Y 绿 / Z 蓝）
  const axesHelper = new THREE.AxesHelper(2);
  scene.add(axesHelper);

  // 立方体（静止）
  cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x4a9eff });
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.position.y = 0.5; // 让立方体坐落在 y=0 平面上
  scene.add(cube);

  // 灯光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);

  // 渲染循环（配合 OrbitControls 阻尼需要每帧 update）
  renderer.setAnimationLoop(() => {
    controls?.update();
    renderer?.render(scene!, camera!);
  });

  // 容器尺寸变化时同步渲染器
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

function disposeScene() {
  resizeObserver?.disconnect();
  resizeObserver = null;

  controls?.dispose();
  controls = null;

  renderer?.setAnimationLoop(null);
  renderer?.dispose();
  renderer?.domElement.remove();

  cubeGeometry?.dispose();
  cubeMaterial?.dispose();

  renderer = null;
  scene = null;
  camera = null;
  cubeGeometry = null;
  cubeMaterial = null;
}

onMounted(initScene);
onBeforeUnmount(disposeScene);
</script>

<template>
  <div ref="containerRef" class="relative h-full w-full overflow-hidden"></div>
</template>
