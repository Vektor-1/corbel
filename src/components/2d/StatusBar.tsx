/**
 * Bottom status bar for 2D canvas.
 * Displays metrics: wall count, room count, total area, tool status.
 */

import React from "react";

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
  const areaM2 = (totalAreaMm2 / 1e6).toFixed(1);

  return (
    <div
      data-testid="floor-plan-status-bar"
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: "8px 12px",
        fontSize: 12,
        backgroundColor: "#f5f5f5",
        borderTop: "1px solid #ddd",
      }}
    >
      <span>Walls: {wallCount}</span>
      <span>Rooms: {roomCount}</span>
      <span>Area: {areaM2} m²</span>
      <span style={{ marginLeft: "auto", color: "#555" }}>{statusLabel}</span>
    </div>
  );
};
