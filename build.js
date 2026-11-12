const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = path.join(__dirname, 'app');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8');
const outDir = process.env.OUT_DIR || path.join(__dirname, 'dist');
const launch = process.env.LAUNCH === '1';

const config = Object.assign(JSON.parse(read('config.json')), { launch: launch });

const js = ['logic.js', 'progress.js', 'analysis.js', 'challenge.js', 'backup.js', 'notebook.js', 'ics.js',
  'daily-more-1.js', 'daily-more-2.js', 'ielts.js', 'practice-bank.js', 'content.js', 'series.js', 'stage.js', 'i18n.js', 'legal.js', 'ui.js']
  .map(read)
  .join('\n;\n')
  .replace(/<\/script/gi, '<\\/script');

const inline = 'window.CONFIG=' + JSON.stringify(config).replace(/</g, '\\u003c') + ';\n;\n' + js;

const html = read('index.src.html')
  .replace('<!--ROBOTS-->', launch ? 'index,follow' : 'noindex,nofollow')
  .replace('/*INLINE_CSS*/', () => read('style.css'))
  .replace('/*INLINE_JS*/', () => inline);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);

// PWA files (separate, small): manifest, icons, service worker stamped with a content hash.
const version = 'konus-' + crypto.createHash('sha256').update(html).digest('hex').slice(0, 8);
fs.copyFileSync(path.join(app, 'pwa', 'manifest.webmanifest'), path.join(outDir, 'manifest.webmanifest'));
['icon-192.png', 'icon-512.png'].forEach((f) => fs.copyFileSync(path.join(app, 'pwa', f), path.join(outDir, f)));
fs.writeFileSync(path.join(outDir, 'sw.js'), fs.readFileSync(path.join(app, 'pwa', 'sw.template.js'), 'utf8').replace('__VERSION__', version));

console.log('dist/index.html written (' + html.length + ' bytes), ' + version + (launch ? ' [LAUNCH]' : ' [noindex]'));
