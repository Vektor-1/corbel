/**
 * 3D Floor Plan Schema
 * Bidirectional sync with Canonical 2D schema
 */

export namespace Canonical3D {
  /**
   * 3D Wall - extruded from 2D wall with height
   */
  export interface Wall3D {
    id: string;
    wallId2D: string; // Reference to Canonical.Wall
    start: Vector3;
    end: Vector3;
    height: number; // mm, default 2800
    thickness: number; // mm
    material: string;
    loadBearing: boolean;
    confidence: number;
  }

  /**
   * 3D Room - polyhedron with walls and ceiling
   */
  export interface Room3D {
    id: string;
    roomId2D: string; // Reference to Canonical.Room
    vertices: Vector3[]; // Floor vertices
    height: number; // Ceiling height in mm, default 2800
    label: string;
    type: string;
    area: number; // m² (from 2D)
    volume: number; // m³ (calculated)
    confidence: number;
  }

  /**
   * 3D Opening - door/window with frame
   */
  export interface Opening3D {
    id: string;
    openingId2D: string; // Reference to Canonical.Opening
    position: Vector3;
    normal: Vector3; // Wall normal
    kind: 'door' | 'window';
    width: number; // mm
    height: number; // mm
    sillHeight: number; // mm, for windows
    frameDepth: number; // mm
    confidence: number;
  }

  /**
   * 3D Floor Plan - complete model
   */
  export interface Floor3D {
    id: string;
    floorId2D: string; // Reference to Canonical.Floor
    name: string;
    walls: Wall3D[];
    rooms: Room3D[];
    openings: Opening3D[];
    metadata: {
      createdAt: number;
      modifiedAt: number;
      scale: number; // units per mm
      defaultHeight: number; // mm
    };
  }

  /**
   * 3D Vector
   */
  export interface Vector3 {
    x: number; // mm
    y: number; // mm
    z: number; // mm
  }

  /**
   * Geometry analysis result
   */
  export interface GeometryAnalysis {
    wallCount: number;
    roomCount: number;
    totalVolume: number; // m³
    totalFloorArea: number; // m²
    maxHeight: number; // mm
    minHeight: number; // mm;
    openingCount: number;
    complexity: 'simple' | 'moderate' | 'complex';
  }

  /**
   * 3D to 2D Conversion result
   */
  export interface Conversion3DTo2D {
    floor2D: any; // Canonical.Floor
    confidence: number;
    issues: string[];
    recoveredElements: {
      walls: number;
      rooms: number;
      openings: number;
    };
  }
}
