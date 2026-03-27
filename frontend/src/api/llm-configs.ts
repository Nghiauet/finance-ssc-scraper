import { apiFetch } from "./client"
import type { LLMConfig } from "@/types"

export interface LLMConfigCreateParams {
  name: string
  base_url: string
  model_name: string
  api_key: string
  max_tokens?: number
  is_default?: boolean
  config_type?: string
  embedding_dimension?: number | null
}

export interface LLMConfigUpdateParams {
  name?: string
  base_url?: string
  model_name?: string
  api_key?: string
  max_tokens?: number
  is_default?: boolean
  config_type?: string
  embedding_dimension?: number | null
}

export async function listLLMConfigs(config_type?: string) {
  const q = new URLSearchParams()
  if (config_type) q.set("config_type", config_type)
  return apiFetch<LLMConfig[]>(`/api/llm-configs?${q}`)
}

export async function createLLMConfig(data: LLMConfigCreateParams) {
  return apiFetch<LLMConfig>("/api/llm-configs", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function getLLMConfig(id: string) {
  return apiFetch<LLMConfig>(`/api/llm-configs/${id}`)
}

export async function updateLLMConfig(id: string, data: LLMConfigUpdateParams) {
  return apiFetch<LLMConfig>(`/api/llm-configs/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteLLMConfig(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/llm-configs/${id}`, {
    method: "DELETE",
  })
}

export async function testLLMConfig(id: string) {
  return apiFetch<{ ok: boolean; message: string }>(`/api/llm-configs/${id}/test`, {
    method: "POST",
  })
}

export interface LLMConfigTestEndpointParams {
  base_url: string
  model_name: string
  api_key: string
  config_type: string
}

export async function testLLMEndpoint(data: LLMConfigTestEndpointParams) {
  return apiFetch<{ ok: boolean; message: string }>("/api/llm-configs/test-endpoint", {
    method: "POST",
    body: JSON.stringify(data),
  })
}
