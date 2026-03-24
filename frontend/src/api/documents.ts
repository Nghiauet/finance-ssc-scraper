import { apiFetch, withBase } from "./client"
import type { Document, DocumentStats, DocumentNavigation } from "@/types"

export interface DocumentFilters {
  ticker?: string
  exchange?: string
  report_type?: string
  report_period?: string
  year?: number
  quarter?: number
  search?: string
  page?: number
  page_size?: number
}

export async function listDocuments(params: DocumentFilters = {}) {
  const q = new URLSearchParams()
  if (params.ticker) q.set("ticker", params.ticker)
  if (params.exchange) q.set("exchange", params.exchange)
  if (params.report_type) q.set("report_type", params.report_type)
  if (params.report_period) q.set("report_period", params.report_period)
  if (params.year) q.set("year", String(params.year))
  if (params.quarter) q.set("quarter", String(params.quarter))
  if (params.search) q.set("search", params.search)
  if (params.page) q.set("page", String(params.page))
  if (params.page_size) q.set("page_size", String(params.page_size))
  return apiFetch<Document[]>(`/api/documents?${q}`)
}

export async function countDocuments(ticker?: string) {
  const q = ticker ? `?ticker=${ticker}` : ""
  return apiFetch<{ count: number }>(`/api/documents/count${q}`)
}

export async function getDocumentStats() {
  return apiFetch<DocumentStats>("/api/documents/stats")
}

export async function getDocument(id: string) {
  return apiFetch<Document>(`/api/documents/${id}`)
}

export async function getDocumentNavigation(id: string) {
  return apiFetch<DocumentNavigation>(`/api/documents/${id}/navigation`)
}

export async function deleteDocument(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/documents/${id}`, { method: "DELETE" })
}

export async function batchDeleteDocuments(ids: string[]) {
  return apiFetch<{ deleted: number }>("/api/documents/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export async function deduplicateDocuments() {
  return apiFetch<Record<string, unknown>>("/api/documents/deduplicate", {
    method: "POST",
  })
}

export function getDocumentContentUrl(id: string, token?: string | null) {
  const base = withBase(`/api/documents/${id}/content`)
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function getDocumentDownloadUrl(id: string, token?: string | null) {
  const base = withBase(`/api/documents/${id}/download`)
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function getExportUrl(params: { ticker?: string; year?: number } = {}) {
  const q = new URLSearchParams()
  if (params.ticker) q.set("ticker", params.ticker)
  if (params.year) q.set("year", String(params.year))
  return withBase(`/api/documents/export?${q}`)
}
