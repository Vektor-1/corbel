/**
 * Bidirectional 2D ↔ 3D Floor Plan Conversion
 * Synchronization engine between Canonical 2D and 3D schemas
 */

import { Canonical, Source } from '@/types/schema';
import { Canonical3D } from '@/lib/types/3d';

const DEFAULT_WALL_HEIGHT = 2800; // mm
const DEFAULT_CEILING_HEIGHT = 2800; // mm
const DEFAULT_SILL_HEIGHT = 1000; // mm for windows

/**
 * Convert Canonical 2D floor plan to 3D
 */
export function convert2DTo3D(floor2D: Canonical.Floor): Canonical3D.Floor3D {
  const floorWithMetadata = floor2D as (Canonical.Floor & { name?: string });
  const floor3D: Canonical3D.Floor3D = {
    id: `3d-${floor2D.id}`,
    floorId2D: floor2D.id,
    name: floorWithMetadata.name || 'Floor',
    walls: [],
    rooms: [],
    openings: [],
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      scale: 1.0,
      defaultHeight: DEFAULT_WALL_HEIGHT,
    },
  };

  // Convert walls
  floor2D.walls.forEach(wall2D => {
    const wall3D: Canonical3D.Wall3D = {
      id: `3d-${wall2D.id}`,
      wallId2D: wall2D.id,
      start: {
        x: wall2D.start.x,
        y: wall2D.start.y,
        z: 0,
      },
      end: {
        x: wall2D.end.x,
        y: wall2D.end.y,
        z: 0,
      },
      height: DEFAULT_WALL_HEIGHT,
      thickness: 200, // Default, would get from library
      material: 'concrete',
      loadBearing: true,
      confidence: wall2D.confidence,
    };
    floor3D.walls.push(wall3D);
  });

  // Convert rooms
  floor2D.rooms.forEach(room2D => {
    const centroid = { x: 0, y: 0 };
    if (room2D.vertices && room2D.vertices.length > 0) {
      room2D.vertices.forEach(v => {
        centroid.x += v.x;
        centroid.y += v.y;
      });
      centroid.x /= room2D.vertices.length;
      centroid.y /= room2D.vertices.length;
    }
    const room3D: Canonical3D.Room3D = {
      id: `3d-${room2D.id}`,
      roomId2D: room2D.id,
      vertices: [
        { x: centroid.x - 1000, y: centroid.y - 1000, z: 0 },
        { x: centroid.x + 1000, y: centroid.y - 1000, z: 0 },
        { x: centroid.x + 1000, y: centroid.y + 1000, z: 0 },
        { x: centroid.x - 1000, y: centroid.y + 1000, z: 0 },
      ],
      height: DEFAULT_CEILING_HEIGHT,
      label: room2D.label || '',
      type: room2D.type || 'room',
      area: room2D.area / 1e6, // Convert mm² to m²
      volume: (room2D.area / 1e6) * (DEFAULT_CEILING_HEIGHT / 1000), // m³
      confidence: room2D.confidence,
    };
    floor3D.rooms.push(room3D);
  });

  // Convert openings
  floor2D.openings.forEach(opening2D => {
    const wall = floor2D.walls.find(w => w.id === opening2D.hostWallId);
    if (!wall) return;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    const x = wall.start.x + ux * opening2D.positionAlongWall;
    const y = wall.start.y + uy * opening2D.positionAlongWall;

    const opening3D: Canonical3D.Opening3D = {
      id: `3d-${opening2D.id}`,
      openingId2D: opening2D.id,
      position: { x, y, z: 0 },
      normal: { x: uy, y: -ux, z: 0 }, // Perpendicular to wall
      kind: opening2D.kind,
      width: opening2D.kind === 'door' ? 900 : 1200,
      height: opening2D.kind === 'door' ? 2100 : 1200,
      sillHeight: opening2D.kind === 'window' ? DEFAULT_SILL_HEIGHT : 0,
      frameDepth: 100,
      confidence: opening2D.confidence,
    };
    floor3D.openings.push(opening3D);
  });

  return floor3D;
}

/**
 * Convert 3D floor plan back to Canonical 2D
 */
export function convert3DTo2D(floor3D: Canonical3D.Floor3D): Canonical.Floor {
  const floor2D: Canonical.Floor = {
    id: floor3D.floorId2D || `2d-${floor3D.id}`,
    elevation: 0,
    floorHeight: floor3D.metadata.defaultHeight || 2800,
    walls: [],
    rooms: [],
    openings: [],
  };

  // Convert walls back to 2D
  floor3D.walls.forEach(wall3D => {
    const wall2D: Canonical.Wall = {
      id: wall3D.wallId2D,
      start: {
        x: wall3D.start.x,
        y: wall3D.start.y,
      },
      end: {
        x: wall3D.end.x,
        y: wall3D.end.y,
      },
      typeRef: wall3D.loadBearing ? 'ext-200' : 'int-100',
      openingIds: [],
      confidence: wall3D.confidence,
      source: Source.USER,
    };
    floor2D.walls.push(wall2D);
  });

  // Convert rooms back to 2D
  floor3D.rooms.forEach(room3D => {
    // Reconstruct centroid from vertices
    let centroidX = 0,
      centroidY = 0;
    room3D.vertices.forEach(v => {
      centroidX += v.x;
      centroidY += v.y;
    });
    centroidX /= room3D.vertices.length;
    centroidY /= room3D.vertices.length;

    const room2D: Canonical.Room = {
      id: room3D.roomId2D,
      label: room3D.label,
      type: room3D.type,
      vertices: room3D.vertices.map(v => ({ x: v.x, y: v.y })),
      area: room3D.area * 1e6, // Convert m² to mm²
      boundingWallIds: [],
      confidence: room3D.confidence,
      source: Source.USER,
    };
    floor2D.rooms.push(room2D);
  });

  // Convert openings back to 2D
  floor3D.openings.forEach(opening3D => {
    const opening2D: Canonical.Opening = {
      id: opening3D.openingId2D,
      kind: opening3D.kind,
      typeRef: opening3D.kind === 'door' ? 'd-900' : 'w-1200',
      hostWallId: '', // Will be resolved from nearest wall
      positionAlongWall: 0,
      confidence: opening3D.confidence,
      source: Source.USER,
    };

    // Find nearest wall
    let minDist = Infinity;
    floor3D.walls.forEach(wall => {
      // Distance from opening to wall line
      const x1 = wall.start.x,
        y1 = wall.start.y;
      const x2 = wall.end.x,
        y2 = wall.end.y;
      const px = opening3D.position.x,
        py = opening3D.position.y;

      const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / ((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1))));
      const closestX = x1 + t * (x2 - x1);
      const closestY = y1 + t * (y2 - y1);
      const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

      if (dist < minDist) {
        minDist = dist;
        opening2D.hostWallId = wall.wallId2D;
        opening2D.positionAlongWall = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * t;
      }
    });

    if (opening2D.hostWallId) {
      floor2D.openings.push(opening2D);
    }
  });

  return floor2D;
}

/**
 * Analyze 3D geometry and extract key metrics
 */
export function analyze3DGeometry(floor3D: Canonical3D.Floor3D): Canonical3D.GeometryAnalysis {
  let totalVolume = 0;
  let totalArea = 0;
  let maxHeight = 0;
  let minHeight = Infinity;

  floor3D.rooms.forEach(room => {
    totalVolume += room.volume;
    totalArea += room.area;
    maxHeight = Math.max(maxHeight, room.height);
    minHeight = Math.min(minHeight, room.height);
  });

  const complexity =
    floor3D.rooms.length > 10
      ? 'complex'
      : floor3D.rooms.length > 5
        ? 'moderate'
        : 'simple';

  return {
    wallCount: floor3D.walls.length,
    roomCount: floor3D.rooms.length,
    totalVolume,
    totalFloorArea: totalArea,
    maxHeight,
    minHeight: minHeight === Infinity ? 0 : minHeight,
    openingCount: floor3D.openings.length,
    complexity,
  };
}
