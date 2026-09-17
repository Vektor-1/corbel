import { readdirSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { createServer } from 'http';
import { chromium } from 'playwright';
import { makeAsk } from '../src/lib/plan-import/rodium-ai';

// Local image server to bypass file:// fetch restrictions
const port = 9999;
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

async function runGlobalDetection(ask: any) {
  const prompt = `This is a floor plan. Detect every wall segment. Return a JSON array: 
  [{ "id": "w1", "startX": <x>, "startY": <y>, "endX": <x>, "endY": <y>, "thicknessMm": 225, "role": "loadBearing" }]
  Return only the JSON array.`;
  
  try {
    const result = await ask(prompt);
    return Array.isArray(result) ? result : [];
  } catch (e) {
    console.error("Global detection failed", e);
    return [];
  }
}

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
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1] as string) : 30;
  
  const outDir = join(__dirname, '../benchmark_out');
  mkdirSync(outDir, { recursive: true });

  let files: string[] = [];
  try {
    files = readdirSync(datasetDir).filter(f => f.endsWith('.png')).slice(0, limit);
  } catch (e) {
    console.error("Could not read datasets directory. Make sure it exists relative to Corbel.");
    process.exit(1);
  }

  server.listen(port);
  console.log(`Starting benchmark on ${files.length} images...`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/editor');
  
  const results = [];
  for (const file of files) {
    console.log(`Processing ${file}...`);
    const url = `http://localhost:${port}/${file}`;
    
    // Reuse the existing internal API router logic via Rodium AI (which resolves)
    const ask = makeAsk(url);


    console.log(`  [Loop 1] Global detection...`);
    const globalWalls = await runGlobalDetection(ask);
    await page.evaluate(() => (window as any).CorbelAPI?.clear());
    for (const wall of globalWalls) {
      console.log('wall obj:', wall);
      const mappedWall = { id: wall.id || Math.random().toString(), startPoint: { x: wall.startX || 0, y: wall.startY || 0 }, endPoint: { x: wall.endX || 0, y: wall.endY || 0 }, thickness: wall.thicknessMm || 225, role: wall.role || 'loadBearing', material: 'concrete', type: 'exterior', height: 3000 };
      await page.evaluate((w: any) => (window as any).CorbelAPI?.addWall(w), mappedWall);
    }
    await page.screenshot({ path: join(outDir, `${file.replace('.png', '')}_loop1.png`) });
    const globalIssues = await page.evaluate(() => (window as any).CorbelAPI?.getValidationIssues() || []);
    const globalState = await page.evaluate(() => (window as any).CorbelAPI?.getState());

    console.log(`  [Loop 2] Chunked detection...`);
    const chunkedWalls = await runChunkedDetection(ask);
    await page.evaluate(() => (window as any).CorbelAPI?.clear());
    for (const wall of chunkedWalls) {
      console.log('wall obj:', wall);
      const mappedWall = { id: wall.id || Math.random().toString(), startPoint: { x: wall.startX || 0, y: wall.startY || 0 }, endPoint: { x: wall.endX || 0, y: wall.endY || 0 }, thickness: wall.thicknessMm || 225, role: wall.role || 'loadBearing', material: 'concrete', type: 'exterior', height: 3000 };
      await page.evaluate((w: any) => (window as any).CorbelAPI?.addWall(w), mappedWall);
    }
    await page.screenshot({ path: join(outDir, `${file.replace('.png', '')}_loop2.png`) });
    const chunkedIssues = await page.evaluate(() => (window as any).CorbelAPI?.getValidationIssues() || []);
    const chunkedState = await page.evaluate(() => (window as any).CorbelAPI?.getState());

    // Save full JSON plans for comparison
    writeFileSync(join(outDir, `${file.replace('.png', '')}_loop1_plan.json`), JSON.stringify(globalState, null, 2));
    writeFileSync(join(outDir, `${file.replace('.png', '')}_loop2_plan.json`), JSON.stringify(chunkedState, null, 2));

    results.push({
      file,
      globalWallCount: globalWalls.length,
      globalIssues: globalIssues.length,
      chunkedWallCount: chunkedWalls.length,
      chunkedIssues: chunkedIssues.length,
      globalJsonOut: `${file.replace('.png', '')}_loop1_plan.json`,
      chunkedJsonOut: `${file.replace('.png', '')}_loop2_plan.json`,
    });
    console.log(`  => Loop 1 Issues: ${globalIssues.length} | Loop 2 Issues: ${chunkedIssues.length}`);
  }

  await browser.close();
  server.close();
  
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log('Benchmark complete. See benchmark_out/ for results.');
}

main().catch(console.error);
