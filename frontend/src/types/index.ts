export interface Company {
  id: string
  symbol: string
  name: string
  exchange: string | null
  metadata_: Record<string, unknown> | null
  created_at: string
  updated_at: string | null
  document_count: number
}

export interface Document {
  id: string
  ticker: string
  exchange: string | null
  report_name: string
  company_name: string | null
  summary: string | null
  submission_date: string | null
  report_type: string | null
  report_period: string | null
  year: number | null
  quarter: number | null
  company_id: string | null
  file_id: string | null
  scrape_job_id: string | null
  created_at: string
}

export interface ScrapeJob {
  id: string
  status: "pending" | "running" | "completed" | "failed"
  ticker: string | null
  from_date: string | null
  to_date: string | null
  max_pages: number | null
  download_files: boolean
  total_reports_found: number
  total_files_downloaded: number
  total_pages_scraped: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface FileRecord {
  id: string
  name: string
  path: string
  bucket: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
}

export interface DashboardStats {
  total_companies: number
  total_documents: number
  total_files: number
  active_jobs: number
}

export interface DocumentStats {
  total_documents: number
  total_companies: number
  by_exchange: Record<string, number>
  by_report_type: Record<string, number>
  by_year: Record<string, number>
}

export interface DocumentNavigation {
  newer_id: string | null
  older_id: string | null
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface PaginatedParams {
  page?: number
  page_size?: number
}

export interface LLMConfig {
  id: string
  name: string
  base_url: string
  model_name: string
  max_tokens: number
  is_default: boolean
  config_type: "vision" | "embedding"
  embedding_dimension: number | null
  created_at: string
}

export interface ConversionJob {
  id: string
  document_id: string
  llm_config_id: string | null
  status: "pending" | "running" | "completed" | "failed"
  total_pages: number
  pages_processed: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  document_ticker: string | null
  document_report_name: string | null
  document_exchange: string | null
  document_report_type: string | null
  document_report_period: string | null
  document_year: number | null
  document_quarter: number | null
  document_company_name: string | null
}

export interface EmbeddingJob {
  id: string
  document_id: string | null
  llm_config_id: string | null
  status: "pending" | "running" | "completed" | "failed"
  total_chunks: number
  chunks_processed: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  document_ticker: string | null
  document_report_name: string | null
}

export interface ConversionPreviewCount {
  unconverted: number
  already_converted: number
}

export interface BatchConversionError {
  document_id: string
  ticker: string | null
  report_name: string | null
  error: string
}

export interface ConversionJobListResponse {
  jobs: ConversionJob[]
  total: number
}

export interface BatchConversionResponse {
  jobs: ConversionJob[]
  errors: BatchConversionError[]
}

export interface FilterBatchConversionResponse {
  jobs_created: number
  total_matching: number
  jobs: ConversionJob[]
  errors: BatchConversionError[]
}

export interface ConversionStatusCounts {
  all: number
  pending: number
  running: number
  completed: number
  failed: number
  active: number
}

export interface ConversionTickerStats {
  ticker: string
  company_name: string | null
  total_documents: number
  converted: number
  unconverted: number
}

export interface ConversionStatsResponse {
  total_documents: number
  converted_documents: number
  unconverted_documents: number
  active_jobs: number
  completed_jobs: number
  failed_jobs: number
  by_ticker: ConversionTickerStats[]
}

export interface ConvertedDocument {
  document_id: string
  ticker: string
  exchange: string | null
  report_name: string
  report_type: string | null
  report_period: string | null
  year: number | null
  quarter: number | null
  company_name: string | null
  page_count: number
  model_name: string | null
  converted_at: string | null
  markdown_id: string
}

export interface ConvertedDocumentsResponse {
  documents: ConvertedDocument[]
  total: number
}

export interface MarkdownContent {
  id: string
  document_id: string
  content: string
  page_count: number
  model_name: string | null
  created_at: string
}

export interface InsightSection {
  title: string
  content: string
}

export interface InsightContent {
  sections: InsightSection[]
}

export interface CompanyInsight {
  id: string | null
  ticker: string
  company_id: string | null
  llm_config_id: string | null
  status: 'none' | 'pending' | 'running' | 'completed' | 'failed'
  content: InsightContent | null
  error_message: string | null
  generated_at: string | null
  created_at: string
}
