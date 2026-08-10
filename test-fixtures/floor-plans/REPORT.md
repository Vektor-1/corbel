# Corbel Trace baseline evaluation

## Corpus

Seven evaluated inputs derived from five licensed online sources:

- clean modern raster plan
- degraded/rotated derivative
- PDF derivative
- historic residential scan
- historic institutional scan
- complex historic plan
- rasterized vector kitchen plan

See `SOURCES.md` for provenance and licensing.

## Results

| Input | Wall candidates | Canonical segments | Derived rooms | OCR labels | OCR dimensions |
|---|---:|---:|---:|---:|---:|
| Clean modern, degraded | 25 | 39 | 0 | 5 | 1 |
| Clean modern JPEG | 21 | 32 | 1 | 5 | 0 |
| Clean modern PDF | 21 | 36 | 3 | 5 | 5 |
| Complex historic | 51 | 66 | 0 | 0 | 17 |
| Historic home | 40 | 97 | 1 | 1 | 5 |
| Historic library | 56 | 115 | 3 | 0 | 0 |
| Kitchen vector raster | 8 | 10 | 0 | 1 | 0 |

All seven inputs completed ingestion, produced valid `ReconstructionResultV1` payloads, passed the TypeScript response parser, and entered Corbel's reconstruction pipeline without schema errors.

## Refinement comparison

The second pass pairs parallel wall boundaries into centerlines, suppresses long unpaired annotation lines, and snaps near-miss horizontal/vertical junctions.

- Candidate lines fell from 46 to 25 on the degraded modern plan.
- Candidate lines fell from 40 to 21 on the clean JPEG.
- Canonical segments fell from 147 to 32 on the clean JPEG.
- Historic-home canonical segments fell from 671 to 97.
- Historic-library canonical segments fell from 612 to 115.
- Spurious historic-room topology dropped substantially, while the clean PDF recovered three closed spaces.

Confidence remains deliberately conservative because these scores measure geometric evidence, not semantic certainty.

## Findings

### Working

- JPEG, PNG and PDF ingestion
- PDF page rasterization
- line candidate extraction after dotted-grid/text suppression
- OCR candidate output
- versioned worker/Next.js contract compatibility
- Corbel wall splitting and topology reconstruction
- low-confidence diagnostics

### Not production-ready

- Wall candidates still include furniture, annotations and duplicate wall boundaries.
- Intersection repair can expand false candidates into hundreds of canonical segments.
- Closed-room recovery is unstable on degraded plans.
- OCR dimensions are not yet associated with the geometry they dimension.
- No learned door/window detector is connected yet.
- The default scale is intentionally low-confidence and requires manual calibration.

## Decision

The classical pipeline is useful as a deployment and contract baseline, but it must not be marketed as accurate reconstruction. The next technical milestone is a learned wall/opening adapter, followed by graph simplification before Corbel topology repair.
