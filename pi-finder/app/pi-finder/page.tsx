"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, AlertCircle, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Skeleton } from "@/components/ui/skeleton"
import { ResultCard } from "@/components/result-card"
import { EmptyPlaceholder } from "@/components/empty-placeholder"
import { PaginationControls } from "@/components/pagination-controls"
import { ErrorMessage } from "@/components/error-message"
import { fetchResults } from "@/lib/api"
import { DEFAULT_RADIUS, DEFAULT_ZIP, MAX_RADIUS, MIN_RADIUS, ITEMS_PER_PAGE } from "@/lib/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ApiResponse, Physician } from "@/lib/constants"
import { TrialMeta } from "@/lib/types"
import { useTrialMeta } from "@/hooks/use-trial-meta"
import { TrialFilterDrawer, type TrialFilters } from "@/components/trial-filter-drawer"
import Image from "next/image"

// Centralized default filters so we can easily reset them when starting a new search
const DEFAULT_FILTERS: TrialFilters = { phases: [], sponsorType: "Any", recruitingOnly: false }

export default function PiFinderPage() {
  const [zipCode, setZipCode] = useState(DEFAULT_ZIP)
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [startYear, setStartYear] = useState<string>("")
  const [endYear, setEndYear] = useState<string>("")
  const [currentPage, setCurrentPage] = useState(1)
  const [searchParams, setSearchParams] = useState<{
    zipCode: string
    radius: number
    startYear?: number
    endYear?: number
  } | null>(null)
  const [filters, setFilters] = useState<TrialFilters>(DEFAULT_FILTERS)

  const { data, isLoading, isFetching, error, refetch } = useQuery<ApiResponse, Error>({
    queryKey: ["physicians", searchParams, currentPage],
    queryFn: () =>
      searchParams
        ? fetchResults(
            searchParams.zipCode,
            searchParams.radius,
            [],
            currentPage,
            searchParams.startYear,
            searchParams.endYear,
          )
        : Promise.resolve({ physicians: [], totalCount: 0 }),
    enabled: !!searchParams,
    placeholderData: (prev: ApiResponse | undefined) => prev,
    retry: 1,
  })

  // Helper to determine if any trial filter is active
  const isTrialFilterActive = useMemo(() => {
    return (
      filters.phases.length > 0 ||
      filters.sponsorType !== "Any" ||
      filters.recruitingOnly
    )
  }, [filters])

  // State to hold all physicians when filtering client-side
  const [allPhysicians, setAllPhysicians] = useState<Physician[] | null>(null)
  const [allLoading, setAllLoading] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)
  const [allPhysiciansDataAvailable, setAllPhysiciansDataAvailable] = useState(false)

  // Fetch all physicians if trial filter is active
  useEffect(() => {
    let cancelled = false
    if (isTrialFilterActive && searchParams) {
      setAllLoading(true)
      setAllError(null)
      setAllPhysiciansDataAvailable(false) // Reset before fetch
      fetchResults(
        searchParams.zipCode,
        searchParams.radius,
        [],
        1,
        searchParams.startYear,
        searchParams.endYear,
        true // fetchAll
      )
        .then((res) => {
          if (!cancelled) {
            setAllPhysicians(res.physicians)
            setAllPhysiciansDataAvailable(true) // Set true on success
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setAllError(err.message || "Failed to fetch all results")
            setAllPhysiciansDataAvailable(false) // Set false on error
          }
        })
        .finally(() => {
          if (!cancelled) setAllLoading(false)
        })
    } else {
      setAllPhysicians(null)
      // setAllLoading(false) // Handled by finally in the if block
      setAllError(null)
      setAllPhysiciansDataAvailable(false) // Reset if not active or no searchParams
    }
    return () => {
      cancelled = true
    }
  }, [isTrialFilterActive, searchParams])

  // Gather unique NCT IDs from the correct physician set
  const nctIds = useMemo(() => {
    const base = isTrialFilterActive && allPhysicians ? allPhysicians : data?.physicians || []
    return base
      .map((p) => p.nctId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  }, [data?.physicians, allPhysicians, isTrialFilterActive])

  const {
    data: trialMeta = [],
    isLoading: metaLoading,
    error: metaError,
  } = useTrialMeta(nctIds)

  // Fast lookup map for filters
  const metaMap = useMemo(() => {
    const m = new Map<string, TrialMeta>()
    for (const tm of trialMeta) m.set(tm.nctId, tm)
    return m
  }, [trialMeta])

  // Apply trial meta filters to the correct physician set
  const filteredPhysicians = useMemo(() => {
    const base = isTrialFilterActive && allPhysicians ? allPhysicians : data?.physicians || []
    if (!base.length) return []
    // Early return when no filters are active
    const noPhase = filters.phases.length === 0
    const anySponsor = filters.sponsorType === "Any"
    const noRecruit = !filters.recruitingOnly
    if (!isTrialFilterActive || (noPhase && anySponsor && noRecruit)) return base

    return base.filter((p) => {
      const meta = p.nctId ? metaMap.get(p.nctId) : undefined
      if (!meta) return false // Cannot evaluate → exclude
      if (filters.phases.length && !filters.phases.includes(meta.phase)) return false
      if (filters.sponsorType === "Industry" && meta.fundedBy?.toLowerCase() !== "industry") return false
      if (filters.recruitingOnly && !(meta.overallStatus?.toLowerCase().startsWith("recruit"))) return false
      return true
    })
  }, [data?.physicians, allPhysicians, metaMap, filters, isTrialFilterActive])

  // Paginate filtered results in memory if trial filter is active
  const paginatedPhysicians = useMemo(() => {
    if (isTrialFilterActive) {
      const start = (currentPage - 1) * ITEMS_PER_PAGE
      const end = start + ITEMS_PER_PAGE
      return filteredPhysicians.slice(start, end)
    }
    return filteredPhysicians
  }, [filteredPhysicians, currentPage, isTrialFilterActive])

  // Use filtered count for pagination and display if trial filter is active
  const displayPhysicians = paginatedPhysicians
  const filteredTotalCount = filteredPhysicians.length
  const filteredTotalPages = Math.ceil(filteredTotalCount / ITEMS_PER_PAGE)
  const totalCountToShow = isTrialFilterActive ? filteredTotalCount : data?.totalCount || 0
  const totalPagesToShow = isTrialFilterActive ? filteredTotalPages : Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE)

  const handleSearch = () => {
    // Reset any previously‑applied trial attribute filters to their defaults so that a
    // fresh search starts from a clean slate – especially important when a prior
    // metadata fetch failed and left the UI in an empty‑state.
    setFilters(DEFAULT_FILTERS)

    // Validate ZIP code
    if (!zipCode || zipCode.length !== 5 || !/^\d+$/.test(zipCode)) {
      return
    }

    // Validate years (blank is allowed)
    const isValidYear = (y: string) => y === "" || (/^[0-9]{4}$/.test(y) && Number(y) >= 1900 && Number(y) <= 2100)
    if (!isValidYear(startYear) || !isValidYear(endYear)) {
      return
    }

    const sy = startYear ? Number(startYear) : undefined
    const ey = endYear ? Number(endYear) : undefined

    // Swap locally before sending if sy > ey
    let syFixed = sy
    let eyFixed = ey
    if (syFixed && eyFixed && syFixed > eyFixed) {
      ;[syFixed, eyFixed] = [eyFixed, syFixed]
    }

    setCurrentPage(1) // Reset to first page on new search
    setSearchParams({
      zipCode,
      radius,
      startYear: syFixed,
      endYear: eyFixed,
    })
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // Scroll to top of results
    window.scrollTo({
      top: document.getElementById("results-section")?.offsetTop || 0,
      behavior: "smooth",
    })
  }

  const isSearching = isLoading || isFetching
  const physicians = data?.physicians || []
  const totalCount = data?.totalCount || 0
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const isZipCodeValid = !zipCode || (zipCode.length === 5 && /^\d+$/.test(zipCode))
  const isYearValid = (y: string) => y === "" || (/^[0-9]{4}$/.test(y) && Number(y) >= 1900 && Number(y) <= 2100)
  const isYearRangeValid = isYearValid(startYear) && isYearValid(endYear)

  const showPhaseCounts = allPhysiciansDataAvailable && !metaLoading && !metaError

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center px-4 md:px-6 gap-2">
          <Image src="/images/reticular-logo.svg" alt="Reticular logo" width={40} height={40} />
          <h1 className="text-logo">Reticular</h1>
        </div>
      </header>

      <main className="container py-8 px-4 md:px-6 space-y-8">
        {/* Search Panel */}
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl border bg-background/60 backdrop-blur-sm p-6 md:p-8 shadow-lg">
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault()
                handleSearch()
              }}
            >
              <div className="space-y-3">
                <label htmlFor="zipCode" className="text-sm font-medium">
                  ZIP Code
                </label>
                <Input
                  id="zipCode"
                  placeholder="77030"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  aria-invalid={!isZipCodeValid}
                  aria-describedby={!isZipCodeValid ? "zipcode-error" : undefined}
                />
                {!isZipCodeValid && (
                  <Alert variant="destructive" id="zipcode-error" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Please enter a valid 5-digit ZIP code</AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="radius" className="text-sm font-medium">
                    Radius
                  </label>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{radius} mi</span>
                </div>
                <Slider
                  id="radius"
                  min={MIN_RADIUS}
                  max={MAX_RADIUS}
                  step={1}
                  value={[radius]}
                  onValueChange={(value) => setRadius(value[0])}
                  aria-label={`Set search radius, currently ${radius} miles`}
                />
              </div>

              {/* Year Range Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="startYear" className="text-sm font-medium">
                    Start Year
                  </label>
                  <Input
                    id="startYear"
                    placeholder="e.g. 2015"
                    value={startYear}
                    onChange={(e) => setStartYear(e.target.value)}
                    aria-invalid={!isYearValid(startYear)}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="endYear" className="text-sm font-medium">
                    End Year
                  </label>
                  <Input
                    id="endYear"
                    placeholder="e.g. 2024"
                    value={endYear}
                    onChange={(e) => setEndYear(e.target.value)}
                    aria-invalid={!isYearValid(endYear)}
                  />
                </div>
              </div>

              {!isYearRangeValid && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Please enter valid 4‑digit years (1900‑2100)</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={isSearching || !isZipCodeValid || !isYearRangeValid}>
                {isSearching ? (
                  <>Searching...</>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                    Search
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Results Section */}
        <div id="results-section" className="space-y-6">
          {/* Error message */}
          {error && <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />}

          {/* Results count and pagination info */}
          {searchParams && !(isSearching || allLoading) && !error && !allError && displayPhysicians.length > 0 && (
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min((currentPage - 1) * ITEMS_PER_PAGE + displayPhysicians.length, totalCountToShow)} of {totalCountToShow} results
              </p>
              {/* Filters button with loading state */}
              <TrialFilterDrawer meta={trialMeta} filters={filters} onChange={setFilters} loading={metaLoading} showPhaseCounts={showPhaseCounts} />
            </div>
          )}
          {allLoading && <Skeleton className="h-8 w-32" />}
          {allError && <ErrorMessage message={allError} onRetry={() => setFilters(DEFAULT_FILTERS)} />}

          {isSearching ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-live="polite" aria-busy="true">
              {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden shadow-lg">
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-16 w-full" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="pt-4 border-t">
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : displayPhysicians.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-live="polite">
                {displayPhysicians.map((physician: Physician) => (
                  <ResultCard key={physician.id} physician={physician} />
                ))}
              </div>

              {/* Pagination Controls */}
              <PaginationControls currentPage={currentPage} totalPages={totalPagesToShow} onPageChange={handlePageChange} />
            </>
          ) : searchParams && !error ? (
            <EmptyPlaceholder message="No PIs match the selected filters." />
          ) : null}

          {metaError && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to fetch trial metadata. Filters may be incomplete.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </main>
    </div>
  )
}
