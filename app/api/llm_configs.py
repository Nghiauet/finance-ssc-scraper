from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LLMConfig
from app.schemas.llm_config import LLMConfigCreate, LLMConfigUpdate, LLMConfigResponse
from app.services.crypto_service import encrypt_api_key, decrypt_api_key

router = APIRouter(prefix="/llm-configs", tags=["llm-configs"])


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
    # If setting as default, unset other defaults of the same type
    if data.is_default:
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
        is_default=data.is_default,
        config_type=data.config_type,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return LLMConfigResponse.model_validate(config)


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
    """Test an LLM config by sending a simple request."""
    import httpx

    config = db.query(LLMConfig).get(config_id)
    if not config:
        raise HTTPException(404, "LLM config not found")

    api_key = decrypt_api_key(config.api_key_encrypted)
    url = f"{config.base_url.rstrip('/')}/models"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
            resp.raise_for_status()
            return {"ok": True, "message": "Connection successful"}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "message": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"ok": False, "message": str(e)}
