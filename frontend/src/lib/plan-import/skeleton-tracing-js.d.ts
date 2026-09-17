// skeleton-tracing-js (npm, MIT, https://github.com/LingDong-/skeleton-tracing)
// ships no TypeScript types. This covers only the one API this project
// uses (fromBoolArray) -- verified against the installed package's
// runtime shape (Day 1 spike, docs/corbel-ship-segmentation-plan.md).
declare module 'skeleton-tracing-js' {
  export interface SkeletonTraceResult {
    polylines: [number, number][][];
    rects: [number, number, number, number][];
  }

  interface SkeletonTracer {
    fromBoolArray(arr: Uint8Array | boolean[], width: number, height: number): SkeletonTraceResult;
  }

  // UMD single-object export (`module.exports = TraceSkeleton`), not
  // individually-assigned named exports -- confirmed by reading the
  // installed dist file directly. A default import is the portable form;
  // a named `{ fromBoolArray }` import only works under bundler-style
  // dynamic CJS interop (Vite/webpack), not Node's native ESM loader.
  const TraceSkeleton: SkeletonTracer;
  export default TraceSkeleton;
}
