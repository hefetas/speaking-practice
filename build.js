const fs = require('fs');
const path = require('path');

const app = path.join(__dirname, 'app');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8');

const js = [read('logic.js'), read('content.js'), read('ui.js')]
  .join('\n;\n')
  .replace(/<\/script/gi, '<\\/script');

const html = read('index.src.html')
  .replace('/*INLINE_CSS*/', () => read('style.css'))
  .replace('/*INLINE_JS*/', () => js);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
console.log('dist/index.html written (' + html.length + ' bytes)');
