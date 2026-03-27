import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  Building2,
  FileText,
  HardDrive,
  Activity,
  Plus,
  Download,
} from "lucide-react"
import type { PieLabelRenderProps } from "recharts"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge, ExchangeBadge } from "@/components/StatusBadge"
import { getDashboardStats } from "@/api/dashboard"
import { getDocumentStats, getExportUrl } from "@/api/documents"
import { listScrapeJobs } from "@/api/scrape-jobs"
import { listDocuments } from "@/api/documents"
import { formatDate, formatRelative } from "@/lib/format"
import { getToken } from "@/api/client"
import { useDocumentTitle } from "@/hooks/use-document-title"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function DashboardPage() {
  useDocumentTitle("Dashboard")
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
  })

  const { data: docStats } = useQuery({
    queryKey: ["document-stats"],
    queryFn: getDocumentStats,
  })

  const { data: recentJobs } = useQuery({
    queryKey: ["recent-jobs"],
    queryFn: () => listScrapeJobs({ page_size: 5 }),
  })

  const { data: recentDocs } = useQuery({
    queryKey: ["recent-docs"],
    queryFn: () => listDocuments({ page_size: 10 }),
  })

  const yearData = docStats
    ? Object.entries(docStats.by_year)
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year.localeCompare(b.year))
    : []

  const exchangeData = docStats
    ? Object.entries(docStats.by_exchange)
        .filter(([k]) => k !== "null" && k)
        .map(([name, value]) => ({ name, value }))
    : []

  const typeData = docStats
    ? Object.entries(docStats.by_report_type).map(([name, value]) => ({
        name: name === "hop_nhat" ? "Consolidated" : name === "rieng" ? "Individual" : name === "me" ? "Parent" : name,
        value,
      }))
    : []

  const handleExport = () => {
    const url = getExportUrl()
    const token = getToken()
    // Use fetch to download with auth
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = "documents_export.csv"
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  const statCards = [
    { label: "Companies", value: stats?.total_companies, icon: Building2, color: "text-blue-600" },
    { label: "Documents", value: stats?.total_documents, icon: FileText, color: "text-indigo-600" },
    { label: "Files Stored", value: stats?.total_files, icon: HardDrive, color: "text-green-600" },
    { label: "Active Jobs", value: stats?.active_jobs, icon: Activity, color: "text-yellow-600" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Vietnamese financial reports dataset manager
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/scrape-jobs">
              <Plus className="mr-1.5 h-4 w-4" /> New Scrape
            </Link>
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`rounded-lg bg-muted p-2.5 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{s.value ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {docStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Documents by Year</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yearData}>
                  <XAxis dataKey="year" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">By Exchange</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={exchangeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    label={(props: PieLabelRenderProps) =>
                      `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {exchangeData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">By Report Type</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    label={(props: PieLabelRenderProps) =>
                      `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {typeData.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recent Scrape Jobs</CardTitle>
            <Link
              to="/scrape-jobs"
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentJobs?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scrape jobs yet</p>
            ) : (
              <div className="space-y-3">
                {recentJobs?.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        {job.ticker || "All tickers"}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {formatRelative(job.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {job.total_reports_found} reports
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recent Documents</CardTitle>
            <Link
              to="/documents"
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentDocs?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet</p>
            ) : (
              <div className="space-y-3">
                {recentDocs?.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="flex items-start justify-between text-sm hover:bg-accent rounded-md px-2 py-1 -mx-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ExchangeBadge exchange={doc.exchange} />
                        <span className="font-medium text-primary">
                          {doc.ticker}
                        </span>
                      </div>
                      <p className="truncate text-muted-foreground">
                        {doc.report_name}
                      </p>
                    </div>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {formatDate(doc.submission_date)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
