import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useMutation } from "@tanstack/react-query"
import {
  Search,
  Brain,
  FileText,
  Database,
  Loader2,
  Sparkles,
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
import {
  searchKnowledge,
  askKnowledge,
  getKnowledgeStats,
  embedAll,
  type KnowledgeSearchResult,
} from "@/api/knowledge"
import { toast } from "sonner"

type Mode = "search" | "ask"

export function KnowledgeBasePage() {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<Mode>("search")
  const [ticker, setTicker] = useState("")
  const [year, setYear] = useState("")
  const [reportType, setReportType] = useState("")

  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [answerSources, setAnswerSources] = useState<KnowledgeSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const { data: stats } = useQuery({
    queryKey: ["knowledge-stats"],
    queryFn: getKnowledgeStats,
  })

  const embedAllMutation = useMutation({
    mutationFn: embedAll,
    onSuccess: (data) => toast.success(data.message),
    onError: (err: Error) => toast.error(err.message),
  })

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
            onClick={() => embedAllMutation.mutate()}
            disabled={embedAllMutation.isPending}
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
                  <span className="text-muted-foreground">-</span>
                  <Link
                    to={`/documents/${result.document_id}`}
                    className="truncate text-muted-foreground hover:text-foreground"
                  >
                    {result.report_name}
                  </Link>
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
