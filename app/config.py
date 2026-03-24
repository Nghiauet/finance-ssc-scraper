from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    # Database
    database_url: str = "postgresql+psycopg2://scrape_ssc:scrape_ssc_secret@localhost:5432/scrape_ssc"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "ssc-admin"
    minio_secret_key: str = "ssc-secret-key"
    minio_bucket: str = "ssc-reports"
    minio_secure: bool = False

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    root_path: str = ""

    # Basic auth
    basic_auth_username: str = ""
    basic_auth_password: str = ""
    basic_auth_realm: str = "SSC Finance"

    # JWT
    jwt_secret_key: str = ""
    jwt_expiry_hours: int = 24

    # Scraper
    max_concurrent_scrapes: int = 1
    scrape_headless: bool = True

    # LLM Conversions
    max_concurrent_conversions: int = 3

    # RAG / Embeddings
    embedding_dimension: int = 1536
    auto_embed_after_conversion: bool = True


settings = Settings()
