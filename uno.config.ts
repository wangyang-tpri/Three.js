import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetUno,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';

export default defineConfig({
  presets: [
    presetUno(), // 核心工具类预设（flex / h-full / w-full 等）
    presetAttributify(), // 属性模式，不用堆class
    presetIcons(), // 图标支持
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // 自定义规则 / 快捷方式
  shortcuts: {
    'flex-center': 'flex justify-center items-center',
  },
});
