import { Link, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Scan, FileText, Eye, Download, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ExchangeBadge,
  ReportTypeBadge,
  ReportPeriodBadge,
} from "@/components/StatusBadge"
import { EmptyState } from "@/components/EmptyState"
import { getCompany, listCompanyDocuments } from "@/api/companies"
import { getDocumentDownloadUrl } from "@/api/documents"
import { formatDate, formatDateTime } from "@/lib/format"
import { getToken } from "@/api/client"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { toast } from "sonner"
import { getInsight, generateInsight } from "@/api/insights"
import type { InsightSection } from "@/types"

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: company, isLoading } = useQuery({
    queryKey: ["company", id],
    queryFn: () => getCompany(id!),
    enabled: !!id,
  })

  useDocumentTitle(company ? `${company.symbol} — ${company.name}` : "Company")

  const { data: documents } = useQuery({
    queryKey: ["company-documents", id],
    queryFn: () => listCompanyDocuments(id!, { page_size: 100 }),
    enabled: !!id,
  })

  const queryClient = useQueryClient()

  const { data: insight } = useQuery({
    queryKey: ["insight", company?.symbol],
    queryFn: () => getInsight(company!.symbol),
    enabled: !!company,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" || status === "running" ? 3000 : false
    },
  })

  const generateMutation = useMutation({
    mutationFn: (force: boolean) => generateInsight(company!.symbol, { force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insight", company?.symbol] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const token = getToken()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!company) {
    return <EmptyState title="Company not found" message="This company does not exist." />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/companies" className="hover:text-foreground">
          <ArrowLeft className="inline h-4 w-4" /> Companies
        </Link>
        <span>/</span>
        <span>{company.symbol}</span>
      </div>

      <Card>
        <CardContent className="flex items-start justify-between p-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{company.symbol}</h1>
              <ExchangeBadge exchange={company.exchange} />
            </div>
            <p className="mt-1 text-muted-foreground">{company.name}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Added {formatDateTime(company.created_at)}
            </p>
          </div>
          <Button asChild>
            <Link to={`/scrape-jobs?ticker=${company.symbol}`}>
              <Scan className="mr-1.5 h-4 w-4" />
              Scrape {company.symbol}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Phân tích AI
          </CardTitle>
          {insight?.status === "completed" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => generateMutation.mutate(true)}
              disabled={generateMutation.isPending}
              title="Làm mới phân tích"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {(!insight || insight.status === "none") && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Chưa có phân tích AI</p>
              <Button
                size="sm"
                onClick={() => generateMutation.mutate(false)}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Đang tạo...</>
                ) : (
                  "Tạo phân tích"
                )}
              </Button>
            </div>
          )}

          {(insight?.status === "pending" || insight?.status === "running") && (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Đang phân tích...</span>
            </div>
          )}

          {insight?.status === "failed" && (
            <div className="space-y-3 py-4">
              <p className="text-sm text-destructive">{insight.error_message ?? "Phân tích thất bại"}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateMutation.mutate(true)}
                disabled={generateMutation.isPending}
              >
                Thử lại
              </Button>
            </div>
          )}

          {insight?.status === "completed" && (
            insight.content ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {insight.content.sections.map((section: InsightSection, i: number) => (
                  <div key={i} className="rounded-md border p-3">
                    <p className="text-sm font-semibold mb-1">{section.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Không có nội dung phân tích.</p>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Documents ({documents?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!documents || documents.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No documents"
                message={`No reports found for ${company.symbol}. Start scraping to collect them.`}
                actionLabel="Scrape Now"
                actionTo={`/scrape-jobs?ticker=${company.symbol}`}
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-3 font-medium">Report</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Period</th>
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b hover:bg-accent/50 transition-colors">
                    <td className="p-3">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {doc.report_name}
                      </Link>
                    </td>
                    <td className="p-3">
                      <ReportTypeBadge type={doc.report_type} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <ReportPeriodBadge period={doc.report_period} />
                        {doc.year && (
                          <span className="text-muted-foreground">
                            {doc.year}
                            {doc.quarter ? ` Q${doc.quarter}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(doc.submission_date)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        {doc.file_id && (
                          <>
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                              <Link to={`/documents/${doc.id}`}>
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                fetch(getDocumentDownloadUrl(doc.id), {
                                  headers: { Authorization: `Bearer ${token}` },
                                })
                                  .then((r) => r.blob())
                                  .then((blob) => {
                                    const a = document.createElement("a")
                                    a.href = URL.createObjectURL(blob)
                                    a.download = doc.report_name
                                    a.click()
                                    URL.revokeObjectURL(a.href)
                                  })
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {!doc.file_id && (
                          <span className="text-xs text-muted-foreground">
                            <FileText className="inline h-3.5 w-3.5" /> Metadata only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
