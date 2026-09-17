/**
 * Advanced Material System for 3D Rendering
 * Physically-based rendering (PBR) with texture support
 */

export interface PBRMaterial {
  name: string;
  category: 'wall' | 'floor' | 'ceiling' | 'trim' | 'fixture';
  description: string;

  // PBR properties
  baseColor: string; // Hex color
  metalness: number; // 0-1
  roughness: number; // 0-1
  normalScale: number; // 0-2
  aoIntensity: number; // Ambient occlusion 0-1

  // Physical properties
  material: string; // e.g., "brick", "concrete", "wood"
  finish: string; // e.g., "matte", "glossy", "satin"

  // Cost & sustainability
  costPerSqFt: number;
  embodiedCarbon: number; // kg CO2 per unit
  recyclability: 'high' | 'medium' | 'low';

  // Textures (base64 or URLs)
  textures?: {
    albedo?: string;
    normal?: string;
    roughness?: string;
    metallic?: string;
    ao?: string;
  };
}

export const MATERIAL_LIBRARY: Record<string, PBRMaterial> = {
  // Walls
  'brick-red': {
    name: 'Red Brick',
    category: 'wall',
    description: 'Traditional red clay brick',
    baseColor: '#c84c22',
    metalness: 0.0,
    roughness: 0.7,
    normalScale: 1.2,
    aoIntensity: 0.6,
    material: 'brick',
    finish: 'matte',
    costPerSqFt: 12,
    embodiedCarbon: 0.8,
    recyclability: 'high',
  },

  'concrete-standard': {
    name: 'Standard Concrete',
    category: 'wall',
    description: 'Gray concrete block',
    baseColor: '#808080',
    metalness: 0.0,
    roughness: 0.8,
    normalScale: 0.8,
    aoIntensity: 0.5,
    material: 'concrete',
    finish: 'matte',
    costPerSqFt: 8,
    embodiedCarbon: 0.15,
    recyclability: 'medium',
  },

  'drywall-white': {
    name: 'White Drywall',
    category: 'wall',
    description: 'Standard interior drywall',
    baseColor: '#f5f5f5',
    metalness: 0.0,
    roughness: 0.9,
    normalScale: 0.3,
    aoIntensity: 0.2,
    material: 'drywall',
    finish: 'matte',
    costPerSqFt: 2,
    embodiedCarbon: 0.1,
    recyclability: 'high',
  },

  'paint-off-white': {
    name: 'Off-White Paint',
    category: 'wall',
    description: 'Interior wall paint',
    baseColor: '#fffaf0',
    metalness: 0.0,
    roughness: 0.85,
    normalScale: 0.1,
    aoIntensity: 0.1,
    material: 'paint',
    finish: 'matte',
    costPerSqFt: 1,
    embodiedCarbon: 0.05,
    recyclability: 'low',
  },

  'tile-ceramic': {
    name: 'Ceramic Tile',
    category: 'floor',
    description: 'Glazed ceramic floor tile',
    baseColor: '#e8dcc8',
    metalness: 0.1,
    roughness: 0.4,
    normalScale: 0.6,
    aoIntensity: 0.3,
    material: 'ceramic',
    finish: 'glossy',
    costPerSqFt: 8,
    embodiedCarbon: 0.2,
    recyclability: 'high',
  },

  'wood-oak': {
    name: 'Oak Hardwood',
    category: 'floor',
    description: 'Natural oak hardwood flooring',
    baseColor: '#d4a574',
    metalness: 0.0,
    roughness: 0.35,
    normalScale: 0.9,
    aoIntensity: 0.4,
    material: 'wood',
    finish: 'satin',
    costPerSqFt: 6,
    embodiedCarbon: -0.5, // Carbon negative (sequestered)
    recyclability: 'high',
  },

  'laminate-dark': {
    name: 'Dark Laminate',
    category: 'floor',
    description: 'Engineered laminate flooring',
    baseColor: '#3d2817',
    metalness: 0.05,
    roughness: 0.45,
    normalScale: 0.5,
    aoIntensity: 0.35,
    material: 'laminate',
    finish: 'satin',
    costPerSqFt: 3,
    embodiedCarbon: 0.08,
    recyclability: 'medium',
  },

  // Ceilings
  'acoustic-tile': {
    name: 'Acoustic Ceiling Tile',
    category: 'ceiling',
    description: 'Standard drop ceiling tile',
    baseColor: '#f0ebe3',
    metalness: 0.0,
    roughness: 0.95,
    normalScale: 1.5,
    aoIntensity: 0.7,
    material: 'mineral',
    finish: 'matte',
    costPerSqFt: 2,
    embodiedCarbon: 0.1,
    recyclability: 'high',
  },

  'gypsum-board': {
    name: 'Gypsum Board',
    category: 'ceiling',
    description: 'Painted gypsum board ceiling',
    baseColor: '#f5f5f5',
    metalness: 0.0,
    roughness: 0.9,
    normalScale: 0.2,
    aoIntensity: 0.15,
    material: 'gypsum',
    finish: 'matte',
    costPerSqFt: 1.5,
    embodiedCarbon: 0.08,
    recyclability: 'high',
  },

  // Fixtures
  'metal-steel': {
    name: 'Steel',
    category: 'fixture',
    description: 'Polished steel fixture',
    baseColor: '#c0c0c0',
    metalness: 0.9,
    roughness: 0.2,
    normalScale: 0.3,
    aoIntensity: 0.2,
    material: 'steel',
    finish: 'glossy',
    costPerSqFt: 15,
    embodiedCarbon: 2.0,
    recyclability: 'high',
  },

  'glass-clear': {
    name: 'Clear Glass',
    category: 'fixture',
    description: 'Clear glazing',
    baseColor: '#e6f3ff',
    metalness: 0.0,
    roughness: 0.05,
    normalScale: 0.1,
    aoIntensity: 0.0,
    material: 'glass',
    finish: 'glossy',
    costPerSqFt: 20,
    embodiedCarbon: 0.9,
    recyclability: 'high',
  },
};

/**
 * Get material by name or ID
 */
export function getMaterial(materialId: string): PBRMaterial | undefined {
  return MATERIAL_LIBRARY[materialId];
}

/**
 * Get all materials in a category
 */
export function getMaterialsByCategory(category: PBRMaterial['category']): PBRMaterial[] {
  return Object.values(MATERIAL_LIBRARY).filter(m => m.category === category);
}

/**
 * Calculate total cost for material usage
 */
export function calculateMaterialCost(materialId: string, areaSqFt: number): number {
  const material = getMaterial(materialId);
  if (!material) return 0;
  return material.costPerSqFt * areaSqFt;
}

/**
 * Calculate embodied carbon for material usage
 */
export function calculateEmbodiedCarbon(materialId: string, areaSqFt: number): number {
  const material = getMaterial(materialId);
  if (!material) return 0;
  // Convert sq ft to sq m (1 sq ft ≈ 0.0929 sq m)
  const areaSqM = areaSqFt * 0.0929;
  return material.embodiedCarbon * areaSqM;
}

/**
 * Suggest sustainable alternatives
 */
export function getSustainableAlternatives(materialId: string, category: PBRMaterial['category']): PBRMaterial[] {
  const alternatives = getMaterialsByCategory(category);
  return alternatives
    .filter(m => m.recyclability === 'high' && m.embodiedCarbon < 0.5)
    .sort((a, b) => a.embodiedCarbon - b.embodiedCarbon)
    .slice(0, 3);
}

/**
 * Create material data for Three.js
 */
export function createThreeMaterial(materialId: string) {
  const material = getMaterial(materialId);
  if (!material) return null;

  return {
    color: material.baseColor,
    metalness: material.metalness,
    roughness: material.roughness,
    envMapIntensity: 1.0,
    normalScale: [material.normalScale, material.normalScale],
  };
}

/**
 * Generate material cost and carbon report
 */
export function generateMaterialReport(
  materials: Array<{ materialId: string; areaSqFt: number }>
): {
  totalCost: number;
  totalCarbon: number;
  breakdown: Array<{
    name: string;
    area: number;
    cost: number;
    carbon: number;
  }>;
} {
  const breakdown = materials
    .map(({ materialId, areaSqFt }) => {
      const mat = getMaterial(materialId);
      if (!mat) return null;

      return {
        name: mat.name,
        area: areaSqFt,
        cost: calculateMaterialCost(materialId, areaSqFt),
        carbon: calculateEmbodiedCarbon(materialId, areaSqFt),
      };
    })
    .filter(Boolean) as any[];

  return {
    totalCost: breakdown.reduce((sum, item) => sum + item.cost, 0),
    totalCarbon: breakdown.reduce((sum, item) => sum + item.carbon, 0),
    breakdown,
  };
}
