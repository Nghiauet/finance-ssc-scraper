from fastapi import APIRouter

from app.stock_groups import STOCK_GROUPS

router = APIRouter(prefix="/stock-groups", tags=["stock-groups"])


@router.get("")
def list_stock_groups():
    """Return all predefined stock groups with their tickers."""
    return {
        "groups": [
            {
                "key": key,
                "name": group["name"],
                "description": group["description"],
                "tickers": group["tickers"],
                "count": len(group["tickers"]),
            }
            for key, group in STOCK_GROUPS.items()
        ]
    }
