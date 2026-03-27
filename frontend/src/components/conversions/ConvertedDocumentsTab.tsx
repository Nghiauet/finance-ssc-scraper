import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, Trash2, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ExchangeBadge, ReportTypeBadge } from "@/components/StatusBadge"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Pagination } from "@/components/Pagination"
import { EmptyState } from "@/components/EmptyState"
import { listConvertedDocuments, deleteDocumentMarkdown } from "@/api/conversions"
import { formatDateTime } from "@/lib/format"
import { toast } from "sonner"

const PAGE_SIZE = 20

export function ConvertedDocumentsTab() {
  const queryClient = useQueryClient()
  const [ticker, setTicker] = useState("")
  const [reportType, setReportType] = useState("")
  const [year, setYear] = useState<number | undefined>()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["converted-documents", ticker, reportType, year, page],
    queryFn: () =>
      listConvertedDocuments({
        ticker: ticker || undefined,
        report_type: reportType || undefined,
        year,
        page,
        page_size: PAGE_SIZE,
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDocumentMarkdown,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["converted-documents"] })
      queryClient.invalidateQueries({ queryKey: ["conversion-status-counts"] })
      toast.success("Markdown deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const documents = data?.documents ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const hasFilters = ticker || reportType || year

  const clearFilters = () => {
    setTicker("")
    setReportType("")
    setYear(undefined)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by ticker..."
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value)
              setPage(1)
            }}
            className="pl-9 w-40"
          />
        </div>
        <Select
          value={reportType}
          onValueChange={(v) => {
            setReportType(v === "all" ? "" : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Report Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="hop_nhat">Consolidated</SelectItem>
            <SelectItem value="rieng">Individual</SelectItem>
            <SelectItem value="me">Parent</SelectItem>
            <SelectItem value="tong_hop">Summary</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="Year"
          value={year ?? ""}
          onChange={(e) => {
            setYear(e.target.value ? parseInt(e.target.value) : undefined)
            setPage(1)
          }}
          className="w-24"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {total} converted document{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          title="No converted documents"
          message={
            hasFilters
              ? "No documents match the current filters."
              : "Convert documents from the Documents page to see them here."
          }
        />
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Document</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Year</th>
                <th className="p-3 font-medium">Pages</th>
                <th className="p-3 font-medium">Model</th>
                <th className="p-3 font-medium">Converted</th>
                <th className="w-20 p-3" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.markdown_id}
                  className="border-b hover:bg-accent/50 transition-colors"
                >
                  <td className="p-3">
                    <Link
                      to={`/documents/${doc.document_id}`}
                      className="hover:underline"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-primary">{doc.ticker}</span>
                        <ExchangeBadge exchange={doc.exchange} />
                      </div>
                      <div className="mt-0.5 truncate max-w-[280px] text-xs text-muted-foreground">
                        {doc.report_name}
                      </div>
                    </Link>
                  </td>
                  <td className="p-3">
                    <ReportTypeBadge type={doc.report_type} />
                  </td>
                  <td className="p-3 text-xs">
                    {doc.year ?? "-"}
                    {doc.quarter ? `/Q${doc.quarter}` : ""}
                  </td>
                  <td className="p-3 text-xs">{doc.page_count}</td>
                  <td className="p-3">
                    <span className="text-xs text-muted-foreground truncate max-w-[120px] inline-block">
                      {doc.model_name ?? "-"}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    {formatDateTime(doc.converted_at)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Link to={`/documents/${doc.document_id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="View document">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Delete markdown"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        title="Delete markdown content?"
                        description="This will remove the converted markdown. The original PDF document will not be affected. You can re-convert it later."
                        confirmLabel="Delete"
                        onConfirm={() => deleteMutation.mutate(doc.document_id)}
                      />
                    </div>
                  </td>
                </tr>
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
