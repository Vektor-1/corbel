export type ImageBaseline = {
  url: string;
  blur: boolean;
};

/** Reads the image-first Trace baseline from Studio's URL state. */
export function parseImageBaseline(searchParams: URLSearchParams): ImageBaseline | null {
  const url = searchParams.get('ghostUrl');

  return url ? { url, blur: searchParams.get('blur') === 'true' } : null;
}
