/**
 * Bottom status bar for 2D canvas.
 * Displays metrics: wall count, room count, total area, tool status.
 * Uses millimetres internally and presents student-facing area in square metres.
 */

import React from 'react';

export interface StatusBarProps {
  wallCount: number;
  roomCount: number;
  totalAreaMm2: number;
  statusLabel: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  wallCount,
  roomCount,
  totalAreaMm2,
  statusLabel,
}) => {
  const totalAreaM2 = totalAreaMm2 / 1_000_000;

  return (
    <footer
      aria-label="Canvas status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#ddd] bg-[#f7f7f7] px-3 py-2 text-xs text-[#4a4a4a]"
    >
      <div className="flex flex-wrap gap-x-3">
        <span>Walls: {wallCount}</span>
        <span>Rooms: {roomCount}</span>
        <span>Total area: {totalAreaM2.toFixed(1)} m²</span>
      </div>
      <span aria-live="polite">{statusLabel}</span>
    </footer>
  );
};
