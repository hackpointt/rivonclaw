import type { AuthSessionManager } from "../auth/auth-session.js";

interface CachedRunProfile {
  id: string;
  name: string;
  selectedToolIds: string[];
  surfaceId: string;
  ephemeral: boolean;
  createdAt: string;
  updatedAt: string;
}

const RUN_PROFILES_QUERY = `
  query {
    runProfiles {
      id
      name
      selectedToolIds
      surfaceId
      ephemeral
      createdAt
      updatedAt
    }
  }
`;

let cachedRunProfiles: CachedRunProfile[] | null = null;

/** Fetch run profiles from the server and update the in-memory cache. */
export async function fetchAndCache(authSession: AuthSessionManager): Promise<CachedRunProfile[]> {
  const result = await authSession.graphqlFetch<{ runProfiles: CachedRunProfile[] }>(RUN_PROFILES_QUERY);
  cachedRunProfiles = result.runProfiles;
  return cachedRunProfiles;
}

/** Return the cached run profiles, or null if not yet fetched. */
export function getCached(): CachedRunProfile[] | null {
  return cachedRunProfiles;
}

/** Look up a cached run profile by ID. Returns undefined if not cached or not found. */
export function getById(id: string): CachedRunProfile | undefined {
  return cachedRunProfiles?.find((p) => p.id === id);
}

/** Clear the in-memory cache (e.g. on logout). */
export function invalidate(): void {
  cachedRunProfiles = null;
}
