// Ghana Building Code & Standards Type Definitions

export interface MaterialProperty {
  name: string;
  minCompressiveStrength: number; // MPa
  maxCompressiveStrength: number; // MPa
  density: number; // kg/m³
  costPerUnit: number; // GHS
  unitName: string;
  references: string[];
}

export interface LoadBearingRequirement {
  material: string;
  minWallThickness: number; // mm
  maxUnsupportedSpan: number; // mm
  maxStories: number;
  notes: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  references: string[]; // e.g., ["GS 1207:2018 Part 7", "L.I. 1630"]
  checkFunction: (data: any) => boolean;
}

export interface GhanaStandards {
  version: string;
  lastUpdated: Date;
  materials: Record<string, MaterialProperty>;
  loadBearingRequirements: LoadBearingRequirement[];
  validationRules: ValidationRule[];
}
