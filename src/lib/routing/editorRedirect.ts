type EditorSearchParams = Record<string, string | string[] | undefined>;

/** Builds the Studio destination while preserving every legacy editor query value. */
export function getStudioRedirectPath(searchParams: EditorSearchParams): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (typeof value === 'string') {
      query.set(key, value);
    }
  }

  const suffix = query.toString();
  return suffix ? `/studio?${suffix}` : '/studio';
}
