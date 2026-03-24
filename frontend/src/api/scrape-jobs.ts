import { apiFetch } from "./client"
import type { ScrapeJob } from "@/types"

export interface ScrapeJobCreateParams {
  ticker?: string | null
  from_date?: string | null
  to_date?: string | null
  max_pages?: number | null
  download_files?: boolean
}

export async function listScrapeJobs(params: {
  status?: string
  page?: number
  page_size?: number
} = {}) {
  const q = new URLSearchParams()
  if (params.status) q.set("status", params.status)
  if (params.page) q.set("page", String(params.page))
  if (params.page_size) q.set("page_size", String(params.page_size))
  return apiFetch<ScrapeJob[]>(`/api/scrape-jobs?${q}`)
}

export async function countScrapeJobs() {
  return apiFetch<{ count: number }>("/api/scrape-jobs/count")
}

export async function createScrapeJob(data: ScrapeJobCreateParams) {
  return apiFetch<ScrapeJob>("/api/scrape-jobs", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function getScrapeJob(id: string) {
  return apiFetch<ScrapeJob>(`/api/scrape-jobs/${id}`)
}

export async function deleteScrapeJob(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/scrape-jobs/${id}`, {
    method: "DELETE",
  })
}
