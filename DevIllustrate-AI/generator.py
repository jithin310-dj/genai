"""
generator.py - Stable Diffusion image generator powered by PyTorch & Hugging Face Diffusers.
Automatically selects CUDA GPU (float16) when available (e.g., Google Colab T4),
with graceful CPU (float32) fallback, VRAM optimizations, deterministic seeding,
and clear beginner-friendly error handling.
"""

from __future__ import annotations

from typing import Optional, Tuple

from config import DEFAULT_MODEL_ID


def get_runtime_info() -> Tuple[str, str]:
    """Inspect PyTorch hardware availability without failing if torch is absent."""
    try:
        import torch
    except ImportError:
        return "Unavailable", "PyTorch is not installed. Run: pip install -r requirements.txt"

    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        return "CUDA GPU", f"{gpu_name} ({vram_gb:.1f} GB VRAM)"

    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "Apple MPS", "Apple Silicon Metal GPU"

    return "CPU", "Running on CPU (generation is slower; enable T4 GPU in Google Colab for speed)"


class TechnicalIllustrationGenerator:
    """Wraps Hugging Face StableDiffusionPipeline for reproducible technical graphics."""

    def __init__(self, model_id: str = DEFAULT_MODEL_ID) -> None:
        self.model_id = model_id
        self.device: str = "cpu"
        self.pipeline = None

    def load_pipeline(self) -> None:
        """Load the Stable Diffusion pipeline once into memory with VRAM optimizations."""
        if self.pipeline is not None:
            return

        try:
            import torch
            from diffusers import DPMSolverMultistepScheduler, StableDiffusionPipeline
        except ImportError as exc:
            raise RuntimeError(
                "Missing ML dependencies (torch / diffusers). Install them with:\n"
                "pip install -r requirements.txt"
            ) from exc

        if torch.cuda.is_available():
            self.device = "cuda"
            dtype = torch.float16
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            self.device = "mps"
            dtype = torch.float16
        else:
            self.device = "cpu"
            dtype = torch.float32

        try:
            pipe = StableDiffusionPipeline.from_pretrained(
                self.model_id,
                torch_dtype=dtype,
                safety_checker=None,
            )
            # DPM-Solver++ delivers crisp technical structures in 20–35 steps
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
            pipe = pipe.to(self.device)

            # Reduce peak VRAM usage for Google Colab T4 GPUs
            pipe.enable_attention_slicing()
            if hasattr(pipe, "enable_vae_slicing"):
                pipe.enable_vae_slicing()

            self.pipeline = pipe
        except Exception as exc:
            raise RuntimeError(
                f"Could not load Stable Diffusion model '{self.model_id}' on {self.device}: {exc}"
            ) from exc

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
        Generate a PIL Image from an enhanced technical prompt and generation parameters.
        """
        if not prompt or not prompt.strip():
            raise ValueError("Prompt cannot be empty.")

        width = int(width)
        height = int(height)
        if width <= 0 or height <= 0 or width % 8 != 0 or height % 8 != 0:
            raise ValueError(
                f"Invalid resolution {width}x{height}. Width and height must be positive multiples of 8."
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
                    prompt=prompt.strip(),
                    negative_prompt=negative_prompt.strip() or None,
                    num_inference_steps=int(num_inference_steps),
                    guidance_scale=float(guidance_scale),
                    width=width,
                    height=height,
                    generator=torch_gen,
                )
            return output.images[0]
        except Exception as exc:
            if torch.cuda.is_available() and "out of memory" in str(exc).lower():
                torch.cuda.empty_cache()
                raise RuntimeError(
                    "CUDA GPU ran out of memory. Reduce resolution to 512×512 or steps to 25 and retry."
                ) from exc
            raise RuntimeError(f"Stable Diffusion generation failed: {exc}") from exc
