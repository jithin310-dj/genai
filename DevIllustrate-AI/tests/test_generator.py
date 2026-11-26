"""
test_generator.py - Unit tests for DevIllustrate-AI/generator.py.
Verifies CUDA, Apple MPS, and CPU device selection, missing dependency handling,
input validation, error message formatting, and pipeline loading logic using mocks.
Note: Does NOT claim live GPU Stable Diffusion image generation; live GPU execution
must be verified via `python DevIllustrate-AI/verify_runtime.py --run-generation`.
"""

from __future__ import annotations

import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

APP_DIR = Path(__file__).resolve().parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import generator


def _make_fake_torch(*, cuda: bool = False, mps: bool = False):
    """Build a minimal fake torch module to verify device & dtype selection paths."""
    fake_torch = types.ModuleType("torch")
    fake_torch.__version__ = "2.5.0-mock"
    fake_torch.float16 = "torch.float16"
    fake_torch.float32 = "torch.float32"

    cuda_ns = types.SimpleNamespace(
        is_available=lambda: cuda,
        get_device_name=lambda idx: "Tesla T4",
        get_device_properties=lambda idx: types.SimpleNamespace(total_memory=16 * (1024**3)),
        empty_cache=mock.MagicMock(),
    )
    mps_ns = types.SimpleNamespace(is_available=lambda: mps)
    fake_torch.cuda = cuda_ns
    fake_torch.backends = types.SimpleNamespace(mps=mps_ns)

    class _FakeGenerator:
        def __init__(self, device="cpu"):
            self.device = device
            self.seed = None

        def manual_seed(self, seed: int):
            self.seed = seed
            return self

    class _NoOpCtx:
        def __enter__(self):
            return None

        def __exit__(self, *args):
            return False

    fake_torch.Generator = _FakeGenerator
    fake_torch.inference_mode = lambda: _NoOpCtx()
    return fake_torch


class GeneratorRuntimeTests(unittest.TestCase):
    def test_cuda_device_selection_uses_float16(self):
        fake_torch = _make_fake_torch(cuda=True, mps=False)
        device, dtype, label, detail = generator.detect_compute_device(fake_torch)
        self.assertEqual(device, "cuda")
        self.assertEqual(dtype, fake_torch.float16)
        self.assertEqual(label, "CUDA GPU")
        self.assertIn("Tesla T4", detail)
        self.assertIn("16.0 GB VRAM", detail)

    def test_mps_device_selection_defaults_to_nan_safe_float32(self):
        fake_torch = _make_fake_torch(cuda=False, mps=True)
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SD_MPS_FP16", None)
            device, dtype, label, detail = generator.detect_compute_device(fake_torch)
        self.assertEqual(device, "mps")
        self.assertEqual(dtype, fake_torch.float32)
        self.assertEqual(label, "Apple MPS")
        self.assertIn("float32", detail)

    def test_cpu_fallback_uses_float32(self):
        fake_torch = _make_fake_torch(cuda=False, mps=False)
        device, dtype, label, detail = generator.detect_compute_device(fake_torch)
        self.assertEqual(device, "cpu")
        self.assertEqual(dtype, fake_torch.float32)
        self.assertEqual(label, "CPU")
        self.assertIn("Google Colab", detail)

    def test_missing_dependencies_raises_clear_error(self):
        gen = generator.TechnicalIllustrationGenerator()
        with mock.patch.object(
            generator,
            "check_dependencies",
            return_value={
                "ready": False,
                "installed": {},
                "missing": ["torch>=2.1.0", "diffusers>=0.27.2"],
                "install_command": "pip install -r DevIllustrate-AI/requirements.txt",
            },
        ):
            with self.assertRaises(RuntimeError) as ctx:
                gen.load_pipeline()
        self.assertIn("torch>=2.1.0", str(ctx.exception))
        self.assertIn("pip install -r DevIllustrate-AI/requirements.txt", str(ctx.exception))

    def test_validation_rejects_empty_prompt_and_bad_dimensions(self):
        gen = generator.TechnicalIllustrationGenerator()
        with self.assertRaises(ValueError):
            gen.generate(prompt="   ")
        with self.assertRaises(ValueError):
            gen.generate(prompt="Cloud architecture", width=500, height=512)
        with self.assertRaises(ValueError):
            gen.generate(prompt="Cloud architecture", num_inference_steps=0)
        with self.assertRaises(ValueError):
            gen.generate(prompt="Cloud architecture", guidance_scale=45.0)

    def test_format_load_errors_are_actionable(self):
        gated_msg = generator._format_load_error(
            "stabilityai/stable-diffusion-3.5-large",
            "cuda",
            RuntimeError("401 Client Error: Gated repo"),
        )
        self.assertIn("HF_TOKEN", gated_msg)

        oom_msg = generator._format_load_error(
            "runwayml/stable-diffusion-v1-5",
            "cuda",
            RuntimeError("CUDA out of memory"),
        )
        self.assertIn("SD_CPU_OFFLOAD=1", oom_msg)

    def test_verify_runtime_never_claims_generation_without_dependencies(self):
        with mock.patch.object(
            generator,
            "check_dependencies",
            return_value={
                "ready": False,
                "installed": {},
                "missing": ["torch>=2.1.0"],
                "install_command": "pip install -r DevIllustrate-AI/requirements.txt",
            },
        ):
            report = generator.verify_runtime(run_generation=True)
        self.assertFalse(report["dependencies_ready"])
        self.assertFalse(report["generation_verified"])
        self.assertIsNotNone(report["error"])


if __name__ == "__main__":
    unittest.main()
