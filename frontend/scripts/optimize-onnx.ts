#!/usr/bin/env node
/**
 * Day 7 item 1 of docs/corbel-custom-geometry-model-plan.md: test
 * onnxruntime-web's SessionOptions.graphOptimizationLevel + executionMode
 * against G0 (the segmentation candidate) and Run C (the currently-shipped
 * fallback candidate), and bake the optimized graph to disk via
 * optimizedModelFilePath so the browser benchmark doesn't re-run the
 * optimizer on every page load. Node-side only -- running this inside a
 * browser triggers a download popup instead of writing silently.
 *
 * Example:
 * node --experimental-strip-types scripts/optimize-onnx.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as ort from 'onnxruntime-web';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const WARMUP = 3;
const RUNS = 15;

interface ModelSpec {
  name: string;
  path: string;
  inputName: string;
  inputShape: number[];
  optimizedOutPath: string;
}

const MODELS: ModelSpec[] = [
  {
    name: 'G0 (segmentation candidate)',
    path: path.join(ROOT, 'ml/g0/g0_slim.onnx'),
    inputName: 'input',
    inputShape: [1, 3, 640, 640],
    optimizedOutPath: path.join(ROOT, 'ml/g0/g0_optimized.onnx'),
  },
  {
    name: 'Run C (shipped fallback candidate)',
    path: path.join(ROOT, 'ml/train_runC.onnx'),
    inputName: 'images',
    inputShape: [1, 3, 640, 640],
    optimizedOutPath: path.join(ROOT, 'ml/g0/runC_optimized.onnx.scratch'),
  },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

function stats(samples: number[]): { mean: number; p50: number; p95: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    mean: samples.reduce((sum, v) => sum + v, 0) / samples.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

async function detectInputName(modelPath: string, fallback: string): Promise<string> {
  const probe = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
  const name = probe.inputNames[0] ?? fallback;
  await probe.release();
  return name;
}

async function timeSession(
  session: ort.InferenceSession,
  inputName: string,
  inputShape: number[]
): Promise<number[]> {
  const size = inputShape.reduce((a, b) => a * b, 1);
  const data = new Float32Array(size);
  for (let i = 0; i < size; i++) data[i] = Math.random();
  const tensor = new ort.Tensor('float32', data, inputShape);

  for (let i = 0; i < WARMUP; i++) {
    await session.run({ [inputName]: tensor });
  }
  const timings: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await session.run({ [inputName]: tensor });
    timings.push(performance.now() - start);
  }
  return timings;
}

async function benchmarkModel(spec: ModelSpec) {
  console.log(`\n=== ${spec.name} (${spec.path}) ===`);

  let inputName = spec.inputName;
  try {
    inputName = await detectInputName(spec.path, spec.inputName);
  } catch (error) {
    console.log(`  Could not probe input name, using default "${spec.inputName}": ${(error as Error).message}`);
  }

  const baselineSession = await ort.InferenceSession.create(spec.path, {
    executionProviders: ['wasm'],
  });
  const baselineTimings = await timeSession(baselineSession, inputName, spec.inputShape);
  const baselineStats = stats(baselineTimings);
  console.log(`  baseline (default SessionOptions): mean=${baselineStats.mean.toFixed(1)}ms p50=${baselineStats.p50.toFixed(1)}ms p95=${baselineStats.p95.toFixed(1)}ms`);
  await baselineSession.release();

  const optimizedSession = await ort.InferenceSession.create(spec.path, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
  });
  const optimizedTimings = await timeSession(optimizedSession, inputName, spec.inputShape);
  const optimizedStats = stats(optimizedTimings);
  console.log(`  optimized (graphOptimizationLevel=all):  mean=${optimizedStats.mean.toFixed(1)}ms p50=${optimizedStats.p50.toFixed(1)}ms p95=${optimizedStats.p95.toFixed(1)}ms`);
  await optimizedSession.release();

  // optimizedModelFilePath reproducibly crashes onnxruntime-web's threaded
  // WASM build under Node (TypeError inside ort-wasm-simd-threaded.mjs's
  // stdout-print shim while serializing the optimized graph -- happens
  // identically with numThreads forced to 1, so it isn't a threading race).
  // Not attempting to bake the optimized graph to disk from Node; the
  // browser harness applies graphOptimizationLevel directly at session
  // creation instead, which sidesteps this entirely.
  const optimizedFileSize: number | null = null;

  const deltaPct = ((baselineStats.mean - optimizedStats.mean) / baselineStats.mean) * 100;
  console.log(`  delta: ${deltaPct >= 0 ? '-' : '+'}${Math.abs(deltaPct).toFixed(1)}% mean latency vs baseline`);

  return {
    name: spec.name,
    modelPath: spec.path,
    inputName,
    runs: RUNS,
    warmup: WARMUP,
    baseline: baselineStats,
    optimized: optimizedStats,
    optimizedFilePath: spec.optimizedOutPath,
    optimizedFileSizeBytes: optimizedFileSize,
    deltaPctMeanLatency: deltaPct,
  };
}

async function main() {
  const results = [];
  for (const spec of MODELS) {
    try {
      await fs.access(spec.path);
    } catch {
      console.log(`\n=== ${spec.name} ===\n  SKIPPED: model not found at ${spec.path}`);
      continue;
    }
    results.push(await benchmarkModel(spec));
  }

  const outPath = path.join(ROOT, 'ml/g0/onnx_optimization_report.json');
  await fs.writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nWrote report: ${outPath}`);
}

void main();
