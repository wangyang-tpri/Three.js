import { createRouter, createWebHashHistory } from 'vue-router'
import Scene from '@/components/Project/Scene/index.vue'
import Camera from '@/components/Project/Camera/index.vue'
import Renderer from '@/components/Project/Renderer/index.vue'
import Geometry from '@/components/Project/Geometry/index.vue'
import ModelLoader from '@/components/Project/ModelLoader/index.vue'
import CadFloorPlan from '@/components/Project/CadFloorPlan/index.vue'
import MallNavigation from '@/components/Project/MallNavigation/index.vue'

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
]
export default createRouter({
  history: createWebHashHistory(),
  routes
})
