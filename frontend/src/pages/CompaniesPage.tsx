import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, Trash2, X, FileText, FileDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { ExchangeBadge } from "@/components/StatusBadge"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ConvertDocumentsModal } from "@/components/ConvertDocumentsModal"
import { Pagination } from "@/components/Pagination"
import { EmptyState } from "@/components/EmptyState"
import { listCompanies, countCompanies, deleteCompany, batchDeleteCompanies } from "@/api/companies"
import type { Company } from "@/types"
import { toast } from "sonner"
import { useDocumentTitle } from "@/hooks/use-document-title"

const PAGE_SIZE = 20

export function CompaniesPage() {
  useDocumentTitle("Companies")
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get("search") || ""
  const page = parseInt(searchParams.get("page") || "1")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [convertModalOpen, setConvertModalOpen] = useState(false)
  const [convertModalCompanies, setConvertModalCompanies] = useState<Company[]>([])
  const queryClient = useQueryClient()

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies", search, page],
    queryFn: () => listCompanies({ search, page, page_size: PAGE_SIZE }),
  })

  const { data: countData } = useQuery({
    queryKey: ["companies-count"],
    queryFn: countCompanies,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["companies-count"] })
      toast.success("Company deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteCompanies,
    onSuccess: (data) => {
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["companies-count"] })
      toast.success(`Deleted ${data.deleted} companies`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const total = countData?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (!companies) return
    if (selectedIds.size === companies.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(companies.map((c) => c.id)))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Companies{" "}
          <span className="text-base font-normal text-muted-foreground">
            ({total})
          </span>
        </h1>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => {
              setConvertModalCompanies((companies ?? []).filter((c) => selectedIds.has(c.id)))
              setConvertModalOpen(true)
            }}>
              <FileDown className="mr-1.5 h-4 w-4" />
              Convert Documents
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete {selectedIds.size} selected
                </Button>
              }
              title="Delete selected companies?"
              description={`This will permanently delete ${selectedIds.size} companies and cannot be undone.`}
              confirmLabel="Delete"
              onConfirm={() => batchDeleteMutation.mutate([...selectedIds])}
            />
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by symbol or name..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearchParams((prev) => {
                prev.set("search", e.target.value)
                prev.set("page", "1")
                return prev
              })
            }}
          />
        </div>
        {search && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setSearchParams((prev) => {
                prev.delete("search")
                prev.set("page", "1")
                return prev
              })
            }
          >
            <X className="h-4 w-4" />
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
      ) : companies?.length === 0 ? (
        <EmptyState
          title="No companies"
          message={search ? "No companies match your search" : "Start by scraping some reports"}
          actionLabel={search ? undefined : "New Scrape Job"}
          actionTo={search ? undefined : "/scrape-jobs"}
        />
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="w-10 p-3">
                  <Checkbox
                    checked={
                      companies
                        ? selectedIds.size === companies.length && companies.length > 0
                        : false
                    }
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="p-3 font-medium">Symbol</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Exchange</th>
                <th className="p-3 text-center font-medium">Documents</th>
                <th className="w-10 p-3" />
              </tr>
            </thead>
            <tbody>
              {companies?.map((c) => (
                <tr key={c.id} className="border-b hover:bg-accent/50 transition-colors">
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="p-3">
                    <Link
                      to={`/companies/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.symbol}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{c.name}</td>
                  <td className="p-3">
                    <ExchangeBadge exchange={c.exchange} />
                  </td>
                  <td className="p-3 text-center">{c.document_count}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary">
                        <Link to={`/documents?ticker=${c.symbol}`}>
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        title={`Delete ${c.symbol}?`}
                        description="This company will be permanently deleted."
                        confirmLabel="Delete"
                        onConfirm={() => deleteMutation.mutate(c.id)}
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

      <ConvertDocumentsModal
        open={convertModalOpen}
        companies={convertModalCompanies}
        onClose={() => setConvertModalOpen(false)}
        onSuccess={() => {
          setConvertModalOpen(false)
          setSelectedIds(new Set())
          setConvertModalCompanies([])
        }}
      />
    </div>
  )
}
