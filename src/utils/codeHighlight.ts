/**
 * 代码语法高亮（轻量手写实现，无需引入第三方库）
 *
 * 将纯文本 JS 代码转换为带 <span> 标签的高亮 HTML 字符串。
 * 输出使用 c-code-* 系列 CSS 类，由使用方在 <style scoped> 中通过 :deep() 定义颜色。
 *
 * 使用示例：
 *   <pre v-html="highlightCode(codeStr)"></pre>
 */

const KEYWORDS = new Set([
  'const',
  'new',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'true',
  'false',
  'class',
  'for',
  'while',
  'import',
  'from',
  'typeof',
  'instanceof',
]);

/** 类名/全局对象（如 THREE）→ c-code-class */
const CLASS_WORDS = new Set(['THREE']);

/** 场景内常用实例名 → c-code-camera */
const INSTANCE_WORDS = new Set(['camera', 'renderer', 'scene']);

export function highlightCode(code: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const src = esc(code);
  let html = '';
  let i = 0;
  while (i < src.length) {
    // 行注释 //
    if (src.startsWith('//', i)) {
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      html += `<span class="c-code-comment">${src.slice(i, j)}</span>`;
      i = j;
      continue;
    }
    // 字符串（单/双/模板引号）
    const ch = src.charAt(i);
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length && src.charAt(j) !== ch) {
        if (src.charAt(j) === '\\') j++;
        j++;
      }
      if (j < src.length) j++;
      html += `<span class="c-code-string">${src.slice(i, j)}</span>`;
      i = j;
      continue;
    }
    // 数字
    if (/\d/.test(ch)) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src.charAt(j))) j++;
      html += `<span class="c-code-num">${src.slice(i, j)}</span>`;
      i = j;
      continue;
    }
    // 标识符 / 关键字
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src.charAt(j))) j++;
      const word = src.slice(i, j);
      if (KEYWORDS.has(word)) html += `<span class="c-code-keyword">${word}</span>`;
      else if (CLASS_WORDS.has(word)) html += `<span class="c-code-class">${word}</span>`;
      else if (INSTANCE_WORDS.has(word)) html += `<span class="c-code-camera">${word}</span>`;
      else html += word;
      i = j;
      continue;
    }
    html += ch;
    i++;
  }
  return html;
}
