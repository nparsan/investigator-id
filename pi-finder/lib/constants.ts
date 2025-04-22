export const DEFAULT_RADIUS = 15
export const MIN_RADIUS = 5
export const MAX_RADIUS = 50
export const DEFAULT_ZIP = "77030"
export const ITEMS_PER_PAGE = 6

export type Physician = {
  id: number
  name: string
  /** Optional columns from the investigators table */
  role?: string | null
  facility?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  affiliation?: string | null
  nctId?: string | null
  /**
   * Calculated on the server – distance (in miles) between the user‑supplied
   * ZIP code and the investigator's ZIP code. Needed for the UI badge.
   */
  distance: number
  /** Study start date (ISO string) */
  startDate: string
  /** Optional – we may enrich this later by joining trials table */
  trialTitle?: string | null
}

export type ApiResponse = {
  physicians: Physician[]
  totalCount: number
}

export type ApiError = {
  message: string
  code?: string
}
