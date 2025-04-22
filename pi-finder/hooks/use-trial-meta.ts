import { useQuery } from "@tanstack/react-query"

import type { TrialMeta } from "@/lib/types"

/**
 * Fetches trial metadata for a list of NCT IDs using the `/api/trial-meta` route.
 *
 * The results are cached by React Query keyed on a stable, sorted list of IDs to
 * avoid duplicate requests when the same set of trials is requested again in a
 * different order.
 */
export function useTrialMeta(ids: string[]) {
  // Sort once to ensure cache key stability but keep original order for the UI.
  const keyIds = [...ids].sort()

  return useQuery({
    queryKey: ["trialMeta", keyIds.join(",")],
    queryFn: async (): Promise<TrialMeta[]> => {
      if (!ids.length) return []

      // ---------------- URL length safety ----------------
      const queryString = ids.join(",")
      const shouldPost = `/api/trial-meta?ids=${queryString}`.length > 1800

      const res = shouldPost
        ? await fetch(`/api/trial-meta`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          })
        : await fetch(`/api/trial-meta?ids=${queryString}`)

      if (!res.ok) throw new Error(`Failed to fetch trial meta (${res.status})`)
      return (await res.json()) as TrialMeta[]
    },
    // Only run when there is at least one ID
    enabled: ids.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes – tweak as needed
  })
} 