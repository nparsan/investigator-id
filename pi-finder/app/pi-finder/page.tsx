"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, AlertCircle } from "lucide-react"
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

export default function PiFinderPage() {
  const [zipCode, setZipCode] = useState(DEFAULT_ZIP)
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [indications, setIndications] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [searchParams, setSearchParams] = useState<{
    zipCode: string
    radius: number
    indications: string[]
  } | null>(null)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["physicians", searchParams, currentPage],
    queryFn: () =>
      searchParams
        ? fetchResults(searchParams.zipCode, searchParams.radius, searchParams.indications, currentPage)
        : Promise.resolve({ physicians: [], totalCount: 0 }),
    enabled: !!searchParams,
    keepPreviousData: true,
    retry: 1,
  })

  const handleSearch = () => {
    // Validate ZIP code
    if (!zipCode || zipCode.length !== 5 || !/^\d+$/.test(zipCode)) {
      return
    }

    const indicationsArray = indications
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

    setCurrentPage(1) // Reset to first page on new search
    setSearchParams({
      zipCode,
      radius,
      indications: indicationsArray,
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center px-4 md:px-6">
          <h1 className="text-xl font-bold">PI Finder</h1>
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

              <div className="space-y-3">
                <label htmlFor="indications" className="text-sm font-medium">
                  Indications
                </label>
                <Input
                  id="indications"
                  placeholder="e.g. asthma, COPD"
                  value={indications}
                  onChange={(e) => setIndications(e.target.value)}
                  aria-describedby="indications-hint"
                />
                <p id="indications-hint" className="text-xs text-muted-foreground">
                  e.g. asthma, COPD
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isSearching || !isZipCodeValid}>
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
          {searchParams && !isSearching && !error && physicians.length > 0 && (
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of{" "}
                {totalCount} results
              </p>
            </div>
          )}

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
          ) : physicians.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-live="polite">
                {physicians.map((physician) => (
                  <ResultCard key={physician.id} physician={physician} />
                ))}
              </div>

              {/* Pagination Controls */}
              <PaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
            </>
          ) : searchParams && !error ? (
            <EmptyPlaceholder message="No PIs found yet—try a different radius or indication." />
          ) : null}
        </div>
      </main>
    </div>
  )
}
