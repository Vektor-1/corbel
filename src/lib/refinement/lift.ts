/**
 * Lift Algorithm: Draft → Canonical
 * Transforms loose, confidence-tagged draft geometry into a topology-complete canonical floor plan.
 *
 * Pipeline:
 * 1. Axis-snap walls (round endpoints to grid)
 * 2. Merge/close junctions (connect walls that should touch)
 * 3. Collapse overlaps (remove duplicate or nearly-duplicate walls)
 * 4. Detect closed loops (rooms)
 * 5. Attach openings to host walls
 * 6. Resolve library types (wall thickness → WallType, door size → DoorType, etc.)
 * 7. Validate topology (rooms are closed, openings attach to walls, etc.)
 * 8. Build canonical Floor
 */

import { Draft, Canonical, LiftConfig, LiftContext, ElementStatus } from "../../types/schema";

const DEFAULT_CONFIG: LiftConfig = {
  gridSnapTolerance: 50, // mm
  minWallLength: 300, // mm, discard stubby fragments
  maxGapToClose: 150, // mm, gap to snap junctions
  minRoomArea: 5e6, // mm² (5 m²)
  openingSnapDistance: 200, // mm, max distance to host wall
};

// ============================================================================
// STEP 1: AXIS-SNAP WALLS
// ============================================================================

/**
 * Round wall endpoints to nearest grid point.
 * Tolerance: if endpoint is within gridSnapTolerance of a grid line, snap it.
 */
function axisSnapWalls(
  walls: Draft.Wall[],
  tolerance: number
): Draft.Wall[] {
  const GRID_UNIT = 100; // mm, snap to 100mm grid

  return walls.map((wall) => {
    const snappedStart = snapToGrid(wall.start, GRID_UNIT, tolerance);
    const snappedEnd = snapToGrid(wall.end, GRID_UNIT, tolerance);

    return {
      ...wall,
      start: snappedStart,
      end: snappedEnd,
    };
  });
}

function snapToGrid(
  point: { x: number; y: number },
  gridUnit: number,
  tolerance: number
): { x: number; y: number } {
  const snapX = Math.round(point.x / gridUnit) * gridUnit;
  const snapY = Math.round(point.y / gridUnit) * gridUnit;

  // Only snap if within tolerance
  if (Math.abs(point.x - snapX) > tolerance) {
    return { x: point.x, y: snapY };
  }
  if (Math.abs(point.y - snapY) > tolerance) {
    return { x: snapX, y: point.y };
  }

  return { x: snapX, y: snapY };
}

// ============================================================================
// STEP 2: MERGE/CLOSE JUNCTIONS
// ============================================================================

/**
 * Connect walls whose endpoints are close but not touching.
 * If wall A's endpoint is within maxGapToClose of wall B's start/end, snap them together.
 * Also merge collinear segments (walls on same infinite line).
 */
function closeJunctions(
  walls: Draft.Wall[],
  maxGapToClose: number
): Draft.Wall[] {
  let closed = [...walls];
  let changed = true;

  // Iterate until no more merges
  while (changed) {
    changed = false;

    for (let i = 0; i < closed.length; i++) {
      for (let j = i + 1; j < closed.length; j++) {
        const wallA = closed[i];
        const wallB = closed[j];

        // Check if endpoints are close
        const distAEnd_BStart = distance(wallA.end, wallB.start);
        const distAEnd_BEnd = distance(wallA.end, wallB.end);
        const distAStart_BEnd = distance(wallA.start, wallB.end);
        const distAStart_BStart = distance(wallA.start, wallB.start);

        // Case 1: A's end is close to B's start but the two walls run in
        // different directions — they meet at a corner (e.g. two sides of a
        // room), not a fragmented straight run. Snap both endpoints to the
        // same point instead of merging the segments, which would otherwise
        // destroy the corner by stretching A across B's entire span.
        if (
          distAEnd_BStart > 0 &&
          distAEnd_BStart < maxGapToClose &&
          !areCollinear(wallA, wallB, maxGapToClose)
        ) {
          const mid = {
            x: (wallA.end.x + wallB.start.x) / 2,
            y: (wallA.end.y + wallB.start.y) / 2,
          };
          closed[i] = { ...wallA, end: mid };
          closed[j] = { ...wallB, start: mid };
          changed = true;
          break;
        }

        // Case 2: A and B are collinear, on same line, overlapping or with a
        // small gap between them → merge into a single longer wall.
        if (areCollinear(wallA, wallB, maxGapToClose)) {
          const merged = mergeCollinearWalls(wallA, wallB);
          if (merged) {
            closed[i] = merged;
            closed.splice(j, 1);
            changed = true;
            break;
          }
        }
      }
      if (changed) break;
    }
  }

  return closed;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function areCollinear(
  wallA: Draft.Wall,
  wallB: Draft.Wall,
  tolerance: number
): boolean {
  // Compute direction vectors
  const dirA = { x: wallA.end.x - wallA.start.x, y: wallA.end.y - wallA.start.y };
  const dirB = { x: wallB.end.x - wallB.start.x, y: wallB.end.y - wallB.start.y };

  // Normalize
  const lenA = Math.hypot(dirA.x, dirA.y);
  const lenB = Math.hypot(dirB.x, dirB.y);
  if (lenA < 1 || lenB < 1) return false;

  const normA = { x: dirA.x / lenA, y: dirA.y / lenA };
  const normB = { x: dirB.x / lenB, y: dirB.y / lenB };

  // Check if parallel (cross product ≈ 0)
  const crossProd = Math.abs(normA.x * normB.y - normA.y * normB.x);
  if (crossProd > 0.05) return false; // not parallel

  // Check if on same infinite line: project wallB.start onto wallA's line
  const toStart = { x: wallB.start.x - wallA.start.x, y: wallB.start.y - wallA.start.y };
  const perpDist = Math.abs(normA.x * toStart.y - normA.y * toStart.x);
  return perpDist < tolerance;
}

function mergeCollinearWalls(wallA: Draft.Wall, wallB: Draft.Wall): Draft.Wall | null {
  // Combine the two walls into the longest span
  const dirA = { x: wallA.end.x - wallA.start.x, y: wallA.end.y - wallA.start.y };
  const normDir = {
    x: dirA.x / Math.hypot(dirA.x, dirA.y),
    y: dirA.y / Math.hypot(dirA.x, dirA.y),
  };

  // Project all four endpoints onto the line, sort by projection
  const endpoints = [
    { point: wallA.start, wall: "A", end: "start" },
    { point: wallA.end, wall: "A", end: "end" },
    { point: wallB.start, wall: "B", end: "start" },
    { point: wallB.end, wall: "B", end: "end" },
  ];

  const projections = endpoints.map((ep) => ({
    projection: (ep.point.x - wallA.start.x) * normDir.x + (ep.point.y - wallA.start.y) * normDir.y,
    point: ep.point,
  }));

  projections.sort((a, b) => a.projection - b.projection);
  const start = projections[0].point;
  const end = projections[projections.length - 1].point;

  return {
    ...wallA,
    start,
    end,
    confidence: Math.min(wallA.confidence, wallB.confidence),
  };
}

// ============================================================================
// STEP 3: COLLAPSE OVERLAPS
// ============================================================================

/**
 * Remove duplicate or near-duplicate walls.
 * Two walls are duplicates if they cover nearly the same segment (forward or reversed).
 */
function collapseOverlaps(walls: Draft.Wall[], tolerance: number): Draft.Wall[] {
  const seen: Draft.Wall[] = [];

  for (const wall of walls) {
    const isDuplicate = seen.some((existing) => {
      // Check if (existing.start, existing.end) ≈ (wall.start, wall.end)
      // or (existing.start, existing.end) ≈ (wall.end, wall.start)
      const forward =
        distance(existing.start, wall.start) < tolerance &&
        distance(existing.end, wall.end) < tolerance;
      const reversed =
        distance(existing.start, wall.end) < tolerance &&
        distance(existing.end, wall.start) < tolerance;

      return forward || reversed;
    });

    if (!isDuplicate) {
      seen.push(wall);
    }
  }

  return seen;
}

// ============================================================================
// STEP 4: DETECT CLOSED LOOPS (ROOMS)
// ============================================================================

interface WallNode {
  point: { x: number; y: number };
  wallId: string;
  isStart: boolean;
}

/**
 * Build a graph of wall endpoints, then find all closed cycles.
 * Each cycle represents a candidate room.
 */
function detectClosedLoops(walls: Draft.Wall[]): string[][] {
  // Build a map: point → list of (wallId, isStart)
  const graph: Map<string, WallNode[]> = new Map();

  walls.forEach((wall) => {
    const startKey = `${Math.round(wall.start.x)},${Math.round(wall.start.y)}`;
    const endKey = `${Math.round(wall.end.x)},${Math.round(wall.end.y)}`;

    if (!graph.has(startKey)) graph.set(startKey, []);
    if (!graph.has(endKey)) graph.set(endKey, []);

    graph.get(startKey)!.push({ point: wall.start, wallId: wall.id, isStart: true });
    graph.get(endKey)!.push({ point: wall.end, wallId: wall.id, isStart: false });
  });

  // Find cycles: DFS from each endpoint
  const cycles: string[][] = [];
  const visited = new Set<string>();

  function dfs(
    currentWallId: string,
    isCurrentStart: boolean,
    startPoint: string,
    path: string[]
  ): void {
    if (path.length > 2 && currentWallId === path[0]) {
      // Closed cycle found
      const cycleKey = path.slice(0, -1).sort().join(",");
      if (!visited.has(cycleKey)) {
        visited.add(cycleKey);
        cycles.push(path.slice(0, -1));
      }
      return;
    }

    if (path.length > 20) return; // Prevent infinite recursion

    const currentWall = walls.find((w) => w.id === currentWallId);
    if (!currentWall) return;

    // isCurrentStart means we arrived at this wall via its start endpoint,
    // so continue the walk from its other (end) endpoint, and vice versa.
    const nextPoint = isCurrentStart ? currentWall.end : currentWall.start;
    const nextKey = `${Math.round(nextPoint.x)},${Math.round(nextPoint.y)}`;

    const neighbors = graph.get(nextKey) || [];
    for (const neighbor of neighbors) {
      if (neighbor.wallId === currentWallId) continue; // Don't reverse

      const edgeKey = `${currentWallId}-${neighbor.wallId}`;
      const reverseKey = `${neighbor.wallId}-${currentWallId}`;
      if (path.includes(reverseKey)) continue; // Don't zigzag

      dfs(neighbor.wallId, neighbor.isStart, startPoint, [...path, neighbor.wallId]);
    }
  }

  // Start DFS from each wall's start point, walking toward its end (isCurrentStart:
  // true means "entered via start", so the first hop correctly proceeds to wall.end).
  walls.forEach((wall) => {
    const startKey = `${Math.round(wall.start.x)},${Math.round(wall.start.y)}`;
    dfs(wall.id, true, startKey, [wall.id]);
  });

  return cycles;
}

// ============================================================================
// STEP 5: ATTACH OPENINGS TO HOST WALLS
// ============================================================================

/**
 * For each opening, find the nearest wall and snap it to that wall.
 * Store the distance along the wall (for later positioning).
 */
function attachOpeningsToWalls(
  openings: Draft.Opening[],
  walls: Draft.Wall[],
  maxDistance: number
): Map<string, { wallId: string; positionAlongWall: number }> {
  const attachments = new Map<string, { wallId: string; positionAlongWall: number }>();

  for (const opening of openings) {
    let bestWall: Draft.Wall | null = null;
    let bestDistance = maxDistance;
    let bestProjection = 0;

    for (const wall of walls) {
      // Project opening onto wall segment
      const { distance: perpDist, projection } = projectPointToSegment(
        opening.position,
        wall.start,
        wall.end
      );

      if (perpDist < bestDistance) {
        bestDistance = perpDist;
        bestWall = wall;
        bestProjection = projection;
      }
    }

    if (bestWall) {
      attachments.set(opening.id, {
        wallId: bestWall.id,
        positionAlongWall: bestProjection,
      });
    }
  }

  return attachments;
}

function projectPointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
): { distance: number; projection: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    // start === end
    return {
      distance: distance(point, start),
      projection: 0,
    };
  }

  // Project point onto line
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  const closest = { x: start.x + t * dx, y: start.y + t * dy };

  return {
    distance: distance(point, closest),
    projection: t * Math.hypot(dx, dy),
  };
}

// ============================================================================
// STEP 6–8: BUILD CANONICAL FLOOR
// ============================================================================

/**
 * Main lift entry point: Draft.FloorPlan → Canonical.Floor
 */
export function liftFloorPlan(
  draftFloor: Draft.FloorPlan,
  config: Partial<LiftConfig> = {}
): Canonical.Floor {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const context: LiftContext = {
    config: finalConfig,
    draftPlan: draftFloor,
    canonicalFloors: new Map(),
    wallMapping: new Map(),
    roomMapping: new Map(),
    issues: [],
  };

  // Step 1: Axis-snap
  let walls = axisSnapWalls(draftFloor.walls, finalConfig.gridSnapTolerance);

  // Step 2: Close junctions
  walls = closeJunctions(walls, finalConfig.maxGapToClose);

  // Step 3: Collapse overlaps
  walls = collapseOverlaps(walls, finalConfig.gridSnapTolerance);

  // Filter out short stubs
  walls = walls.filter((w) => distance(w.start, w.end) >= finalConfig.minWallLength);

  // Step 4: Detect rooms
  const roomCycles = detectClosedLoops(walls);

  // Step 5: Attach openings
  const openingAttachments = attachOpeningsToWalls(
    draftFloor.openings,
    walls,
    finalConfig.openingSnapDistance
  );

  // Step 6–8: Build canonical structures
  const canonicalWalls = walls.map((wall, idx) => {
    const typeRef = resolveWallType(wall.thickness); // resolve to library
    const newWall: Canonical.Wall = {
      id: `wall_${idx}`,
      start: wall.start,
      end: wall.end,
      typeRef,
      openingIds: [],
      draftSourceId: wall.id,
      confidence: wall.confidence,
      source: wall.source,
    };
    context.wallMapping.set(wall.id, newWall.id);
    return newWall;
  });

  // Attach openings to canonical walls
  const canonicalOpenings = draftFloor.openings
    .map((opening, idx) => {
      const attachment = openingAttachments.get(opening.id);
      if (!attachment) return null;

      const hostWallCanonicalId = context.wallMapping.get(attachment.wallId);
      if (!hostWallCanonicalId) return null;

      const typeRef = resolveDoorWindowType(opening.kind, opening.width, opening.height);
      return {
        id: `opening_${idx}`,
        kind: opening.kind,
        typeRef,
        hostWallId: hostWallCanonicalId,
        positionAlongWall: attachment.positionAlongWall,
        draftSourceId: opening.id,
        confidence: opening.confidence,
        source: opening.source,
      } as Canonical.Opening;
    })
    .filter((o) => o !== null) as Canonical.Opening[];

  // Attach openings to walls
  canonicalOpenings.forEach((opening) => {
    const wall = canonicalWalls.find((w) => w.id === opening.hostWallId);
    if (wall) wall.openingIds.push(opening.id);
  });

  // Detect rooms as closed polygons
  const canonicalRooms = roomCycles
    .map((cycleWallIds, idx) => {
      const cycleWalls = cycleWallIds
        .map((wallId) => canonicalWalls.find((w) => w.draftSourceId === wallId))
        .filter((w) => w !== undefined) as Canonical.Wall[];

      if (cycleWalls.length === 0) return null;

      const vertices = extractPolygonVertices(cycleWalls);
      const area = polygonArea(vertices);

      if (area < finalConfig.minRoomArea) return null; // too small

      return {
        id: `room_${idx}`,
        label: undefined,
        boundingWallIds: cycleWalls.map((w) => w.id),
        vertices,
        area,
        confidence: averageConfidence(cycleWalls),
        source: "refined" as const,
      } as Canonical.Room;
    })
    .filter((r) => r !== null) as Canonical.Room[];

  return {
    id: draftFloor.id || `floor_0`,
    elevation: draftFloor.elevation,
    floorHeight: 2800, // default, mm
    walls: canonicalWalls,
    openings: canonicalOpenings,
    rooms: canonicalRooms,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function resolveWallType(thickness: number): string {
  // Snap to nearest standard thickness, return type ID
  if (thickness < 150) return "int-100";
  return "ext-200";
}

function resolveDoorWindowType(kind: "door" | "window", width: number, height: number): string {
  if (kind === "door") return "d-900"; // standard door
  return "w-1200"; // standard window
}

function extractPolygonVertices(walls: Canonical.Wall[]): { x: number; y: number }[] {
  // Order walls by connectivity, extract unique vertices
  const vertices: { x: number; y: number }[] = [];
  const visited = new Set<string>();

  if (walls.length === 0) return vertices;

  let currentWall = walls[0];
  let currentPoint = currentWall.start;

  for (let i = 0; i < walls.length; i++) {
    const key = `${Math.round(currentPoint.x)},${Math.round(currentPoint.y)}`;
    if (!visited.has(key)) {
      vertices.push(currentPoint);
      visited.add(key);
    }

    // Find next wall connected to currentPoint
    const nextPoint = distance(currentWall.end, currentPoint) < 10 ? currentWall.start : currentWall.end;
    const nextWall = walls.find(
      (w) =>
        w !== currentWall &&
        ((distance(w.start, nextPoint) < 10 && distance(w.end, nextPoint) > 10) ||
          (distance(w.end, nextPoint) < 10 && distance(w.start, nextPoint) > 10))
    );

    if (!nextWall) break;
    currentWall = nextWall;
    // currentPoint becomes the endpoint of the new wall that coincides with
    // nextPoint (where we just arrived) — not the far endpoint.
    currentPoint = distance(currentWall.start, nextPoint) < 10 ? currentWall.start : currentWall.end;
  }

  return vertices;
}

function polygonArea(vertices: { x: number; y: number }[]): number {
  // Shoelace formula
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area / 2);
}

function averageConfidence(walls: Canonical.Wall[]): number {
  if (walls.length === 0) return 0;
  const sum = walls.reduce((acc, w) => acc + w.confidence, 0);
  return sum / walls.length;
}
