from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LLMConfig
from app.schemas.llm_config import LLMConfigCreate, LLMConfigUpdate, LLMConfigResponse, LLMConfigTestEndpoint
from app.services.crypto_service import encrypt_api_key, decrypt_api_key

router = APIRouter(prefix="/llm-configs", tags=["llm-configs"])


def _parse_embedding_response(data: dict) -> list[float]:
    """Extract embedding from OpenAI or Ollama native response format."""
    # OpenAI format: {"data": [{"embedding": [...], "index": 0}]}
    if "data" in data and isinstance(data["data"], list):
        return data["data"][0]["embedding"]
    # Ollama native format (batch): {"embeddings": [[...], [...]]}
    if "embeddings" in data and isinstance(data["embeddings"], list):
        return data["embeddings"][0]
    # Ollama native format (single): {"embedding": [...]}
    if "embedding" in data and isinstance(data["embedding"], list):
        return data["embedding"]
    raise KeyError("No embedding found in response. Expected OpenAI or Ollama format.")


@router.get("", response_model=list[LLMConfigResponse])
def list_configs(
    config_type: str = Query(""),
    db: Session = Depends(get_db),
):
    q = db.query(LLMConfig)
    if config_type:
        q = q.filter(LLMConfig.config_type == config_type)
    return [LLMConfigResponse.model_validate(c) for c in q.order_by(LLMConfig.created_at.desc()).all()]


@router.post("", response_model=LLMConfigResponse, status_code=201)
def create_config(data: LLMConfigCreate, db: Session = Depends(get_db)):
    # Auto-set as default if this is the first config of this type
    existing_count = db.query(LLMConfig).filter(LLMConfig.config_type == data.config_type).count()
    is_default = data.is_default or existing_count == 0

    # If setting as default, unset other defaults of the same type
    if is_default:
        db.query(LLMConfig).filter(
            LLMConfig.config_type == data.config_type,
            LLMConfig.is_default == True,
        ).update({"is_default": False})

    config = LLMConfig(
        name=data.name,
        base_url=data.base_url,
        model_name=data.model_name,
        api_key_encrypted=encrypt_api_key(data.api_key),
        max_tokens=data.max_tokens,
        is_default=is_default,
        config_type=data.config_type,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return LLMConfigResponse.model_validate(config)


@router.post("/test-endpoint")
async def test_endpoint(data: LLMConfigTestEndpoint):
    """Test a model endpoint with raw values (no saved config needed)."""
    import httpx
    from app.services import build_openai_url

    headers = {
        "Authorization": f"Bearer {data.api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            if data.config_type == "embedding":
                url = build_openai_url(data.base_url, "/embeddings")
                payload = {
                    "model": data.model_name,
                    "input": ["Hello world"],
                    "prompt": "Hello world",
                }
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                result = resp.json()
                embedding = _parse_embedding_response(result)
                dim = len(embedding)
                return {
                    "ok": True,
                    "message": f"Embedding model works! Dimension: {dim}",
                }
            else:
                url = build_openai_url(data.base_url, "/chat/completions")
                payload = {
                    "model": data.model_name,
                    "max_tokens": 20,
                    "stream": False,
                    "messages": [
                        {"role": "user", "content": "Say 'ok' if you can read this."}
                    ],
                }
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                result = resp.json()
                msg = result["choices"][0]["message"]
                reply = (msg.get("content") or msg.get("reasoning_content") or "")[:100]
                return {
                    "ok": True,
                    "message": f"Model works! Reply: {reply}",
                }
    except httpx.HTTPStatusError as e:
        return {"ok": False, "message": f"HTTP {e.response.status_code}: {e.response.text[:300]}"}
    except KeyError as e:
        return {"ok": False, "message": f"Unexpected response format (missing key: {e}). Ensure the API is OpenAI-compatible."}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.get("/{config_id}", response_model=LLMConfigResponse)
def get_config(config_id: str, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).get(config_id)
    if not config:
        raise HTTPException(404, "LLM config not found")
    return LLMConfigResponse.model_validate(config)


@router.put("/{config_id}", response_model=LLMConfigResponse)
def update_config(config_id: str, data: LLMConfigUpdate, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).get(config_id)
    if not config:
        raise HTTPException(404, "LLM config not found")

    updates = data.model_dump(exclude_unset=True)

    # Handle api_key separately (encrypt)
    if "api_key" in updates:
        api_key = updates.pop("api_key")
        if api_key:
            config.api_key_encrypted = encrypt_api_key(api_key)

    # If setting as default, unset other defaults of the same type
    if updates.get("is_default"):
        cfg_type = updates.get("config_type", config.config_type)
        db.query(LLMConfig).filter(
            LLMConfig.id != config_id,
            LLMConfig.config_type == cfg_type,
            LLMConfig.is_default == True,
        ).update({"is_default": False})

    for field, value in updates.items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)
    return LLMConfigResponse.model_validate(config)


@router.delete("/{config_id}")
def delete_config(config_id: str, db: Session = Depends(get_db)):
    config = db.query(LLMConfig).get(config_id)
    if not config:
        raise HTTPException(404, "LLM config not found")
    db.delete(config)
    db.commit()
    return {"ok": True}


@router.post("/{config_id}/test")
async def test_config(config_id: str, db: Session = Depends(get_db)):
    """Test an LLM config by sending a real request to the model."""
    import httpx
    from app.services import build_openai_url

    config = db.query(LLMConfig).get(config_id)
    if not config:
        raise HTTPException(404, "LLM config not found")

    api_key = decrypt_api_key(config.api_key_encrypted)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            if config.config_type == "embedding":
                url = build_openai_url(config.base_url, "/embeddings")
                payload = {
                    "model": config.model_name,
                    "input": ["Hello world"],
                    "prompt": "Hello world",
                }
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                embedding = _parse_embedding_response(data)
                dim = len(embedding)
                return {
                    "ok": True,
                    "message": f"Embedding model works! Dimension: {dim}",
                }
            else:
                url = build_openai_url(config.base_url, "/chat/completions")
                payload = {
                    "model": config.model_name,
                    "max_tokens": 20,
                    "stream": False,
                    "messages": [
                        {"role": "user", "content": "Say 'ok' if you can read this."}
                    ],
                }
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                msg = data["choices"][0]["message"]
                reply = (msg.get("content") or msg.get("reasoning_content") or "")[:100]
                return {
                    "ok": True,
                    "message": f"Model works! Reply: {reply}",
                }
    except httpx.HTTPStatusError as e:
        return {"ok": False, "message": f"HTTP {e.response.status_code}: {e.response.text[:300]}"}
    except KeyError as e:
        return {"ok": False, "message": f"Unexpected response format (missing key: {e}). Ensure the API is OpenAI-compatible."}
    except Exception as e:
        return {"ok": False, "message": str(e)}
