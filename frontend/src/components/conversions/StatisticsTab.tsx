import { useQuery } from "@tanstack/react-query"
import { FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getConversionStats } from "@/api/conversions"

export function StatisticsTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["conversion-stats"],
    queryFn: getConversionStats,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!stats) return null

  const statCards = [
    {
      title: "Total Documents",
      value: stats.total_documents,
      icon: FileText,
      className: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Converted",
      value: stats.converted_documents,
      icon: CheckCircle2,
      className: "text-green-600 dark:text-green-400",
    },
    {
      title: "Unconverted",
      value: stats.unconverted_documents,
      icon: XCircle,
      className: "text-orange-600 dark:text-orange-400",
    },
    {
      title: "Active Jobs",
      value: stats.active_jobs,
      icon: Loader2,
      className: "text-yellow-600 dark:text-yellow-400",
    },
  ]

  const coveragePct =
    stats.total_documents > 0
      ? Math.round((stats.converted_documents / stats.total_documents) * 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`h-4 w-4 ${card.className}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overall coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-3 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-medium w-12 text-right">{coveragePct}%</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.converted_documents} of {stats.total_documents} documents converted
            {stats.failed_jobs > 0 && ` | ${stats.failed_jobs} failed jobs`}
          </p>
        </CardContent>
      </Card>

      {/* Per-company table */}
      {stats.by_ticker.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coverage by Company</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-3 font-medium">Ticker</th>
                    <th className="p-3 font-medium">Company</th>
                    <th className="p-3 font-medium text-right">Total</th>
                    <th className="p-3 font-medium text-right">Converted</th>
                    <th className="p-3 font-medium text-right">Unconverted</th>
                    <th className="p-3 font-medium w-40">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_ticker.map((row) => {
                    const pct =
                      row.total_documents > 0
                        ? Math.round((row.converted / row.total_documents) * 100)
                        : 0
                    return (
                      <tr
                        key={row.ticker}
                        className="border-b hover:bg-accent/50 transition-colors"
                      >
                        <td className="p-3 font-medium">{row.ticker}</td>
                        <td className="p-3 text-xs text-muted-foreground truncate max-w-[200px]">
                          {row.company_name ?? "-"}
                        </td>
                        <td className="p-3 text-right">{row.total_documents}</td>
                        <td className="p-3 text-right text-green-600 dark:text-green-400">
                          {row.converted}
                        </td>
                        <td className="p-3 text-right text-orange-600 dark:text-orange-400">
                          {row.unconverted}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-green-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
