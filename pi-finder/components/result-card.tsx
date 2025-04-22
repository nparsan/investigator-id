import type { Physician } from "@/lib/constants"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarIcon, ExternalLink } from "lucide-react"
import Link from "next/link"

interface ResultCardProps {
  physician: Physician
}

export function ResultCard({ physician }: ResultCardProps) {
  // Format date to be more readable
  const formattedDate = new Date(physician.startDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  const distanceLabel = Number.isFinite(physician.distance) ? `${physician.distance.toFixed(1)} mi` : "N/A"

  return (
    <Card className="overflow-hidden rounded-2xl shadow-lg h-full flex flex-col transition-shadow hover:shadow-xl border-gray-200">
      <CardHeader className="pb-3 space-y-1 bg-white">
        <CardTitle className="text-xl leading-tight text-gray-900">{physician.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 pb-2 bg-white">
        <p className="text-sm text-gray-600 line-clamp-2">{physician.trialTitle ?? "Study Title TBD"}</p>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200">
            {distanceLabel}
          </Badge>
        </div>
        {physician.facility && (
          <p className="text-sm font-medium text-gray-700 truncate" title={physician.facility ?? undefined}>
            {physician.facility}
          </p>
        )}
        {(physician.city || physician.state || physician.zip) && (
          <p className="text-sm text-gray-600">
            {[physician.city, physician.state].filter(Boolean).join(", ")}
            {physician.zip ? ` ${physician.zip}` : ""}
          </p>
        )}
        {physician.affiliation && (
          <p className="text-xs text-gray-500 italic truncate" title={physician.affiliation ?? undefined}>
            {physician.affiliation}
          </p>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <CalendarIcon className="h-4 w-4" aria-hidden="true" />
          <span>Study Start: {formattedDate}</span>
        </div>
      </CardContent>
      <CardFooter className="pt-3 border-t bg-white border-gray-100">
        <Link
          href={physician.nctId ? `https://clinicaltrials.gov/study/${physician.nctId}` : "#"}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          aria-label={`View study for ${physician.name}`}
          target={physician.nctId ? "_blank" : undefined}
          rel={physician.nctId ? "noopener noreferrer" : undefined}
        >
          View Study
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  )
}
