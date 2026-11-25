"""
utils/helpers.py - Shared helper functions for DevIllustrate AI.
Handles filename slugification, hex-to-RGB color conversion, PNG byte serialization,
and safe coordinate formatting.
"""

from __future__ import annotations

import io
import re
from typing import Tuple


def slugify(text: str, fallback: str = "devillustrate", max_length: int = 40) -> str:
    """Convert a diagram title into a safe lowercase filename slug."""
    cleaned = re.sub(r"[^a-z0-9]+", "_", (text or "").strip().lower()).strip("_")
    slug = cleaned[:max_length].strip("_")
    return slug or fallback


def hex_to_rgb(hex_color: str, default: Tuple[int, int, int] = (29, 78, 216)) -> Tuple[int, int, int]:
    """Convert a CSS hex color string (e.g. '#1D4ED8') into an (R, G, B) tuple."""
    if not isinstance(hex_color, str):
        return default
    raw = hex_color.strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        return default
    try:
        return (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16))
    except ValueError:
        return default


def image_to_png_bytes(image) -> bytes:
    """Serialize a PIL Image into in-memory PNG bytes for Streamlit downloads."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def clamp_normalized(value: float) -> float:
    """Clamp a floating-point value to the inclusive [0.0, 1.0] interval."""
    return round(min(1.0, max(0.0, float(value))), 2)
