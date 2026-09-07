<template>
  <n-layout has-sider class="h-full">
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :inverted="inverted"
    >
      <n-menu
        :inverted="inverted"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="activeKey"
        :default-expanded-keys="['group-basic', 'group-advanced']"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>
    <n-layout class="h-full">
      <router-view></router-view>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import type { MenuOption } from 'naive-ui'
import type { Component } from 'vue'
import {
  AppsOutline as AppIcon,
  CameraOutline as CameraIcon,
  CloudDownloadOutline as ModelIcon,
  CubeOutline as CubeIcon,
  DesktopOutline as DesktopIcon,
  LayersOutline as BasicIcon,
  RocketOutline as AdvancedIcon,
  ShapesOutline as ShapesIcon,
} from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

// 一级目录：基础 / 进阶 / 应用
const menuOptions: MenuOption[] = [
  {
    label: '基础',
    key: 'group-basic',
    icon: renderIcon(BasicIcon),
    children: [
      { label: '场景', key: 'scene', icon: renderIcon(CubeIcon) },
      { label: '相机', key: 'camera', icon: renderIcon(CameraIcon) },
      { label: '渲染器', key: 'renderer', icon: renderIcon(DesktopIcon) },
      { label: '几何体', key: 'geometry', icon: renderIcon(ShapesIcon) },
    ],
  },
  {
    label: '进阶',
    key: 'group-advanced',
    icon: renderIcon(AdvancedIcon),
    children: [
      { label: '模型加载', key: 'model-load', icon: renderIcon(ModelIcon) },
    ],
  },
  {
    label: '应用',
    key: 'group-app',
    icon: renderIcon(AppIcon),
    children: [],
  },
]

const inverted = ref(false)

const router = useRouter()
const route = useRoute()

// 根据当前路由高亮选中的菜单项
const activeKey = computed(() => String(route.name ?? ''))

// 点击菜单跳转对应路由（仅当存在对应路由时跳转，目录项不跳转）
function handleMenuSelect(key: string) {
  if (router.hasRoute(key)) router.push({ name: key })
}
</script>
