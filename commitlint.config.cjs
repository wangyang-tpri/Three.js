module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 必须小写
    'type-case': [2, 'always', 'lowerCase'],
    // 禁止空 type
    'type-empty': [2, 'never'],
    // 禁止空描述
    'subject-empty': [2, 'never'],
    // 禁止描述末尾带句号
    'subject-full-stop': [0, 'never'],
    // scope 可选、允许为空
    'scope-empty': [0, 'always'],
  },
  // czg 中文交互弹窗配置
  prompt: {
    messages: {
      type: '请选择提交类型：',
      scope: '请填写影响范围(可选，例如：core、ui、plugin)：',
      customScope: '自定义范围：',
      subject: '简短描述本次变更(必填，不超过100字符)：',
      body: '详细描述(可选，换行使用 | 符号换行)：',
      breaking: '是否存在破坏性变更？(y/N)',
      breakingSubject: '破坏性变更说明：',
      footerPrefixsSelect: '选择关联issue类型：',
      customFooterPrefixs: '自定义issue前缀：',
      footer: '填写关联issue编号，例如 #123：',
      confirmCommit: '确认提交以上内容？',
    },
    types: [
      { value: 'feat', name: 'feat:     ✨ 新增功能' },
      { value: 'fix', name: 'fix:      🐛 修复bug' },
      { value: 'docs', name: 'docs:     📝 文档更新' },
      { value: 'style', name: 'style:    💄 代码格式调整，不改变逻辑' },
      { value: 'refactor', name: 'refactor: ♻️ 代码重构，无新增功能无bug修复' },
      { value: 'perf', name: 'perf:     ⚡ 性能优化' },
      { value: 'test', name: 'test:     ✅ 新增/修改测试用例' },
      { value: 'build', name: 'build:    🔨 构建、依赖、打包变更' },
      { value: 'ci', name: 'ci:       🎡 CI流水线配置改动' },
      { value: 'chore', name: 'chore:    🧹 工程配置、工具杂项修改' },
      { value: 'revert', name: 'revert:   ⏪ 回滚某次提交' },
    ],
    useEmoji: true,
    emojiAlign: 'left',
    allowCustomIssuePrefixs: true,
    allowEmptyIssuePrefixs: true,
    maxSubjectLength: 100,
    minSubjectLength: 0,
    scopeOverrides: null,
    defaultScope: '',
    // 跳过issue关联提问，如需关联issue删除该行
    skipQuestions: ['footerPrefixsSelect', 'footer'],
  },
};
