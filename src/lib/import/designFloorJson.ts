import type { Door, FloorPlan, MaterialType, Point, Wall, WallType, Window } from "@/types/design";
import { centerizeFloorPlan } from "@/lib/geometry/origin";

export interface DesignFloorJsonImport {
  exportVersion: number;
  exportedAt: string;
  generator: string;
  meta: { planId: string; planName: string };
  canvas: { widthMm: number; heightMm: number };
  walls: Array<{ id: string; startX: number; startY: number; endX: number; endY: number; thickness: number; loadBearing: boolean }>;
  rooms: Array<{ id: string; name: string; type?: string; area: number }>;
  doors: Array<{ id: string; x: number; y: number; swing: string; width: number; height: number }>;
  windows: Array<{ id: string; x: number; y: number; width: number; height: number; sillHeight: number }>;
}

export type DesignFloorJsonImportKind = "legacy-export" | "direct-geometry" | "canonical-export" | "render-brief";

type JsonObject = Record<string, unknown>;
type RenderBriefRoom = { id: string; name: string; dimensions?: string; location?: string };

const DEFAULT_WALL_HEIGHT_MM = 2700;
const DEFAULT_WALL_THICKNESS_MM = 150;
const ROOM_GAP_MM = 300;
const CANVAS_MARGIN_MM = 500;
const DEFAULT_ROOM_DIMENSIONS_MM: Record<string, readonly [number, number]> = {
  bathroom: [2400, 1800],
  laundry: [1800, 1600],
  utility: [1400, 1200],
  kitchen: [3000, 3600],
  bedroom: [3600, 3300],
};

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isPoint = (value: unknown): value is Point => isObject(value) && isNumber(value.x) && isNumber(value.y);
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

function isLegacyExport(value: JsonObject): boolean {
  return value.exportVersion === 1
    && isObject(value.meta) && isString(value.meta.planId) && isString(value.meta.planName)
    && isObject(value.canvas) && isNumber(value.canvas.widthMm) && isNumber(value.canvas.heightMm)
    && isArray(value.walls) && value.walls.every((wall) => isObject(wall) && isString(wall.id) && isNumber(wall.startX) && isNumber(wall.startY) && isNumber(wall.endX) && isNumber(wall.endY) && isNumber(wall.thickness) && typeof wall.loadBearing === "boolean")
    && isArray(value.rooms) && value.rooms.every((room) => isObject(room) && isString(room.id) && isString(room.name) && isNumber(room.area))
    && isArray(value.doors) && value.doors.every((door) => isObject(door) && isString(door.id) && isNumber(door.x) && isNumber(door.y) && isString(door.swing) && isNumber(door.width) && isNumber(door.height))
    && isArray(value.windows) && value.windows.every((window) => isObject(window) && isString(window.id) && isNumber(window.x) && isNumber(window.y) && isNumber(window.width) && isNumber(window.height) && isNumber(window.sillHeight));
}

function isDirectGeometry(value: JsonObject): boolean {
  return isString(value.id) && isString(value.name) && isNumber(value.width) && isNumber(value.height)
    && isArray(value.walls) && value.walls.every((wall) => isObject(wall) && isString(wall.id) && isPoint(wall.startPoint) && isPoint(wall.endPoint) && isNumber(wall.thickness) && isString(wall.material) && isString(wall.type) && isNumber(wall.height))
    && isArray(value.rooms) && value.rooms.every((room) => isObject(room) && isString(room.id) && isString(room.name) && isArray(room.vertices) && room.vertices.every(isPoint) && isNumber(room.area))
    && isArray(value.doors) && value.doors.every((door) => isObject(door) && isString(door.id) && isString(door.wallId) && isPoint(door.position) && isNumber(door.width) && isString(door.type) && isString(door.swing))
    && isArray(value.windows) && value.windows.every((window) => isObject(window) && isString(window.id) && isString(window.wallId) && isPoint(window.position) && isNumber(window.width) && isNumber(window.height) && isNumber(window.sillHeight));
}

function isCanonicalExport(value: JsonObject): boolean {
  return value.exportVersion === 1 && value.generator === "corbel"
    && isObject(value.meta) && isString(value.meta.planId) && isString(value.meta.planName)
    && isObject(value.canvas) && isNumber(value.canvas.widthMm) && isNumber(value.canvas.heightMm)
    && isArray(value.walls) && value.walls.every((wall) => isObject(wall) && isString(wall.id) && isPoint(wall.startMm) && isPoint(wall.endMm) && isNumber(wall.thicknessMm) && isNumber(wall.heightMm) && isString(wall.type))
    && isArray(value.rooms) && value.rooms.every((room) => isObject(room) && isString(room.id) && isArray(room.verticesMm) && room.verticesMm.every(isPoint) && isObject(room.computed) && isNumber(room.computed.areaSqM))
    && isArray(value.openings) && value.openings.every((opening) => isObject(opening) && isString(opening.id) && (opening.type === "door" || opening.type === "window") && isString(opening.wallId) && isNumber(opening.positionAlongWallMm) && isNumber(opening.widthMm) && isNumber(opening.heightMm));
}

function isRenderBrief(value: JsonObject): boolean {
  return value.task === "generate_3d_floor_plan_visualization"
    && isObject(value.project) && isString(value.project.name)
    && isArray(value.rooms)
    && value.rooms.every((room) => isObject(room) && isString(room.id) && isString(room.name));
}

export function getDesignFloorJsonImportKind(data: unknown): DesignFloorJsonImportKind | null {
  if (!isObject(data)) return null;
  if (isLegacyExport(data)) return "legacy-export";
  if (isDirectGeometry(data)) return "direct-geometry";
  if (isCanonicalExport(data)) return "canonical-export";
  if (isRenderBrief(data)) return "render-brief";
  return null;
}

export function parseDesignFloorJson(jsonText: string): unknown {
  return JSON.parse(jsonText);
}

export function validateDesignFloorJson(data: unknown): boolean {
  return getDesignFloorJsonImportKind(data) !== null;
}

function material(value: unknown): MaterialType {
  return value === "laterite" || value === "concrete" || value === "timber" || value === "sandcrete" ? value : "sandcrete";
}

function wallType(value: unknown): WallType {
  return value === "partition" ? "partition" : "loadBearing";
}

function directPlan(data: JsonObject): FloorPlan {
  return {
    id: data.id as string,
    name: data.name as string,
    width: data.width as number,
    height: data.height as number,
    scale: isNumber(data.scale) ? data.scale : 1,
    walls: (data.walls as JsonObject[]).map((wall): Wall => ({
      id: wall.id as string, startPoint: wall.startPoint as Point, endPoint: wall.endPoint as Point,
      thickness: wall.thickness as number, material: material(wall.material), type: wallType(wall.type), height: wall.height as number,
    })),
    rooms: (data.rooms as JsonObject[]).map((room) => ({ id: room.id as string, name: room.name as string, vertices: room.vertices as Point[], area: room.area as number })),
    doors: (data.doors as JsonObject[]).map((door): Door => ({ id: door.id as string, position: door.position as Point, wallId: door.wallId as string, width: door.width as number, type: door.type === "entry" ? "entry" : "internal", swing: door.swing === "right" ? "right" : "left" })),
    windows: (data.windows as JsonObject[]).map((window): Window => ({ id: window.id as string, position: window.position as Point, wallId: window.wallId as string, width: window.width as number, height: window.height as number, sillHeight: window.sillHeight as number })),
    objects: isArray(data.objects) ? data.objects as FloorPlan["objects"] : [],
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function canonicalPlan(data: JsonObject): FloorPlan {
  const openings = data.openings as JsonObject[];
  return {
    id: (data.meta as JsonObject).planId as string,
    name: (data.meta as JsonObject).planName as string,
    width: (data.canvas as JsonObject).widthMm as number,
    height: (data.canvas as JsonObject).heightMm as number,
    scale: 1,
    walls: (data.walls as JsonObject[]).map((wall): Wall => ({ id: wall.id as string, startPoint: wall.startMm as Point, endPoint: wall.endMm as Point, thickness: wall.thicknessMm as number, material: material(wall.material), type: wallType(wall.type), height: wall.heightMm as number })),
    rooms: (data.rooms as JsonObject[]).map((room) => ({ id: room.id as string, name: isString(room.name) ? room.name : "Unlabelled room", vertices: room.verticesMm as Point[], area: (room.computed as JsonObject).areaSqM as number })),
    doors: openings.filter((opening) => opening.type === "door").map((opening): Door => ({ id: opening.id as string, wallId: opening.wallId as string, position: { x: opening.positionAlongWallMm as number, y: 0 }, width: opening.widthMm as number, type: opening.doorType === "entry" ? "entry" : "internal", swing: opening.swing === "outward" ? "right" : "left" })),
    windows: openings.filter((opening) => opening.type === "window").map((opening): Window => ({ id: opening.id as string, wallId: opening.wallId as string, position: { x: opening.positionAlongWallMm as number, y: 0 }, width: opening.widthMm as number, height: opening.heightMm as number, sillHeight: opening.sillHeightMm as number })),
    objects: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

function dimensionsFromText(value: unknown, roomName: string): readonly [number, number] {
  if (isString(value)) {
    const match = value.match(/^\s*(\d+)'\s*(?:(\d+)\")?\s*x\s*(\d+)'\s*(?:(\d+)\")?\s*$/i);
    if (match) return [Math.round((Number(match[1]) * 12 + Number(match[2] ?? 0)) * 25.4), Math.round((Number(match[3]) * 12 + Number(match[4] ?? 0)) * 25.4)];
  }
  const key = roomName.toLowerCase();
  return Object.entries(DEFAULT_ROOM_DIMENSIONS_MM).find(([name]) => key.includes(name))?.[1] ?? [3000, 3000];
}

function slot(location: unknown, index: number): readonly [number, number] {
  const slots: Record<string, readonly [number, number]> = {
    "upper-left": [0, 0], "upper-right": [2, 0], center: [1, 1], "lower-left": [0, 2], "center-lower": [1, 2], "lower-right": [2, 2], "bottom-center": [1, 3],
  };
  return isString(location) && slots[location] ? slots[location] : [index % 3, Math.floor(index / 3)];
}

/** Creates editable, clearly approximate geometry from a render brief that lacks coordinates. */
function approximatePlan(data: JsonObject): FloorPlan {
  const sourceRooms = data.rooms as JsonObject[];
  const rooms = sourceRooms.map((room, index) => {
    const [width, height] = dimensionsFromText(room.dimensions, room.name as string);
    const [column, row] = slot(room.location, index);
    return { id: room.id as string, name: room.name as string, width, height, column, row };
  });
  const columnWidths = [0, 0, 0];
  const rowHeights = [0, 0, 0, 0];
  rooms.forEach((room) => { columnWidths[room.column] = Math.max(columnWidths[room.column], room.width); rowHeights[room.row] = Math.max(rowHeights[room.row], room.height); });
  const columnX = columnWidths.map((_, index) => CANVAS_MARGIN_MM + columnWidths.slice(0, index).reduce((sum, width) => sum + width + ROOM_GAP_MM, 0));
  const rowY = rowHeights.map((_, index) => CANVAS_MARGIN_MM + rowHeights.slice(0, index).reduce((sum, height) => sum + height + ROOM_GAP_MM, 0));
  const walls: Wall[] = [];
  const importedRooms = rooms.map((room) => {
    const x = columnX[room.column];
    const y = rowY[room.row];
    const vertices = [{ x, y }, { x: x + room.width, y }, { x: x + room.width, y: y + room.height }, { x, y: y + room.height }];
    vertices.forEach((startPoint, index) => walls.push({ id: `${room.id}-wall-${index + 1}`, startPoint, endPoint: vertices[(index + 1) % vertices.length], thickness: DEFAULT_WALL_THICKNESS_MM, material: "sandcrete", type: "partition", height: DEFAULT_WALL_HEIGHT_MM }));
    return { id: room.id, name: room.name, vertices, area: (room.width * room.height) / 1_000_000 };
  });
  return {
    id: `approx-${Date.now()}`,
    name: `${((data.project as JsonObject).name as string)} (approximate layout)`,
    width: Math.max(...columnX.map((x, index) => x + columnWidths[index])) + CANVAS_MARGIN_MM,
    height: Math.max(...rowY.map((y, index) => y + rowHeights[index])) + CANVAS_MARGIN_MM,
    scale: 1, walls, rooms: importedRooms, doors: [], windows: [], objects: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

function legacyPlan(data: DesignFloorJsonImport): FloorPlan {
  return {
    id: data.meta.planId, name: data.meta.planName, width: data.canvas.widthMm, height: data.canvas.heightMm, scale: 1,
    walls: data.walls.map((wall): Wall => ({ id: wall.id, startPoint: { x: wall.startX, y: wall.startY }, endPoint: { x: wall.endX, y: wall.endY }, thickness: wall.thickness, material: "sandcrete", type: wall.loadBearing ? "loadBearing" : "partition", height: DEFAULT_WALL_HEIGHT_MM })),
    rooms: data.rooms.map((room) => ({ id: room.id, name: room.name, vertices: [], area: room.area })),
    doors: data.doors.map((door): Door => ({ id: door.id, position: { x: door.x, y: door.y }, wallId: "", width: door.width, type: "internal", swing: door.swing === "right" ? "right" : "left" })),
    windows: data.windows.map((window): Window => ({ id: window.id, position: { x: window.x, y: window.y }, wallId: "", width: window.width, height: window.height, sillHeight: window.sillHeight })),
    objects: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

export function importDesignFloorJson(jsonData: unknown): FloorPlan {
  const kind = getDesignFloorJsonImportKind(jsonData);
  if (!kind || !isObject(jsonData)) throw new Error("Unsupported JSON. Import requires Corbel geometry or a render brief with rooms.");
  const plan =
    kind === "legacy-export"
      ? legacyPlan(jsonData as unknown as DesignFloorJsonImport)
      : kind === "direct-geometry"
        ? directPlan(jsonData)
        : kind === "canonical-export"
          ? canonicalPlan(jsonData)
          : approximatePlan(jsonData);
  // Imports are authored top-left-anchored; convert to the centered sheet origin.
  return centerizeFloorPlan(plan);
}
