import type { ComponentMarker, LabelingConfig, VisualStyle } from '../types/project';

export interface CoordinateValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that normalized marker coordinates strictly fall within [0.0, 1.0].
 * Mirrors the validation contract in DevIllustrate-AI/labeler.py.
 */
export function validateCoordinates(x: number, y: number): CoordinateValidationResult {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { valid: false, error: 'Coordinates must be valid numbers between 0.00 and 1.00.' };
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return {
      valid: false,
      error: `Coordinates (${x.toFixed(2)}, ${y.toFixed(2)}) out of range. X and Y must be between 0.00 and 1.00.`,
    };
  }
  return { valid: true };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load base illustration image.'));
    img.src = src;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  if (!words.length || !words[0]) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Rasterizes an SVG string into a crisp high-resolution PNG Data URL.
 */
export async function rasterizeSvgToPng(
  svgMarkup: string,
  width: number,
  height: number
): Promise<string> {
  const normalizedSvg = svgMarkup.includes('xmlns=')
    ? svgMarkup
    : svgMarkup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');

  const blob = new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Cover/contain fit cleanly preserving 4:3 or 1:1 geometry
    const imgRatio = (img.naturalWidth || 1200) / (img.naturalHeight || 900);
    const canvasRatio = width / height;
    let drawW = width;
    let drawH = height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > canvasRatio) {
      drawH = width / imgRatio;
      offsetY = (height - drawH) / 2;
    } else {
      drawW = height * imgRatio;
      offsetX = (width - drawW) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Renders the Smart Labeled documentation graphic onto an HTML5 Canvas:
 * - Optional title & subtitle header banner
 * - Base technical illustration
 * - Validated numbered component markers (x, y in [0, 1]) with optional concise callout tags
 * - Structured, multi-column component legend below the image
 */
export async function renderLabeledIllustration(
  sourceImageUrl: string,
  components: ComponentMarker[],
  config: LabelingConfig,
  style: VisualStyle
): Promise<string> {
  const baseImg = await loadImage(sourceImageUrl);
  const imgW = Math.max(baseImg.naturalWidth || 1024, 960);
  const scale = imgW / (baseImg.naturalWidth || 1024);
  const imgH = Math.round((baseImg.naturalHeight || 768) * scale);

  const isBlueprint = style === 'Blueprint';
  const headerBg = isBlueprint ? '#0A1E34' : '#FFFFFF';
  const headerInk = isBlueprint ? '#F8FAFC' : '#0F172A';
  const headerSubInk = isBlueprint ? '#93C5FD' : '#475569';
  const borderHairline = isBlueprint ? '#1E3A5F' : '#E2E8F0';
  const legendBg = isBlueprint ? '#0B223B' : '#F8FAFC';
  const legendTitleInk = isBlueprint ? '#F8FAFC' : '#0F172A';
  const legendDescInk = isBlueprint ? '#CBD5E1' : '#475569';

  const padX = Math.round(imgW * 0.04);
  const headerHeight = config.showTitle
    ? config.subtitle.trim()
      ? 104
      : 76
    : 0;

  // Measure legend height accurately before allocating final canvas
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) throw new Error('Canvas 2D context unavailable.');

  const validComponents = components.filter((c) => validateCoordinates(c.x, c.y).valid);
  const columns = validComponents.length > 2 ? 2 : 1;
  const colGap = 32;
  const colWidth = (imgW - padX * 2 - (columns - 1) * colGap) / columns;

  const titleFontSize = Math.round(Math.max(22, Math.min(30, imgW * 0.025)));
  const subFontSize = Math.round(Math.max(13, Math.min(16, imgW * 0.0135)));
  const legendHeadingSize = 14;
  const itemNameSize = 15;
  const itemDescSize = 13;
  const descLineHeight = 19;

  interface MeasuredLegendRow {
    index: number;
    marker: ComponentMarker;
    descLines: string[];
    rowHeight: number;
  }

  measureCtx.font = `400 ${itemDescSize}px "DM Sans", system-ui, sans-serif`;
  const measuredItems: MeasuredLegendRow[] = validComponents.map((marker, idx) => {
    const descLines = wrapTextLines(
      measureCtx,
      marker.description || 'Component description not specified.',
      colWidth - 44
    );
    const rowHeight = Math.max(46, 26 + descLines.length * descLineHeight);
    return { index: idx + 1, marker, descLines, rowHeight };
  });

  // Pair rows across columns to compute exact legend panel height
  let legendContentHeight = 0;
  const rowsCount = Math.ceil(measuredItems.length / columns);
  const rowHeights: number[] = [];
  for (let r = 0; r < rowsCount; r++) {
    let maxRowH = 0;
    for (let c = 0; c < columns; c++) {
      const item = measuredItems[r * columns + c];
      if (item) {
        maxRowH = Math.max(maxRowH, item.rowHeight);
      }
    }
    rowHeights.push(maxRowH);
    legendContentHeight += maxRowH + 16;
  }

  const legendHeight =
    config.showLegend && validComponents.length > 0 ? 58 + legendContentHeight + 24 : 0;

  const totalHeight = headerHeight + imgH + legendHeight;
  const canvas = document.createElement('canvas');
  canvas.width = imgW;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // Base fill
  ctx.fillStyle = headerBg;
  ctx.fillRect(0, 0, imgW, totalHeight);

  // 1. Draw Title Banner
  if (config.showTitle) {
    ctx.fillStyle = headerBg;
    ctx.fillRect(0, 0, imgW, headerHeight);

    ctx.fillStyle = headerInk;
    ctx.font = `700 ${titleFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(config.title.trim() || 'Technical Documentation Diagram', padX, 22);

    if (config.subtitle.trim()) {
      ctx.fillStyle = headerSubInk;
      ctx.font = `400 ${subFontSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillText(config.subtitle.trim(), padX, 22 + titleFontSize + 10);
    }

    // Crisp hairline divider beneath header
    ctx.strokeStyle = borderHairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight - 0.5);
    ctx.lineTo(imgW, headerHeight - 0.5);
    ctx.stroke();
  }

  // 2. Draw Base Illustration
  ctx.drawImage(baseImg, 0, headerHeight, imgW, imgH);

  // 3. Draw Numbered Component Markers
  const radius = Math.round(Math.max(16, Math.min(22, imgW * 0.017)));
  validComponents.forEach((comp, idx) => {
    const num = String(idx + 1);
    const cx = comp.x * imgW;
    const cy = headerHeight + comp.y * imgH;

    // Optional subtle concise label tag next to marker
    if (config.showMarkerTags && comp.name.trim()) {
      ctx.save();
      ctx.font = `600 13px "DM Sans", system-ui, sans-serif`;
      const labelText = comp.name.trim();
      const textW = ctx.measureText(labelText).width;
      const boxW = textW + 18;
      const boxH = 26;
      const placeLeft = cx + radius + 10 + boxW > imgW - 14;
      const bx = placeLeft ? cx - radius - 8 - boxW : cx + radius + 8;
      const by = cy - boxH / 2;

      ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = isBlueprint ? 'rgba(10, 30, 52, 0.92)' : 'rgba(255, 255, 255, 0.94)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 6);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = isBlueprint ? 'rgba(125, 211, 252, 0.55)' : 'rgba(15, 23, 42, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isBlueprint ? '#F8FAFC' : '#0F172A';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(labelText, bx + 9, cy + 0.5);
      ctx.restore();
    }

    // Outer shadow + white halo ring for high contrast on any background
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.34)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = config.markerColor || '#1D4ED8';
    ctx.fill();

    // Marker number centered cleanly
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.round(radius * 0.92)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, cx, cy + 1);
    ctx.restore();
  });

  // 4. Draw Component Legend Panel Below Image
  if (legendHeight > 0) {
    const legendTop = headerHeight + imgH;
    ctx.fillStyle = legendBg;
    ctx.fillRect(0, legendTop, imgW, legendHeight);

    ctx.strokeStyle = borderHairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, legendTop + 0.5);
    ctx.lineTo(imgW, legendTop + 0.5);
    ctx.stroke();

    // Legend section title
    ctx.fillStyle = headerSubInk;
    ctx.font = `600 ${legendHeadingSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Component Legend', padX, legendTop + 20);

    // Subtle coordinate provenance note on right of legend header
    ctx.fillStyle = headerSubInk;
    ctx.font = `400 12px "DM Sans", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('Positions manually annotated (normalized 0.0–1.0)', imgW - padX, legendTop + 22);
    ctx.textAlign = 'left';

    let cursorY = legendTop + 56;
    for (let r = 0; r < rowsCount; r++) {
      for (let c = 0; c < columns; c++) {
        const item = measuredItems[r * columns + c];
        if (!item) continue;

        const colX = padX + c * (colWidth + colGap);
        const badgeR = 13;

        // Numbered legend circle
        ctx.beginPath();
        ctx.arc(colX + badgeR, cursorY + badgeR, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = config.markerColor || '#1D4ED8';
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 13px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item.index), colX + badgeR, cursorY + badgeR + 0.5);

        // Component Name
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = legendTitleInk;
        ctx.font = `600 ${itemNameSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.fillText(item.marker.name || `Component ${item.index}`, colX + 38, cursorY + 2);

        // Component Description lines
        ctx.fillStyle = legendDescInk;
        ctx.font = `400 ${itemDescSize}px "DM Sans", system-ui, sans-serif`;
        item.descLines.forEach((line, lineIdx) => {
          ctx.fillText(line, colX + 38, cursorY + 25 + lineIdx * descLineHeight);
        });
      }
      cursorY += rowHeights[r] + 16;
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Converts any image URL (local asset or data URL) into a PNG data URL
 * so Original PNG download and disk saving work seamlessly across presets.
 */
export async function imageUrlToPngDataUrl(sourceUrl: string): Promise<string> {
  if (sourceUrl.startsWith('data:image/png')) {
    return sourceUrl;
  }
  const img = await loadImage(sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 1024;
  canvas.height = img.naturalHeight || 768;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}
