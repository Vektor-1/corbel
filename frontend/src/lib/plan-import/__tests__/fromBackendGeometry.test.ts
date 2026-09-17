import { describe, it, expect } from 'vitest';
import { fromBackendGeometry, type BackendGeometry, type OcrScaleResult } from '../fromBackendGeometry';
import type { ImportSource } from '../types';

const source: ImportSource = { kind: 'image', fileName: 'plan.png', url: 'http://localhost/plan.png', width: 800, height: 600 };

const ocr: OcrScaleResult = {
  labels: [{ id: 'label-1', text: 'Bedroom', x: 100, y: 100, role: 'room-name' }],
  scale: { pixelsPerMeter: 100, confidence: 0.9, method: 'dimension-ocr' },
};

describe('fromBackendGeometry', () => {
  it('maps walls and openings one-to-one into PlanDetection[]', () => {
    const geometry: BackendGeometry = {
      walls: [
        { id: 'g0-w0', kind: 'wall', confidence: 0.65, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thicknessMm: 200, role: 'partition' },
      ],
      openings: [
        { id: 'yolo-o0', kind: 'door', confidence: 0.8, wallId: 'g0-w0', offsetRatio: 0.5, widthMm: 900, heightMm: null, sillHeightMm: null, swing: 'left' },
      ],
    };

    const result = fromBackendGeometry(source, geometry, ocr);

    expect(result.schemaVersion).toBe(1);
    expect(result.source).toBe(source);
    expect(result.scale).toEqual(ocr.scale);
    expect(result.detections).toHaveLength(3); // 1 wall + 1 opening + 1 room-name label

    const wall = result.detections.find((d) => d.id === 'g0-w0');
    expect(wall).toMatchObject({ kind: 'wall', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thicknessMm: 200, role: 'partition' });

    const opening = result.detections.find((d) => d.id === 'yolo-o0');
    expect(opening).toMatchObject({ kind: 'door', wallId: 'g0-w0', offsetRatio: 0.5, widthMm: 900 });
  });

  it('converts pixel measurements only after OCR/manual scale is available', () => {
    const geometry: BackendGeometry = {
      walls: [{ id: 'w1', kind: 'wall', confidence: 0.8, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thicknessPx: 20 }],
      openings: [{ id: 'o1', kind: 'door', confidence: 0.8, wallId: 'w1', offsetRatio: 0.5, widthPx: 90 }],
    };

    const result = fromBackendGeometry(source, geometry, ocr);
    expect(result.detections.find((d) => d.id === 'w1')).toMatchObject({ thicknessMm: 200 });
    expect(result.detections.find((d) => d.id === 'o1')).toMatchObject({ widthMm: 900 });
  });

  it('converts null heightMm/sillHeightMm to undefined rather than passing null through', () => {
    const geometry: BackendGeometry = {
      walls: [],
      openings: [{ id: 'o1', kind: 'window', confidence: 0.7, wallId: 'w1', offsetRatio: 0.2, widthMm: 600, heightMm: null, sillHeightMm: null }],
    };
    const result = fromBackendGeometry(source, geometry, ocr);
    const opening = result.detections[0] as { heightMm?: number; sillHeightMm?: number };
    expect(opening.heightMm).toBeUndefined();
    expect(opening.sillHeightMm).toBeUndefined();
  });

  it('clamps offsetRatio into [0, 1]', () => {
    const geometry: BackendGeometry = {
      walls: [],
      openings: [{ id: 'o1', kind: 'door', confidence: 0.7, wallId: 'w1', offsetRatio: 1.4, widthMm: 900 }],
    };
    const result = fromBackendGeometry(source, geometry, ocr);
    expect((result.detections[0] as { offsetRatio: number }).offsetRatio).toBe(1);
  });

  it('defaults role to partition when the backend omits it', () => {
    const geometry: BackendGeometry = {
      walls: [{ id: 'w1', kind: 'wall', confidence: 0.6, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
      openings: [],
    };
    const result = fromBackendGeometry(source, geometry, ocr);
    expect((result.detections[0] as { role: string }).role).toBe('partition');
  });

  it('filters OCR labels to room-name only', () => {
    const ocrWithExtras: OcrScaleResult = {
      labels: [
        { id: 'l1', text: 'Kitchen', x: 0, y: 0, role: 'room-name' },
        { id: 'l2', text: '3.2m', x: 10, y: 10, role: 'dimension' },
      ],
      scale: ocr.scale,
    };
    const result = fromBackendGeometry(source, { walls: [], openings: [] }, ocrWithExtras);
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]).toMatchObject({ kind: 'label', text: 'Kitchen' });
  });

  it('falls back to a default confidence when there are no walls or openings', () => {
    const result = fromBackendGeometry(source, { walls: [], openings: [] }, ocr);
    expect(result.overallConfidence).toBe(0.7);
  });

  it('averages confidence across walls and openings', () => {
    const geometry: BackendGeometry = {
      walls: [{ id: 'w1', kind: 'wall', confidence: 0.8, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
      openings: [{ id: 'o1', kind: 'door', confidence: 0.6, wallId: 'w1', offsetRatio: 0.5, widthMm: 900 }],
    };
    const result = fromBackendGeometry(source, geometry, ocr);
    expect(result.overallConfidence).toBe(0.7);
  });
});
