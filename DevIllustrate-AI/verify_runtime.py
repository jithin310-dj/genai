#!/usr/bin/env python3
"""
verify_runtime.py - CLI tool to verify PyTorch, Diffusers, GPU/MPS/CPU availability,
and optionally run a real end-to-end Stable Diffusion technical illustration generation test
with timing, PNG validation, and Markdown evidence report export.

Usage:
  python DevIllustrate-AI/verify_runtime.py
  python DevIllustrate-AI/verify_runtime.py --run-generation --width 512 --height 512 --steps 25 \
      --report-md DevIllustrate-AI/outputs/Colab_Runtime_Verification_Report.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure DevIllustrate-AI modules resolve cleanly regardless of current working directory
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from config import DEFAULT_MODEL_ID
from generator import verify_runtime

DEFAULT_TECHNICAL_PROMPT = (
    "clean isometric cloud computing microservices architecture illustration showing an API gateway, "
    "load balancer, stateless compute cluster, and replicated database cylinders, neutral off-white "
    "studio background, crisp geometric conduits, sharp focus, zero embedded text"
)
DEFAULT_NEGATIVE_PROMPT = (
    "blurry, low resolution, watermark, distorted text, garbled letters, messy cables, noisy background"
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify DevIllustrate AI Stable Diffusion (PyTorch + Diffusers) runtime."
    )
    parser.add_argument(
        "--run-generation",
        action="store_true",
        help="Load the Stable Diffusion pipeline and generate an actual test PNG on disk.",
    )
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID, help="Hugging Face Diffusers model ID.")
    parser.add_argument("--prompt", default=DEFAULT_TECHNICAL_PROMPT, help="Technical illustration prompt.")
    parser.add_argument("--negative-prompt", default=DEFAULT_NEGATIVE_PROMPT, help="Negative prompt.")
    parser.add_argument("--width", type=int, default=512, help="Output image width (multiple of 8).")
    parser.add_argument("--height", type=int, default=512, help="Output image height (multiple of 8).")
    parser.add_argument("--steps", type=int, default=25, help="Number of diffusion inference steps.")
    parser.add_argument("--guidance-scale", type=float, default=7.5, help="Classifier-free guidance scale.")
    parser.add_argument("--seed", type=int, default=4219, help="Deterministic random seed.")
    parser.add_argument("--output", type=str, default=None, help="Optional PNG output path.")
    parser.add_argument(
        "--report-md",
        type=str,
        default=None,
        help="Optional path to write an evidence-based Markdown verification report.",
    )
    args = parser.parse_args()

    result = verify_runtime(
        run_generation=args.run_generation,
        model_id=args.model_id,
        output_path=Path(args.output) if args.output else None,
        prompt=args.prompt,
        negative_prompt=args.negative_prompt,
        width=args.width,
        height=args.height,
        steps=args.steps,
        guidance_scale=args.guidance_scale,
        seed=args.seed,
        report_md_path=Path(args.report_md) if args.report_md else None,
    )

    print(json.dumps(result, indent=2))

    if not result["dependencies_ready"]:
        return 1
    if args.run_generation and not result["generation_verified"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
