import React from "react";
import { Group, Line } from "react-konva";

import { GRID_SIZE } from "../../lib/geometry/snap";

interface GridComponentProps {
  width: number;
  height: number;
  cellSize?: number;
}

/** Non-interactive 100 mm canvas grid. */
export const GridComponent: React.FC<GridComponentProps> = ({
  width,
  height,
  cellSize = GRID_SIZE,
}) => {
  const lines: React.ReactNode[] = [];

  for (let x = 0; x <= width; x += cellSize) {
    lines.push(
      <Line
        key={`grid-v-${x}`}
        points={[x, 0, x, height]}
        stroke="#ddd"
        strokeWidth={0.5}
        opacity={0.3}
        listening={false}
      />
    );
  }

  for (let y = 0; y <= height; y += cellSize) {
    lines.push(
      <Line
        key={`grid-h-${y}`}
        points={[0, y, width, y]}
        stroke="#ddd"
        strokeWidth={0.5}
        opacity={0.3}
        listening={false}
      />
    );
  }

  return <Group listening={false}>{lines}</Group>;
};
