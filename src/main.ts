import { createApp } from 'vue'
import App from './App.vue'
import navie from 'naive-ui'


import router from '../router/index.ts'
import './assets/main.css'
import 'uno.css'
createApp(App).use(router).use(navie).mount('#app')
