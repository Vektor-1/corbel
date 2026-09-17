import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { build } from 'esbuild';
import { matchPoints, matchLines, matchBoxes, polylinesToSegments, scoreCounts } from './plan-comparison-metrics.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dataset = path.resolve(root, '../datasets/dataset');
const out = path.join(root, 'benchmark_out/comparison-40');
const imageDir = path.join(dataset, 'images/test');
const classes = ['wall', 'door', 'window'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
if (process.argv[2] === 'prepare') {
  await fs.mkdir(path.join(out, 'images'), { recursive: true });
  const names = (await fs.readdir(imageDir)).filter(n => n.endsWith('.png')).sort();
  let seed = 20260905;
  for (let i = names.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(seed / 2 ** 32 * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const samples = [];
  for (const [i, name] of names.slice(0, 40).entries()) {
    const bytes = await fs.readFile(path.join(imageDir, name));
    const { width, height } = await sharp(bytes).metadata();
    await fs.copyFile(path.join(imageDir, name), path.join(out, 'images', name));
    const preview = `${String(i + 1).padStart(2, '0')}.png`;
    // All manual annotations use this 800×800, white-letterboxed frame.
    await sharp(bytes).resize(800, 800, { fit: 'contain', background: 'white' }).png().toFile(path.join(out, preview));
    samples.push({ index: i + 1, name, width, height, sha256: hash(bytes), preview });
  }
  const manifest = { seed: 20260905, split: 'test', count: samples.length, dataset, samples,
    modelSha256: hash(await fs.readFile(path.join(root, 'public/models/corbel-detect.onnx'))),
    detector: { confThreshold: 0.25, iouThreshold: 0.45, enhanceImage: false },
    manualCoordinates: '800x800 contain preview; approximate visual annotations' };
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await build({ entryPoints: [path.join(root, 'src/lib/plan-import/local-ml.ts')], bundle: true,
    format: 'iife', globalName: 'CorbelDetector', platform: 'browser', outfile: path.join(out, 'detector.js') });
  console.log(JSON.stringify(samples.map(({ index, name }) => ({ index, name }))));
}

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const pct = n => `${(n * 100).toFixed(1)}%`;
const colors = { wall: '#e44545', door: '#1976d2', window: '#008b54' };
function previewTransform(sample) {
  const scale = Math.min(800 / sample.width, 800 / sample.height);
  const width = Math.round(sample.width * scale), height = Math.round(sample.height * scale);
  return { sx: width / sample.width, sy: height / sample.height, px: Math.floor((800 - width) / 2), py: Math.floor((800 - height) / 2) };
}
function previewBox(b, t) {
  return { ...b, x0: b.x0 * t.sx + t.px, y0: b.y0 * t.sy + t.py, x1: b.x1 * t.sx + t.px, y1: b.y1 * t.sy + t.py };
}
function geometry(boxes) {
  return {
    walls: boxes.filter(b => b.cls === 'wall').map(b => b.x1 - b.x0 >= b.y1 - b.y0
      ? [b.x0, (b.y0 + b.y1) / 2, b.x1, (b.y0 + b.y1) / 2]
      : [(b.x0 + b.x1) / 2, b.y0, (b.x0 + b.x1) / 2, b.y1]),
    doors: boxes.filter(b => b.cls === 'door').map(b => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]),
    windows: boxes.filter(b => b.cls === 'window').map(b => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]),
  };
}
function svgGeometry(g, boxes = []) {
  const lines = polylinesToSegments(g.walls).map(([x0, y0, x1, y1]) => `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${colors.wall}" stroke-width="3"/>`).join('');
  const points = ['door', 'window'].map(cls => g[`${cls}s`].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" stroke="${colors[cls]}" stroke-width="3" fill="white" fill-opacity=".8"/>`).join('')).join('');
  const rects = boxes.map(b => `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="${colors[b.cls]}" stroke-width="1.5" stroke-opacity=".55"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">${rects}${lines}${points}</svg>`;
}
function scores(g, reference, wallTolerance = 8, openingTolerance = 16) {
  return { wall: matchLines(polylinesToSegments(g.walls), polylinesToSegments(reference.walls), wallTolerance),
    door: matchPoints(g.doors, reference.doors, openingTolerance), window: matchPoints(g.windows, reference.windows, openingTolerance) };
}
function aggregate(rows, method) {
  return Object.fromEntries(classes.map(cls => {
    const values = rows.map(r => r[method][cls]);
    if (cls !== 'wall') return [cls, scoreCounts(...['tp', 'fp', 'fn'].map(k => values.reduce((sum, v) => sum + v[k], 0)))];
    const lengths = Object.fromEntries(['predictedLength', 'referenceLength', 'supportedLength', 'recoveredLength'].map(k => [k, values.reduce((sum, v) => sum + v[k], 0)]));
    const precision = lengths.supportedLength / lengths.predictedLength || 0, recall = lengths.recoveredLength / lengths.referenceLength || 0;
    return [cls, { ...lengths, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 }];
  }));
}

if (process.argv[2] === 'report') {
  const manifest = JSON.parse(await fs.readFile(path.join(out, 'manifest.json'), 'utf8'));
  const annotationBytes = await fs.readFile(path.join(out, 'assistant-annotations.json'));
  const manual = JSON.parse(annotationBytes);
  const run = JSON.parse(await fs.readFile(path.join(out, 'detector-results.json'), 'utf8'));
  if (hash(annotationBytes) !== run.assistantAnnotationSha256) throw new Error('Assistant annotations changed after detector run.');
  if (manifest.samples.length !== 40 || manual.length !== 40 || run.results.length !== 40) throw new Error('Expected exactly 40 paired results.');
  await fs.mkdir(path.join(out, 'comparisons'), { recursive: true });
  await fs.mkdir(path.join(out, 'references'), { recursive: true });
  const rows = [], cards = [], sensitivity = { strict: [], loose: [] };
  const allBoxes = [];
  for (const sample of manifest.samples) {
    const assistant = manual.find(a => a.index === sample.index);
    const detection = run.results.find(a => a.index === sample.index);
    if (!assistant || !detection || detection.name !== sample.name) throw new Error(`Unpaired sample ${sample.index}`);
    const labelFile = path.join(dataset, 'labels/test', sample.name.replace(/\.png$/, '.txt'));
    const labelBytes = await fs.readFile(labelFile);
    const truth = labelBytes.toString().trim().split(/\r?\n/).filter(Boolean).map(line => {
      const values = line.split(/\s+/).map(Number);
      if (values.length !== 5 || !values.every(Number.isFinite) || !classes[values[0]]) throw new Error(`Invalid label in ${labelFile}`);
      const [cls, cx, cy, w, h] = values;
      return { cls: classes[cls], confidence: 1, x0: (cx - w / 2) * sample.width, y0: (cy - h / 2) * sample.height,
        x1: (cx + w / 2) * sample.width, y1: (cy + h / 2) * sample.height };
    });
    const t = previewTransform(sample);
    const detectorBoxes = detection.boxes.map(b => previewBox(b, t));
    const referenceBoxes = truth.map(b => previewBox(b, t));
    const detector = geometry(detectorBoxes), reference = geometry(referenceBoxes);
    const bbox = Object.fromEntries(classes.map(cls => [cls, matchBoxes(detection.boxes.filter(b => b.cls === cls), truth.filter(b => b.cls === cls))]));
    const row = { index: sample.index, name: sample.name, error: detection.error ?? null, elapsedMs: detection.elapsedMs,
      referenceCounts: Object.fromEntries(classes.map(c => [c, truth.filter(b => b.cls === c).length])),
      detectorCounts: Object.fromEntries(classes.map(c => [c, detection.boxes.filter(b => b.cls === c).length])),
      assistant: scores(assistant, reference), detector: scores(detector, reference), bbox, labelSha256: hash(labelBytes) };
    rows.push(row);
    sensitivity.strict.push({ assistant: scores(assistant, reference, 4, 8), detector: scores(detector, reference, 4, 8) });
    sensitivity.loose.push({ assistant: scores(assistant, reference, 16, 24), detector: scores(detector, reference, 16, 24) });
    allBoxes.push({ index: sample.index, referenceBoxes, detectorBoxes });
    const source = await fs.readFile(path.join(out, sample.preview));
    const manualPng = await sharp(source).composite([{ input: Buffer.from(svgGeometry(assistant)) }]).png().toBuffer();
    const detectorPng = await sharp(source).composite([{ input: Buffer.from(svgGeometry(detector, detectorBoxes)) }]).png().toBuffer();
    const referencePath = `references/${String(sample.index).padStart(2, '0')}.png`;
    await sharp(source).composite([{ input: Buffer.from(svgGeometry(reference, referenceBoxes)) }]).png().toFile(path.join(out, referencePath));
    const comparisonPath = `comparisons/${String(sample.index).padStart(2, '0')}.png`;
    const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="48"><rect width="2400" height="48" fill="#192b38"/><g font-family="sans-serif" font-size="22" fill="white"><text x="20" y="32">${sample.index}. Source image</text><text x="820" y="32">Assistant · approximate visual sketch</text><text x="1620" y="32">Corbel detector · actual browser output</text></g></svg>`);
    await sharp({ create: { width: 2400, height: 848, channels: 3, background: 'white' } }).composite([
      { input: title, left: 0, top: 0 }, { input: source, left: 0, top: 48 }, { input: manualPng, left: 800, top: 48 }, { input: detectorPng, left: 1600, top: 48 },
    ]).png().toFile(path.join(out, comparisonPath));
    const metricRow = classes.map(c => `<tr><td>${c}</td><td>${pct(row.assistant[c].f1)}</td><td>${pct(row.detector[c].f1)}</td><td>${row.referenceCounts[c]}</td><td>${row.detectorCounts[c]}</td></tr>`).join('');
    cards.push(`<article id="plan-${sample.index}"><h2>${sample.index}. ${esc(sample.name)}</h2><p>${esc(assistant.note)}</p><p class="muted">Uncertainty: ${esc(assistant.uncertainty)}</p><a href="${comparisonPath}" target="_blank"><img loading="lazy" src="${comparisonPath}" alt="Source, assistant sketch and detector output for ${esc(sample.name)}" width="2400" height="848"></a><div class="detail"><table><thead><tr><th>Shared feature</th><th>Assistant F1</th><th>Detector F1</th><th>Reference boxes</th><th>Detector boxes</th></tr></thead><tbody>${metricRow}</tbody></table><details><summary>Show dataset reference overlay</summary><img loading="lazy" src="${referencePath}" width="800" height="800" alt="Dataset reference annotations"></details></div></article>`);
  }
  const summary = { assistant: aggregate(rows, 'assistant'), detector: aggregate(rows, 'detector'),
    detectorBoxIoU50: Object.fromEntries(classes.map(c => [c, scoreCounts(...['tp', 'fp', 'fn'].map(k => rows.reduce((sum, r) => sum + r.bbox[c][k], 0)))])),
    failures: rows.filter(r => r.error).length,
    totalMs: rows.reduce((sum, r) => sum + r.elapsedMs, 0),
    sensitivity: Object.fromEntries(Object.entries(sensitivity).map(([name, values]) => [name, { assistant: aggregate(values, 'assistant'), detector: aggregate(values, 'detector') }])) };
  const methodology = '40 images sampled with seed 20260905 from sorted test filenames, without selection by output quality. Assistant manually inspected all 40 source previews and froze sketches before inference/label inspection. Assistant walls are approximate principal-wall polylines; door/window centres are manually estimated, with no calibrated widths, confidence scores or automatic inference timing. Both sets are evaluated against supplied YOLO test labels in an 800×800 aspect-preserving preview frame. Wall score is length-weighted centreline coverage within 8px, with 1px sampling; labels and detector boxes become longest-axis centrelines. Door/window score is maximum one-to-one centre matching within 16px. These are custom localization metrics, not mAP or proof of reconstruction accuracy. Separate detector-only F1 uses bounding-box IoU≥0.50 at confidence 0.25 and NMS 0.45. No threshold sweep or retraining performed. Reference conversion may include balcony walls, cabinet doors or incomplete cropped elements; manual sketches exclude some of these. Diagonal/L-shaped wall boxes lose shape when converted to a centreline. Strict and loose tolerance sensitivity is supplied in results.json. Browser wall-clock time includes image decode and first model load; assistant annotation latency is not measured.';
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ manifest, methodology, summary, rows }, null, 2));
  await fs.writeFile(path.join(out, 'reference-and-detector-boxes.json'), JSON.stringify(allBoxes));
  const tableRows = classes.map(c => `<tr><th>${c === 'wall' ? 'Wall centreline (8px)' : `${c} location (16px)`}</th><td>${pct(summary.assistant[c].precision)}</td><td>${pct(summary.assistant[c].recall)}</td><td>${pct(summary.assistant[c].f1)}</td><td>${pct(summary.detector[c].precision)}</td><td>${pct(summary.detector[c].recall)}</td><td>${pct(summary.detector[c].f1)}</td></tr>`).join('');
  const boxRows = classes.map(c => `<tr><th>${c}</th><td>${pct(summary.detectorBoxIoU50[c].precision)}</td><td>${pct(summary.detectorBoxIoU50[c].recall)}</td><td>${pct(summary.detectorBoxIoU50[c].f1)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Corbel · 40-image comparison</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#f1f4f5;color:#192b38;margin:0}main{max-width:1500px;margin:auto;padding:32px}h1{font-size:36px;margin:0}h2{font-size:20px}p{max-width:1100px}.muted{color:#566572}article,section{background:white;margin:24px 0;padding:24px;border:1px solid #d5dfe4;border-radius:8px}img{max-width:100%;height:auto}table{border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px 16px;border-bottom:1px solid #dde3e7}thead{background:#eef3f6}.detail{display:flex;gap:32px;align-items:start;flex-wrap:wrap}details img{max-width:650px;width:100%}summary{cursor:pointer}a{color:#185fac}nav{display:flex;gap:12px;flex-wrap:wrap}.legend span{margin-right:24px;font-weight:600}@media(max-width:700px){main{padding:12px}article,section{padding:12px}table{font-size:12px}th,td{padding:6px}.table-scroll{overflow:auto}}</style><main><h1>Corbel / 40-image comparison</h1><p>Source drawings → independent assistant sketches → shipped image detector. Test split · seed 20260905 · ${40 - summary.failures}/40 successful browser runs.</p><p class="legend"><span style="color:${colors.wall}">Red: wall centreline</span><span style="color:${colors.door}">Blue: door centre</span><span style="color:${colors.window}">Green: window centre</span></p><p class="muted">Detector/reference panels also show faint bounding boxes. Click any triptych for a full-resolution comparison.</p><section><h2>Shared-feature comparison</h2><p>These scores compare approximate geometry and symbol locations—not full reconstruction quality. Precision measures support by the dataset labels; recall measures label recovery.</p><div class="table-scroll"><table><thead><tr><th></th><th colspan="3">Assistant visual sketch</th><th colspan="3">Corbel detector</th></tr><tr><th>Feature</th><th>Precision</th><th>Recall</th><th>F1</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>${tableRows}</tbody></table></div><h2>Detector bounding-box F1 at IoU 0.50</h2><table><thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>${boxRows}</tbody></table><p>Detector elapsed time: ${(summary.totalMs / 1000).toFixed(1)} seconds including first load. Browser: ${esc(run.browser)}.</p><details><summary>Methodology and limitations</summary><p>${esc(methodology)}</p><p>Model SHA256: ${manifest.modelSha256}<br>Frozen assistant annotations: ${run.assistantAnnotationSha256}</p></details><p><a href="results.json">Results JSON</a> · <a href="results.csv">Results CSV</a> · <a href="assistant-annotations.json">Assistant annotations</a> · <a href="detector-results.json">Raw detector output</a></p></section><nav>${rows.map(r => `<a href="#plan-${r.index}">${r.index}</a>`).join('')}</nav>${cards.join('')}</main></html>`;
  await fs.writeFile(path.join(out, 'report.html'), html);
  const header = ['index', 'file', 'assistant_wall_f1', 'detector_wall_f1', 'assistant_door_f1', 'detector_door_f1', 'assistant_window_f1', 'detector_window_f1', 'detector_box_wall_f1', 'detector_box_door_f1', 'detector_box_window_f1', 'elapsed_ms', 'error'];
  const csv = rows.map(r => [r.index, r.name, r.assistant.wall.f1, r.detector.wall.f1, r.assistant.door.f1, r.detector.door.f1, r.assistant.window.f1, r.detector.window.f1, ...classes.map(c => r.bbox[c].f1), r.elapsedMs, r.error ?? ''].map(v => JSON.stringify(v)).join(','));
  await fs.writeFile(path.join(out, 'results.csv'), [header.join(','), ...csv].join('\n'));
  await fs.writeFile(path.join(out, 'README.md'), `# Corbel: 40-image comparison\n\nOpen report.html in a browser. Comparisons/ contains 40 full-size PNG triptychs.\n\n${methodology}\n\nRebuild report: node scripts/compare-40-plans.mjs report\n\nThe browser run used the production detectLocalMl export, bundled without code changes. ONNX runtime assets were served from installed files by Playwright interception instead of the CDN.\n`);
  const findings = `# Findings\n\nAll 40 browser detector runs completed. The detector scored above the assistant's approximate source-only sketches on each shared feature:\n\n| Shared metric (F1) | Assistant | Detector |\n|---|---:|---:|\n${classes.map(c => `| ${c} | ${pct(summary.assistant[c].f1)} | ${pct(summary.detector[c].f1)} |`).join('\n')}\n\nThese custom scores measure wall centreline coverage (8px tolerance in an 800px frame) and opening centre localization (16px tolerance), not full reconstruction correctness. The ordering also holds at the stricter and looser tolerances in results.json.\n\nThe detector's stricter bounding-box F1 at IoU 0.50 is ${pct(summary.detectorBoxIoU50.wall.f1)} for walls, ${pct(summary.detectorBoxIoU50.door.f1)} for doors, and ${pct(summary.detectorBoxIoU50.window.f1)} for windows. Wall extent/segmentation quality is weaker than coarse wall placement. No room closure, host-wall association, dimension calibration or editable reconstruction was evaluated. Those are the next tests needed to explain poor reconstructed plans.\n\nThe assistant baseline is manual approximate tracing by the current assistant, not a separately deployed vision model. It omits some fine symbols and external/cropped structures, is not a gold standard, and has no comparable automatic runtime. The supplied test labels are the independent reference. This sample was not used to tune either method.\n`;
  await fs.writeFile(path.join(out, 'FINDINGS.md'), findings);
  console.log(JSON.stringify(summary, null, 2));
}
