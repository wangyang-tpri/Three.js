<script setup lang="ts">
import * as THREE from 'three';
import { onMounted, ref } from 'vue';
import { useThreeScene } from '@/hooks/useThreeScene';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

const containerRef = ref<HTMLDivElement | null>(null);

// 当前展示的几何体（复用同一个 mesh，仅更换 geometry）
let currentMesh: THREE.Mesh | null = null;
let currentMaterial: THREE.MeshStandardMaterial | null = null;
let currentGeometry: THREE.BufferGeometry | null = null;

const activeShape = ref('box');

const { scene } = useThreeScene(containerRef, {
  background: 0xf5f7fa,
  camera: { fov: 55, near: 0.1, far: 100, position: [3, 2, 5], lookAt: [0, 0.5, 0] },
  controls: { target: [0, 0.5, 0] },
  grid: { size: 6, divisions: 12 },
  axes: 2,
  lights: { ambient: 0.6, directional: 1, dirPosition: [5, 10, 7] },
  onDispose: () => {
    currentGeometry?.dispose();
    currentMaterial?.dispose();
    currentMesh = null;
    currentGeometry = null;
    currentMaterial = null;
  },
});

/* ================= 几何体工厂 ================= */
const SHAPES: Record<string, { label: string; make: () => THREE.BufferGeometry }> = {
  box: { label: '立方体', make: () => new THREE.BoxGeometry(1, 1, 1) },
  sphere: { label: '球体', make: () => new THREE.SphereGeometry(0.7, 32, 32) },
  cylinder: { label: '圆柱', make: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32) },
  cone: { label: '圆锥', make: () => new THREE.ConeGeometry(0.6, 1.2, 32) },
  torus: { label: '圆环', make: () => new THREE.TorusGeometry(0.55, 0.2, 16, 48) },
  knot: { label: '环面结', make: () => new THREE.TorusKnotGeometry(0.45, 0.15, 100, 16) },
  dodeca: { label: '十二面体', make: () => new THREE.DodecahedronGeometry(0.7, 0) },
  plane: { label: '平面', make: () => new THREE.PlaneGeometry(1.6, 1.6) },
};

/* ================= 场景内容（hook 已初始化，此处创建初始几何体） ================= */
onMounted(() => {
  const s = scene.value;
  if (!s) return;

  // 通用材质：双面可见（平面旋转后也能从背面看到）
  currentMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a9eff,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  // 初始：立方体
  currentGeometry = SHAPES.box!.make();
  currentMesh = new THREE.Mesh(currentGeometry, currentMaterial);
  currentMesh.position.y = 0.5;
  s.add(currentMesh);
});

/* ================= 切换几何体 ================= */
function applyShape(key: string) {
  activeShape.value = key;
  if (!currentMesh || !currentGeometry) return;
  // 替换 geometry，并释放旧的
  currentGeometry.dispose();
  currentGeometry = SHAPES[key]!.make();
  currentMesh.geometry = currentGeometry;
  // 平面平放，其余竖放
  currentMesh.rotation.x = key === 'plane' ? -Math.PI / 2 : 0;
  currentMesh.position.y = key === 'plane' ? 0 : 0.5;
}

/* ================= 代码与讲解（函数式动态生成） ================= */
const codeMap: Record<string, () => string> = {
  box: () => `// ① 立方体：6 个正方形面、8 个顶点
const geometry = new THREE.BoxGeometry(1, 1, 1)
// 参数：width, height, depth（宽/高/深）
const material = new THREE.MeshStandardMaterial({ color: 0x4a9eff })
const mesh = new THREE.Mesh(geometry, material)`,

  sphere: () => `// ② 球体：经纬线分段，段数越高越圆滑
const geometry = new THREE.SphereGeometry(0.7, 32, 32)
// 参数：radius 半径
//       widthSegments 经线分段，heightSegments 纬线分段
const mesh = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({ color: 0x4a9eff })
)`,

  cylinder: () => `// ③ 圆柱：上下两个半径可不同，可做锥台
const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
// 参数：radiusTop, radiusBottom 上下底面半径
//       height 高度，radialSegments 圆周分段`,
  cone: () => `// ④ 圆锥：底面圆 + 顶点
const geometry = new THREE.ConeGeometry(0.6, 1.2, 32)
// 参数：radius 底面半径
//       height 高度，radialSegments 圆周分段`,
  torus: () => `// ⑤ 圆环（甜甜圈）
const geometry = new THREE.TorusGeometry(0.55, 0.2, 16, 48)
// 参数：radius 环心半径，tube 管道半径
//       radialSegments 管道分段，tubularSegments 环向分段`,
  knot: () => `// ⑥ 环面结：数学缠结，适合做 logo / 装饰
const geometry = new THREE.TorusKnotGeometry(0.45, 0.15, 100, 16)
// 参数：radius 半径，tube 管道半径
//       tubularSegments 环向分段，radialSegments 管道分段`,
  dodeca: () => `// ⑦ 十二面体：12 个正五边形面
const geometry = new THREE.DodecahedronGeometry(0.7, 0)
// 参数：radius 外接球半径，detail 细分层级(0 为最简)`,
  plane: () => `// ⑧ 平面：2D 面片，默认只有正面可见
const geometry = new THREE.PlaneGeometry(1.6, 1.6)
// 参数：width, height 宽高
// 材质需设 side: THREE.DoubleSide 双面可见
// 通常旋转 -90° 水平放置当地面`,
};

const explainMap: Record<string, () => string> = {
  box: () =>
    `【原理】由 6 个矩形面、8 个顶点、12 条边组成。\n【参数】width / height / depth：三个方向的边长。\n【要点】最常用的基础几何体，适合搭建建筑、箱体、方块类场景。`,
  sphere: () =>
    `【原理】由经纬线围成的球面，分段越多越接近理想球体。\n【参数】radius 半径；widthSegments 经线分段（沿赤道）；heightSegments 纬线分段（沿两极）。\n【要点】分段低时可模拟低多边形风格，段数高则更平滑但顶点更多。`,
  cylinder: () =>
    `【原理】上下底面圆 + 侧面，由圆周分段围成。\n【参数】radiusTop / radiusBottom：上下底面半径（不同时形成锥台）；height 高度；radialSegments 圆周分段。\n【要点】底面默认不在 y=0，需自行调整位置。`,
  cone: () =>
    `【原理】底面圆 + 一个顶点（半径为 0 的圆柱特例）。\n【参数】radius 底面半径；height 高度；radialSegments 圆周分段。\n【要点】适合做尖塔、锥形、漏斗等。`,
  torus: () =>
    `【原理】一个圆环管绕中心轴旋转一周形成。\n【参数】radius 环心到管道中心距离；tube 管道半径；radialSegments 管道分段；tubularSegments 环向分段。\n【要点】分段越高越圆润，经典“甜甜圈”形状。`,
  knot: () =>
    `【原理】由三维曲线（环面结）扫掠出管道，曲线自相交缠绕。\n【参数】radius 整体半径；tube 管道半径；tubularSegments 沿曲线分段；radialSegments 管道截面分段。\n【要点】结构复杂、顶点多，适合做装饰性 Logo。`,
  dodeca: () =>
    `【原理】12 个正五边形面组成的正多面体（柏拉图立体）。\n【参数】radius 外接球半径；detail 细分层级，>0 时把每个面进一步细分。\n【要点】同系列还有 Icosahedron(20面)、Octahedron(8面)、Tetrahedron(4面)。`,
  plane: () =>
    `【原理】只有 x/y 两个方向的 2D 面片，没有厚度。\n【参数】width / height：宽高；分段数可选。\n【要点】默认单面可见，材质要设 side: DoubleSide；常旋转 -90° 水平放置当地面 / 墙。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeShape);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <!-- 功能按钮区 -->
    <div class="flex flex-wrap items-center gap-2">
      <n-button
        v-for="(shape, key) in SHAPES"
        :key="key"
        size="small"
        :type="activeShape === key ? 'primary' : 'default'"
        @click="applyShape(key)"
        >{{ shape.label }}</n-button
      >
    </div>

    <!-- 主体：左 3D 场景 / 右 代码+讲解 -->
    <div class="flex min-h-0 flex-1 gap-3">
      <div
        ref="containerRef"
        class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm"
      ></div>

      <CodePanel :title="activeShape" :code="code" :explanation="explanation" />
    </div>
  </div>
</template>
