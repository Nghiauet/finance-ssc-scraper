import { useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/StatusBadge"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { listConversions, deleteConversion } from "@/api/conversions"
import { formatDateTime, formatDuration } from "@/lib/format"
import { toast } from "sonner"

const PAGE_SIZE = 20

export function ConversionsPage() {
  const queryClient = useQueryClient()
  const prevJobsRef = useRef<string>("")

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["conversions"],
    queryFn: () => listConversions({ page_size: PAGE_SIZE }),
    refetchInterval: (query) => {
      const data = query.state.data
      const hasActive = data?.some(
        (j) => j.status === "running" || j.status === "pending",
      )
      return hasActive ? 3000 : false
    },
  })

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
            toast.success(`Conversion completed (${job.pages_processed} pages)`)
          } else if (job.status === "failed") {
            toast.error("Conversion failed")
          }
        }
      }
    }
    prevJobsRef.current = key
  }, [jobs])

  const deleteMutation = useMutation({
    mutationFn: deleteConversion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversions"] })
      toast.success("Job deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Conversions</h1>
      <p className="text-sm text-muted-foreground">
        PDF to Markdown conversion jobs
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : jobs?.length === 0 ? (
        <EmptyState
          title="No conversion jobs"
          message="Convert a document from the Documents page to see jobs here."
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
                      <Link
                        to={`/documents/${job.document_id}`}
                        className="flex items-center gap-1.5 font-medium text-primary hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {job.document_id.slice(0, 8)}...
                      </Link>
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
    </div>
  )
}
