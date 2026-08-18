// Core design data types for Corbel

export type WallType = 'loadBearing' | 'partition';
export type MaterialType = 'sandcrete' | 'laterite' | 'concrete' | 'timber';
export type ObjectAssetId = string;
export type ObjectCategory = 'furniture' | 'appliance' | 'bathroom' | 'kitchen' | 'outdoor';

export interface ObjectAsset {
  id: ObjectAssetId;
  name: string;
  category: ObjectCategory;
  tags: string[];
  modelUrl: string;
  thumbnailUrl: string;
  dimensions: [number, number, number]; // meters: width, height, depth
  offset: [number, number, number];
  modelRotation: [number, number, number];
  modelScale: [number, number, number];
  color: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  startPoint: Point;
  endPoint: Point;
  thickness: number; // mm
  material: MaterialType;
  type: WallType;
  height: number; // mm
  confidence?: number; // 0-1, from AI extraction; 1 = manual
  source?: 'ai' | 'user'; // where this came from
}

export interface Room {
  id: string;
  name: string;
  vertices: Point[];
  area: number; // m²
}

export interface Door {
  id: string;
  position: Point; // x = distance along host wall in plan units
  wallId: string;
  width: number; // mm
  type: 'entry' | 'internal';
  swing: 'left' | 'right';
  confidence?: number; // 0-1, from AI extraction
  source?: 'ai' | 'user';
}

export interface Window {
  id: string;
  position: Point; // x = distance along host wall in plan units
  wallId: string;
  width: number; // mm
  height: number; // mm
  sillHeight: number; // mm above floor
  confidence?: number; // 0-1, from AI extraction
  source?: 'ai' | 'user';
}

export interface DesignObject {
  id: string;
  assetId: ObjectAssetId;
  position: Point; // plan coordinates, 100 units = 1 meter
  rotation: number; // radians around vertical axis
  scale: number;
}

export interface FloorPlan {
  id: string;
  name: string;
  width: number; // mm
  height: number; // mm
  scale: number; // pixels per meter
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  objects: DesignObject[];
  createdAt: Date;
  updatedAt: Date;
  ghostImageBase64?: string; // base64 data:image URL for AI-extracted plans
}

export interface ValidationResult {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  targetId: string; // wall or element ID
  rule: string;
}
