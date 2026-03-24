import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

const statusConfig: Record<string, { className: string; label: string }> = {
  completed: {
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    label: "Completed",
  },
  running: {
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    label: "Running",
  },
  pending: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    label: "Pending",
  },
  failed: {
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    label: "Failed",
  },
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.pending
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        config.className,
      )}
    >
      {status === "running" && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {config.label}
    </span>
  )
}

const exchangeColors: Record<string, string> = {
  HOSE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  HNX: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  UPCOM: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
}

export function ExchangeBadge({ exchange }: { exchange: string | null }) {
  if (!exchange) return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        exchangeColors[exchange] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      )}
    >
      {exchange}
    </span>
  )
}

const reportTypeLabels: Record<string, string> = {
  hop_nhat: "Consolidated",
  rieng: "Individual",
  me: "Parent",
  tong_hop: "Summary",
}

const reportTypeColors: Record<string, string> = {
  hop_nhat: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  rieng: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  me: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  tong_hop: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
}

export function ReportTypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        reportTypeColors[type] || "bg-gray-100 text-gray-800",
      )}
    >
      {reportTypeLabels[type] || type}
    </span>
  )
}

const reportPeriodLabels: Record<string, string> = {
  nam: "Annual",
  ban_nien: "Semi-annual",
  quy: "Quarterly",
}

export function ReportPeriodBadge({ period }: { period: string | null }) {
  if (!period) return null
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
      {reportPeriodLabels[period] || period}
    </span>
  )
}
