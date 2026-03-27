import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JobsTab } from "@/components/conversions/JobsTab"
import { ConvertedDocumentsTab } from "@/components/conversions/ConvertedDocumentsTab"
import { StatisticsTab } from "@/components/conversions/StatisticsTab"
import { getConversionStatusCounts } from "@/api/conversions"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function ConversionsPage() {
  useDocumentTitle("Conversions")
  const [activeTab, setActiveTab] = useState("jobs")

  const { data: statusCounts } = useQuery({
    queryKey: ["conversion-status-counts"],
    queryFn: getConversionStatusCounts,
    refetchInterval: (query) => {
      const counts = query.state.data
      return counts && counts.active > 0 ? 3000 : false
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conversions</h1>
        <p className="text-sm text-muted-foreground">
          PDF to Markdown conversion management
        </p>
      </div>

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
