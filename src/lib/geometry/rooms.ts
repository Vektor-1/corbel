import type { Point, Room, Wall } from '@/types/design';

const PX_PER_METER = 100;
const MIN_ROOM_AREA_M2 = 0.5;

type Vertex = {
  key: string;
  point: Point;
  neighbors: Set<string>;
};

const pointKey = (point: Point) => `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`;
const directedKey = (from: string, to: string) => `${from}>${to}`;

function signedArea(vertices: Point[]) {
  return vertices.reduce((area, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function roomId(vertexKeys: string[]) {
  const canonical = [...vertexKeys].sort().join('|');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `room-${(hash >>> 0).toString(36)}`;
}

/**
 * Finds bounded faces in the wall endpoint graph. Walls must meet at endpoints;
 * crossings that do not create endpoints are intentionally not interpreted as rooms.
 */
export function deriveRoomsFromWalls(walls: Wall[]): Room[] {
  const vertices = new Map<string, Vertex>();

  const ensureVertex = (point: Point) => {
    const key = pointKey(point);
    if (!vertices.has(key)) vertices.set(key, { key, point, neighbors: new Set() });
    return key;
  };

  for (const wall of walls) {
    const start = ensureVertex(wall.startPoint);
    const end = ensureVertex(wall.endPoint);
    if (start === end) continue;
    vertices.get(start)?.neighbors.add(end);
    vertices.get(end)?.neighbors.add(start);
  }

  const orderedNeighbors = new Map<string, string[]>();
  for (const vertex of vertices.values()) {
    orderedNeighbors.set(
      vertex.key,
      [...vertex.neighbors].sort((a, b) => {
        const pointA = vertices.get(a)!.point;
        const pointB = vertices.get(b)!.point;
        const angleA = Math.atan2(pointA.y - vertex.point.y, pointA.x - vertex.point.x);
        const angleB = Math.atan2(pointB.y - vertex.point.y, pointB.x - vertex.point.x);
        return angleA - angleB;
      })
    );
  }

  const visited = new Set<string>();
  const rooms: Room[] = [];

  for (const from of vertices.keys()) {
    for (const to of orderedNeighbors.get(from) ?? []) {
      const firstHalfEdge = directedKey(from, to);
      if (visited.has(firstHalfEdge)) continue;

      const faceKeys: string[] = [];
      let currentFrom = from;
      let currentTo = to;
      let closed = false;

      for (let guard = 0; guard < walls.length * 2 + 2; guard += 1) {
        const halfEdge = directedKey(currentFrom, currentTo);
        if (visited.has(halfEdge)) {
          closed = halfEdge === firstHalfEdge;
          break;
        }

        visited.add(halfEdge);
        faceKeys.push(currentFrom);

        const nextOptions = orderedNeighbors.get(currentTo) ?? [];
        const reverseIndex = nextOptions.indexOf(currentFrom);
        if (reverseIndex < 0 || nextOptions.length < 2) break;

        const nextTo = nextOptions[(reverseIndex - 1 + nextOptions.length) % nextOptions.length];
        currentFrom = currentTo;
        currentTo = nextTo;

        if (directedKey(currentFrom, currentTo) === firstHalfEdge) {
          closed = true;
          break;
        }
      }

      if (!closed || faceKeys.length < 3) continue;

      const polygon = faceKeys.map((key) => vertices.get(key)!.point);
      const areaPx = signedArea(polygon);
      // Canvas coordinates increase downward, so bounded clockwise faces are positive.
      if (areaPx <= 0) continue;

      const area = areaPx / (PX_PER_METER * PX_PER_METER);
      if (area < MIN_ROOM_AREA_M2) continue;

      rooms.push({
        id: roomId(faceKeys),
        name: `Room ${rooms.length + 1}`,
        vertices: polygon,
        area: Math.round(area * 100) / 100,
      });
    }
  }

  return rooms;
}

export function polygonCentroid(vertices: Point[]): Point {
  const area = signedArea(vertices);
  if (Math.abs(area) < 0.001) {
    return {
      x: vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length,
      y: vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length,
    };
  }

  let x = 0;
  let y = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const point = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const cross = point.x * next.y - next.x * point.y;
    x += (point.x + next.x) * cross;
    y += (point.y + next.y) * cross;
  }

  return { x: x / (6 * area), y: y / (6 * area) };
}
