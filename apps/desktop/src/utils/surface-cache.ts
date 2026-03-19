import type { AuthSessionManager } from "../auth/auth-session.js";

interface CachedSurface {
  id: string;
  name: string;
  description?: string;
  allowedToolIds: string[];
  allowedCategories: string[];
  presetId?: string;
  createdAt: string;
  updatedAt: string;
}

const SURFACES_QUERY = `
  query {
    surfaces {
      id
      name
      description
      allowedToolIds
      allowedCategories
      presetId
      createdAt
      updatedAt
    }
  }
`;

let cachedSurfaces: CachedSurface[] | null = null;

/** Fetch surfaces from the server and update the in-memory cache. */
export async function fetchAndCache(authSession: AuthSessionManager): Promise<CachedSurface[]> {
  const result = await authSession.graphqlFetch<{ surfaces: CachedSurface[] }>(SURFACES_QUERY);
  cachedSurfaces = result.surfaces;
  return cachedSurfaces;
}

/** Return the cached surfaces, or null if not yet fetched. */
export function getCached(): CachedSurface[] | null {
  return cachedSurfaces;
}

/** Look up a cached surface by ID. Returns undefined if not cached or not found. */
export function getById(id: string): CachedSurface | undefined {
  return cachedSurfaces?.find((s) => s.id === id);
}

/** Clear the in-memory cache (e.g. on logout). */
export function invalidate(): void {
  cachedSurfaces = null;
}
