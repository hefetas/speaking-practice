// One-off: renders the app icon to PNG. Run: node tools/make-icons.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d4cc9"/><stop offset="1" stop-color="#3b3fa8"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<circle cx="400" cy="112" r="120" fill="#ff6b57"/>
<rect x="206" y="108" width="100" height="190" rx="50" fill="#fff"/>
<path d="M156 256a100 100 0 0 0 200 0" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round"/>
<path d="M256 356v60M206 416h100" stroke="#fff" stroke-width="22" stroke-linecap="round"/>
<circle cx="256" cy="168" r="16" fill="#ffc247"/></svg>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0">${svg(s)}</body>`);
    await p.screenshot({ path: path.join(__dirname, '..', 'app', 'pwa', `icon-${s}.png`) });
  }
  await b.close();
  console.log('icons written');
})();
