"""
labeler.py - Smart Labeling engine for DevIllustrate AI using Pillow (PIL).
Direct Python conversion of src/utils/labeler.ts.

IMPORTANT TRANSPARENCY NOTE:
Component marker positions (x, y) are MANUALLY PROVIDED by the user as normalized
coordinates strictly between 0.0 and 1.0 (e.g., x=0.50, y=0.50 is the center of the
illustration). This module does NOT run an automatic object-detection model; manual
placement guarantees accurate, deterministic annotations for technical documentation.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from config import FONT_CANDIDATES_BOLD, FONT_CANDIDATES_MONO, FONT_CANDIDATES_REGULAR
from utils.helpers import hex_to_rgb


def validate_coordinates(x: Any, y: Any) -> Tuple[bool, Optional[str]]:
    """
    Validate that normalized marker coordinates (x, y) are finite numbers within [0.0, 1.0].

    Returns:
        (True, None) if valid, or (False, error_message) if invalid.
    """
    try:
        x_val = float(x)
        y_val = float(y)
    except (TypeError, ValueError):
        return False, "Coordinates must be valid numbers between 0.00 and 1.00."

    if not math.isfinite(x_val) or not math.isfinite(y_val):
        return False, "Coordinates must be finite numbers between 0.00 and 1.00."

    if x_val < 0.0 or x_val > 1.0 or y_val < 0.0 or y_val > 1.0:
        return (
            False,
            f"Coordinates ({x_val:.2f}, {y_val:.2f}) out of range. X and Y must be between 0.00 and 1.00.",
        )

    return True, None


def validate_components(components: List[Dict[str, Any]]) -> None:
    """
    Validate a list of component dictionaries before rendering markers.

    Raises:
        ValueError: If any component is missing coordinates or lies outside [0.0, 1.0].
    """
    if not isinstance(components, list):
        raise ValueError("Components must be provided as a list of dictionaries.")

    for idx, comp in enumerate(components, start=1):
        if not isinstance(comp, dict) or "x" not in comp or "y" not in comp:
            raise ValueError(f"Component #{idx} must include 'x' and 'y' coordinates.")
        valid, err = validate_coordinates(comp["x"], comp["y"])
        if not valid:
            name = comp.get("name") or f"Component #{idx}"
            raise ValueError(f"#{idx} ({name}): {err}")


def _load_font(candidates: List[str], size: int):
    from PIL import ImageFont

    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap_text_pixels(draw, text: str, font, max_width: int) -> List[str]:
    """Wrap text accurately using rendered pixel widths so long descriptions never overlap."""
    words = (text or "").strip().split()
    if not words:
        return []

    lines: List[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def add_smart_labels(
    image,
    *,
    title: str = "Technical Documentation Diagram",
    subtitle: str = "",
    components: Optional[List[Dict[str, Any]]] = None,
    show_title: bool = True,
    show_legend: bool = True,
    show_marker_tags: bool = False,
    marker_color: str = "#1D4ED8",
    style: str = "Professional 3D",
):
    """
    Render a documentation-ready labeled PNG from a base PIL Image:
      - Optional title & subtitle header banner
      - Base technical illustration (scaled up cleanly if narrower than 960px for crisp typography)
      - Boundary-clamped numbered circular markers (1, 2, 3...) at validated manual (x, y) in [0, 1]
      - Optional inline callout tags that automatically flip left/right to stay inside image bounds
      - Auto-measured 1- or 2-column Component Legend panel below the graphic

    Note:
        Component positions (x, y) are manually provided by the user, not automatically detected.
    """
    from PIL import Image, ImageDraw

    comp_list = components or []
    validate_components(comp_list)

    base = image.convert("RGB")
    raw_w, raw_h = base.size

    # Ensure legible typography on smaller 512x512 Stable Diffusion images
    target_w = max(raw_w, 960)
    if target_w != raw_w:
        scale = target_w / raw_w
        target_h = int(round(raw_h * scale))
        base = base.resize((target_w, target_h), Image.Resampling.LANCZOS)
    img_w, img_h = base.size

    is_blueprint = style == "Blueprint"
    header_bg = (10, 30, 52) if is_blueprint else (255, 255, 255)
    header_ink = (248, 250, 252) if is_blueprint else (15, 23, 42)
    header_sub_ink = (147, 197, 253) if is_blueprint else (71, 85, 105)
    border_hairline = (30, 58, 95) if is_blueprint else (226, 232, 240)
    legend_bg = (11, 34, 59) if is_blueprint else (248, 250, 252)
    legend_title_ink = (248, 250, 252) if is_blueprint else (15, 23, 42)
    legend_desc_ink = (203, 213, 225) if is_blueprint else (71, 85, 105)
    tag_bg = (10, 30, 52) if is_blueprint else (255, 255, 255)
    tag_border = (125, 211, 252) if is_blueprint else (203, 213, 225)
    tag_ink = (248, 250, 252) if is_blueprint else (15, 23, 42)

    accent_rgb = hex_to_rgb(marker_color)

    pad_x = max(28, int(round(img_w * 0.04)))
    title_font_size = max(22, min(30, int(round(img_w * 0.025))))
    sub_font_size = max(13, min(16, int(round(img_w * 0.0135))))
    marker_radius = max(16, min(22, int(round(img_w * 0.017))))

    title_font = _load_font(FONT_CANDIDATES_BOLD, title_font_size)
    sub_font = _load_font(FONT_CANDIDATES_REGULAR, sub_font_size)
    heading_font = _load_font(FONT_CANDIDATES_BOLD, 14)
    note_font = _load_font(FONT_CANDIDATES_REGULAR, 12)
    item_name_font = _load_font(FONT_CANDIDATES_BOLD, 15)
    item_desc_font = _load_font(FONT_CANDIDATES_REGULAR, 13)
    tag_font = _load_font(FONT_CANDIDATES_BOLD, 13)
    marker_font = _load_font(FONT_CANDIDATES_MONO, max(14, int(round(marker_radius * 0.92))))
    legend_badge_font = _load_font(FONT_CANDIDATES_MONO, 13)

    clean_title = (title or "").strip() or "Technical Documentation Diagram"
    clean_subtitle = (subtitle or "").strip()
    header_h = (104 if clean_subtitle else 76) if show_title else 0

    # Measure multi-column legend height before creating output canvas
    scratch = Image.new("RGB", (10, 10))
    scratch_draw = ImageDraw.Draw(scratch)

    columns = 2 if len(comp_list) > 2 else 1
    col_gap = 32
    col_width = int((img_w - pad_x * 2 - (columns - 1) * col_gap) / columns)
    desc_line_h = 19

    measured_items = []
    for idx, comp in enumerate(comp_list, start=1):
        name = str(comp.get("name", f"Component {idx}")).strip() or f"Component {idx}"
        desc = str(comp.get("description", "")).strip() or "Component description not specified."
        desc_lines = _wrap_text_pixels(scratch_draw, desc, item_desc_font, max(120, col_width - 44))
        row_h = max(46, 26 + len(desc_lines) * desc_line_h)
        measured_items.append(
            {"index": idx, "name": name, "desc_lines": desc_lines, "row_h": row_h}
        )

    rows_count = math.ceil(len(measured_items) / columns) if measured_items else 0
    row_heights: List[int] = []
    legend_content_h = 0
    for r in range(rows_count):
        max_h = 0
        for c in range(columns):
            item_idx = r * columns + c
            if item_idx < len(measured_items):
                max_h = max(max_h, measured_items[item_idx]["row_h"])
        row_heights.append(max_h)
        legend_content_h += max_h + 16

    legend_h = (58 + legend_content_h + 24) if (show_legend and measured_items) else 0
    total_h = header_h + img_h + legend_h

    canvas = Image.new("RGB", (img_w, total_h), color=header_bg)
    draw = ImageDraw.Draw(canvas)

    # 1. Title & Subtitle Banner
    if header_h > 0:
        draw.rectangle([(0, 0), (img_w, header_h)], fill=header_bg)
        draw.text((pad_x, 22), clean_title, fill=header_ink, font=title_font)
        if clean_subtitle:
            draw.text((pad_x, 22 + title_font_size + 10), clean_subtitle, fill=header_sub_ink, font=sub_font)
        draw.line([(0, header_h - 1), (img_w, header_h - 1)], fill=border_hairline, width=1)

    # 2. Base Illustration
    canvas.paste(base, (0, header_h))

    # 3. Numbered Component Markers (clamped safely inside image bounds)
    margin = marker_radius + 5
    for idx, comp in enumerate(comp_list, start=1):
        raw_cx = int(round(float(comp["x"]) * img_w))
        raw_cy = header_h + int(round(float(comp["y"]) * img_h))

        cx = max(margin, min(img_w - margin, raw_cx))
        cy = max(header_h + margin, min(header_h + img_h - margin, raw_cy))

        # Optional inline callout tag (auto-flips to prevent clipping outside edges)
        comp_name = str(comp.get("name", "")).strip()
        if show_marker_tags and comp_name:
            text_w = int(math.ceil(draw.textlength(comp_name, font=tag_font)))
            box_w = text_w + 18
            box_h = 26
            place_left = (cx + marker_radius + 10 + box_w) > (img_w - 12)
            bx = (cx - marker_radius - 8 - box_w) if place_left else (cx + marker_radius + 8)
            bx = max(8, min(img_w - box_w - 8, bx))
            by = max(header_h + 8, min(header_h + img_h - box_h - 8, cy - box_h // 2))

            draw.rounded_rectangle(
                [(bx, by), (bx + box_w, by + box_h)],
                radius=6,
                fill=tag_bg,
                outline=tag_border,
                width=1,
            )
            draw.text((bx + 9, by + 5), comp_name, fill=tag_ink, font=tag_font)

        # White contrast halo ring + colored marker badge
        halo = marker_radius + 3
        draw.ellipse([(cx - halo, cy - halo), (cx + halo, cy + halo)], fill=(255, 255, 255))
        draw.ellipse(
            [(cx - marker_radius, cy - marker_radius), (cx + marker_radius, cy + marker_radius)],
            fill=accent_rgb,
        )

        num_text = str(idx)
        bbox = draw.textbbox((0, 0), num_text, font=marker_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(
            (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]),
            num_text,
            fill=(255, 255, 255),
            font=marker_font,
        )

    # 4. Structured Component Legend Below Image
    if legend_h > 0:
        legend_top = header_h + img_h
        draw.rectangle([(0, legend_top), (img_w, total_h)], fill=legend_bg)
        draw.line([(0, legend_top), (img_w, legend_top)], fill=border_hairline, width=1)

        draw.text((pad_x, legend_top + 20), "Component Legend", fill=header_sub_ink, font=heading_font)
        note_text = "Positions manually annotated (normalized 0.00–1.00)"
        note_w = draw.textlength(note_text, font=note_font)
        draw.text((img_w - pad_x - note_w, legend_top + 22), note_text, fill=header_sub_ink, font=note_font)

        cursor_y = legend_top + 56
        badge_r = 13
        for r in range(rows_count):
            for c in range(columns):
                item_idx = r * columns + c
                if item_idx >= len(measured_items):
                    continue
                item = measured_items[item_idx]
                col_x = pad_x + c * (col_width + col_gap)

                # Legend numbered circle
                draw.ellipse(
                    [(col_x, cursor_y), (col_x + badge_r * 2, cursor_y + badge_r * 2)],
                    fill=accent_rgb,
                )
                num_str = str(item["index"])
                nb = draw.textbbox((0, 0), num_str, font=legend_badge_font)
                ntw = nb[2] - nb[0]
                nth = nb[3] - nb[1]
                draw.text(
                    (col_x + badge_r - ntw / 2 - nb[0], cursor_y + badge_r - nth / 2 - nb[1]),
                    num_str,
                    fill=(255, 255, 255),
                    font=legend_badge_font,
                )

                # Component Name & Wrapped Description
                draw.text((col_x + 38, cursor_y + 2), item["name"], fill=legend_title_ink, font=item_name_font)
                for line_i, line in enumerate(item["desc_lines"]):
                    draw.text(
                        (col_x + 38, cursor_y + 25 + line_i * desc_line_h),
                        line,
                        fill=legend_desc_ink,
                        font=item_desc_font,
                    )

            cursor_y += row_heights[r] + 16

    return canvas
