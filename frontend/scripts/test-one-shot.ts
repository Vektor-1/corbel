import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { chromium } from 'playwright';
import { makeAsk } from '../src/lib/plan-import/rodium-ai';
import { stage2_walls, type ImageMeta } from '../src/lib/plan-import/pipeline';

const port = 9997;
const datasetDir = join(__dirname, '../../../datasets/dataset/images/test');
const file = 'colorful_11260.png';

const server = createServer((req, res) => {
  try {
    const data = readFileSync(join(datasetDir, file));
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end();
  }
});

async function main() {
  server.listen(port);
  console.log(`Starting 10-loop One-Shot SVG benchmark on ${file}...`);
  
  const url = `http://localhost:${port}/${file}`;
  const ask = makeAsk(url);
  
  // Dummy meta for the prompt
  const meta: ImageMeta = { widthPx: 1000, heightPx: 1000, rotationNeeded: 0, quality: 'clear', hasScaleBar: false, hasDimensions: false, orientation: 'landscape', notes: '' };
  
  const results = [];
  
  for (let loop = 1; loop <= 10; loop++) {
    console.log(`  [Loop ${loop}/10] Executing One-Shot SVG Detection...`);
    
    // Call the actual exported pipeline function
    const walls = await stage2_walls(ask, meta, 'benchmark', false);
    
    results.push(walls.length);
    console.log(`    => LLM Output SVG lines: ${walls.length}`);
  }
  
  const min = Math.min(...results);
  const max = Math.max(...results);
  console.log(`\nOne-Shot Benchmark Complete.`);
  console.log(`  Variance: Min ${min} / Max ${max}`);
  
  server.close();
  process.exit(0);
}

main().catch(console.error);
