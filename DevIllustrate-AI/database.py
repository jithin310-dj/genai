"""
database.py - SQLite persistence layer for DevIllustrate AI outputs history.
Upgrades the Express JSON file index (outputs/index.json) to an ACID-safe SQLite
database (outputs/devillustrate.db) with search, style filtering, and clean
deletion of both database metadata and PNG files on disk.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import DB_PATH, OUTPUTS_DIR, ensure_directories
from utils.helpers import slugify


class OutputDatabase:
    """Manages archived original & smart-labeled technical graphics in SQLite."""

    def __init__(self, db_path: Path = DB_PATH, outputs_dir: Path = OUTPUTS_DIR) -> None:
        self.db_path = Path(db_path)
        self.outputs_dir = Path(outputs_dir)
        ensure_directories()
        self.outputs_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS outputs (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    subtitle TEXT NOT NULL DEFAULT '',
                    prompt TEXT NOT NULL,
                    enhanced_prompt TEXT NOT NULL DEFAULT '',
                    negative_prompt TEXT NOT NULL DEFAULT '',
                    style TEXT NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    steps INTEGER NOT NULL,
                    guidance_scale REAL NOT NULL,
                    seed INTEGER NOT NULL,
                    marker_color TEXT NOT NULL DEFAULT '#1D4ED8',
                    original_path TEXT NOT NULL,
                    labeled_path TEXT NOT NULL,
                    components_json TEXT NOT NULL DEFAULT '[]',
                    component_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_outputs_created_at ON outputs (created_at DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_outputs_style ON outputs (style)"
            )
            conn.commit()

    def save_output(
        self,
        *,
        title: str,
        subtitle: str,
        prompt: str,
        enhanced_prompt: str,
        negative_prompt: str,
        style: str,
        width: int,
        height: int,
        steps: int,
        guidance_scale: float,
        seed: int,
        marker_color: str,
        original_png_bytes: bytes,
        labeled_png_bytes: bytes,
        components: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Write both PNG files to outputs/ and insert metadata into SQLite."""
        record_id = f"diagram_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"
        slug = slugify(title, fallback="diagram")

        orig_filename = f"{slug}_{record_id}_original.png"
        labeled_filename = f"{slug}_{record_id}_labeled.png"

        orig_path = self.outputs_dir / orig_filename
        labeled_path = self.outputs_dir / labeled_filename

        orig_path.write_bytes(original_png_bytes)
        labeled_path.write_bytes(labeled_png_bytes)

        created_at = datetime.now(timezone.utc).isoformat()
        components_json = json.dumps(components)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO outputs (
                    id, title, subtitle, prompt, enhanced_prompt, negative_prompt,
                    style, width, height, steps, guidance_scale, seed, marker_color,
                    original_path, labeled_path, components_json, component_count, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    title.strip() or "Technical Architecture Diagram",
                    subtitle.strip(),
                    prompt.strip(),
                    enhanced_prompt.strip(),
                    negative_prompt.strip(),
                    style,
                    int(width),
                    int(height),
                    int(steps),
                    float(guidance_scale),
                    int(seed),
                    marker_color,
                    str(orig_path),
                    str(labeled_path),
                    components_json,
                    len(components),
                    created_at,
                ),
            )
            conn.commit()

        record = self.get_output(record_id)
        if record is None:
            raise RuntimeError("Failed to retrieve saved output record after insert.")
        return record

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        data = dict(row)
        try:
            data["components"] = json.loads(data.pop("components_json", "[]"))
        except json.JSONDecodeError:
            data["components"] = []
        return data

    def get_output(self, record_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single output record by ID."""
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM outputs WHERE id = ?", (record_id,)).fetchone()
        return self._row_to_dict(row) if row else None

    def list_outputs(
        self,
        *,
        search: str = "",
        style: str = "All",
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """List archived outputs filtered by optional search query and visual style."""
        clauses: List[str] = []
        params: List[Any] = []

        if style and style != "All":
            clauses.append("style = ?")
            params.append(style)

        if search.strip():
            like_term = f"%{search.strip().lower()}%"
            clauses.append(
                "(LOWER(title) LIKE ? OR LOWER(prompt) LIKE ? OR LOWER(style) LIKE ?)"
            )
            params.extend([like_term, like_term, like_term])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT * FROM outputs {where_sql} ORDER BY created_at DESC LIMIT ?"
        params.append(int(limit))

        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def delete_output(self, record_id: str) -> bool:
        """Delete an output record and safely remove its PNG files inside outputs/."""
        existing = self.get_output(record_id)
        if not existing:
            return False

        # Safe path containment check so deletion never escapes outputs_dir
        resolved_out = self.outputs_dir.resolve()
        for key in ("original_path", "labeled_path"):
            raw_path = existing.get(key)
            if not raw_path:
                continue
            target = Path(raw_path).resolve()
            if resolved_out in target.parents and target.exists():
                target.unlink()

        with self._connect() as conn:
            conn.execute("DELETE FROM outputs WHERE id = ?", (record_id,))
            conn.commit()
        return True
