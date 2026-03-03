'use strict';

// hexo-renderer-markdown-it + markdown-it-mathjax3 会输出 MathJax v2 格式的 <script type="math/tex"> 标签，
// 而 NexT 加载的是 MathJax v3，v3 默认不处理这些标签。
// 此 filter 在构建时将其后处理为 MathJax v3 能识别的 \[...\] 和 \(...\) 格式。

hexo.extend.filter.register('after_render:html', function (str) {
  // 块级公式: <script type="math/tex; mode=display">...</script> → \[...\]
  str = str.replace(
    /<script type="math\/tex; mode=display">([\s\S]*?)<\/script>/g,
    (_, math) => `\\[${math}\\]`
  );
  // 行内公式: <script type="math/tex">...</script> → \(...\)
  str = str.replace(
    /<script type="math\/tex">([\s\S]*?)<\/script>/g,
    (_, math) => `\\(${math}\\)`
  );
  return str;
});
