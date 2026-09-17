// Day 7 worker spike: receives a main-thread-preprocessed transferable
// tensor buffer and runs ort inference off the main thread. Preprocessing
// itself stays on the main thread (workers have no DOM/canvas) -- this
// proves only that the inference step can move off-thread, not a full
// OffscreenCanvas migration.
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.min.js');

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

let sessionPromise = null;

function getSession(modelUrl) {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
  }
  return sessionPromise;
}

self.onmessage = async (event) => {
  const { id, modelUrl, tensorBuffer, dims, inputName } = event.data;
  try {
    const tSessionStart = performance.now();
    const session = await getSession(modelUrl);
    const tSessionReady = performance.now();

    const data = new Float32Array(tensorBuffer);
    const tensor = new ort.Tensor('float32', data, dims);

    const tInferStart = performance.now();
    const outputs = await session.run({ [inputName]: tensor });
    const tInferEnd = performance.now();

    const outputName = Object.keys(outputs)[0];
    const outData = outputs[outputName].data;
    const outBuffer = outData.buffer.slice(0);

    self.postMessage(
      {
        id,
        ok: true,
        sessionWaitMs: tSessionReady - tSessionStart,
        inferenceMs: tInferEnd - tInferStart,
        outDims: outputs[outputName].dims,
        outBuffer,
      },
      [outBuffer]
    );
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.stack || error) });
  }
};
