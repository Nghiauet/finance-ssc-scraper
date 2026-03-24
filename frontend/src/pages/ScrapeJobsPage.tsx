import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Trash2, Play } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/StatusBadge"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Pagination } from "@/components/Pagination"
import { EmptyState } from "@/components/EmptyState"
import {
  listScrapeJobs,
  createScrapeJob,
  deleteScrapeJob,
  countScrapeJobs,
} from "@/api/scrape-jobs"
import { formatDateTime, formatDuration } from "@/lib/format"
import { toast } from "sonner"

const PAGE_SIZE = 20

export function ScrapeJobsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get("page") || "1")
  const prefillTicker = searchParams.get("ticker") || ""
  const queryClient = useQueryClient()
  const prevJobsRef = useRef<string>("")

  // Form state
  const [ticker, setTicker] = useState(prefillTicker)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [maxPages, setMaxPages] = useState(prefillTicker ? "0" : "5")
  const [downloadFiles, setDownloadFiles] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Sync prefill ticker from URL
  useEffect(() => {
    if (prefillTicker) {
      setTicker(prefillTicker)
      setMaxPages("0")
    }
  }, [prefillTicker])

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["scrape-jobs", page],
    queryFn: () => listScrapeJobs({ page, page_size: PAGE_SIZE }),
    refetchInterval: (query) => {
      const data = query.state.data
      const hasActive = data?.some(
        (j) => j.status === "running" || j.status === "pending",
      )
      return hasActive ? 3000 : false
    },
  })

  // Toast on job status change
  useEffect(() => {
    if (!jobs) return
    const key = jobs.map((j) => `${j.id}:${j.status}`).join(",")
    if (prevJobsRef.current && prevJobsRef.current !== key) {
      for (const job of jobs) {
        const prev = prevJobsRef.current
        const prevStatus = prev
          .split(",")
          .find((s) => s.startsWith(job.id))
          ?.split(":")[1]
        if (prevStatus && prevStatus !== job.status) {
          if (job.status === "completed") {
            toast.success(
              `Scrape ${job.ticker || "all"} completed: ${job.total_reports_found} reports found`,
            )
          } else if (job.status === "failed") {
            toast.error(`Scrape ${job.ticker || "all"} failed`)
          }
        }
      }
    }
    prevJobsRef.current = key
  }, [jobs])

  const { data: countData } = useQuery({
    queryKey: ["scrape-jobs-count"],
    queryFn: countScrapeJobs,
  })

  const createMutation = useMutation({
    mutationFn: createScrapeJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrape-jobs"] })
      queryClient.invalidateQueries({ queryKey: ["scrape-jobs-count"] })
      toast.success("Scrape job started")
      setSubmitting(false)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setSubmitting(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteScrapeJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrape-jobs"] })
      queryClient.invalidateQueries({ queryKey: ["scrape-jobs-count"] })
      toast.success("Job deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    createMutation.mutate({
      ticker: ticker || null,
      from_date: fromDate || null,
      to_date: toDate || null,
      max_pages: maxPages ? parseInt(maxPages) : null,
      download_files: downloadFiles,
    })
  }

  const total = countData?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Scrape Jobs</h1>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Form */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New Scrape Job</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ticker">Ticker (optional)</Label>
                  <Input
                    id="ticker"
                    placeholder="e.g. VNM"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to scrape all tickers
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fromDate">From Date</Label>
                    <Input
                      id="fromDate"
                      placeholder="dd/mm/yyyy"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="toDate">To Date</Label>
                    <Input
                      id="toDate"
                      placeholder="dd/mm/yyyy"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="maxPages">Max Pages</Label>
                  <Input
                    id="maxPages"
                    type="number"
                    min="0"
                    placeholder="0 = all pages"
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="downloadFiles"
                    checked={downloadFiles}
                    onCheckedChange={(v) => setDownloadFiles(!!v)}
                  />
                  <Label htmlFor="downloadFiles" className="text-sm font-normal">
                    Download PDF/XLS files
                  </Label>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-1.5 h-4 w-4" />
                      Start Scraping
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Jobs table */}
        <div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : jobs?.length === 0 ? (
            <EmptyState
              title="No scrape jobs"
              message="Use the form to start your first scrape job."
            />
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-3 font-medium">Job</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Results</th>
                    <th className="p-3 font-medium">Time</th>
                    <th className="w-10 p-3" />
                  </tr>
                </thead>
                <tbody>
                  {jobs?.map((job) => (
                    <>
                      <tr
                        key={job.id}
                        className="border-b hover:bg-accent/50 transition-colors"
                      >
                        <td className="p-3">
                          <div className="font-medium">
                            {job.ticker ? (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                                {job.ticker}
                              </span>
                            ) : (
                              "All tickers"
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {job.max_pages
                              ? `${job.max_pages} pages`
                              : "All pages"}
                            {job.download_files && " + files"}
                          </div>
                        </td>
                        <td className="p-3">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="p-3">
                          <div className="text-xs">
                            <span>{job.total_reports_found} reports</span>
                            {job.download_files && (
                              <span className="ml-2">
                                {job.total_files_downloaded} files
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {job.total_pages_scraped} pages scraped
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-xs">
                            {formatDateTime(job.created_at)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDuration(job.started_at, job.completed_at)}
                          </div>
                        </td>
                        <td className="p-3">
                          {job.status !== "running" &&
                            job.status !== "pending" && (
                              <ConfirmDialog
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                }
                                title="Delete scrape job?"
                                description="This will remove the job record. Scraped data will not be affected."
                                confirmLabel="Delete"
                                onConfirm={() => deleteMutation.mutate(job.id)}
                              />
                            )}
                        </td>
                      </tr>
                      {job.status === "failed" && job.error_message && (
                        <tr key={`${job.id}-error`} className="border-b">
                          <td
                            colSpan={5}
                            className="bg-destructive/5 px-3 py-2 text-xs text-destructive"
                          >
                            {job.error_message.slice(0, 300)}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            onPageChange={(p) =>
              setSearchParams((prev) => {
                prev.set("page", String(p))
                return prev
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
