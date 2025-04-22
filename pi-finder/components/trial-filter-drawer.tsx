import { useState, useEffect, useMemo } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { TrialMeta } from "@/lib/types"
import { Loader2 } from "lucide-react"

export interface TrialFilters {
  phases: string[]
  sponsorType: "Any" | "Industry"
  recruitingOnly: boolean
}

type Props = {
  meta: TrialMeta[]
  filters: TrialFilters
  onChange: (f: TrialFilters) => void
  loading?: boolean
}

const PHASE_OPTIONS = ["1", "2", "3", "4", "NA"]

export function TrialFilterDrawer({ meta, filters, onChange, loading }: Props) {
  const [local, setLocal] = useState<TrialFilters>(filters)

  // Sync prop → local when drawer reopens
  useEffect(() => setLocal(filters), [filters])

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const study of meta) {
      const phase = study.phase ?? "NA"
      map[phase] = (map[phase] ?? 0) + 1
    }
    return map
  }, [meta])

  const apply = () => {
    onChange(local)
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" disabled={loading}>
          {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
          Filters
        </Button>
      </DrawerTrigger>
      <DrawerContent className="p-4 space-y-6">
        <DrawerHeader>
          <DrawerTitle>Filter by Trial Attributes</DrawerTitle>
        </DrawerHeader>

        {/* Phase chips */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Phase</p>
          <ToggleGroup
            type="multiple"
            value={local.phases}
            onValueChange={(v) => setLocal((prev) => ({ ...prev, phases: v }))}
          >
            {PHASE_OPTIONS.map((p) => (
              <ToggleGroupItem key={p} value={p} aria-label={`Phase ${p}`}>
                {`Phase ${p}`}
                {counts[p] ? <span className="ml-1 text-muted-foreground text-xs">({counts[p]})</span> : null}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Sponsor type */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Sponsor Type</p>
          <RadioGroup
            value={local.sponsorType}
            onValueChange={(v) => setLocal((prev) => ({ ...prev, sponsorType: v as "Any" | "Industry" }))}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="Any" id="sponsor-any" />
              <label htmlFor="sponsor-any" className="text-sm">Any</label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="Industry" id="sponsor-industry" />
              <label htmlFor="sponsor-industry" className="text-sm">Industry</label>
            </div>
          </RadioGroup>
        </div>

        {/* Recruiting */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Recruiting Status</p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="recruiting-only"
              checked={local.recruitingOnly}
              onCheckedChange={(v) => setLocal((prev) => ({ ...prev, recruitingOnly: Boolean(v) }))}
            />
            <label htmlFor="recruiting-only" className="text-sm">Recruiting only</label>
          </div>
        </div>

        {/* Indications (coming soon) */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Indications <span className="text-xs text-muted-foreground">(coming soon)</span></p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              className="bg-muted text-muted-foreground border rounded px-3 py-2 w-full cursor-not-allowed"
              placeholder="e.g. asthma, COPD"
              disabled
            />
            <Button variant="secondary" disabled className="opacity-60 cursor-not-allowed">Filter</Button>
          </div>
        </div>

        <DrawerFooter>
          <Button onClick={apply}>Apply</Button>
          <DrawerClose asChild>
            <Button variant="ghost">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
} 