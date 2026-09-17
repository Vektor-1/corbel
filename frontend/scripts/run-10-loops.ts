import { readdirSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import { chromium } from 'playwright';
import { makeAsk } from '../src/lib/plan-import/rodium-ai';

const port = 9998;
const datasetDir = join(__dirname, '../../../datasets/dataset/images/test');

const server = createServer((req, res) => {
  try {
    const file = req.url?.replace('/', '');
    if (!file) { res.writeHead(404); return res.end(); }
    const data = readFileSync(join(datasetDir, file));
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end();
  }
});

async function runChunkedDetection(ask: any) {
  const roomPrompt = `This is a floor plan. Chunk the plan by identifying every distinct room or zone.
  Return a JSON array: [{ "id": "r1", "name": "Living Room", "bounds": { "minX": <x>, "minY": <y>, "maxX": <x>, "maxY": <y> } }]
  Return only JSON.`;
  
  let rooms = [];
  try {
    const rResult = await ask(roomPrompt);
    rooms = Array.isArray(rResult) ? rResult : [];
  } catch (e) { }

  const wallPrompt = `This is a floor plan. It has been chunked into rooms:
  ${JSON.stringify(rooms)}
  Trace walls systematically room by room, then exterior boundaries. 
  Return a JSON array of wall objects: [{ "id": "w1", "startX": <x>, "startY": <y>, "endX": <x>, "endY": <y>, "thicknessMm": 225, "role": "loadBearing" }]
  Return only JSON.`;

  try {
    const wResult = await ask(wallPrompt);
    return Array.isArray(wResult) ? wResult : [];
  } catch (e) {
    return [];
  }
}

async function main() {
  const outDir = join(__dirname, '../benchmark_out/10_loops');
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(datasetDir).filter(f => f.endsWith('.png')).slice(0, 4);
  server.listen(port);
  console.log(`Starting 10-loop stability benchmark on ${files.length} images...`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/editor');
  
  const allResults = [];

  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const url = `http://localhost:${port}/${file}`;
    const ask = makeAsk(url);

    const imageResults = [];

    for (let loop = 1; loop <= 10; loop++) {
      console.log(`  [Loop ${loop}/10] Chunked detection...`);
      const chunkedWalls = await runChunkedDetection(ask);
      
      await page.evaluate(() => (window as any).CorbelAPI?.clear());
      
      for (const wall of chunkedWalls) {
        const mappedWall = { 
          id: wall.id || Math.random().toString(), 
          startPoint: { x: wall.startX || 0, y: wall.startY || 0 }, 
          endPoint: { x: wall.endX || 0, y: wall.endY || 0 }, 
          thickness: wall.thicknessMm || 225, 
          role: wall.role || 'loadBearing', 
          material: 'concrete', 
          type: 'exterior', 
          height: 3000 
        };
        await page.evaluate((w: any) => (window as any).CorbelAPI?.addWall(w), mappedWall);
      }
      
      const issues = await page.evaluate(() => (window as any).CorbelAPI?.getValidationIssues() || []);
      const state = await page.evaluate(() => (window as any).CorbelAPI?.getState());
      
      const finalWallCount = state?.walls?.length || 0;
      
      imageResults.push({
        loop,
        llmSuggestedWalls: chunkedWalls.length,
        corbelFinalWalls: finalWallCount,
        issues: issues.length
      });
      
      console.log(`    => LLM Output: ${chunkedWalls.length} | Corbel Resolved: ${finalWallCount} | Issues: ${issues.length}`);
    }
    
    allResults.push({ file, loops: imageResults });
  }

  await browser.close();
  server.close();
  
  writeFileSync(join(outDir, 'stability_results.json'), JSON.stringify(allResults, null, 2));
  console.log('\\n10-loop benchmark complete.');
}

main().catch(console.error);