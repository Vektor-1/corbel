import type { Canonical } from '@/types/schema';

export type ImageBaseline = {
  url: string;
  blur: boolean;
};

/** Reads the image-first Trace baseline from Studio's URL state. */
export function parseImageBaseline(searchParams: URLSearchParams): ImageBaseline | null {
  const url = searchParams.get('ghostUrl');

  return url ? { url, blur: searchParams.get('blur') === 'true' } : null;
}

/** Creates the blank editable floor used by the image-first Trace workspace. */
export function createEmptyTraceFloor(): Canonical.Floor {
  return {
    id: 'trace-workspace',
    elevation: 0,
    floorHeight: 2800,
    walls: [],
    openings: [],
    rooms: [],
  };
}
