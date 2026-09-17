/**
 * Database Schema for Corbel Floor Plans
 * Supports Canonical 2D and 3D bidirectional sync
 */

import { Canonical } from '@/types/schema';
import { Canonical3D } from '@/lib/types/3d';

export interface FloorPlanDocument {
  id: string;
  userId: string;
  name: string;
  description?: string;

  // 2D Floor Plan (Canonical)
  floor2D: Canonical.Floor | null;
  floor2DVersion: number;

  // 3D Floor Plan
  floor3D: Canonical3D.Floor3D | null;
  floor3DVersion: number;

  // Metadata
  status: 'draft' | 'review' | 'approved' | 'archived';
  createdAt: number;
  modifiedAt: number;
  createdBy: string;
  modifiedBy: string;

  // Audit
  tags: string[];
  labels: Record<string, string>;
}

export interface FloorPlanRevision {
  id: string;
  floorId: string;
  revision: number;

  // Snapshots
  floor2D: Canonical.Floor | null;
  floor3D: Canonical3D.Floor3D | null;

  // Change tracking
  changes: {
    type: '2d' | '3d' | 'sync';
    description: string;
    elementIds: string[];
  }[];

  metadata: {
    timestamp: number;
    author: string;
    editType: 'manual' | 'ai' | 'import' | 'sync';
    notes?: string;
  };
}

export interface GeometryCache {
  id: string;
  floorId: string;
  floor3DId: string;

  // Mesh data
  meshData: {
    vertices: number[];
    indices: number[];
    normals: number[];
  };

  // Analysis
  analysis: Canonical3D.GeometryAnalysis;

  cachedAt: number;
}

export interface ConversionLog {
  id: string;
  floorId: string;

  // Conversion details
  direction: '2d-to-3d' | '3d-to-2d';
  source: Canonical.Floor | Canonical3D.Floor3D;
  result: Canonical.Floor | Canonical3D.Floor3D;

  // Quality metrics
  confidence: number;
  issues: string[];
  recoveryRate: number;

  timestamp: number;
  duration: number; // ms
}

export interface AIAnalysisCache {
  id: string;
  floorId: string;
  modelUsed: string;

  // Input
  inputType: '2d' | '3d' | 'image';
  inputId: string;

  // Output
  detectedElements: {
    walls: number;
    rooms: number;
    openings: number;
  };
  confidence: number;
  result: Canonical.Floor | Canonical3D.Floor3D;

  // Metadata
  timestamp: number;
  ttl: number; // Time to live in seconds
}

// Database operations type definitions
export interface IFloorPlanDB {
  // Create
  createFloor(doc: FloorPlanDocument): Promise<FloorPlanDocument>;

  // Read
  getFloor(id: string): Promise<FloorPlanDocument | null>;
  listFloors(userId: string): Promise<FloorPlanDocument[]>;

  // Update
  updateFloor(id: string, updates: Partial<FloorPlanDocument>): Promise<FloorPlanDocument>;
  updateFloor2D(id: string, floor2D: Canonical.Floor): Promise<void>;
  updateFloor3D(id: string, floor3D: Canonical3D.Floor3D): Promise<void>;

  // Sync
  syncFloor2DTo3D(floorId: string): Promise<Canonical3D.Floor3D>;
  syncFloor3DTo2D(floorId: string): Promise<Canonical.Floor>;

  // Revisions
  createRevision(rev: FloorPlanRevision): Promise<FloorPlanRevision>;
  getRevisions(floorId: string): Promise<FloorPlanRevision[]>;
  revertToRevision(floorId: string, revisionId: string): Promise<FloorPlanDocument>;

  // Analysis
  cacheAnalysis(cache: AIAnalysisCache): Promise<void>;
  getAnalysisCache(floorId: string, modelUsed: string): Promise<AIAnalysisCache | null>;

  // Delete
  deleteFloor(id: string): Promise<void>;
}
