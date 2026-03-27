import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search,
  Brain,
  FileText,
  Database,
  Loader2,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MarkdownViewer } from "@/components/MarkdownViewer"
import { StatusBadge } from "@/components/StatusBadge"
import {
  searchKnowledge,
  askKnowledge,
  getKnowledgeStats,
  embedAll,
  listEmbedJobs,
  type KnowledgeSearchResult,
} from "@/api/knowledge"
import { formatDuration } from "@/lib/format"
import { toast } from "sonner"
import { useDocumentTitle } from "@/hooks/use-document-title"

type Mode = "search" | "ask"

export function KnowledgeBasePage() {
  useDocumentTitle("Knowledge Base")
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<Mode>("search")
  const [ticker, setTicker] = useState("")
  const [year, setYear] = useState("")
  const [reportType, setReportType] = useState("")
  const [jobsPanelOpen, setJobsPanelOpen] = useState(true)

  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [answerSources, setAnswerSources] = useState<KnowledgeSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const prevJobsRef = useRef<string>("")

  const { data: stats } = useQuery({
    queryKey: ["knowledge-stats"],
    queryFn: getKnowledgeStats,
  })

  const { data: embedJobs } = useQuery({
    queryKey: ["embed-jobs"],
    queryFn: () => listEmbedJobs({ page_size: 20 }),
    refetchInterval: (query) => {
      const data = query.state.data
      const hasActive = data?.some(
        (j) => j.status === "running" || j.status === "pending",
      )
      return hasActive ? 3000 : false
    },
  })

  // Toast notifications on job status changes + refresh stats
  useEffect(() => {
    if (!embedJobs) return
    const key = embedJobs.map((j) => `${j.id}:${j.status}`).join(",")
    if (prevJobsRef.current && prevJobsRef.current !== key) {
      let hasNewCompletion = false
      for (const job of embedJobs) {
        const prevStatus = prevJobsRef.current
          .split(",")
          .find((s) => s.startsWith(job.id))
          ?.split(":")[1]
        if (prevStatus && prevStatus !== job.status) {
          if (job.status === "completed") {
            const label = job.document_ticker || "Document"
            toast.success(`Embedding completed: ${label} (${job.total_chunks} chunks)`)
            hasNewCompletion = true
          } else if (job.status === "failed") {
            const label = job.document_ticker || "Document"
            toast.error(`Embedding failed: ${label}`)
          }
        }
      }
      if (hasNewCompletion) {
        queryClient.invalidateQueries({ queryKey: ["knowledge-stats"] })
      }
    }
    prevJobsRef.current = key
  }, [embedJobs, queryClient])

  const embedAllMutation = useMutation({
    mutationFn: () => embedAll(false),
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ["embed-jobs"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const reembedAllMutation = useMutation({
    mutationFn: () => embedAll(true),
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ["embed-jobs"] })
      queryClient.invalidateQueries({ queryKey: ["knowledge-stats"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const activeJobCount = embedJobs?.filter(
    (j) => j.status === "running" || j.status === "pending",
  ).length ?? 0

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setSearching(true)
    setAnswer(null)
    setAnswerSources([])
    setSearchResults([])

    try {
      const filters = {
        query: query.trim(),
        ticker: ticker || undefined,
        year: year ? parseInt(year) : undefined,
        report_type: reportType || undefined,
      }

      if (mode === "search") {
        const res = await searchKnowledge({ ...filters, limit: 20 })
        setSearchResults(res.results)
      } else {
        const res = await askKnowledge(filters)
        setAnswer(res.answer)
        setAnswerSources(res.sources)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed")
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            Search and query your financial document library
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
              <Database className="h-3 w-3" />
              {stats.embedded_documents}/{stats.total_documents} docs embedded
              ({stats.total_chunks} chunks)
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => reembedAllMutation.mutate()}
            disabled={reembedAllMutation.isPending || embedAllMutation.isPending}
          >
            {reembedAllMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Re-embed All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => embedAllMutation.mutate()}
            disabled={embedAllMutation.isPending || reembedAllMutation.isPending}
          >
            {embedAllMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Embed All
          </Button>
        </div>
      </div>

      {/* Embedding Jobs Panel */}
      {embedJobs && embedJobs.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none p-3"
            onClick={() => setJobsPanelOpen((v) => !v)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" />
                Embedding Jobs
                {activeJobCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {activeJobCount} active
                  </span>
                )}
              </CardTitle>
              {jobsPanelOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {jobsPanelOpen && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-b bg-muted/50 text-left">
                      <th className="p-2 pl-4 font-medium">Document</th>
                      <th className="p-2 font-medium">Status</th>
                      <th className="p-2 font-medium">Progress</th>
                      <th className="p-2 pr-4 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {embedJobs.map((job) => {
                      const pct = job.total_chunks > 0
                        ? Math.round((job.chunks_processed / job.total_chunks) * 100)
                        : 0
                      return (
                        <tr key={job.id} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors">
                          <td className="p-2 pl-4">
                            {job.document_id ? (
                              <Link
                                to={`/documents/${job.document_id}`}
                                className="hover:underline"
                              >
                                <span className="font-medium text-primary">
                                  {job.document_ticker || "—"}
                                </span>
                                {job.document_report_name && (
                                  <span className="ml-1.5 text-xs text-muted-foreground truncate max-w-[200px] inline-block align-bottom">
                                    {job.document_report_name}
                                  </span>
                                )}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2">
                            <StatusBadge status={job.status} />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    job.status === "failed"
                                      ? "bg-red-500"
                                      : job.status === "completed"
                                        ? "bg-green-500"
                                        : "bg-primary"
                                  }`}
                                  style={{ width: `${job.status === "completed" ? 100 : pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {job.chunks_processed}/{job.total_chunks}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDuration(job.started_at, job.completed_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Search form */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={
                    mode === "search"
                      ? "Search documents..."
                      : "Ask a question about your documents..."
                  }
                  className="pl-9 h-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={searching || !query.trim()}>
                {searching ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : mode === "search" ? (
                  <Search className="mr-1.5 h-4 w-4" />
                ) : (
                  <Brain className="mr-1.5 h-4 w-4" />
                )}
                {mode === "search" ? "Search" : "Ask AI"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Mode toggle */}
              <div className="flex gap-1 rounded-lg bg-muted p-0.5">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    mode === "search"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMode("search")}
                >
                  <Search className="mr-1 inline h-3 w-3" />
                  Search
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    mode === "ask"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMode("ask")}
                >
                  <Brain className="mr-1 inline h-3 w-3" />
                  Ask AI
                </button>
              </div>

              <Input
                placeholder="Ticker"
                className="h-8 w-24 text-xs"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
              />
              <Input
                placeholder="Year"
                className="h-8 w-20 text-xs"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
              <Select
                value={reportType}
                onValueChange={(v) => setReportType(v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="hop_nhat">Consolidated</SelectItem>
                  <SelectItem value="rieng">Individual</SelectItem>
                  <SelectItem value="me">Parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* AI Answer */}
      {answer && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Brain className="h-4 w-4 text-primary" />
              AI Answer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownViewer content={answer} />
            {answerSources.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                  Sources ({answerSources.length})
                </h4>
                <div className="space-y-1">
                  {answerSources.map((s, i) => (
                    <Link
                      key={i}
                      to={`/documents/${s.document_id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
                    >
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-primary">{s.ticker}</span>
                      <span className="truncate text-muted-foreground">
                        {s.report_name}
                      </span>
                      {s.year && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {s.year}
                        </span>
                      )}
                      {s.section_heading && (
                        <span className="text-muted-foreground">
                          &gt; {s.section_heading}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            {searchResults.length} results found
          </h3>
          {searchResults.map((result, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Link
                    to={`/documents/${result.document_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {result.ticker}
                  </Link>
                  {result.company_name && (
                    <span className="text-xs text-muted-foreground">
                      ({result.company_name})
                    </span>
                  )}
                  <span className="text-muted-foreground">-</span>
                  <Link
                    to={`/documents/${result.document_id}`}
                    className="truncate text-muted-foreground hover:text-foreground"
                  >
                    {result.report_name}
                  </Link>
                  {result.year && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {result.year}
                    </span>
                  )}
                  {result.report_type && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {result.report_type}
                    </span>
                  )}
                  {result.section_heading && (
                    <>
                      <span className="text-muted-foreground">&gt;</span>
                      <span className="text-xs text-muted-foreground">
                        {result.section_heading}
                      </span>
                    </>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {(result.score * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {result.chunk_text.length > 500
                    ? result.chunk_text.slice(0, 500) + "..."
                    : result.chunk_text}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!searching && !answer && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Search className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-sm text-muted-foreground">
            Search your financial documents or ask AI a question
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Make sure documents are converted to markdown and embedded first
          </p>
        </div>
      )}
    </div>
  )
}
