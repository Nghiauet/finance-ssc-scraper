import { apiFetch } from "./client"
import type { CompanyInsight } from "@/types"

export async function getInsight(ticker: string): Promise<CompanyInsight> {
  return apiFetch<CompanyInsight>(`/api/insights/${ticker}`)
}

export async function generateInsight(
  ticker: string,
  options: { force?: boolean; llm_config_id?: string } = {}
): Promise<CompanyInsight> {
  return apiFetch<CompanyInsight>(`/api/insights/${ticker}`, {
    method: "POST",
    body: JSON.stringify(options),
  })
}
