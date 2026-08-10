// Ghana-specific material properties based on local research
// References: Acheampong et al. (2020), Apau et al. (2021), GS 1207:2018

import type { MaterialProperty } from '@/types/standards';

export const ghanaianMaterials: Record<string, MaterialProperty> = {
  sandcrete: {
    name: 'Sandcrete Block (450×225×150mm)',
    minCompressiveStrength: 1.9, // MPa - real-world averages from Ghanaian production
    maxCompressiveStrength: 2.8, // MPa - per GS 1207:2018
    density: 1900, // kg/m³
    costPerUnit: 0.85, // GHS per block (2024 estimate)
    unitName: 'block',
    references: [
      'GS 1207:2018 Part 7 (Housing)',
      'Acheampong et al. (2020)',
      'Apau et al. (2021)',
    ],
  },

  laterite: {
    name: 'Laterite Block (450×225×150mm)',
    minCompressiveStrength: 2.5, // MPa - with 6% cement content
    maxCompressiveStrength: 3.5, // MPa
    density: 2100, // kg/m³
    costPerUnit: 0.65, // GHS per block (more sustainable, lower cost)
    unitName: 'block',
    references: [
      'GS 1207:2018 Part 7',
      'Donkor & Obonyo (2016)',
    ],
  },

  concrete: {
    name: 'Concrete (C20/C25)',
    minCompressiveStrength: 20, // MPa
    maxCompressiveStrength: 25, // MPa
    density: 2400, // kg/m³
    costPerUnit: 250, // GHS per m³
    unitName: 'm³',
    references: ['GS 1207:2018'],
  },

  timber: {
    name: 'Hardwood Timber (Locally sourced)',
    minCompressiveStrength: 8, // MPa - parallel to grain
    maxCompressiveStrength: 12, // MPa
    density: 700, // kg/m³ - average for Ghana hardwoods
    costPerUnit: 1200, // GHS per m³
    unitName: 'm³',
    references: ['GS 1207:2018 Part 7'],
  },
};

// Wall thickness requirements per GS 1207:2018 & L.I. 1630
export const wallThicknessRequirements = {
  sandcrete: {
    loadBearing: {
      oneStory: 150, // mm - minimum
      twoStory: 225, // mm
      threeStory: 300, // mm
    },
    partition: {
      minimum: 100, // mm
    },
  },
  laterite: {
    loadBearing: {
      oneStory: 150, // mm
      twoStory: 200, // mm
      threeStory: 250, // mm
    },
    partition: {
      minimum: 100, // mm
    },
  },
  concrete: {
    loadBearing: {
      oneStory: 100, // mm
      twoStory: 150, // mm
      threeStory: 200, // mm
    },
    partition: {
      minimum: 75, // mm
    },
  },
};

// Common residential dimensions (Ghana context)
export const standardDimensions = {
  doorWidth: 900, // mm - standard entry door
  doorHeight: 2100, // mm
  windowWidth: 1200, // mm
  windowHeight: 1200, // mm
  ceilingHeight: 2700, // mm - typical residential
  floorToFloorHeight: 3300, // mm - with structure
};
