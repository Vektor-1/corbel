'use client';

import React, { useEffect, useRef } from 'react';
import { Canonical } from '@/types/schema';

interface CanonicalRendererProps {
  floor: Canonical.Floor | null;
  library: Canonical.Library;
  width: number;
  height: number;
  ghostFloor?: Canonical.Floor | null;
  ghostOpacity?: number;
}

export function CanonicalRenderer({
  floor,
  library,
  width,
  height,
  ghostFloor,
  ghostOpacity = 0.3,
}: CanonicalRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !floor) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Calculate bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    floor.walls.forEach(wall => {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    });

    // Add padding
    const padding = 2000;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const scale = Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.95;
    const offsetX = width / 2 - ((maxX + minX) / 2) * scale;
    const offsetY = height / 2 - ((maxY + minY) / 2) * scale;

    const transformX = (x: number) => offsetX + x * scale;
    const transformY = (y: number) => offsetY + y * scale;

    // Draw ghost floor if present
    if (ghostFloor) {
      ctx.globalAlpha = ghostOpacity;
      drawFloor(ctx, ghostFloor, transformX, transformY);
      ctx.globalAlpha = 1;
    }

    // Draw current floor
    drawFloor(ctx, floor, transformX, transformY);

  }, [floor, ghostFloor, ghostOpacity, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', border: '1px solid #e0e0e0', background: '#fff' }}
    />
  );
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  floor: Canonical.Floor,
  transformX: (x: number) => number,
  transformY: (y: number) => number
) {
  // Draw rooms (filled)
  ctx.fillStyle = '#f0f0f0';
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;

  floor.rooms.forEach(room => {
    // Calculate centroid from vertices
    if (room.vertices && room.vertices.length > 0) {
      const centroidX = room.vertices.reduce((sum, v) => sum + v.x, 0) / room.vertices.length;
      const centroidY = room.vertices.reduce((sum, v) => sum + v.y, 0) / room.vertices.length;

      ctx.fillRect(
        transformX(centroidX - 1000),
        transformY(centroidY - 1000),
        2000,
        2000
      );
    }
  });

  // Draw walls
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  floor.walls.forEach(wall => {
    const wallType = null; // Would get from library if needed
    ctx.beginPath();
    ctx.moveTo(transformX(wall.start.x), transformY(wall.start.y));
    ctx.lineTo(transformX(wall.end.x), transformY(wall.end.y));
    ctx.stroke();
  });

  // Draw openings (doors/windows)
  floor.openings.forEach(opening => {
    const wall = floor.walls.find(w => w.id === opening.hostWallId);
    if (!wall) return;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    const x = wall.start.x + ux * opening.positionAlongWall;
    const y = wall.start.y + uy * opening.positionAlongWall;

    const px = transformX(x);
    const py = transformY(y);

    if (opening.kind === 'door') {
      // Draw door as arc
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 100, 0, Math.PI / 2);
      ctx.stroke();
    } else {
      // Draw window as small rectangle
      ctx.fillStyle = '#87CEEB';
      ctx.fillRect(px - 50, py - 50, 100, 100);
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 50, py - 50, 100, 100);
    }
  });

  // Draw room labels
  ctx.fillStyle = '#333';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  floor.rooms.forEach(room => {
    if (room.vertices && room.vertices.length > 0) {
      const centroidX = room.vertices.reduce((sum, v) => sum + v.x, 0) / room.vertices.length;
      const centroidY = room.vertices.reduce((sum, v) => sum + v.y, 0) / room.vertices.length;
      const text = room.label || room.type || 'Room';
      ctx.fillText(text, transformX(centroidX), transformY(centroidY));
    }
  });
}
