import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the commercially-valuable reconstruction/validation engine free of any
 * dependency on Corbel's teaching layer, so the engine can be extracted or sold
 * independently without first untangling it from lesson content, scoring rubrics,
 * or student-facing copy.
 *
 * The direction is one-way: the education layer is expected to depend on the
 * engine (it's built on top of it), but the engine must never import education
 * code. This test enforces only that direction, by statically scanning every
 * source file's import specifiers -- no bundler, no ESLint plugin, cheap to run
 * as part of the normal test suite.
 *
 * When a file's classification genuinely changes (see the note on
 * editorConfidence.ts below, moved here from an original plan that had not yet
 * read the file), update the lists below deliberately -- do not silence a
 * failure by, say, loosening the regex.
 */

const SRC_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The engine: reconstruction, geometry, validation/compliance, export,
 * persistence, and the core store and types. This is the surface a commercial
 * buyer would license -- it must stand on its own.
 */
const ENGINE_PATHS = [
  'lib/plan-import',
  'lib/geometry',
  'lib/objects',
  'lib/units',
  'lib/conversion',
  'lib/persistence',
  'lib/export',
  'lib/redesign.ts',
  // standards/ is engine EXCEPT traceFeedback.ts, which is carved out below --
  // it is specific to the image-trace teaching exercise (TraceCalibration,
  // student-facing wording), not a building-code or confidence check.
  'lib/standards',
  'store/designStore.ts',
];

const ENGINE_EXCEPTIONS = ['lib/standards/traceFeedback.ts'];

/**
 * The teaching layer: adaptive tutoring, the study protocol,
 * and the redesign rubric (which grades a student's edit against a baseline --
 * a pedagogical judgement, not a geometric fact like lib/comparison/match.ts).
 */
const EDU_PATHS = [
  'lib/learning',
  'lib/study',
  'lib/comparison/rubric.ts',
  'lib/standards/traceFeedback.ts',
];

function listFiles(relativePath: string): string[] {
  const absolute = path.join(SRC_ROOT, relativePath);
  const info = statSync(absolute, { throwIfNoEntry: false });
  if (!info) return [];
  if (info.isFile()) return [relativePath];

  const out: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name.includes('.test.')) continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(child));
    else if (/\.tsx?$/.test(entry.name)) out.push(child);
  }
  return out;
}

function isExcepted(file: string, exceptions: string[]): boolean {
  return exceptions.some((exception) => file === exception || file.startsWith(exception + '/'));
}

const engineFiles = ENGINE_PATHS.flatMap(listFiles).filter(
  (file) => !isExcepted(file, ENGINE_EXCEPTIONS)
);
const eduFiles = new Set(EDU_PATHS.flatMap(listFiles));

/** Resolves an import specifier relative to `fromFile` to a src-relative path. */
function resolveImport(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith('@/')) return specifier.slice(2);
  if (specifier.startsWith('.')) return path.normalize(path.join(path.dirname(fromFile), specifier));
  return null; // an npm package, not a Corbel module
}

/** True when `resolved` (extension-less or not) names a file under `known`. */
function matchesKnownFile(resolved: string, known: Set<string>): string | null {
  const candidates = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`, `${resolved}/index.tsx`];
  for (const candidate of candidates) if (known.has(candidate)) return candidate;
  return null;
}

describe('engine/education boundary', () => {
  it('classifies at least one file on each side, so the guard cannot silently pass empty', () => {
    expect(engineFiles.length).toBeGreaterThan(10);
    expect(eduFiles.size).toBeGreaterThan(3);
  });

  it('never imports education code from an engine module', () => {
    const violations: string[] = [];

    for (const file of engineFiles) {
      const source = readFileSync(path.join(SRC_ROOT, file), 'utf8');
      const specifiers = [...source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);

      for (const specifier of specifiers) {
        const resolved = resolveImport(specifier, file);
        if (!resolved) continue;
        const match = matchesKnownFile(resolved, eduFiles);
        if (match) violations.push(`${file} imports ${match} (via '${specifier}')`);
      }
    }

    expect(violations).toEqual([]);
  });
});
