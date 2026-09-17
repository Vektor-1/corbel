/**
 * Annotation system for floor plans.
 * Sticky notes and measurement lines for markup.
 */

import { Canonical } from '@/types/schema';

export type AnnotationType = 'note' | 'measurement' | 'marker';

export interface Annotation {
  id: string;
  type: AnnotationType;
  position: { x: number; y: number };
  content: string;
  color: 'yellow' | 'blue' | 'red' | 'green';
  createdAt: number;
  author?: string;
}

export interface MeasurementAnnotation extends Annotation {
  type: 'measurement';
  endPosition: { x: number; y: number };
  lengthMm?: number;
}

export interface AnnotationStore {
  annotations: Annotation[];
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt'>) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  getAnnotationsByType: (type: AnnotationType) => Annotation[];
  clearAnnotations: () => void;
}

export function createAnnotationStore(): AnnotationStore {
  let annotations: Annotation[] = [];

  return {
    annotations,
    addAnnotation: (annotation) => {
      const id = `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      annotations.push({
        ...annotation,
        id,
        createdAt: Date.now(),
      });
    },
    removeAnnotation: (id) => {
      annotations = annotations.filter((a) => a.id !== id);
    },
    updateAnnotation: (id, updates) => {
      const idx = annotations.findIndex((a) => a.id === id);
      if (idx !== -1) {
        annotations[idx] = { ...annotations[idx], ...updates };
      }
    },
    getAnnotationsByType: (type) => annotations.filter((a) => a.type === type),
    clearAnnotations: () => {
      annotations = [];
    },
  };
}

export function getAnnotationLabel(annotation: Annotation): string {
  if (annotation.type === 'measurement') {
    const m = annotation as MeasurementAnnotation;
    return m.lengthMm ? `${(m.lengthMm / 1000).toFixed(2)}m` : 'Measure';
  }
  return annotation.content.substring(0, 20);
}
