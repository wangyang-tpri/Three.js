<script setup lang="ts">
import * as THREE from 'three';
import { onMounted, ref } from 'vue';
import { useThreeScene } from '@/hooks/useThreeScene';

const containerRef = ref<HTMLDivElement | null>(null);

let cubeGeometry: THREE.BoxGeometry | null = null;
let cubeMaterial: THREE.MeshStandardMaterial | null = null;

const { scene } = useThreeScene(containerRef, {
  background: 0xffffff,
  camera: { fov: 75, position: [3, 3, 5] },
  controls: { target: [0, 0.5, 0] },
  grid: { size: 6, divisions: 12 },
  axes: 2,
  lights: { ambient: 0.6, directional: 1, dirPosition: [5, 10, 7] },
  onDispose: () => {
    cubeGeometry?.dispose();
    cubeMaterial?.dispose();
    cubeGeometry = null;
    cubeMaterial = null;
  },
});

// 场景对象：立方体（hook 已在 onMounted 中初始化场景）
onMounted(() => {
  const s = scene.value;
  if (!s) return;
  cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x4a9eff });
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.position.y = 0.5; // 让立方体坐落在 y=0 平面上
  s.add(cube);
});
</script>

<template>
  <div ref="containerRef" class="relative h-full w-full overflow-hidden"></div>
</template>
