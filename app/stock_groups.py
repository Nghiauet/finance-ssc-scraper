"""Predefined stock index groups for batch operations."""

STOCK_GROUPS: dict[str, dict] = {
    "VN30": {
        "name": "VN30",
        "description": "Top 30 largest & most liquid stocks on HOSE",
        "tickers": [
            "ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR",
            "HDB", "HPG", "MBB", "MSN", "MWG", "PLX", "POW", "SAB",
            "SHB", "SSB", "SSI", "STB", "TCB", "TPB", "VCB", "VHM",
            "VIB", "VIC", "VJC", "VNM", "VPB", "VRE",
        ],
    },
}


def get_group_tickers(group_key: str) -> list[str] | None:
    """Return ticker list for a stock group, or None if not found."""
    group = STOCK_GROUPS.get(group_key.upper())
    return group["tickers"] if group else None
