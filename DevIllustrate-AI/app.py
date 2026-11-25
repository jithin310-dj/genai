"""
app.py - Main Streamlit Application for DevIllustrate AI – Technical Documentation Graphic Generator.
Faithful Python + Streamlit conversion of the React + Express application.

Run locally:
    streamlit run app.py --server.port 8501

Run in Google Colab with Cloudflare Tunnel:
    streamlit run DevIllustrate-AI/app.py --server.port 8501 --server.headless true &
    cloudflared tunnel --url http://localhost:8501
"""

from __future__ import annotations

import copy
import random
from pathlib import Path
from typing import Any, Dict, List, Optional

import streamlit as st
from dotenv import load_dotenv
from PIL import Image

from config import (
    APP_NAME,
    APP_TITLE,
    DEFAULT_GUIDANCE_SCALE,
    DEFAULT_STEPS,
    MARKER_COLOR_OPTIONS,
    MAX_GUIDANCE_SCALE,
    MAX_STEPS,
    MIN_GUIDANCE_SCALE,
    MIN_STEPS,
    RESOLUTION_OPTIONS,
    SAMPLE_PRESETS,
    STYLE_DEFINITIONS,
    THEME,
    VISUAL_STYLES,
    ensure_directories,
)
from database import OutputDatabase
from generator import TechnicalIllustrationGenerator, get_runtime_info
from labeler import add_smart_labels, validate_coordinates
from prompt_engine import enhance_prompt_gemini, enhance_prompt_template
from utils.helpers import image_to_png_bytes, slugify

load_dotenv()
ensure_directories()

st.set_page_config(
    page_title=APP_TITLE,
    layout="wide",
    initial_sidebar_state="collapsed",
)


def inject_swiss_theme_css() -> None:
    """Apply the Swiss technical engineering workbench palette & typography matching React."""
    st.markdown(
        f"""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

        html, body, [class*="css"] {{
            font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
            color: {THEME['ink_primary']};
            background-color: {THEME['canvas_bg']};
        }}

        .stApp {{
            background-color: {THEME['canvas_bg']};
        }}

        h1, h2, h3, h4 {{
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
            color: {THEME['ink_primary']} !important;
            letter-spacing: -0.015em;
        }}

        code, .mono-meta {{
            font-family: 'JetBrains Mono', ui-monospace, monospace !important;
            font-variant-numeric: tabular-nums;
        }}

        .block-container {{
            max-width: 1440px;
            padding-top: 1.25rem;
            padding-bottom: 2.5rem;
        }}

        .dev-topbar {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.25rem 0 0.75rem 0;
            border-bottom: 1px solid {THEME['border']};
            margin-bottom: 1.25rem;
        }}

        .dev-brand {{
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 1.15rem;
            font-weight: 700;
            color: {THEME['ink_primary']};
            letter-spacing: -0.02em;
        }}

        .dev-card {{
            background: {THEME['surface_bg']};
            border: 1px solid {THEME['border']};
            border-radius: 12px;
            padding: 1.15rem 1.25rem;
            margin-bottom: 1rem;
        }}

        .dev-disclosure {{
            background: #F8FAFC;
            border: 1px solid {THEME['border']};
            border-radius: 8px;
            padding: 0.75rem 1rem;
            font-size: 0.82rem;
            line-height: 1.5;
            color: #334155;
            margin: 0.5rem 0 1rem 0;
        }}

        .dev-meta-line {{
            font-size: 0.78rem;
            color: {THEME['ink_secondary']};
            font-variant-numeric: tabular-nums;
            margin-bottom: 0.5rem;
        }}

        div.stButton > button[kind="primary"] {{
            background-color: {THEME['accent']};
            border-color: {THEME['accent']};
            color: #FFFFFF;
            font-weight: 600;
            border-radius: 8px;
        }}

        div.stButton > button[kind="primary"]:hover {{
            background-color: {THEME['accent_hover']};
            border-color: {THEME['accent_hover']};
        }}

        div.stButton > button[kind="secondary"],
        div.stDownloadButton > button {{
            border-radius: 8px;
            border-color: {THEME['border']};
            font-weight: 500;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


@st.cache_resource(show_spinner=False)
def get_database() -> OutputDatabase:
    return OutputDatabase()


@st.cache_resource(show_spinner="Loading Stable Diffusion pipeline (first load takes ~60s)...")
def get_diffusion_generator() -> TechnicalIllustrationGenerator:
    gen = TechnicalIllustrationGenerator()
    gen.load_pipeline()
    return gen


def load_image_safe(image_path: str) -> Image.Image:
    """Open an image file cleanly or generate a crisp neutral placeholder if missing."""
    path = Path(image_path)
    if path.exists():
        return Image.open(path).convert("RGB")
    return Image.new("RGB", (1024, 768), color=(241, 245, 249))


def apply_preset_to_state(preset: Dict[str, Any]) -> None:
    """Load one of the 4 built-in presets into Streamlit session_state."""
    style = preset["style"]
    enhanced, negative = enhance_prompt_template(preset["prompt"], style)
    st.session_state.active_preset_id = preset["id"]
    st.session_state.prompt = preset["prompt"]
    st.session_state.enhanced_prompt = enhanced
    st.session_state.negative_prompt = negative
    st.session_state.style = style
    st.session_state.seed = int(preset["seed"])
    st.session_state.title = preset["title"]
    st.session_state.subtitle = preset["subtitle"]
    st.session_state.marker_color = STYLE_DEFINITIONS[style]["default_marker_color"]
    st.session_state.components = copy.deepcopy(preset["components"])
    st.session_state.original_image = load_image_safe(preset["image_path"])


def init_session_state() -> None:
    """Initialize application state on first page load."""
    if "initialized" in st.session_state:
        return

    st.session_state.initialized = True
    st.session_state.active_page = "Studio"
    st.session_state.preview_mode = "Side-by-Side"
    st.session_state.steps = DEFAULT_STEPS
    st.session_state.guidance_scale = DEFAULT_GUIDANCE_SCALE
    st.session_state.resolution_label = "768 × 576 (4:3 Standard)"
    st.session_state.show_title = True
    st.session_state.show_legend = True
    st.session_state.show_marker_tags = False
    st.session_state.last_error = None
    st.session_state.last_notice = None

    apply_preset_to_state(SAMPLE_PRESETS[0])


def render_current_labeled_image() -> tuple[Optional[Image.Image], List[str]]:
    """
    Validate current component coordinates and render the Pillow smart-labeled graphic.
    Returns (labeled_pil_image_or_None, list_of_validation_errors).
    """
    errors: List[str] = []
    valid_components: List[Dict[str, Any]] = []
    for idx, comp in enumerate(st.session_state.components, start=1):
        ok, err = validate_coordinates(comp.get("x"), comp.get("y"))
        if not ok:
            errors.append(f"#{idx} ({comp.get('name') or 'Unnamed'}): {err}")
        else:
            valid_components.append(comp)

    orig_img: Image.Image = st.session_state.original_image
    labeled_img = add_smart_labels(
        orig_img,
        title=st.session_state.title,
        subtitle=st.session_state.subtitle,
        components=valid_components,
        show_title=st.session_state.show_title,
        show_legend=st.session_state.show_legend,
        show_marker_tags=st.session_state.show_marker_tags,
        marker_color=st.session_state.marker_color,
        style=st.session_state.style,
    )
    return labeled_img, errors


def render_top_navigation(labeled_bytes: Optional[bytes]) -> None:
    """Render the clean 3-zone top bar (Brand — Navigation — Primary Download PNG)."""
    col_brand, col_nav, col_cta = st.columns([2.2, 3.0, 1.5], vertical_alignment="center")

    with col_brand:
        st.markdown(f'<div class="dev-brand">{APP_NAME}</div>', unsafe_allow_html=True)

    with col_nav:
        nav_cols = st.columns([1, 1, 2])
        with nav_cols[0]:
            if st.button(
                "Studio",
                type="primary" if st.session_state.active_page == "Studio" else "secondary",
                use_container_width=True,
                key="nav_studio",
            ):
                st.session_state.active_page = "Studio"
                st.rerun()
        with nav_cols[1]:
            if st.button(
                "Outputs",
                type="primary" if st.session_state.active_page == "Outputs" else "secondary",
                use_container_width=True,
                key="nav_outputs",
            ):
                st.session_state.active_page = "Outputs"
                st.rerun()

    with col_cta:
        filename = f"{slugify(st.session_state.title, fallback='devillustrate')}_labeled.png"
        st.download_button(
            label="Download PNG",
            data=labeled_bytes or b"",
            file_name=filename,
            mime="image/png",
            disabled=labeled_bytes is None,
            use_container_width=True,
            key="topbar_download_png",
        )

    st.markdown("<hr style='margin:0.5rem 0 1.25rem 0;border-color:#E2E8F0;'/>", unsafe_allow_html=True)


def render_studio_page(
    db: OutputDatabase,
    labeled_img: Optional[Image.Image],
    validation_errors: List[str],
    labeled_bytes: Optional[bytes],
) -> None:
    """Render the 2-column DevIllustrate AI Studio workspace."""
    left_col, right_col = st.columns([1.1, 2.25], gap="large")

    # =========================================================================
    # LEFT RAIL: Presets, Upload, Prompt Engine, Styles, Generation Settings
    # =========================================================================
    with left_col:
        st.markdown("#### Quick Examples")
        p_cols = st.columns(2)
        for idx, preset in enumerate(SAMPLE_PRESETS):
            with p_cols[idx % 2]:
                is_active = st.session_state.get("active_preset_id") == preset["id"]
                if st.button(
                    f"{preset['label']}\n({preset['short_tag']})",
                    key=f"preset_{preset['id']}",
                    type="primary" if is_active else "secondary",
                    use_container_width=True,
                ):
                    apply_preset_to_state(preset)
                    st.session_state.last_error = None
                    st.rerun()

        uploaded_file = st.file_uploader(
            "Upload Custom PNG / JPG to Smart Label",
            type=["png", "jpg", "jpeg", "webp"],
            key="custom_image_uploader",
        )
        if uploaded_file is not None:
            upload_sig = f"{uploaded_file.name}:{uploaded_file.size}"
            if st.session_state.get("last_upload_sig") != upload_sig:
                try:
                    st.session_state.original_image = Image.open(uploaded_file).convert("RGB")
                    st.session_state.active_preset_id = None
                    st.session_state.last_upload_sig = upload_sig
                    st.session_state.last_notice = f"Loaded custom image: {uploaded_file.name}"
                    st.rerun()
                except Exception as exc:
                    st.session_state.last_error = f"Could not read uploaded image: {exc}"

        st.divider()

        # Prompt Input & Prompt Enhancement
        st.markdown("#### Technical Description")
        st.session_state.prompt = st.text_area(
            "Describe the technical diagram",
            value=st.session_state.prompt,
            height=90,
            label_visibility="collapsed",
            placeholder="Example: Create a cloud computing architecture diagram.",
        )

        enh_cols = st.columns(2)
        with enh_cols[0]:
            if st.button("AI Enhance Prompt", use_container_width=True, key="btn_ai_enhance"):
                try:
                    with st.spinner("Enhancing prompt with Gemini..."):
                        result = enhance_prompt_gemini(
                            st.session_state.prompt, st.session_state.style
                        )
                    st.session_state.enhanced_prompt = result["enhanced_prompt"]
                    st.session_state.negative_prompt = result["negative_prompt"]
                    if result.get("suggested_title"):
                        st.session_state.title = result["suggested_title"]
                    if result.get("suggested_components"):
                        st.session_state.components = result["suggested_components"]
                    st.session_state.last_error = None
                    st.session_state.last_notice = "Prompt enhanced via Gemini API."
                    st.rerun()
                except Exception as exc:
                    st.session_state.last_error = str(exc)

        with enh_cols[1]:
            if st.button("Template Rules", use_container_width=True, key="btn_template_enhance"):
                try:
                    ep, np = enhance_prompt_template(
                        st.session_state.prompt, st.session_state.style
                    )
                    st.session_state.enhanced_prompt = ep
                    st.session_state.negative_prompt = np
                    st.session_state.last_error = None
                    st.session_state.last_notice = "Applied deterministic style prompt rules."
                    st.rerun()
                except Exception as exc:
                    st.session_state.last_error = str(exc)

        # Visual Style Selection
        st.markdown("#### Visual Style")
        style_cols = st.columns(2)
        for idx, style_name in enumerate(VISUAL_STYLES):
            with style_cols[idx % 2]:
                active = st.session_state.style == style_name
                if st.button(
                    style_name,
                    key=f"style_{style_name}",
                    type="primary" if active else "secondary",
                    use_container_width=True,
                ):
                    st.session_state.style = style_name
                    st.session_state.marker_color = STYLE_DEFINITIONS[style_name][
                        "default_marker_color"
                    ]
                    ep, np = enhance_prompt_template(
                        st.session_state.prompt or "Technical system architecture",
                        style_name,
                    )
                    st.session_state.enhanced_prompt = ep
                    st.session_state.negative_prompt = np
                    st.rerun()

        st.caption(STYLE_DEFINITIONS[st.session_state.style]["summary"])

        st.divider()

        # Generation Settings
        st.markdown("#### Generation Settings")
        device_label, device_detail = get_runtime_info()
        st.caption(f"Compute Runtime: **{device_label}** · {device_detail}")

        st.session_state.steps = st.slider(
            "Inference Steps",
            min_value=MIN_STEPS,
            max_value=MAX_STEPS,
            value=int(st.session_state.steps),
            step=1,
        )

        st.session_state.guidance_scale = st.slider(
            "Guidance Scale (CFG)",
            min_value=MIN_GUIDANCE_SCALE,
            max_value=MAX_GUIDANCE_SCALE,
            value=float(st.session_state.guidance_scale),
            step=0.5,
        )

        res_labels = list(RESOLUTION_OPTIONS.keys())
        current_res_idx = (
            res_labels.index(st.session_state.resolution_label)
            if st.session_state.resolution_label in res_labels
            else 1
        )
        st.session_state.resolution_label = st.selectbox(
            "Image Resolution",
            options=res_labels,
            index=current_res_idx,
        )
        width, height = RESOLUTION_OPTIONS[st.session_state.resolution_label]

        seed_col, rand_col = st.columns([2.2, 1], vertical_alignment="bottom")
        with seed_col:
            st.session_state.seed = st.number_input(
                "Random Seed",
                min_value=0,
                max_value=999999,
                value=int(st.session_state.seed),
                step=1,
            )
        with rand_col:
            if st.button("Random", use_container_width=True, key="btn_random_seed"):
                st.session_state.seed = random.randint(1000, 99999)
                st.rerun()

        with st.expander("Advanced Prompt Options"):
            st.session_state.enhanced_prompt = st.text_area(
                "Enhanced Prompt",
                value=st.session_state.enhanced_prompt,
                height=90,
            )
            st.session_state.negative_prompt = st.text_area(
                "Negative Prompt",
                value=st.session_state.negative_prompt,
                height=70,
            )

        # Primary Generate Illustration CTA
        if st.button(
            "Generate Illustration (Stable Diffusion)",
            type="primary",
            use_container_width=True,
            key="btn_generate",
        ):
            if not st.session_state.prompt.strip():
                st.session_state.last_error = "Please enter a technical description before generating."
            elif validation_errors:
                st.session_state.last_error = (
                    "Fix out-of-range component coordinates (0.00–1.00) before generating."
                )
            else:
                st.session_state.last_error = None
                try:
                    final_prompt = st.session_state.enhanced_prompt.strip()
                    if not final_prompt:
                        final_prompt, _ = enhance_prompt_template(
                            st.session_state.prompt, st.session_state.style
                        )

                    with st.spinner(
                        f"Generating {st.session_state.style} illustration ({width}×{height}, {st.session_state.steps} steps)..."
                    ):
                        gen = get_diffusion_generator()
                        generated_img = gen.generate(
                            prompt=final_prompt,
                            negative_prompt=st.session_state.negative_prompt,
                            num_inference_steps=int(st.session_state.steps),
                            guidance_scale=float(st.session_state.guidance_scale),
                            width=width,
                            height=height,
                            seed=int(st.session_state.seed),
                        )
                        st.session_state.original_image = generated_img
                        st.session_state.active_preset_id = None

                        fresh_labeled = add_smart_labels(
                            generated_img,
                            title=st.session_state.title,
                            subtitle=st.session_state.subtitle,
                            components=st.session_state.components,
                            show_title=st.session_state.show_title,
                            show_legend=st.session_state.show_legend,
                            show_marker_tags=st.session_state.show_marker_tags,
                            marker_color=st.session_state.marker_color,
                            style=st.session_state.style,
                        )
                        db.save_output(
                            title=st.session_state.title,
                            subtitle=st.session_state.subtitle,
                            prompt=st.session_state.prompt,
                            enhanced_prompt=final_prompt,
                            negative_prompt=st.session_state.negative_prompt,
                            style=st.session_state.style,
                            width=width,
                            height=height,
                            steps=int(st.session_state.steps),
                            guidance_scale=float(st.session_state.guidance_scale),
                            seed=int(st.session_state.seed),
                            marker_color=st.session_state.marker_color,
                            original_png_bytes=image_to_png_bytes(generated_img),
                            labeled_png_bytes=image_to_png_bytes(fresh_labeled),
                            components=st.session_state.components,
                        )
                    st.session_state.last_notice = "Generated illustration and saved to outputs/."
                    st.rerun()
                except Exception as exc:
                    st.session_state.last_error = str(exc)

    # =========================================================================
    # RIGHT STAGE: Preview Comparison + Smart Labeling Controls
    # =========================================================================
    with right_col:
        if st.session_state.last_error:
            st.error(st.session_state.last_error)
        if st.session_state.last_notice:
            st.success(st.session_state.last_notice)
            st.session_state.last_notice = None

        width, height = RESOLUTION_OPTIONS[st.session_state.resolution_label]

        # Preview Mode & Export Action Row
        tb_left, tb_right = st.columns([1.4, 1.8], vertical_alignment="center")
        with tb_left:
            st.session_state.preview_mode = st.radio(
                "Preview Mode",
                options=["Side-by-Side", "Labeled", "Original"],
                index=["Side-by-Side", "Labeled", "Original"].index(
                    st.session_state.preview_mode
                ),
                horizontal=True,
                label_visibility="collapsed",
            )
        with tb_right:
            act_cols = st.columns(3)
            with act_cols[0]:
                if st.button("Save to outputs/", use_container_width=True, key="btn_save_outputs"):
                    if validation_errors:
                        st.session_state.last_error = (
                            "Please fix out-of-range coordinates (0.00–1.00) before saving."
                        )
                        st.rerun()
                    elif labeled_img is not None:
                        db.save_output(
                            title=st.session_state.title,
                            subtitle=st.session_state.subtitle,
                            prompt=st.session_state.prompt,
                            enhanced_prompt=st.session_state.enhanced_prompt,
                            negative_prompt=st.session_state.negative_prompt,
                            style=st.session_state.style,
                            width=width,
                            height=height,
                            steps=int(st.session_state.steps),
                            guidance_scale=float(st.session_state.guidance_scale),
                            seed=int(st.session_state.seed),
                            marker_color=st.session_state.marker_color,
                            original_png_bytes=image_to_png_bytes(st.session_state.original_image),
                            labeled_png_bytes=labeled_bytes or image_to_png_bytes(labeled_img),
                            components=st.session_state.components,
                        )
                        st.session_state.last_notice = "Archived original & labeled PNG to outputs/."
                        st.rerun()
            with act_cols[1]:
                orig_bytes = image_to_png_bytes(st.session_state.original_image)
                st.download_button(
                    "Original PNG",
                    data=orig_bytes,
                    file_name=f"{slugify(st.session_state.title)}_original.png",
                    mime="image/png",
                    use_container_width=True,
                    key="btn_dl_original",
                )
            with act_cols[2]:
                st.download_button(
                    "Labeled PNG",
                    data=labeled_bytes or b"",
                    file_name=f"{slugify(st.session_state.title)}_labeled.png",
                    mime="image/png",
                    disabled=labeled_bytes is None,
                    use_container_width=True,
                    key="btn_dl_labeled",
                )

        st.markdown(
            f'<div class="dev-meta-line">{st.session_state.style} · {width}×{height} · '
            f'Seed {st.session_state.seed} · {len(st.session_state.components)} markers</div>',
            unsafe_allow_html=True,
        )

        # Original vs. Smart Labeled Preview Display
        mode = st.session_state.preview_mode
        if mode == "Side-by-Side":
            c_orig, c_lab = st.columns(2, gap="medium")
            with c_orig:
                st.caption("Original Illustration")
                st.image(st.session_state.original_image, use_container_width=True)
            with c_lab:
                st.caption("Smart Labeled Output (Title + Markers + Legend)")
                if labeled_img is not None:
                    st.image(labeled_img, use_container_width=True)
        elif mode == "Original":
            st.caption("Original Illustration")
            st.image(st.session_state.original_image, use_container_width=True)
        else:
            st.caption("Smart Labeled Output (Title + Markers + Legend)")
            if labeled_img is not None:
                st.image(labeled_img, use_container_width=True)

        st.divider()

        # Smart Labeling Controls
        hdr_l, hdr_r = st.columns([3, 1], vertical_alignment="center")
        with hdr_l:
            st.markdown("#### Smart Labeling Controls")
        with hdr_r:
            if st.button("+ Add Component", use_container_width=True, key="btn_add_comp"):
                idx = len(st.session_state.components) + 1
                next_x = round(min(0.88, 0.16 + ((idx - 1) % 4) * 0.22), 2)
                next_y = 0.72 if idx > 4 else 0.48
                st.session_state.components.append(
                    {
                        "name": f"Component {idx}",
                        "description": "Describe the role of this system component.",
                        "x": next_x,
                        "y": next_y,
                    }
                )
                st.rerun()

        st.markdown(
            """
            <div class="dev-disclosure">
              <strong>Manual Position Disclosure:</strong> Component marker coordinates
              (<code>X</code> and <code>Y</code> strictly between <code>0.00</code> and
              <code>1.00</code>) are <strong>manually provided by you</strong> below —
              they are not automatically detected by an object-detection model.
              <code>X=0.00</code> is the left edge, <code>X=1.00</code> is the right edge;
              <code>Y=0.00</code> is the top edge, <code>Y=1.00</code> is the bottom edge.
            </div>
            """,
            unsafe_allow_html=True,
        )

        t_col1, t_col2 = st.columns(2)
        with t_col1:
            st.session_state.title = st.text_input("Diagram Title", value=st.session_state.title)
        with t_col2:
            st.session_state.subtitle = st.text_input(
                "Subtitle (Optional)", value=st.session_state.subtitle
            )

        opt_cols = st.columns([1.2, 1.3, 1.2, 1.5], vertical_alignment="center")
        with opt_cols[0]:
            st.session_state.show_title = st.checkbox(
                "Show Title Banner", value=st.session_state.show_title
            )
        with opt_cols[1]:
            st.session_state.show_legend = st.checkbox(
                "Show Legend Below", value=st.session_state.show_legend
            )
        with opt_cols[2]:
            st.session_state.show_marker_tags = st.checkbox(
                "Inline Callout Tags", value=st.session_state.show_marker_tags
            )
        with opt_cols[3]:
            color_names = list(MARKER_COLOR_OPTIONS.keys())
            color_values = list(MARKER_COLOR_OPTIONS.values())
            cur_idx = (
                color_values.index(st.session_state.marker_color)
                if st.session_state.marker_color in color_values
                else 0
            )
            chosen_color_name = st.selectbox(
                "Marker Accent", options=color_names, index=cur_idx
            )
            st.session_state.marker_color = MARKER_COLOR_OPTIONS[chosen_color_name]

        if validation_errors:
            st.error("Coordinate Validation Error (valid range 0.00 to 1.00):\n- " + "\n- ".join(validation_errors))

        # Component Marker Editor Table
        to_delete: Optional[int] = None
        for idx, comp in enumerate(st.session_state.components):
            c_num, c_name, c_desc, c_x, c_y, c_del = st.columns(
                [0.45, 1.8, 2.7, 0.95, 0.95, 0.55], vertical_alignment="bottom"
            )
            with c_num:
                st.markdown(f"**#{idx + 1}**")
            with c_name:
                comp["name"] = st.text_input(
                    "Name",
                    value=comp.get("name", ""),
                    key=f"comp_name_{idx}",
                    label_visibility="collapsed" if idx > 0 else "visible",
                )
            with c_desc:
                comp["description"] = st.text_input(
                    "Description",
                    value=comp.get("description", ""),
                    key=f"comp_desc_{idx}",
                    label_visibility="collapsed" if idx > 0 else "visible",
                )
            with c_x:
                comp["x"] = st.number_input(
                    "X (0–1)",
                    min_value=-0.5,
                    max_value=1.5,
                    value=float(comp.get("x", 0.5)),
                    step=0.01,
                    format="%.2f",
                    key=f"comp_x_{idx}",
                    label_visibility="collapsed" if idx > 0 else "visible",
                )
            with c_y:
                comp["y"] = st.number_input(
                    "Y (0–1)",
                    min_value=-0.5,
                    max_value=1.5,
                    value=float(comp.get("y", 0.5)),
                    step=0.01,
                    format="%.2f",
                    key=f"comp_y_{idx}",
                    label_visibility="collapsed" if idx > 0 else "visible",
                )
            with c_del:
                if st.button("✕", key=f"comp_del_{idx}", help="Remove component"):
                    to_delete = idx

        if to_delete is not None:
            st.session_state.components.pop(to_delete)
            st.rerun()


def render_outputs_page(db: OutputDatabase) -> None:
    """Render the searchable, style-filterable SQLite Outputs Gallery."""
    st.markdown("### Saved Outputs Directory")
    st.caption(
        "Original and smart-labeled PNG illustrations archived in outputs/ and tracked in SQLite (outputs/devillustrate.db)."
    )

    f_col1, f_col2 = st.columns([2, 1.5])
    with f_col1:
        search_query = st.text_input(
            "Search archived graphics",
            placeholder="Filter by title, prompt, or style...",
            label_visibility="collapsed",
        )
    with f_col2:
        style_filter = st.selectbox(
            "Filter by style",
            options=["All"] + VISUAL_STYLES,
            label_visibility="collapsed",
        )

    records = db.list_outputs(search=search_query, style=style_filter)

    if not records:
        st.info(
            "No saved illustrations match your filter yet. Open Studio, configure or generate "
            "an illustration, and click 'Save to outputs/'."
        )
        if st.button("Open Studio", type="primary"):
            st.session_state.active_page = "Studio"
            st.rerun()
        return

    grid_cols = st.columns(2, gap="large")
    for idx, item in enumerate(records):
        with grid_cols[idx % 2]:
            with st.container(border=True):
                st.markdown(f"**{item['title']}**")
                st.markdown(
                    f"<div class='dev-meta-line'>{item['style']} · {item['width']}×{item['height']} · "
                    f"Seed {item['seed']} · {item['component_count']} markers · {item['created_at'][:19]}</div>",
                    unsafe_allow_html=True,
                )
                st.caption(item["prompt"])

                img_c1, img_c2 = st.columns(2)
                with img_c1:
                    st.caption("Original")
                    if Path(item["original_path"]).exists():
                        st.image(item["original_path"], use_container_width=True)
                with img_c2:
                    st.caption("Smart Labeled")
                    if Path(item["labeled_path"]).exists():
                        st.image(item["labeled_path"], use_container_width=True)

                b1, b2, b3 = st.columns([1.2, 1.2, 0.8])
                with b1:
                    if st.button(
                        "Open in Studio",
                        key=f"open_{item['id']}",
                        use_container_width=True,
                    ):
                        st.session_state.prompt = item["prompt"]
                        st.session_state.enhanced_prompt = item["enhanced_prompt"]
                        st.session_state.negative_prompt = item["negative_prompt"]
                        st.session_state.style = item["style"]
                        st.session_state.seed = int(item["seed"])
                        st.session_state.steps = int(item["steps"])
                        st.session_state.guidance_scale = float(item["guidance_scale"])
                        st.session_state.title = item["title"]
                        st.session_state.subtitle = item["subtitle"]
                        st.session_state.marker_color = item["marker_color"]
                        st.session_state.components = copy.deepcopy(item["components"])
                        st.session_state.original_image = load_image_safe(item["original_path"])
                        st.session_state.active_preset_id = None
                        st.session_state.active_page = "Studio"
                        st.rerun()
                with b2:
                    labeled_path = Path(item["labeled_path"])
                    if labeled_path.exists():
                        st.download_button(
                            "Download PNG",
                            data=labeled_path.read_bytes(),
                            file_name=labeled_path.name,
                            mime="image/png",
                            key=f"dl_{item['id']}",
                            use_container_width=True,
                        )
                with b3:
                    if st.button("Delete", key=f"del_{item['id']}", use_container_width=True):
                        db.delete_output(item["id"])
                        st.rerun()


def main() -> None:
    inject_swiss_theme_css()
    init_session_state()

    db = get_database()
    labeled_img, validation_errors = render_current_labeled_image()
    labeled_bytes = image_to_png_bytes(labeled_img) if labeled_img is not None else None

    render_top_navigation(labeled_bytes)

    if st.session_state.active_page == "Studio":
        render_studio_page(db, labeled_img, validation_errors, labeled_bytes)
    else:
        render_outputs_page(db)


if __name__ == "__main__":
    main()
