declare module 'heerich' {
  export interface StyleObject {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    fillOpacity?: number;
    strokeOpacity?: number;
  }

  export interface StyleParam {
    default?: StyleObject | ((x: number, y: number, z: number) => StyleObject);
    top?: StyleObject | ((x: number, y: number, z: number) => StyleObject);
    bottom?: StyleObject | ((x: number, y: number, z: number) => StyleObject);
    left?: StyleObject | ((x: number, y: number, z: number) => StyleObject);
    right?: StyleObject | ((x: number, y: number, z: number) => StyleObject);
    front?: StyleObject | ((x: number, y: number, z: number) => StyleObject);
    back?: StyleObject | ((x: number, y: number, z: number) => StyleObject);
  }

  export interface CameraOptions {
    type?: 'oblique' | 'perspective';
    angle?: number;
    distance?: number;
    position?: [number, number];
  }

  export interface HeerichOptions {
    tile?: [number, number];
    style?: StyleObject;
    camera?: CameraOptions;
  }

  export interface AddBoxOptions {
    position: [number, number, number];
    size: [number, number, number];
    style?: StyleParam;
    mode?: 'union' | 'subtract' | 'intersect' | 'exclude';
    content?: string;
    opaque?: boolean;
    meta?: Record<string, unknown>;
    rotate?: {
      axis: 'x' | 'y' | 'z';
      turns: number;
      center?: [number, number, number];
    };
  }

  export interface Face {
    type: string;
    voxel: unknown;
    points: Array<[number, number]>;
    depth: number;
    style?: StyleObject;
  }

  export interface ToSVGOptions {
    padding?: number;
    viewBox?: [number, number, number, number];
    offset?: [number, number];
    prepend?: string;
    append?: string;
    faceAttributes?: (face: Face) => Record<string, string>;
  }

  export class Heerich {
    constructor(options?: HeerichOptions);
    addBox(options: AddBoxOptions): void;
    removeBox(options: { position: [number, number, number]; size: [number, number, number] }): void;
    clear(): void;
    setCamera(options: CameraOptions): void;
    toSVG(options?: ToSVGOptions): string;
    getFaces(): Face[];
    getOptimalViewBox(padding?: number, faces?: Face[]): [number, number, number, number];
  }
}
