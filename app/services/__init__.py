def build_openai_url(base_url: str, endpoint: str) -> str:
    """Build OpenAI-compatible API URL, appending endpoint if not already present."""
    base = base_url.rstrip("/")
    return base if base.endswith(endpoint) else f"{base}{endpoint}"
