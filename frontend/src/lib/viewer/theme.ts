export type ViewerTheme = 'light' | 'dark';

// `ColorPreset` ('standard' | 'validation') lives in `@/store/designStore` --
// both the 2D (Konva) and 3D (Three.js) renderers read it, so it isn't a
// viewer-only concept.

/**
 * `rendered` (default) uses PBR-ish `meshStandardMaterial` (roughness/
 * metalness). `solid` uses `meshLambertMaterial` -- diffuse-only lighting,
 * no specular/roughness math, meaningfully cheaper per-fragment and a
 * flatter, more diagrammatic look for large plans or validation figures.
 * Independent of `shadows`, which stay on in both modes.
 */
export type Shading = 'solid' | 'rendered';

// Wall/opening colours vary by theme -- the light-mode daylight tones read
// as flatly wrong (too bright, wrong colour temperature) against a dark
// background, the same reason `environments` below already varies its
// floor/background colours per theme.
export const materials = {
  light: {
    loadBearing: '#c7bda6',
    partition: '#9d968a',
    doorEntry: '#6f4e33',
    doorInternal: '#8a6a4b',
    windowGlass: '#9fb6bd',
  },
  dark: {
    loadBearing: '#5c5647',
    partition: '#454138',
    doorEntry: '#3a2b1d',
    doorInternal: '#4a3826',
    windowGlass: '#5c7079',
  },
} as const;

// Lighting values live alongside the other per-theme visuals here rather
// than as a parallel config structure. `hemi*` drives a hemisphereLight
// (sky colour from above, ground colour from below) -- a standard, cheap
// arch-viz technique for a more natural outdoor-lit look than flat
// ambient light alone.
export const environments = {
  light: {
    background: '#ece8de',
    floor: '#dcd6c9',
    gridMajor: '#a89f8d',
    gridMinor: '#ccc5b5',
    ambientColor: '#fff6e8',
    ambientIntensity: 0.45,
    hemiSkyColor: '#dce8f5',
    hemiGroundColor: '#c9bfa8',
    hemiIntensity: 0.5,
    directionalColor: '#ffedd0',
    directionalIntensity: 1.15,
    pointColor: '#dbe7f0',
    pointIntensity: 0.25,
    edgeColor: '#232323',
  },
  dark: {
    background: '#141310',
    floor: '#211f1a',
    gridMajor: '#4d4839',
    gridMinor: '#2c2921',
    ambientColor: '#aab4c2',
    ambientIntensity: 0.35,
    hemiSkyColor: '#2a3038',
    hemiGroundColor: '#1a1712',
    hemiIntensity: 0.4,
    directionalColor: '#c9d4e0',
    directionalIntensity: 0.85,
    pointColor: '#3a4550',
    pointIntensity: 0.2,
    edgeColor: '#e8e3d6',
  },
} as const;
