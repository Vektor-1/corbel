// Day 7 of docs/corbel-custom-geometry-model-plan.md: real-browser latency
// benchmark for G0 (the segmentation candidate), WASM vs WebGPU, plus a
// Web Worker inference-offload spike. Served as plain static files (not a
// Next.js route) rooted at the repo root via `python3 -m http.server`, so
// model + sample image paths below are absolute from the server root.

const MODEL_URL = '/ml/g0/g0_slim.onnx';
const INPUT_SIZE = 640;
const WARMUP = 3;

// Stratified sample across the three CubiCasa5k styles, drawn from the same
// 400-image validation split G0 was evaluated on (Day 5's vectorizer gate).
const SAMPLE_IMAGES = [
  'colorful_11261.png', 'colorful_13824.png', 'colorful_14328.png', 'colorful_14887.png',
  'colorful_14931.png', 'colorful_1603.png', 'colorful_4719.png',
  'high_quality_1034.png', 'high_quality_14054.png', 'high_quality_1547.png',
  'high_quality_3566.png', 'high_quality_4860.png', 'high_quality_6079.png', 'high_quality_7520.png',
  'high_quality_architectural_1052.png', 'high_quality_architectural_1783.png',
  'high_quality_architectural_3541.png', 'high_quality_architectural_5566.png',
  'high_quality_architectural_6290.png', 'high_quality_architectural_7864.png',
  'high_quality_architectural_9038.png',
].map((name) => `/ml/dataset_seg/images/val/${name}`);

const logEl = document.getElementById('log');
function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  logEl.textContent += line + '\n';
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

function statsOf(samples) {
  const steady = samples.length > WARMUP ? samples.slice(WARMUP) : samples;
  const sorted = [...steady].sort((a, b) => a - b);
  return {
    n: steady.length,
    mean: steady.reduce((s, v) => s + v, 0) / steady.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

async function loadImageBitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

// Mirrors src/lib/plan-import/local-ml.ts's preprocess() letterbox, minus
// enhancePlanPixels -- pixel content doesn't affect inference latency, and
// today's scope is timing, not accuracy (that's Day 8-9's companion
// evaluator).
function preprocess(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext('2d');
  const scale = Math.min(INPUT_SIZE / bitmap.width, INPUT_SIZE / bitmap.height);
  const scaledW = Math.max(1, Math.round(bitmap.width * scale));
  const scaledH = Math.max(1, Math.round(bitmap.height * scale));
  const padX = Math.floor((INPUT_SIZE - scaledW) / 2);
  const padY = Math.floor((INPUT_SIZE - scaledH) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(bitmap, padX, padY, scaledW, scaledH);
  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < plane; i++) {
    tensor[i] = data[i * 4] / 255;
    tensor[plane + i] = data[i * 4 + 1] / 255;
    tensor[plane * 2 + i] = data[i * 4 + 2] / 255;
  }
  return tensor;
}

async function runConfig(label, sessionOptions) {
  log(`--- ${label} ---`);
  const tLoadStart = performance.now();
  let session;
  try {
    session = await ort.InferenceSession.create(MODEL_URL, sessionOptions);
  } catch (error) {
    log(`  FAILED to create session: ${error}`);
    return { label, error: String(error) };
  }
  const loadMs = performance.now() - tLoadStart;
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  log(`  session created in ${loadMs.toFixed(1)}ms (input="${inputName}", output="${outputName}")`);

  const preprocessMs = [];
  const inferenceMs = [];
  const totalMs = [];

  for (const url of SAMPLE_IMAGES) {
    const bitmap = await loadImageBitmap(url);
    const tStart = performance.now();
    const tensorData = preprocess(bitmap);
    bitmap.close();
    const tPre = performance.now();
    const tensor = new ort.Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const outputs = await session.run({ [inputName]: tensor });
    const tInfer = performance.now();
    void outputs[outputName];
    preprocessMs.push(tPre - tStart);
    inferenceMs.push(tInfer - tPre);
    totalMs.push(tInfer - tStart);
  }

  const result = {
    label,
    loadMs,
    preprocess: statsOf(preprocessMs),
    inference: statsOf(inferenceMs),
    total: statsOf(totalMs),
  };
  log(`  preprocess: mean=${result.preprocess.mean.toFixed(1)}ms p50=${result.preprocess.p50.toFixed(1)}ms`);
  log(`  inference:  mean=${result.inference.mean.toFixed(1)}ms p50=${result.inference.p50.toFixed(1)}ms p95=${result.inference.p95.toFixed(1)}ms max=${result.inference.max.toFixed(1)}ms`);
  log(`  total:      mean=${result.total.mean.toFixed(1)}ms p50=${result.total.p50.toFixed(1)}ms p95=${result.total.p95.toFixed(1)}ms`);
  await session.release();
  return result;
}

async function checkWebGpu() {
  if (!('gpu' in navigator)) return { supported: false, reason: 'navigator.gpu not present' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: 'requestAdapter() returned null' };
    return {
      supported: true,
      limits: { maxTextureDimension2D: adapter.limits.maxTextureDimension2D, maxBufferSize: adapter.limits.maxBufferSize },
      features: [...adapter.features],
    };
  } catch (error) {
    return { supported: false, reason: String(error) };
  }
}

// onnxruntime-web's InferenceSession.run() is not reentrant -- sending a
// burst of messages to the worker without waiting for each response caused
// "Session already started" / "Session mismatch" errors on the first
// attempt (recorded as a real finding in the Day 7 writeup). Each image is
// now sent only after the previous response arrives.
function runWorkerSpike() {
  return new Promise(async (resolve) => {
    log('--- worker spike (WASM, main-thread preprocess + transferred tensor) ---');
    const worker = new Worker('./worker.js');
    const roundTripMs = [];
    const sessionWaitMs = [];
    const inferenceMs = [];
    const errors = [];

    function sendOne(url) {
      return new Promise(async (resolveOne) => {
        const bitmap = await loadImageBitmap(url);
        const tensorData = preprocess(bitmap);
        bitmap.close();
        const buffer = tensorData.buffer;

        worker.onmessage = (event) => {
          const { ok, error, sessionWaitMs: sw, inferenceMs: im, roundTripStart } = event.data;
          const roundTrip = performance.now() - roundTripStart;
          if (!ok) {
            errors.push(error);
            log(`  worker error: ${error}`);
          } else {
            roundTripMs.push(roundTrip);
            sessionWaitMs.push(sw);
            inferenceMs.push(im);
          }
          resolveOne();
        };

        const roundTripStart = performance.now();
        worker.postMessage(
          { modelUrl: MODEL_URL, tensorBuffer: buffer, dims: [1, 3, INPUT_SIZE, INPUT_SIZE], inputName: 'input', roundTripStart },
          [buffer]
        );
      });
    }

    for (const url of SAMPLE_IMAGES) {
      await sendOne(url);
    }

    worker.terminate();
    const result = {
      label: 'worker (wasm)',
      roundTrip: statsOf(roundTripMs),
      sessionWait: statsOf(sessionWaitMs),
      inference: statsOf(inferenceMs),
      errorCount: errors.length,
    };
    if (roundTripMs.length > 0) {
      log(`  round trip: mean=${result.roundTrip.mean.toFixed(1)}ms p50=${result.roundTrip.p50.toFixed(1)}ms`);
      log(`  in-worker inference: mean=${result.inference.mean.toFixed(1)}ms p50=${result.inference.p50.toFixed(1)}ms`);
    } else {
      log(`  all ${errors.length} worker calls failed -- see errors above.`);
    }
    resolve(result);
  });
}

async function main() {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

  log(`onnxruntime-web ${ort.env.versions ? JSON.stringify(ort.env.versions) : '(version unknown)'}`);
  log(`User-Agent: ${navigator.userAgent}`);
  log(`Sample images: ${SAMPLE_IMAGES.length} (warmup=${WARMUP}, steady-state n=${SAMPLE_IMAGES.length - WARMUP})`);

  const workerOnly = new URLSearchParams(location.search).has('workerOnly');
  const results = {};
  let webgpuCheck = { skipped: true, reason: 'not run (workerOnly=1)' };

  if (!workerOnly) {
    results.wasmBaseline = await runConfig('WASM baseline (default SessionOptions)', {
      executionProviders: ['wasm'],
    });

    results.wasmOptimized = await runConfig('WASM + graphOptimizationLevel=all', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      executionMode: 'sequential',
    });

    webgpuCheck = await checkWebGpu();
    log(`WebGPU capability: ${JSON.stringify(webgpuCheck)}`);
    if (webgpuCheck.supported) {
      results.webgpu = await runConfig('WebGPU (fallback to wasm)', {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      });
    } else {
      results.webgpu = { skipped: true, reason: webgpuCheck.reason };
      log('Skipping WebGPU benchmark (not supported in this context).');
    }
  } else {
    log('workerOnly=1: skipping WASM/WebGPU configs, running the worker spike only.');
  }

  results.worker = await runWorkerSpike();

  log('NOTE: vectorization (mask -> polyline) is not ported to TS yet (ml/vectorize.py is Python-only). These numbers cover load/preprocess/inference only, not full geometry extraction.');

  if (!workerOnly) {
    const gateMs = 1000;
    const p50 = results.wasmOptimized.inference?.p50 ?? results.wasmBaseline.inference?.p50;
    log(`Gate check: warm WASM inference p50 target <= ${gateMs}ms. Measured (optimized WASM): ${p50?.toFixed(1)}ms -> ${p50 <= gateMs ? 'CLEARS' : 'DOES NOT CLEAR'} the bar.`);
  }

  log('DAY7_RESULT_JSON:');
  log(JSON.stringify({ webgpuCheck, ...results }));
}

main().catch((error) => log(`FATAL: ${error && error.stack || error}`));
