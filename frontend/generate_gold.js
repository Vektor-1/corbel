const { chromium } = require('playwright');
const fs = require('fs');

const svg = `
<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg" style="background:white;">
  <!-- Perimeter -->
  <line x1="50" y1="50" x2="450" y2="50" stroke="black" stroke-width="10" />
  <line x1="450" y1="50" x2="450" y2="450" stroke="black" stroke-width="10" />
  <line x1="450" y1="450" x2="50" y2="450" stroke="black" stroke-width="10" />
  <line x1="50" y1="450" x2="50" y2="50" stroke="black" stroke-width="10" />
  <!-- Internal partition -->
  <line x1="250" y1="50" x2="250" y2="450" stroke="black" stroke-width="5" />
</svg>
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(svg);
  await page.screenshot({ path: 'gold_standard.png' });
  await browser.close();
  
  const b64 = fs.readFileSync('gold_standard.png').toString('base64');
  
  const goldStandardSvg = `<svg width="500" height="500">
  <line id="g1" x1="50" y1="50" x2="450" y2="50" stroke-width="225" class="loadBearing" data-confidence="1.0" />
  <line id="g2" x1="450" y1="50" x2="450" y2="450" stroke-width="225" class="loadBearing" data-confidence="1.0" />
  <line id="g3" x1="450" y1="450" x2="50" y2="450" stroke-width="225" class="loadBearing" data-confidence="1.0" />
  <line id="g4" x1="50" y1="450" x2="50" y2="50" stroke-width="225" class="loadBearing" data-confidence="1.0" />
  <line id="g5" x1="250" y1="50" x2="250" y2="450" stroke-width="115" class="partition" data-confidence="1.0" />
</svg>`;

  fs.writeFileSync('gold_standard.json', JSON.stringify({ imageBase64: b64, svg: goldStandardSvg }));
  console.log("Gold standard created.");
})();
