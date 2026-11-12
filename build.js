const fs = require('fs');
const path = require('path');

const app = path.join(__dirname, 'app');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8');

const js = ['logic.js', 'progress.js', 'analysis.js', 'daily-more-1.js', 'daily-more-2.js', 'ielts.js', 'content.js', 'ui.js']
  .map(read)
  .join('\n;\n')
  .replace(/<\/script/gi, '<\\/script');

const html = read('index.src.html')
  .replace('/*INLINE_CSS*/', () => read('style.css'))
  .replace('/*INLINE_JS*/', () => js);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
console.log('dist/index.html written (' + html.length + ' bytes)');
