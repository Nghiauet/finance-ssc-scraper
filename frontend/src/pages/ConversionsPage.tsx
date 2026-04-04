import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JobsTab } from "@/components/conversions/JobsTab"
import { ConvertedDocumentsTab } from "@/components/conversions/ConvertedDocumentsTab"
import { StatisticsTab } from "@/components/conversions/StatisticsTab"
import { BatchResultDialog } from "@/components/conversions/BatchResultDialog"
import {
  getConversionStatusCounts,
  getStockGroups,
  createFilterBatchConversion,
} from "@/api/conversions"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { toast } from "sonner"
import type { BatchConversionError } from "@/types"

export function ConversionsPage() {
  useDocumentTitle("Conversions")
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState("jobs")
  const [batchResult, setBatchResult] = useState<{
    successCount: number
    errors: BatchConversionError[]
  } | null>(null)

  const { data: statusCounts } = useQuery({
    queryKey: ["conversion-status-counts"],
    queryFn: getConversionStatusCounts,
    refetchInterval: (query) => {
      const counts = query.state.data
      return counts && counts.active > 0 ? 3000 : false
    },
  })

  const { data: stockGroups } = useQuery({
    queryKey: ["stock-groups"],
    queryFn: getStockGroups,
  })

  const vn30Group = stockGroups?.groups.find((g) => g.key === "VN30")

  const convertVN30Mutation = useMutation({
    mutationFn: (tickers: string[]) =>
      createFilterBatchConversion({ tickers }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversions"] })
      queryClient.invalidateQueries({ queryKey: ["conversion-status-counts"] })
      queryClient.invalidateQueries({ queryKey: ["conversion-stats"] })
      if (data.jobs_created > 0 || data.errors.length > 0) {
        setBatchResult({
          successCount: data.jobs_created,
          errors: data.errors,
        })
      } else {
        toast.info("No unconverted VN30 documents found")
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversions</h1>
          <p className="text-sm text-muted-foreground">
            PDF to Markdown conversion management
          </p>
        </div>
        {vn30Group && (
          <Button
            onClick={() => convertVN30Mutation.mutate(vn30Group.tickers)}
            disabled={convertVN30Mutation.isPending}
          >
            <Play className="mr-1.5 h-4 w-4" />
            {convertVN30Mutation.isPending ? "Starting..." : "Convert VN30"}
          </Button>
        )}
      </div>

      <BatchResultDialog
        open={batchResult !== null}
        onClose={() => setBatchResult(null)}
        title="VN30 Batch Conversion"
        successCount={batchResult?.successCount ?? 0}
        errors={batchResult?.errors ?? []}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="jobs" className="gap-1.5">
            Jobs
            {statusCounts && statusCounts.active > 0 && (
              <Badge
                variant="secondary"
                className="min-w-[1.25rem] justify-center text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
              >
                {statusCounts.active}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="converted" className="gap-1.5">
            Converted Documents
            {statusCounts && statusCounts.completed > 0 && (
              <Badge variant="secondary" className="min-w-[1.25rem] justify-center text-[10px]">
                {statusCounts.completed}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-4">
          <JobsTab />
        </TabsContent>
        <TabsContent value="converted" className="mt-4">
          <ConvertedDocumentsTab />
        </TabsContent>
        <TabsContent value="statistics" className="mt-4">
          <StatisticsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
