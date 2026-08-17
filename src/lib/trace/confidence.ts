import type { Canonical } from "@/types/schema";

export const WALL_CONFIDENCE_THRESHOLD = 0.7;
export const OPENING_CONFIDENCE_THRESHOLD = 0.6;

export type LowConfidenceElement = {
  id: string;
  kind: "wall" | "opening";
  confidence: number;
};

/** Returns the editable geometry the student should verify against the source image. */
export function getLowConfidenceElements(floor: Canonical.Floor | null): LowConfidenceElement[] {
  if (!floor) return [];

  return [
    ...floor.walls
      .filter((wall) => wall.confidence < WALL_CONFIDENCE_THRESHOLD)
      .map((wall) => ({ id: wall.id, kind: "wall" as const, confidence: wall.confidence })),
    ...floor.openings
      .filter((opening) => opening.confidence < OPENING_CONFIDENCE_THRESHOLD)
      .map((opening) => ({ id: opening.id, kind: "opening" as const, confidence: opening.confidence })),
  ];
}
