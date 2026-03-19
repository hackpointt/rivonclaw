/**
 * In-memory cache for the user's entitlement set.
 *
 * Fetches from the server GraphQL `entitlementSet` query and caches
 * the result. Invalidated on logout or subscription change.
 */
import type { AuthSessionManager } from "../auth/auth-session.js";

export interface EntitlementSet {
  toolIds: string[];
  categories: string[];
  serviceCategories: string[];
}

const ENTITLEMENT_SET_QUERY = `query { entitlementSet { toolIds categories serviceCategories } }`;

let cached: EntitlementSet | null = null;

/**
 * Fetches the user's entitlement set from the server and stores it in memory.
 * Overwrites any previously cached value.
 */
export async function fetchAndCache(authSession: AuthSessionManager): Promise<EntitlementSet> {
  const result = await authSession.graphqlFetch<{
    entitlementSet: EntitlementSet;
  }>(ENTITLEMENT_SET_QUERY);

  cached = result.entitlementSet;
  return cached;
}

/** Returns the cached entitlement set, or null if not yet fetched. */
export function getCached(): EntitlementSet | null {
  return cached;
}

/** Clears the cached entitlement set. Call on logout or subscription change. */
export function invalidate(): void {
  cached = null;
}
