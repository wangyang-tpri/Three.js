import { createRouter, createWebHashHistory } from 'vue-router'
import Scene from '@/components/Project/Scene/index.vue'
import Camera from '@/components/Project/Camera/index.vue'
import Renderer from '@/components/Project/Renderer/index.vue'
import Geometry from '@/components/Project/Geometry/index.vue'
import ModelLoader from '@/components/Project/ModelLoader/index.vue'

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
]
export default createRouter({
  history: createWebHashHistory(),
  routes
})
