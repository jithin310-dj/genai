/**
 * Triggers a clean browser PNG download from any Data URL.
 */
export function downloadDataUrlAsPng(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
