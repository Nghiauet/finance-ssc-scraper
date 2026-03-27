import { useState, useEffect, useRef, Fragment } from "react"
import { Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2, FileText, RefreshCw, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { StatusBadge, ExchangeBadge, ReportTypeBadge } from "@/components/StatusBadge"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Pagination } from "@/components/Pagination"
import { EmptyState } from "@/components/EmptyState"
import {
  listConversions,
  deleteConversion,
  retryConversion,
  batchRetryConversions,
  getConversionStatusCounts,
} from "@/api/conversions"
import { formatDateTime, formatDuration } from "@/lib/format"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ConversionStatusCounts } from "@/types"

const PAGE_SIZE = 20

const STATUS_FILTERS = [
  { key: "", label: "All", countKey: "all" as keyof ConversionStatusCounts },
  { key: "active", label: "Active", countKey: "active" as keyof ConversionStatusCounts },
  { key: "completed", label: "Completed", countKey: "completed" as keyof ConversionStatusCounts },
  { key: "failed", label: "Failed", countKey: "failed" as keyof ConversionStatusCounts },
] as const

export function JobsTab() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState("")
  const [page, setPage] = useState(1)
  const prevJobsRef = useRef<string>("")

  // Map "active" filter to actual query params
  const statusParam = statusFilter === "active" ? undefined : (statusFilter || undefined)

  const { data: statusCounts } = useQuery({
    queryKey: ["conversion-status-counts"],
    queryFn: getConversionStatusCounts,
    refetchInterval: (query) => {
      const counts = query.state.data
      return counts && counts.active > 0 ? 3000 : false
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ["conversions", statusFilter, page],
    queryFn: () =>
      listConversions({
        status: statusParam,
        page,
        page_size: PAGE_SIZE,
      }),
    refetchInterval: (query) => {
      const result = query.state.data
      const hasActive = result?.jobs.some(
        (j) => j.status === "running" || j.status === "pending",
      )
      return hasActive ? 3000 : false
    },
  })

  // For "active" filter, we do client-side filtering since the API doesn't support "active" as a status
  const jobs = statusFilter === "active"
    ? data?.jobs.filter((j) => j.status === "pending" || j.status === "running")
    : data?.jobs
  const total = statusFilter === "active"
    ? (statusCounts?.active ?? 0)
    : (data?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Toast on status changes
  useEffect(() => {
    if (!data?.jobs) return
    const key = data.jobs.map((j) => `${j.id}:${j.status}`).join(",")
    if (prevJobsRef.current && prevJobsRef.current !== key) {
      for (const job of data.jobs) {
        const prev = prevJobsRef.current
        const prevStatus = prev
          .split(",")
          .find((s) => s.startsWith(job.id))
          ?.split(":")[1]
        if (prevStatus && prevStatus !== job.status) {
          if (job.status === "completed") {
            toast.success(`Conversion completed (${job.pages_processed} pages)`)
          } else if (job.status === "failed") {
            toast.error("Conversion failed")
          }
        }
      }
    }
    prevJobsRef.current = key
  }, [data?.jobs])

  const deleteMutation = useMutation({
    mutationFn: deleteConversion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversions"] })
      queryClient.invalidateQueries({ queryKey: ["conversion-status-counts"] })
      toast.success("Job deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const retryMutation = useMutation({
    mutationFn: ({ jobId, resume }: { jobId: string; resume: boolean }) =>
      retryConversion(jobId, resume),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversions"] })
      queryClient.invalidateQueries({ queryKey: ["conversion-status-counts"] })
      toast.success("Retry job created")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const batchRetryMutation = useMutation({
    mutationFn: () => batchRetryConversions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversions"] })
      queryClient.invalidateQueries({ queryKey: ["conversion-status-counts"] })
      const count = data.jobs.length
      const errCount = data.errors.length
      if (errCount > 0) {
        toast.warning(`${count} retried, ${errCount} failed`)
      } else if (count > 0) {
        toast.success(`${count} retry jobs created`)
      } else {
        toast.info("No failed jobs to retry")
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Reset page when filter changes
  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  return (
    <div className="space-y-4">
      {/* Status filter buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const count = statusCounts?.[f.countKey] ?? 0
          const isActive = statusFilter === f.key
          return (
            <Button
              key={f.key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f.key)}
              className="gap-1.5"
            >
              {f.label}
              <Badge
                variant="secondary"
                className={cn(
                  "ml-0.5 min-w-[1.25rem] justify-center text-[10px]",
                  isActive && "bg-primary-foreground/20 text-primary-foreground",
                )}
              >
                {count}
              </Badge>
            </Button>
          )
        })}

        {statusFilter === "failed" && statusCounts && statusCounts.failed > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => batchRetryMutation.mutate()}
            disabled={batchRetryMutation.isPending}
            className="ml-auto"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Retry All Failed
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !jobs?.length ? (
        <EmptyState
          title="No conversion jobs"
          message={
            statusFilter
              ? `No ${statusFilter} jobs found.`
              : "Convert a document from the Documents page to see jobs here."
          }
        />
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Document</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Progress</th>
                <th className="p-3 font-medium">Time</th>
                <th className="w-24 p-3" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <Fragment key={job.id}>
                  <tr className="border-b hover:bg-accent/50 transition-colors">
                    <td className="p-3">
                      <Link
                        to={`/documents/${job.document_id}`}
                        className="flex items-center gap-1.5 hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-primary">
                          {job.document_ticker || job.document_id.slice(0, 8)}
                        </span>
                        {job.document_exchange && (
                          <ExchangeBadge exchange={job.document_exchange} />
                        )}
                      </Link>
                      {job.document_report_name && (
                        <div className="mt-0.5 flex items-center gap-1.5 ml-5">
                          <span className="truncate max-w-[300px] text-xs text-muted-foreground">
                            {job.document_report_name}
                          </span>
                          {job.document_report_type && (
                            <ReportTypeBadge type={job.document_report_type} />
                          )}
                          {job.document_year && (
                            <span className="text-xs text-muted-foreground">
                              {job.document_year}
                              {job.document_quarter ? `/Q${job.document_quarter}` : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="p-3">
                      <div className="text-xs">
                        {job.pages_processed} / {job.total_pages} pages
                      </div>
                      {job.total_pages > 0 && (
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.round((job.pages_processed / job.total_pages) * 100)}%`,
                            }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-xs">{formatDateTime(job.created_at)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDuration(job.started_at, job.completed_at)}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {job.status === "failed" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Retry"
                              onClick={() =>
                                retryMutation.mutate({ jobId: job.id, resume: false })
                              }
                              disabled={retryMutation.isPending}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            {job.pages_processed > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Resume from last page"
                                onClick={() =>
                                  retryMutation.mutate({ jobId: job.id, resume: true })
                                }
                                disabled={retryMutation.isPending}
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                        {job.status !== "running" && job.status !== "pending" && (
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
                            title="Delete conversion job?"
                            description="This will remove the job record. Converted markdown will not be affected."
                            confirmLabel="Delete"
                            onConfirm={() => deleteMutation.mutate(job.id)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Error details row */}
                  {job.status === "failed" && job.error_message && (
                    <tr className="border-b">
                      <td colSpan={5} className="bg-destructive/5 px-3 py-2">
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-destructive">
                            Error details
                          </summary>
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-destructive font-mono">
                            {job.error_message}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={total}
      />
    </div>
  )
}
