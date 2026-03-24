import { apiFetch } from "./client"
import type { DashboardStats } from "@/types"

export async function getDashboardStats() {
  return apiFetch<DashboardStats>("/api/dashboard/stats")
}
