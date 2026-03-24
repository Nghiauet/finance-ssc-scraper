const TOKEN_KEY = "ssc_token"

// Deployment base path (e.g. "/ssc-portal" or "").
// Set via VITE_BASE_PATH build arg in Docker.
const BASE_PATH = (import.meta.env.VITE_BASE_PATH || "").replace(/\/$/, "")

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** Prefix a path with the deployment base path. */
export function withBase(path: string): string {
  return `${BASE_PATH}${path}`
}

/** Get the React Router basename. */
export function getBasename(): string {
  return BASE_PATH || "/"
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json"
  }

  const res = await fetch(withBase(path), { ...options, headers })

  if (res.status === 401) {
    clearToken()
    window.location.href = withBase("/login")
    throw new Error("Unauthorized")
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }

  // Handle no-content responses
  if (res.status === 204) return undefined as T

  return res.json()
}
