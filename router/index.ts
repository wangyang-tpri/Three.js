import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '@/components/Project/HelloWorld.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
]
export default createRouter({
  history: createWebHashHistory(),
  routes
})

