// Génère le PDF + des aperçus PNG de chaque page : node render.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, 'plaquette.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: path.resolve(__dirname, 'Plaquette_Mariage_2026-2027_La_Cuisine_de_Sophie.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  if (process.argv[2] === 'png') {
    fs.mkdirSync('/tmp/claude-0/-home-user-BOS/f7b8601a-b735-5a1b-8404-ab47b22f8c90/scratchpad/prev', { recursive: true });
    await p.emulateMedia({ media: 'print' });
    const els = await p.$$('.page');
    for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: `/tmp/claude-0/-home-user-BOS/f7b8601a-b735-5a1b-8404-ab47b22f8c90/scratchpad/prev/p${String(i+1).padStart(2,'0')}.png` });
  }
  await b.close();
})();
