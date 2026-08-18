import type { FloorPlan, Wall, Door, Window } from "@/types/design";

export const WALL_CONFIDENCE_THRESHOLD = 0.7;
export const OPENING_CONFIDENCE_THRESHOLD = 0.6;

export type LowConfidenceElement = {
  id: string;
  kind: "wall" | "door" | "window";
  confidence: number;
};

export function getLowConfidenceElements(plan: FloorPlan | null): LowConfidenceElement[] {
  if (!plan) return [];

  return [
    ...plan.walls
      .filter((wall) => (wall.confidence ?? 1) < WALL_CONFIDENCE_THRESHOLD)
      .map((wall) => ({ id: wall.id, kind: "wall" as const, confidence: wall.confidence ?? 1 })),
    ...plan.doors
      .filter((door) => (door.confidence ?? 1) < OPENING_CONFIDENCE_THRESHOLD)
      .map((door) => ({ id: door.id, kind: "door" as const, confidence: door.confidence ?? 1 })),
    ...plan.windows
      .filter((win) => (win.confidence ?? 1) < OPENING_CONFIDENCE_THRESHOLD)
      .map((win) => ({ id: win.id, kind: "window" as const, confidence: win.confidence ?? 1 })),
  ];
}

export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
