<script setup lang="ts">
defineProps<{
  /** 面板标题（左侧带绿色竖杠），如 '透视相机' */
  title: string
  /** 已高亮后的代码 HTML（由 useCodeExplain 的 code 提供） */
  code: string
  /** 讲解文本（支持换行） */
  explanation: string
}>()
</script>

<template>
  <div class="flex w-[420px] shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
    <div class="border-b border-l-[3px] border-l-solid border-l-green-500 border-gray-100 py-2 pl-3 pr-4 text-sm font-semibold text-gray-600">
      {{ title }} · 示例代码
    </div>
    <pre class="m-0 flex-1 overflow-auto bg-gray-50 p-4 text-[13px] leading-relaxed"><code v-html="code"></code></pre>
    <div class="max-h-[46%] overflow-auto border-t border-gray-100 px-4 py-3 text-[13px] leading-relaxed text-gray-600">
      <div class="mb-1 text-xs font-semibold text-gray-400">原理讲解</div>
      <div class="whitespace-pre-wrap">{{ explanation }}</div>
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
