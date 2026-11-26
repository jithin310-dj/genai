"""
generator.py - Stable Diffusion image generator powered by PyTorch & Hugging Face Diffusers.
Automatically selects CUDA GPU (float16), Apple Silicon MPS (float32 by default to avoid
known FP16 NaN black-frame issues), or CPU (float32) fallback, with VRAM optimizations,
deterministic seeding, strict input validation, and clear dependency/runtime error messages.
"""

from __future__ import annotations

import importlib
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from config import DEFAULT_MODEL_ID, OUTPUTS_DIR

REQUIRED_DEPENDENCIES: List[Tuple[str, str]] = [
    ("torch", "torch>=2.1.0"),
    ("diffusers", "diffusers>=0.27.2"),
    ("transformers", "transformers>=4.39.0"),
    ("accelerate", "accelerate>=0.28.0"),
    ("safetensors", "safetensors>=0.4.2"),
    ("PIL", "pillow>=10.2.0"),
]


def check_dependencies() -> Dict[str, Any]:
    """
    Inspect required PyTorch / Diffusers runtime packages without crashing.
    Returns installed versions, missing packages, and an actionable install command.
    """
    installed: Dict[str, str] = {}
    missing: List[str] = []

    for module_name, requirement_spec in REQUIRED_DEPENDENCIES:
        try:
            module = importlib.import_module(module_name)
            installed[module_name] = str(getattr(module, "__version__", "installed"))
        except ImportError:
            missing.append(requirement_spec)

    return {
        "ready": len(missing) == 0,
        "installed": installed,
        "missing": missing,
        "install_command": "pip install -r DevIllustrate-AI/requirements.txt",
    }


def detect_compute_device(torch_module: Any) -> Tuple[str, Any, str, str]:
    """
    Detect the best available PyTorch compute backend (CUDA -> Apple MPS -> CPU).
    Returns (device_id, torch_dtype, label, detail).
    """
    if torch_module.cuda.is_available():
        gpu_name = torch_module.cuda.get_device_name(0)
        vram_gb = torch_module.cuda.get_device_properties(0).total_memory / (1024**3)
        return (
            "cuda",
            torch_module.float16,
            "CUDA GPU",
            f"{gpu_name} ({vram_gb:.1f} GB VRAM, float16)",
        )

    mps_backend = getattr(getattr(torch_module, "backends", None), "mps", None)
    if mps_backend is not None and mps_backend.is_available():
        use_fp16 = os.getenv("SD_MPS_FP16", "").strip() in {"1", "true", "TRUE", "yes"}
        mps_dtype = torch_module.float16 if use_fp16 else torch_module.float32
        dtype_name = "float16" if use_fp16 else "float32 (NaN-safe)"
        return (
            "mps",
            mps_dtype,
            "Apple MPS",
            f"Apple Silicon Metal GPU ({dtype_name})",
        )

    return (
        "cpu",
        torch_module.float32,
        "CPU",
        "Running on CPU (float32; generation is slow — use a CUDA GPU or Google Colab T4 for speed)",
    )


def get_runtime_info() -> Tuple[str, str]:
    """Inspect PyTorch hardware availability without failing if torch or diffusers are absent."""
    deps = check_dependencies()
    if "torch" not in deps["installed"]:
        return (
            "Unavailable",
            f"PyTorch is not installed. Run: {deps['install_command']}",
        )

    import torch

    _, _, label, detail = detect_compute_device(torch)

    if not deps["ready"]:
        missing_str = ", ".join(deps["missing"])
        return (
            f"{label} (Missing Packages)",
            f"{detail}. Missing packages: {missing_str}. Run: {deps['install_command']}",
        )

    return label, detail


def _format_load_error(model_id: str, device: str, exc: Exception) -> str:
    """Convert raw Hugging Face / PyTorch loading exceptions into clear user-facing diagnostics."""
    raw = str(exc)
    lower = raw.lower()
    exc_name = type(exc).__name__

    if any(token in lower for token in ("401", "403", "gated", "unauthorized", "private repo")) or exc_name in {
        "GatedRepoError",
        "HfHubHTTPError",
    }:
        return (
            f"Access denied while loading '{model_id}' on {device}. "
            "Accept the model license on Hugging Face and set HF_TOKEN (or HUGGINGFACE_HUB_TOKEN) "
            "in your environment before retrying."
        )

    if "404" in lower or "not found" in lower or exc_name == "RepositoryNotFoundError":
        return (
            f"Model repository '{model_id}' was not found on Hugging Face Hub. "
            "Verify DEFAULT_MODEL_ID in config.py or pass a valid Diffusers model ID."
        )

    if any(token in lower for token in ("connection", "timed out", "timeout", "temporary failure in name resolution")):
        return (
            f"Network error downloading model weights for '{model_id}'. "
            "Check internet connectivity or pre-download weights into HF_HOME cache."
        )

    if "out of memory" in lower:
        return (
            f"Insufficient memory to load '{model_id}' on {device}. "
            "Free GPU VRAM, restart the Colab runtime, or set SD_CPU_OFFLOAD=1."
        )

    return f"Could not load Stable Diffusion model '{model_id}' on {device}: {raw}"


class TechnicalIllustrationGenerator:
    """Wraps Hugging Face StableDiffusionPipeline for reproducible technical graphics."""

    def __init__(self, model_id: str = DEFAULT_MODEL_ID) -> None:
        self.model_id = model_id
        self.device: str = "cpu"
        self.dtype: Any = None
        self.pipeline: Any = None

    def load_pipeline(self) -> None:
        """Load the Stable Diffusion pipeline once into memory with device & VRAM optimizations."""
        if self.pipeline is not None:
            return

        deps = check_dependencies()
        if not deps["ready"]:
            missing_list = ", ".join(deps["missing"])
            raise RuntimeError(
                f"Missing required Stable Diffusion dependencies: {missing_list}. "
                f"Install them with: {deps['install_command']}"
            )

        try:
            import torch
            from diffusers import DPMSolverMultistepScheduler, StableDiffusionPipeline
        except ImportError as exc:
            raise RuntimeError(
                "Could not import PyTorch or Diffusers. Install dependencies with:\n"
                f"{deps['install_command']}"
            ) from exc

        device, dtype, _, _ = detect_compute_device(torch)
        self.device = device
        self.dtype = dtype

        hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")
        load_kwargs: Dict[str, Any] = {
            "torch_dtype": dtype,
            "safety_checker": None,
        }
        if hf_token:
            load_kwargs["token"] = hf_token

        try:
            pipe = StableDiffusionPipeline.from_pretrained(
                self.model_id,
                **load_kwargs,
            )
            # DPM-Solver++ delivers crisp technical structures in 20–35 steps
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)

            use_cpu_offload = (
                self.device == "cuda"
                and os.getenv("SD_CPU_OFFLOAD", "").strip() in {"1", "true", "TRUE", "yes"}
            )
            if use_cpu_offload and hasattr(pipe, "enable_model_cpu_offload"):
                pipe.enable_model_cpu_offload()
            else:
                pipe = pipe.to(self.device)

            # Reduce peak VRAM usage for Google Colab T4 GPUs and Apple Silicon unified memory
            if hasattr(pipe, "enable_attention_slicing"):
                pipe.enable_attention_slicing()
            if hasattr(pipe, "enable_vae_slicing"):
                pipe.enable_vae_slicing()

            self.pipeline = pipe
        except Exception as exc:
            raise RuntimeError(_format_load_error(self.model_id, self.device, exc)) from exc

    def _validate_generation_args(
        self,
        *,
        prompt: str,
        num_inference_steps: int,
        guidance_scale: float,
        width: int,
        height: int,
    ) -> Tuple[str, int, float, int, int]:
        cleaned_prompt = (prompt or "").strip()
        if not cleaned_prompt:
            raise ValueError("Prompt cannot be empty.")

        width_int = int(width)
        height_int = int(height)
        if width_int <= 0 or height_int <= 0 or width_int % 8 != 0 or height_int % 8 != 0:
            raise ValueError(
                f"Invalid resolution {width_int}x{height_int}. Width and height must be positive multiples of 8."
            )

        steps_int = int(num_inference_steps)
        if steps_int < 1 or steps_int > 150:
            raise ValueError(
                f"Invalid num_inference_steps={steps_int}. Expected an integer between 1 and 150."
            )

        cfg_float = float(guidance_scale)
        if cfg_float < 0.0 or cfg_float > 30.0:
            raise ValueError(
                f"Invalid guidance_scale={cfg_float}. Expected a number between 0.0 and 30.0."
            )

        return cleaned_prompt, steps_int, cfg_float, width_int, height_int

    def generate(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        num_inference_steps: int = 30,
        guidance_scale: float = 7.5,
        width: int = 768,
        height: int = 576,
        seed: int = 42,
    ):
        """
        Generate a single PIL Image from an enhanced technical prompt and generation parameters.
        """
        cleaned_prompt, steps_int, cfg_float, width_int, height_int = self._validate_generation_args(
            prompt=prompt,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            width=width,
            height=height,
        )

        if self.pipeline is None:
            self.load_pipeline()

        import torch

        # Use CPU generator for MPS compatibility and device-matched generator for CUDA/CPU
        gen_device = "cpu" if self.device == "mps" else self.device
        torch_gen = torch.Generator(device=gen_device).manual_seed(int(seed))

        try:
            with torch.inference_mode():
                output = self.pipeline(
                    prompt=cleaned_prompt,
                    negative_prompt=negative_prompt.strip() or None,
                    num_inference_steps=steps_int,
                    guidance_scale=cfg_float,
                    width=width_int,
                    height=height_int,
                    generator=torch_gen,
                )
            images = getattr(output, "images", None)
            if not images:
                raise RuntimeError("Stable Diffusion pipeline returned an empty image list.")
            return images[0]
        except Exception as exc:
            if torch.cuda.is_available() and "out of memory" in str(exc).lower():
                torch.cuda.empty_cache()
                raise RuntimeError(
                    "CUDA GPU ran out of memory. Reduce resolution to 512×512, lower steps to 25, "
                    "or set SD_CPU_OFFLOAD=1 and retry."
                ) from exc
            if isinstance(exc, RuntimeError):
                raise
            raise RuntimeError(f"Stable Diffusion generation failed on {self.device}: {exc}") from exc

    def generate_batch(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        num_inference_steps: int = 30,
        guidance_scale: float = 7.5,
        width: int = 768,
        height: int = 576,
        seed: int = 42,
        quantity: int = 1,
    ) -> List[Tuple[int, Any]]:
        """Generate 1–4 deterministic seed variations and return a list of (seed, PIL Image)."""
        count = max(1, min(4, int(quantity)))
        results: List[Tuple[int, Any]] = []
        for idx in range(count):
            variant_seed = int(seed) + idx
            img = self.generate(
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                width=width,
                height=height,
                seed=variant_seed,
            )
            results.append((variant_seed, img))
        return results


def format_verification_report_md(report: Dict[str, Any]) -> str:
    """Render an honest Markdown runtime verification report strictly from actual recorded results."""
    status = "PASS (Actual PNG Generated & Verified)" if report.get("generation_verified") else (
        "FAIL / BLOCKED" if report.get("generation_attempted") else "DIAGNOSTIC ONLY (Generation Not Executed)"
    )
    installed = report.get("installed_packages") or {}
    installed_rows = "\n".join(
        f"| `{pkg}` | `{ver}` |" for pkg, ver in installed.items()
    ) or "| _(none detected)_ | — |"
    missing = report.get("missing_packages") or []
    missing_str = ", ".join(f"`{m}`" for m in missing) if missing else "None"

    lines = [
        "# DevIllustrate AI — Stable Diffusion Runtime Verification Report",
        "",
        f"- **Timestamp (UTC):** `{report.get('timestamp_utc', 'unknown')}`",
        f"- **Verification Status:** **{status}**",
        f"- **Compute Device:** `{report.get('device_label')}` — {report.get('device_detail')}",
        f"- **Torch Dtype:** `{report.get('torch_dtype') or 'N/A'}`",
        f"- **Model ID:** `{report.get('model_id')}`",
        f"- **Dependencies Ready:** `{report.get('dependencies_ready')}`",
        f"- **Missing Packages:** {missing_str}",
        "",
        "## Installed ML Packages",
        "",
        "| Package | Version |",
        "| --- | --- |",
        installed_rows,
        "",
        "## Generation Settings & Actual Measurements",
        "",
        "| Field | Recorded Value |",
        "| --- | --- |",
        f"| Prompt | `{report.get('prompt', '')}` |",
        f"| Negative Prompt | `{report.get('negative_prompt', '')}` |",
        f"| Requested Resolution | `{report.get('width')} × {report.get('height')}` |",
        f"| Inference Steps | `{report.get('steps')}` |",
        f"| Guidance Scale (CFG) | `{report.get('guidance_scale')}` |",
        f"| Seed | `{report.get('seed')}` |",
        f"| Generation Attempted | `{report.get('generation_attempted')}` |",
        f"| Pipeline Load Time | `{report.get('load_seconds')} s` |" if report.get("load_seconds") is not None else "| Pipeline Load Time | `N/A` |",
        f"| Image Generation Time | `{report.get('generation_seconds')} s` |" if report.get("generation_seconds") is not None else "| Image Generation Time | `N/A` |",
        f"| Total Elapsed Time | `{report.get('total_seconds')} s` |" if report.get("total_seconds") is not None else "| Total Elapsed Time | `N/A` |",
        f"| Output PNG Path | `{report.get('output_file') or 'None'}` |",
        f"| PNG File Exists & Non-Empty | `{report.get('output_exists')}` (`{report.get('output_bytes', 0)}` bytes) |",
        f"| PNG Signature Valid (`89 50 4E 47`) | `{report.get('png_signature_valid')}` |",
        f"| Verified Image Dimensions | `{report.get('verified_dimensions') or 'N/A'}` |",
        f"| Output SHA-256 | `{report.get('output_sha256') or 'N/A'}` |",
        "",
    ]
    if report.get("error"):
        lines.extend([
            "## Error / Blocker Details",
            "",
            f"```text\n{report['error']}\n```",
            "",
        ])
    return "\n".join(lines)


def verify_runtime(
    *,
    run_generation: bool = False,
    model_id: str = DEFAULT_MODEL_ID,
    output_path: Optional[Path] = None,
    prompt: str = (
        "clean isometric cloud computing microservices architecture illustration showing an API gateway, "
        "load balancer, stateless compute cluster, and replicated database cylinders, neutral off-white "
        "studio background, crisp geometric conduits, sharp focus, zero embedded text"
    ),
    negative_prompt: str = "blurry, low resolution, watermark, distorted text, garbled letters, noisy background",
    width: int = 512,
    height: int = 512,
    steps: int = 25,
    guidance_scale: float = 7.5,
    seed: int = 4219,
    report_md_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Verify Stable Diffusion runtime readiness.
    Only sets generation_verified=True when an actual non-empty, valid PNG is generated and verified on disk.
    """
    import hashlib
    import time
    from datetime import datetime, timezone

    deps = check_dependencies()
    device_label, device_detail = get_runtime_info()

    report: Dict[str, Any] = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "dependencies_ready": deps["ready"],
        "installed_packages": deps["installed"],
        "missing_packages": deps["missing"],
        "install_command": deps["install_command"],
        "device_label": device_label,
        "device_detail": device_detail,
        "torch_dtype": None,
        "model_id": model_id,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "width": int(width),
        "height": int(height),
        "steps": int(steps),
        "guidance_scale": float(guidance_scale),
        "seed": int(seed),
        "generation_attempted": False,
        "generation_verified": False,
        "load_seconds": None,
        "generation_seconds": None,
        "total_seconds": None,
        "output_file": None,
        "output_exists": False,
        "output_bytes": 0,
        "png_signature_valid": False,
        "verified_dimensions": None,
        "output_sha256": None,
        "report_md_file": None,
        "error": None,
    }

    if not deps["ready"]:
        report["error"] = (
            f"Cannot verify model loading or image generation because dependencies are missing: "
            f"{', '.join(deps['missing'])}. Install with: {deps['install_command']}"
        )
        if report_md_path:
            md_path = Path(report_md_path)
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text(format_verification_report_md(report), encoding="utf-8")
            report["report_md_file"] = str(md_path)
        return report

    if not run_generation:
        if report_md_path:
            md_path = Path(report_md_path)
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text(format_verification_report_md(report), encoding="utf-8")
            report["report_md_file"] = str(md_path)
        return report

    report["generation_attempted"] = True
    target = Path(output_path) if output_path else (OUTPUTS_DIR / "runtime_verification_test.png")
    target.parent.mkdir(parents=True, exist_ok=True)

    t_start = time.perf_counter()
    try:
        gen = TechnicalIllustrationGenerator(model_id=model_id)
        t_load_start = time.perf_counter()
        gen.load_pipeline()
        report["load_seconds"] = round(time.perf_counter() - t_load_start, 2)
        report["torch_dtype"] = str(gen.dtype)

        t_gen_start = time.perf_counter()
        img = gen.generate(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=int(steps),
            guidance_scale=float(guidance_scale),
            width=int(width),
            height=int(height),
            seed=int(seed),
        )
        report["generation_seconds"] = round(time.perf_counter() - t_gen_start, 2)

        img.save(target, format="PNG")

        exists = target.exists() and target.is_file()
        file_size = target.stat().st_size if exists else 0
        raw_bytes = target.read_bytes() if exists else b""
        png_sig_valid = raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"

        if not exists or file_size <= 0 or not png_sig_valid:
            raise RuntimeError("Saved verification PNG is missing, empty, or has an invalid PNG header.")

        from PIL import Image

        with Image.open(target) as reopened:
            reopened.verify()
        with Image.open(target) as reopened_dims:
            verified_w, verified_h = reopened_dims.size

        report["output_file"] = str(target)
        report["output_exists"] = True
        report["output_bytes"] = file_size
        report["png_signature_valid"] = True
        report["verified_dimensions"] = f"{verified_w}x{verified_h}"
        report["output_sha256"] = hashlib.sha256(raw_bytes).hexdigest()
        report["total_seconds"] = round(time.perf_counter() - t_start, 2)
        report["generation_verified"] = True
    except Exception as exc:
        report["total_seconds"] = round(time.perf_counter() - t_start, 2)
        report["generation_verified"] = False
        report["error"] = str(exc)

    if report_md_path:
        md_path = Path(report_md_path)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(format_verification_report_md(report), encoding="utf-8")
        report["report_md_file"] = str(md_path)

    return report
