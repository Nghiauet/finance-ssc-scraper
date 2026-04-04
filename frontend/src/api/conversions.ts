import { apiFetch } from "./client"
import type {
  ConversionJob,
  ConversionJobListResponse,
  BatchConversionResponse,
  FilterBatchConversionResponse,
  ConversionStatusCounts,
  ConversionStatsResponse,
  ConvertedDocumentsResponse,
  MarkdownContent,
  StockGroupsResponse,
} from "@/types"

export async function listConversions(params: {
  status?: string
  document_id?: string
  page?: number
  page_size?: number
} = {}) {
  const q = new URLSearchParams()
  if (params.status) q.set("status", params.status)
  if (params.document_id) q.set("document_id", params.document_id)
  if (params.page) q.set("page", String(params.page))
  if (params.page_size) q.set("page_size", String(params.page_size))
  return apiFetch<ConversionJobListResponse>(`/api/conversions?${q}`)
}

export async function createConversion(data: {
  document_id: string
  llm_config_id?: string | null
  resume?: boolean
}) {
  return apiFetch<ConversionJob>("/api/conversions", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function createBatchConversion(data: {
  document_ids: string[]
  llm_config_id?: string | null
}) {
  return apiFetch<BatchConversionResponse>("/api/conversions/batch", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function createFilterBatchConversion(data: {
  ticker?: string
  tickers?: string[]
  exchange?: string
  report_type?: string
  report_period?: string
  year?: number
  year_from?: number
  year_to?: number
  quarter?: number
  llm_config_id?: string | null
}) {
  return apiFetch<FilterBatchConversionResponse>("/api/conversions/batch-by-filter", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function getConversionPreviewCount(params: {
  tickers?: string[]
  exchange?: string
  report_type?: string
  report_period?: string
  year_from?: number
  year_to?: number
}) {
  const q = new URLSearchParams()
  params.tickers?.forEach((t) => q.append("tickers", t))
  if (params.exchange) q.set("exchange", params.exchange)
  if (params.report_type) q.set("report_type", params.report_type)
  if (params.report_period) q.set("report_period", params.report_period)
  if (params.year_from) q.set("year_from", String(params.year_from))
  if (params.year_to) q.set("year_to", String(params.year_to))
  return apiFetch<{ unconverted: number; already_converted: number }>(
    `/api/conversions/preview-count?${q}`
  )
}

export async function getConversion(id: string) {
  return apiFetch<ConversionJob>(`/api/conversions/${id}`)
}

export async function deleteConversion(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/conversions/${id}`, {
    method: "DELETE",
  })
}

export async function retryConversion(jobId: string, resume = false) {
  const q = resume ? "?resume=true" : ""
  return apiFetch<ConversionJob>(`/api/conversions/${jobId}/retry${q}`, {
    method: "POST",
  })
}

export async function batchRetryConversions(jobIds?: string[], resume = false) {
  const q = resume ? "?resume=true" : ""
  return apiFetch<BatchConversionResponse>(`/api/conversions/batch-retry${q}`, {
    method: "POST",
    body: JSON.stringify({ job_ids: jobIds || null }),
  })
}

export async function clearFailedConversions() {
  return apiFetch<{ deleted: number }>("/api/conversions/failed", {
    method: "DELETE",
  })
}

export async function getConversionStatusCounts() {
  return apiFetch<ConversionStatusCounts>("/api/conversions/status-counts")
}

export async function getConversionStats() {
  return apiFetch<ConversionStatsResponse>("/api/conversions/stats")
}

export async function listConvertedDocuments(params: {
  ticker?: string
  report_type?: string
  year?: number
  page?: number
  page_size?: number
} = {}) {
  const q = new URLSearchParams()
  if (params.ticker) q.set("ticker", params.ticker)
  if (params.report_type) q.set("report_type", params.report_type)
  if (params.year) q.set("year", String(params.year))
  if (params.page) q.set("page", String(params.page))
  if (params.page_size) q.set("page_size", String(params.page_size))
  return apiFetch<ConvertedDocumentsResponse>(`/api/conversions/converted-documents?${q}`)
}

export async function getDocumentMarkdown(docId: string) {
  return apiFetch<MarkdownContent>(`/api/documents/${docId}/markdown`)
}

export async function deleteDocumentMarkdown(docId: string) {
  return apiFetch<{ ok: boolean }>(`/api/documents/${docId}/markdown`, {
    method: "DELETE",
  })
}

export async function getStockGroups() {
  return apiFetch<StockGroupsResponse>("/api/stock-groups")
}
