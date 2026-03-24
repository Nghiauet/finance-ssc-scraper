import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Sparkles,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ExchangeBadge,
  ReportTypeBadge,
  ReportPeriodBadge,
} from "@/components/StatusBadge"
import { EmptyState } from "@/components/EmptyState"
import { MarkdownViewer } from "@/components/MarkdownViewer"
import {
  getDocument,
  getDocumentNavigation,
  getDocumentContentUrl,
  getDocumentDownloadUrl,
  listDocuments,
} from "@/api/documents"
import { getDocumentMarkdown, createConversion, listConversions } from "@/api/conversions"
import { formatDate } from "@/lib/format"
import { getToken } from "@/api/client"
import { toast } from "sonner"

type ViewTab = "pdf" | "markdown"

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const token = getToken()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<ViewTab>("pdf")
  const [converting, setConverting] = useState(false)

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
  })

  const { data: nav } = useQuery({
    queryKey: ["document-nav", id],
    queryFn: () => getDocumentNavigation(id!),
    enabled: !!id,
  })

  const { data: related } = useQuery({
    queryKey: ["related-docs", doc?.ticker],
    queryFn: () => listDocuments({ ticker: doc!.ticker, page_size: 50 }),
    enabled: !!doc?.ticker,
  })

  const { data: markdown } = useQuery({
    queryKey: ["document-markdown", id],
    queryFn: () => getDocumentMarkdown(id!),
    enabled: !!id,
    retry: false,
  })

  // Poll for active conversion jobs for this document
  const { data: conversions } = useQuery({
    queryKey: ["conversions", { document_id: id }],
    queryFn: () => listConversions({ document_id: id!, page_size: 5 }),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data
      const hasActive = data?.some(
        (j) => j.status === "running" || j.status === "pending",
      )
      return hasActive ? 2000 : false
    },
  })

  const activeConversion = conversions?.find(
    (j) => j.status === "running" || j.status === "pending",
  )

  const handleConvert = async () => {
    if (!id) return
    setConverting(true)
    try {
      await createConversion({ document_id: id })
      toast.success("Conversion started")
      queryClient.invalidateQueries({ queryKey: ["conversions"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start conversion")
    } finally {
      setConverting(false)
    }
  }

  // When conversion completes, refetch markdown
  const latestCompleted = conversions?.find((j) => j.status === "completed")
  const markdownStale = latestCompleted && !markdown
  if (markdownStale) {
    queryClient.invalidateQueries({ queryKey: ["document-markdown", id] })
  }

  const handleDownload = () => {
    if (!doc) return
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
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60 w-full" />
      </div>
    )
  }

  if (!doc) {
    return <EmptyState title="Document not found" message="This document does not exist." />
  }

  const contentUrl = doc.file_id ? getDocumentContentUrl(doc.id, token) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/documents" className="hover:text-foreground">
          <ArrowLeft className="inline h-4 w-4" /> Documents
        </Link>
        <span>/</span>
        <span className="truncate">{doc.report_name}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main content */}
        <div className="space-y-4">
          {/* Info card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Link
                  to={`/companies/${doc.company_id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {doc.ticker}
                </Link>
                <ExchangeBadge exchange={doc.exchange} />
              </div>
              <h1 className="mt-2 text-lg font-bold">{doc.report_name}</h1>
              {doc.company_name && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {doc.company_name}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {doc.submission_date && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {formatDate(doc.submission_date)}
                  </span>
                )}
                <ReportTypeBadge type={doc.report_type} />
                <ReportPeriodBadge period={doc.report_period} />
                {doc.year && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {doc.year}
                    {doc.quarter ? ` Q${doc.quarter}` : ""}
                  </span>
                )}
              </div>

              {doc.summary && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {doc.summary}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {doc.file_id && (
                  <>
                    <Button size="sm" onClick={handleDownload}>
                      <Download className="mr-1.5 h-4 w-4" /> Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (contentUrl) window.open(contentUrl, "_blank")
                      }}
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" /> Open raw
                    </Button>
                  </>
                )}
                {doc.file_id && !activeConversion && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConvert}
                    disabled={converting}
                  >
                    {converting ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    {markdown ? "Re-convert to Markdown" : "Convert to Markdown"}
                  </Button>
                )}
                {activeConversion && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Converting... {activeConversion.pages_processed}/{activeConversion.total_pages} pages
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tab bar */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "pdf"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("pdf")}
            >
              PDF Viewer
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "markdown"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("markdown")}
            >
              Markdown
              {markdown && (
                <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-green-500" />
              )}
            </button>
          </div>

          {/* Viewer */}
          <Card>
            <CardContent className="p-4">
              {activeTab === "pdf" ? (
                contentUrl ? (
                  <iframe
                    src={contentUrl}
                    className="h-[75vh] w-full rounded-md border bg-muted"
                    title="Document viewer"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-md border bg-muted">
                    <div className="text-center text-muted-foreground">
                      <FileText className="mx-auto h-8 w-8" />
                      <p className="mt-2 text-sm">
                        {doc.file_id
                          ? "Preview not available"
                          : "Metadata only - no file attached"}
                      </p>
                    </div>
                  </div>
                )
              ) : markdown ? (
                <MarkdownViewer
                  content={markdown.content}
                  fileName={`${doc.ticker}_${doc.report_name}.md`}
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border bg-muted">
                  <div className="text-center text-muted-foreground">
                    <Sparkles className="mx-auto h-8 w-8" />
                    <p className="mt-2 text-sm">
                      No markdown content yet. Click "Convert to Markdown" to generate.
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="mt-4 flex justify-between">
                {nav?.newer_id ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/documents/${nav.newer_id}`}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Newer
                    </Link>
                  </Button>
                ) : (
                  <div />
                )}
                {nav?.older_id ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/documents/${nav.older_id}`}>
                      Older <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <div />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                More from {doc.ticker}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto p-0">
              {related?.map((r) => (
                <Link
                  key={r.id}
                  to={`/documents/${r.id}`}
                  className={`block border-b px-4 py-2 text-sm transition-colors hover:bg-accent/50 ${
                    r.id === doc.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <p className="truncate font-medium">{r.report_name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(r.submission_date)}</span>
                    {r.file_id && (
                      <span className="rounded bg-muted px-1 text-[10px]">
                        File
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
