"""
prompt_engine.py - Technical prompt enhancement engine for DevIllustrate AI.
Provides:
  1. Deterministic template enhancement (exact parity with src/data/presets.ts)
  2. Optional AI prompt enhancement using Google's official `google-genai` Python SDK
     (preserving server/gemini.ts's /api/enhance-prompt capability when GEMINI_API_KEY is set).
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Tuple

from config import STYLE_DEFINITIONS
from utils.helpers import clamp_normalized


def get_negative_prompt(style: str = "Professional 3D") -> str:
    """Return the anti-clutter, anti-garbled-text negative prompt for a visual style."""
    definition = STYLE_DEFINITIONS.get(style, STYLE_DEFINITIONS["Professional 3D"])
    return definition["negative_prompt"]


def enhance_prompt_template(user_prompt: str, style: str = "Professional 3D") -> Tuple[str, str]:
    """
    Deterministically enhance a natural-language technical prompt using style templates.

    Args:
        user_prompt: Plain-English description (e.g., "Create a cloud computing architecture diagram.")
        style: One of 'Professional 3D', 'Flat Vector', 'Blueprint', or 'Isometric'.

    Returns:
        (enhanced_prompt, negative_prompt)
    """
    cleaned = (user_prompt or "").strip().rstrip(".")
    if not cleaned:
        raise ValueError("Please provide a technical prompt to enhance.")

    definition = STYLE_DEFINITIONS.get(style, STYLE_DEFINITIONS["Professional 3D"])
    enhanced = f"{cleaned}, {definition['prompt_template']}"
    negative = definition["negative_prompt"]
    return enhanced, negative


def enhance_prompt_gemini(user_prompt: str, style: str = "Professional 3D") -> Dict[str, Any]:
    """
    Use the Gemini API (`google-genai` Python SDK) to generate an enhanced Stable Diffusion
    prompt, negative prompt, suggested title, and starting component suggestions.

    Requires the `GEMINI_API_KEY` environment variable to be set.
    """
    cleaned = (user_prompt or "").strip()
    if not cleaned:
        raise ValueError("Please provide a technical prompt to enhance.")

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to your .env file (or Colab secrets) to use AI "
            "Prompt Enhancement, or click 'Template Rules' for offline enhancement."
        )

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise RuntimeError(
            "The 'google-genai' package is not installed. Run: pip install google-genai"
        ) from exc

    system_instruction = (
        "You are a senior technical documentation illustrator and Stable Diffusion prompt engineer. "
        "Given a user's technical concept and a visual style (Professional 3D, Flat Vector, Blueprint, "
        "or Isometric), return a JSON object with keys: "
        "'enhanced_prompt' (detailed Stable Diffusion illustration prompt with zero embedded text), "
        "'negative_prompt' (comma-separated artifacts to avoid), "
        "'suggested_title' (concise 3-6 word diagram title), and "
        "'suggested_components' (list of 4-5 objects each with 'name', 'description', 'x', 'y' "
        "where x and y are normalized layout suggestions between 0.12 and 0.88)."
    )

    client = genai.Client(api_key=api_key)
    model_id = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip() or "gemini-3.1-flash-lite"
    response = client.models.generate_content(
        model=model_id,
        contents=f'User concept: "{cleaned}"\nSelected visual style: "{style}"',
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
        ),
    )

    raw_text = (response.text or "").strip()
    if not raw_text:
        raise RuntimeError("Gemini returned an empty response while enhancing the prompt.")

    parsed = json.loads(raw_text)
    raw_components: List[Dict[str, Any]] = parsed.get("suggested_components", [])
    sanitized_components = [
        {
            "name": str(comp.get("name", f"Component {idx}")).strip(),
            "description": str(comp.get("description", "")).strip(),
            "x": clamp_normalized(float(comp.get("x", 0.5))),
            "y": clamp_normalized(float(comp.get("y", 0.5))),
        }
        for idx, comp in enumerate(raw_components, start=1)
    ]

    return {
        "enhanced_prompt": str(parsed.get("enhanced_prompt", "")).strip(),
        "negative_prompt": str(parsed.get("negative_prompt", get_negative_prompt(style))).strip(),
        "suggested_title": str(parsed.get("suggested_title", "Technical Architecture Diagram")).strip(),
        "suggested_components": sanitized_components,
    }
