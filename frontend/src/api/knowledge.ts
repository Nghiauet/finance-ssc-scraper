import { apiFetch } from "./client"

export interface KnowledgeSearchResult {
  chunk_text: string
  document_id: string
  ticker: string
  report_name: string
  section_heading: string | null
  score: number
}

export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResult[]
  total_results: number
}

export interface KnowledgeAskResponse {
  answer: string
  sources: KnowledgeSearchResult[]
}

export interface KnowledgeStats {
  total_documents: number
  embedded_documents: number
  total_chunks: number
  by_ticker: Record<string, number>
}

export async function searchKnowledge(params: {
  query: string
  ticker?: string
  year?: number
  report_type?: string
  report_period?: string
  limit?: number
}) {
  return apiFetch<KnowledgeSearchResponse>("/api/knowledge/search", {
    method: "POST",
    body: JSON.stringify(params),
  })
}

export async function askKnowledge(params: {
  query: string
  ticker?: string
  year?: number
  report_type?: string
  report_period?: string
  llm_config_id?: string
}) {
  return apiFetch<KnowledgeAskResponse>("/api/knowledge/ask", {
    method: "POST",
    body: JSON.stringify(params),
  })
}

export async function getKnowledgeStats() {
  return apiFetch<KnowledgeStats>("/api/knowledge/stats")
}

export async function embedDocuments(document_ids: string[]) {
  return apiFetch<unknown>("/api/knowledge/embed", {
    method: "POST",
    body: JSON.stringify({ document_ids }),
  })
}

export async function embedAll() {
  return apiFetch<{ message: string; started: number }>("/api/knowledge/embed-all", {
    method: "POST",
  })
}
