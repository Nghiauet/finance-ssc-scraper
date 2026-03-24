import { apiFetch } from "./client"
import type { Company, Document } from "@/types"

export async function listCompanies(params: {
  search?: string
  page?: number
  page_size?: number
}) {
  const q = new URLSearchParams()
  if (params.search) q.set("search", params.search)
  if (params.page) q.set("page", String(params.page))
  if (params.page_size) q.set("page_size", String(params.page_size))
  return apiFetch<Company[]>(`/api/companies?${q}`)
}

export async function countCompanies() {
  return apiFetch<{ count: number }>("/api/companies/count")
}

export async function getCompany(id: string) {
  return apiFetch<Company>(`/api/companies/${id}`)
}

export async function deleteCompany(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/companies/${id}`, { method: "DELETE" })
}

export async function batchDeleteCompanies(ids: string[]) {
  return apiFetch<{ deleted: number }>("/api/companies/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })
}

export async function listCompanyDocuments(
  companyId: string,
  params: { page?: number; page_size?: number } = {},
) {
  const q = new URLSearchParams()
  if (params.page) q.set("page", String(params.page))
  if (params.page_size) q.set("page_size", String(params.page_size))
  return apiFetch<Document[]>(`/api/companies/${companyId}/documents?${q}`)
}
