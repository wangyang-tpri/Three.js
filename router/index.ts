import { createRouter, createWebHashHistory } from 'vue-router';
import Scene from '@/views/business/basics/Scene/index.vue';
import Camera from '@/views/business/basics/Camera/index.vue';
import Renderer from '@/views/business/basics/Renderer/index.vue';
import Geometry from '@/views/business/basics/Geometry/index.vue';
import ModelLoader from '@/views/business/forward/ModelLoader/index.vue';
import CadFloorPlan from '@/views/business/application/CadFloorPlan/index.vue';
import MallNavigation from '@/views/business/application/MallNavigation/index.vue';
const routes = [
  {
    path: '/',
    redirect: '/scene',
  },
  {
    path: '/scene',
    name: 'scene',
    component: Scene,
  },
  {
    path: '/camera',
    name: 'camera',
    component: Camera,
  },
  {
    path: '/renderer',
    name: 'renderer',
    component: Renderer,
  },
  {
    path: '/geometry',
    name: 'geometry',
    component: Geometry,
  },
  {
    path: '/model-load',
    name: 'model-load',
    component: ModelLoader,
  },
  {
    path: '/cad-floor-plan',
    name: 'cad-floor-plan',
    component: CadFloorPlan,
  },
  {
    path: '/mall-navigation',
    name: 'mall-navigation',
    component: MallNavigation,
  },
];
export default createRouter({
  history: createWebHashHistory(),
  routes,
});
