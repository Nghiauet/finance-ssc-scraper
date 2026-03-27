import { apiFetch, setToken, clearToken, withBase } from "./client"
import type { LoginResponse } from "@/types"

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
  setToken(data.access_token)
  return data
}

export function logout(): void {
  clearToken()
  window.location.href = withBase("/login")
}

export async function getMe(): Promise<{ username: string }> {
  return apiFetch("/api/auth/me")
}
