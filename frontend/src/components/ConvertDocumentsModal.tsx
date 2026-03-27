import { useState, useEffect } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getConversionPreviewCount, createFilterBatchConversion } from "@/api/conversions"
import { toast } from "sonner"
import type { Company } from "@/types"

interface ConvertDocumentsModalProps {
  open: boolean
  companies: Company[]
  onClose: () => void
  onSuccess: (jobsCreated: number) => void
}

export function ConvertDocumentsModal({
  open,
  companies,
  onClose,
  onSuccess,
}: ConvertDocumentsModalProps) {
  const [yearFrom, setYearFrom] = useState("")
  const [yearTo, setYearTo] = useState("")
  const [reportType, setReportType] = useState("")
  const [reportPeriod, setReportPeriod] = useState("")
  const [preview, setPreview] = useState<{ unconverted: number; already_converted: number } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const tickers = companies.map((c) => c.symbol)

  // Debounced preview count fetch
  useEffect(() => {
    if (!open || tickers.length === 0) return
    setPreviewLoading(true)
    const timer = setTimeout(async () => {
      try {
        const result = await getConversionPreviewCount({
          tickers,
          report_type: reportType || undefined,
          report_period: reportPeriod || undefined,
          year_from: yearFrom ? parseInt(yearFrom) : undefined,
          year_to: yearTo ? parseInt(yearTo) : undefined,
        })
        setPreview(result)
      } catch {
        setPreview(null)
      } finally {
        setPreviewLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [open, tickers.join(","), yearFrom, yearTo, reportType, reportPeriod])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setYearFrom("")
      setYearTo("")
      setReportType("")
      setReportPeriod("")
      setPreview(null)
    }
  }, [open])

  const convertMutation = useMutation({
    mutationFn: () =>
      createFilterBatchConversion({
        tickers,
        report_type: reportType || undefined,
        report_period: reportPeriod || undefined,
        year_from: yearFrom ? parseInt(yearFrom) : undefined,
        year_to: yearTo ? parseInt(yearTo) : undefined,
      }),
    onSuccess: (data) => {
      if (data.errors.length > 0) {
        toast.warning(`${data.jobs_created} jobs created, ${data.errors.length} failed`)
      } else {
        toast.success(`${data.jobs_created} conversion jobs created`)
      }
      onSuccess(data.jobs_created)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const unconverted = preview?.unconverted ?? 0
  const alreadyConverted = preview?.already_converted ?? 0

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert Documents for {companies.length} {companies.length === 1 ? "Company" : "Companies"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Company chips */}
          <div className="flex flex-wrap gap-1.5">
            {companies.map((c) => (
              <Badge key={c.id} variant="secondary">{c.symbol}</Badge>
            ))}
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Year from</label>
                <Input
                  type="number"
                  placeholder="e.g. 2022"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Year to</label>
                <Input
                  type="number"
                  placeholder="e.g. 2024"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Select value={reportType} onValueChange={(v) => setReportType(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="hop_nhat">Consolidated</SelectItem>
                  <SelectItem value="rieng">Individual</SelectItem>
                  <SelectItem value="me">Parent</SelectItem>
                  <SelectItem value="tong_hop">Summary</SelectItem>
                </SelectContent>
              </Select>

              <Select value={reportPeriod} onValueChange={(v) => setReportPeriod(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="All periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All periods</SelectItem>
                  <SelectItem value="nam">Annual</SelectItem>
                  <SelectItem value="ban_nien">Semi-annual</SelectItem>
                  <SelectItem value="quy">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm min-h-[40px] flex items-center">
            {previewLoading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Counting documents...
              </span>
            ) : preview ? (
              unconverted === 0 ? (
                <span className="text-muted-foreground">No unconverted documents found</span>
              ) : (
                <span>
                  <span className="font-medium">{unconverted}</span> unconverted documents
                  {alreadyConverted > 0 && (
                    <span className="text-muted-foreground"> ({alreadyConverted} already converted — will be skipped)</span>
                  )}
                </span>
              )
            ) : (
              <span className="text-muted-foreground">Select filters to preview</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={convertMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => convertMutation.mutate()}
            disabled={unconverted === 0 || previewLoading || convertMutation.isPending}
          >
            {convertMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Convert {unconverted > 0 ? unconverted : ""} Documents
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
