import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, Trash2, X, Download, Eye, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ExchangeBadge,
  ReportTypeBadge,
} from "@/components/StatusBadge"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Pagination } from "@/components/Pagination"
import { EmptyState } from "@/components/EmptyState"
import {
  listDocuments,
  countDocuments,
  deleteDocument,
  batchDeleteDocuments,
  getDocumentStats,
  getExportUrl,
} from "@/api/documents"
import { createBatchConversion } from "@/api/conversions"
import { formatDate } from "@/lib/format"
import { getToken } from "@/api/client"
import { toast } from "sonner"

const PAGE_SIZE = 20

export function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const ticker = searchParams.get("ticker") || ""
  const exchange = searchParams.get("exchange") || ""
  const report_type = searchParams.get("report_type") || ""
  const report_period = searchParams.get("report_period") || ""
  const year = searchParams.get("year") || ""
  const search = searchParams.get("search") || ""
  const page = parseInt(searchParams.get("page") || "1")

  const filters = {
    ticker: ticker || undefined,
    exchange: exchange || undefined,
    report_type: report_type || undefined,
    report_period: report_period || undefined,
    year: year ? parseInt(year) : undefined,
    search: search || undefined,
    page,
    page_size: PAGE_SIZE,
  }

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", filters],
    queryFn: () => listDocuments(filters),
  })

  const { data: countData } = useQuery({
    queryKey: ["documents-count", ticker],
    queryFn: () => countDocuments(ticker || undefined),
  })

  const { data: stats } = useQuery({
    queryKey: ["document-stats"],
    queryFn: getDocumentStats,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] })
      queryClient.invalidateQueries({ queryKey: ["documents-count"] })
      toast.success("Document deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteDocuments,
    onSuccess: (data) => {
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ["documents"] })
      queryClient.invalidateQueries({ queryKey: ["documents-count"] })
      toast.success(`Deleted ${data.deleted} documents`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const batchConvertMutation = useMutation({
    mutationFn: (ids: string[]) => createBatchConversion({ document_ids: ids }),
    onSuccess: (data) => {
      setSelectedIds(new Set())
      toast.success(`Started ${data.length} conversion jobs`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const total = countData?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const years = stats
    ? Object.keys(stats.by_year).sort((a, b) => b.localeCompare(a))
    : []

  const setFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      if (value) prev.set(key, value)
      else prev.delete(key)
      prev.set("page", "1")
      return prev
    })
  }

  const clearFilters = () => {
    setSearchParams({})
  }

  const hasFilters = ticker || exchange || report_type || report_period || year || search

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (!documents) return
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)))
    }
  }

  const handleExport = () => {
    const url = getExportUrl({
      ticker: ticker || undefined,
      year: year ? parseInt(year) : undefined,
    })
    const token = getToken()
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = "documents_export.csv"
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Documents{" "}
          <span className="text-base font-normal text-muted-foreground">
            ({total})
          </span>
        </h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => batchConvertMutation.mutate([...selectedIds])}
                disabled={batchConvertMutation.isPending}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Convert {selectedIds.size}
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete {selectedIds.size}
                  </Button>
                }
                title="Delete selected documents?"
                description={`This will permanently delete ${selectedIds.size} documents and their files.`}
                confirmLabel="Delete"
                onConfirm={() => batchDeleteMutation.mutate([...selectedIds])}
              />
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
        </div>
        <Input
          placeholder="Ticker"
          className="h-9 w-24"
          value={ticker}
          onChange={(e) => setFilter("ticker", e.target.value.toUpperCase())}
        />
        <Select value={exchange} onValueChange={(v) => setFilter("exchange", v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue placeholder="Exchange" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="HOSE">HOSE</SelectItem>
            <SelectItem value="HNX">HNX</SelectItem>
            <SelectItem value="UPCOM">UPCOM</SelectItem>
          </SelectContent>
        </Select>
        <Select value={report_type} onValueChange={(v) => setFilter("report_type", v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="hop_nhat">Consolidated</SelectItem>
            <SelectItem value="rieng">Individual</SelectItem>
            <SelectItem value="me">Parent</SelectItem>
            <SelectItem value="tong_hop">Summary</SelectItem>
          </SelectContent>
        </Select>
        <Select value={report_period} onValueChange={(v) => setFilter("report_period", v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All periods</SelectItem>
            <SelectItem value="nam">Annual</SelectItem>
            <SelectItem value="ban_nien">Semi-annual</SelectItem>
            <SelectItem value="quy">Quarterly</SelectItem>
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={(v) => setFilter("year", v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-[100px]">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : documents?.length === 0 ? (
        <EmptyState
          title="No documents"
          message={hasFilters ? "No documents match your filters" : "Start by scraping some reports"}
          actionLabel={hasFilters ? undefined : "New Scrape Job"}
          actionTo={hasFilters ? undefined : "/scrape-jobs"}
        />
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="w-10 p-3">
                  <Checkbox
                    checked={
                      documents
                        ? selectedIds.size === documents.length && documents.length > 0
                        : false
                    }
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="p-3 font-medium">Ticker</th>
                <th className="p-3 font-medium">Report</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Period</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents?.map((doc) => (
                <tr key={doc.id} className="border-b hover:bg-accent/50 transition-colors">
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={() => toggleSelect(doc.id)}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-primary">{doc.ticker}</span>
                      <ExchangeBadge exchange={doc.exchange} />
                    </div>
                  </td>
                  <td className="max-w-[300px] p-3">
                    <Link
                      to={`/documents/${doc.id}`}
                      className="block truncate font-medium hover:text-primary"
                    >
                      {doc.report_name}
                    </Link>
                    {doc.summary && (
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.summary}
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    <ReportTypeBadge type={doc.report_type} />
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {doc.year}
                    {doc.quarter ? ` Q${doc.quarter}` : ""}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatDate(doc.submission_date)}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {doc.file_id && (
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                          <Link to={`/documents/${doc.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        title="Delete document?"
                        description="This will permanently delete this document and its associated file."
                        confirmLabel="Delete"
                        onConfirm={() => deleteMutation.mutate(doc.id)}
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
        totalItems={total}
        onPageChange={(p) =>
          setSearchParams((prev) => {
            prev.set("page", String(p))
            return prev
          })
        }
      />
    </div>
  )
}
