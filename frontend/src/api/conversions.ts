import { apiFetch } from "./client"
import type { ConversionJob, MarkdownContent } from "@/types"

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
  return apiFetch<ConversionJob[]>(`/api/conversions?${q}`)
}

export async function createConversion(data: {
  document_id: string
  llm_config_id?: string | null
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
  return apiFetch<ConversionJob[]>("/api/conversions/batch", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function getConversion(id: string) {
  return apiFetch<ConversionJob>(`/api/conversions/${id}`)
}

export async function deleteConversion(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/conversions/${id}`, {
    method: "DELETE",
  })
}

export async function getDocumentMarkdown(docId: string) {
  return apiFetch<MarkdownContent>(`/api/documents/${docId}/markdown`)
}

export async function deleteDocumentMarkdown(docId: string) {
  return apiFetch<{ ok: boolean }>(`/api/documents/${docId}/markdown`, {
    method: "DELETE",
  })
}
