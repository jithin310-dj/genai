"""
config.py - Centralized configuration, visual styles, theme tokens, and presets
for DevIllustrate AI – Technical Documentation Graphic Generator (Python + Streamlit).
Mirrors src/data/presets.ts and src/index.css from the original React + Express project.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

# Directories & Storage Paths
BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"
OUTPUTS_DIR = BASE_DIR / "outputs"
DB_PATH = OUTPUTS_DIR / "devillustrate.db"

# Branding & Theme Tokens (matches React Swiss Technical Workbench palette)
APP_NAME = "DevIllustrate AI"
APP_TITLE = "DevIllustrate AI – Technical Documentation Graphic Generator"
APP_DESCRIPTION = (
    "Convert natural-language technical descriptions into clean technical illustrations "
    "with prompt enhancement, four documentation styles, and manual smart labeling."
)

THEME = {
    "canvas_bg": "#F8FAFC",
    "surface_bg": "#FFFFFF",
    "border": "#E2E8F0",
    "ink_primary": "#0F172A",
    "ink_secondary": "#475569",
    "accent": "#1D4ED8",
    "accent_hover": "#1E40AF",
    "blueprint_header": "#0A1E34",
    "blueprint_legend": "#0B223B",
    "blueprint_border": "#1E3A5F",
}

# Default Stable Diffusion Model (Hugging Face Diffusers)
DEFAULT_MODEL_ID = "runwayml/stable-diffusion-v1-5"

# Generation Parameter Bounds & Defaults
DEFAULT_STEPS = 30
MIN_STEPS = 15
MAX_STEPS = 50

DEFAULT_GUIDANCE_SCALE = 7.5
MIN_GUIDANCE_SCALE = 1.0
MAX_GUIDANCE_SCALE = 15.0

DEFAULT_SEED = 4219

# Resolutions (all multiples of 8 as required by Stable Diffusion UNet/VAE)
RESOLUTION_OPTIONS: Dict[str, Tuple[int, int]] = {
    "512 × 512 (Square)": (512, 512),
    "768 × 576 (4:3 Standard)": (768, 576),
    "1024 × 768 (4:3 HD Docs)": (1024, 768),
    "1024 × 1024 (Square HD)": (1024, 1024),
}

# Marker Accent Swatches (matches MARKER_COLOR_OPTIONS in presets.ts)
MARKER_COLOR_OPTIONS: Dict[str, str] = {
    "Cobalt Blue": "#1D4ED8",
    "Slate Navy": "#0F172A",
    "Blueprint Cyan": "#0EA5E9",
    "Emerald": "#059669",
    "Crimson": "#DC2626",
}

# Four Visual Styles (exact templates migrated from src/data/presets.ts)
STYLE_DEFINITIONS: Dict[str, Dict[str, str]] = {
    "Professional 3D": {
        "summary": "Studio-lit 3D hardware modules and architectural conduits",
        "prompt_template": (
            "clean professional 3D technical documentation illustration, modular industrial "
            "hardware geometry, studio diffused lighting, soft ambient occlusion, crisp "
            "directional data pathways, neutral off-white studio backdrop, sharp focus, "
            "zero embedded text or letters"
        ),
        "negative_prompt": (
            "blurry, low resolution, watermark, distorted text, garbled letters, "
            "messy cables, cartoon characters, noisy background, oversaturated neon"
        ),
        "default_marker_color": "#1D4ED8",
    },
    "Flat Vector": {
        "summary": "Crisp Swiss 2D geometric diagrams for engineering docs",
        "prompt_template": (
            "minimalist Swiss flat vector technical illustration, crisp 2D geometric icons, "
            "clean slate navy outlines, cobalt blue and teal accents, balanced directional "
            "flow arrows, off-white editorial background, ultra-sharp edges, zero embedded text"
        ),
        "negative_prompt": (
            "3D shading, photorealistic, blurry, watermark, text, illegible labels, "
            "sketchy lines, cluttered background, gradients"
        ),
        "default_marker_color": "#0F172A",
    },
    "Blueprint": {
        "summary": "Orthographic CAD technical drafting on Prussian navy grid",
        "prompt_template": (
            "authentic architectural CAD technical blueprint, deep Prussian blue background "
            "with fine orthographic drafting grid lines, crisp white and cyan technical "
            "schematic line art, clean cross-section modules, precision engineering drawing, "
            "zero embedded text"
        ),
        "negative_prompt": (
            "bright white background, photorealistic, blurry, colorful cartoon, "
            "watermark, distorted letters, hand-drawn scribbles"
        ),
        "default_marker_color": "#0EA5E9",
    },
    "Isometric": {
        "summary": "30-degree layered isometric planes and system topologies",
        "prompt_template": (
            "precision 30-degree isometric technical architecture illustration, layered "
            "floating geometric planes, crisp faceted nodes and clean isometric connectors, "
            "cool technical palette of cobalt and brushed titanium on light drafting backdrop, "
            "zero embedded text"
        ),
        "negative_prompt": (
            "perspective distortion, blurry, watermark, garbled text, dark muddy shadows, "
            "organic clutter, low contrast"
        ),
        "default_marker_color": "#2563EB",
    },
}

VISUAL_STYLES: List[str] = list(STYLE_DEFINITIONS.keys())

# Four Built-In Sample Presets (migrated from SAMPLE_PRESETS in src/data/presets.ts)
SAMPLE_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "cloud-architecture",
        "label": "Cloud Computing Architecture",
        "short_tag": "Professional 3D",
        "prompt": "Create a cloud computing architecture diagram.",
        "style": "Professional 3D",
        "image_path": str(ASSETS_DIR / "sample_cloud_architecture.jpg"),
        "title": "Cloud Computing Reference Architecture",
        "subtitle": "Ingress Gateway, Load Balancing, Stateless Compute & Replicated Storage",
        "seed": 4219,
        "components": [
            {
                "name": "Edge API Gateway",
                "description": (
                    "Terminates external HTTPS traffic, enforces rate limiting, and routes "
                    "authenticated requests into the private VPC."
                ),
                "x": 0.16,
                "y": 0.44,
            },
            {
                "name": "Application Load Balancer",
                "description": (
                    "Distributes incoming client sessions across healthy compute nodes "
                    "using round-robin and health checks."
                ),
                "x": 0.35,
                "y": 0.66,
            },
            {
                "name": "Auto-Scaling Compute Cluster",
                "description": (
                    "Horizontally scalable stateless application servers executing core "
                    "business logic across availability zones."
                ),
                "x": 0.54,
                "y": 0.43,
            },
            {
                "name": "Replicated Database Nodes",
                "description": (
                    "Primary and standby persistent storage cylinders maintaining "
                    "synchronous transactional durability."
                ),
                "x": 0.83,
                "y": 0.58,
            },
        ],
    },
    {
        "id": "neural-network",
        "label": "Neural Network Architecture",
        "short_tag": "Isometric",
        "prompt": "Generate a neural network architecture illustration.",
        "style": "Isometric",
        "image_path": str(ASSETS_DIR / "sample_neural_network.jpg"),
        "title": "Multi-Layer Feedforward Neural Network",
        "subtitle": "Normalized Input Features Through Dense Hidden Representations to Output Logits",
        "seed": 7814,
        "components": [
            {
                "name": "Input Feature Layer",
                "description": (
                    "Ingests normalized raw feature vectors or tokenized embeddings into the network."
                ),
                "x": 0.15,
                "y": 0.48,
            },
            {
                "name": "Dense Hidden Layer 1",
                "description": (
                    "Applies learned linear weight matrices followed by non-linear ReLU/GELU "
                    "activations to extract low-level patterns."
                ),
                "x": 0.41,
                "y": 0.47,
            },
            {
                "name": "Dense Hidden Layer 2",
                "description": (
                    "Combines intermediate representations into higher-order abstractions "
                    "before classification."
                ),
                "x": 0.65,
                "y": 0.50,
            },
            {
                "name": "Output Prediction Layer",
                "description": (
                    "Projects final activations into class probabilities (Softmax) or "
                    "continuous regression predictions."
                ),
                "x": 0.83,
                "y": 0.50,
            },
        ],
    },
    {
        "id": "client-server",
        "label": "Client-Server Application",
        "short_tag": "Flat Vector",
        "prompt": "Show how a client-server application works.",
        "style": "Flat Vector",
        "image_path": str(ASSETS_DIR / "sample_client_server.jpg"),
        "title": "Client-Server Request Lifecycle",
        "subtitle": "Web & Mobile Clients Communicating Through a Protected API Gateway",
        "seed": 3042,
        "components": [
            {
                "name": "Web & Mobile Clients",
                "description": (
                    "End-user browser and mobile interfaces initiating REST or GraphQL requests over TLS."
                ),
                "x": 0.17,
                "y": 0.48,
            },
            {
                "name": "Security & API Gateway",
                "description": (
                    "Validates JWT authentication tokens, applies firewall rules, and proxies "
                    "calls to backend services."
                ),
                "x": 0.42,
                "y": 0.50,
            },
            {
                "name": "Application Server Tier",
                "description": (
                    "Processes business workflows, renders responses, and coordinates "
                    "downstream data reads and writes."
                ),
                "x": 0.66,
                "y": 0.50,
            },
            {
                "name": "Primary Relational Database",
                "description": (
                    "Persists structured application state with ACID guarantees and indexed query access."
                ),
                "x": 0.89,
                "y": 0.50,
            },
        ],
    },
    {
        "id": "database-system",
        "label": "Database Management System",
        "short_tag": "Blueprint",
        "prompt": "Create a database management system illustration.",
        "style": "Blueprint",
        "image_path": str(ASSETS_DIR / "sample_database_system.jpg"),
        "title": "Relational DBMS Internal Architecture",
        "subtitle": "Query Processing Pipeline, B-Tree Indexing, and Disk Storage Subsystem",
        "seed": 9105,
        "components": [
            {
                "name": "Connection & SQL Parser",
                "description": (
                    "Accepts client connections, tokenizes incoming SQL statements, and builds "
                    "a validated syntax tree."
                ),
                "x": 0.21,
                "y": 0.48,
            },
            {
                "name": "Cost-Based Query Optimizer",
                "description": (
                    "Evaluates candidate join orders and index scans using table statistics "
                    "to pick the lowest-cost execution plan."
                ),
                "x": 0.46,
                "y": 0.32,
            },
            {
                "name": "Execution & Transaction Manager",
                "description": (
                    "Runs physical operators while coordinating MVCC isolation, row locks, "
                    "and ACID commit states."
                ),
                "x": 0.46,
                "y": 0.66,
            },
            {
                "name": "B-Tree Index Hierarchy",
                "description": (
                    "Balanced tree structures enabling logarithmic-time key lookups and "
                    "ordered range scans."
                ),
                "x": 0.78,
                "y": 0.26,
            },
            {
                "name": "Disk Storage & WAL Buffer",
                "description": (
                    "Manages buffered data pages on disk alongside sequential write-ahead logs "
                    "for crash recovery."
                ),
                "x": 0.78,
                "y": 0.72,
            },
        ],
    },
]

# TrueType Font Search Paths (Colab Linux, Ubuntu, macOS, Windows)
FONT_CANDIDATES_BOLD: List[str] = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "arialbd.ttf",
]

FONT_CANDIDATES_REGULAR: List[str] = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "arial.ttf",
]

FONT_CANDIDATES_MONO: List[str] = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    "C:/Windows/Fonts/consolab.ttf",
]


def ensure_directories() -> None:
    """Ensure outputs/ and assets/ directories exist on disk."""
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
