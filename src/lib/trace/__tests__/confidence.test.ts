import { describe, expect, it } from "vitest";

import { getLowConfidenceElements } from "../confidence";
import type { Canonical } from "@/types/schema";

const floor = {
  walls: [
    { id: "wall-low", confidence: 0.69 },
    { id: "wall-clear", confidence: 0.7 },
  ],
  openings: [
    { id: "opening-low", confidence: 0.59 },
    { id: "opening-clear", confidence: 0.6 },
  ],
} as unknown as Canonical.Floor;

describe("getLowConfidenceElements", () => {
  it("flags only walls and openings below their inclusive review thresholds", () => {
    expect(getLowConfidenceElements(floor)).toEqual([
      { id: "wall-low", kind: "wall", confidence: 0.69 },
      { id: "opening-low", kind: "opening", confidence: 0.59 },
    ]);
  });
});
