import { useEffect, useRef } from 'react';

const glyphs = Array.from('$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ');
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const luminance = (red: number, green: number, blue: number) => {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(red) * 0.2126 + channel(green) * 0.7152 + channel(blue) * 0.0722;
};
const pulse = (seconds: number, begins: number, duration: number, every: number) => {
  const phase = ((seconds - begins) % every + every) % every;
  if (seconds < begins || phase > duration) return 0;
  return smooth(0, 0.12, phase) * (1 - smooth(duration - 0.12, duration, phase));
};

export default function VisionAsciiPortrait() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const out = canvas?.getContext('2d');
    if (!canvas || !host || !out) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const open = new Image(); const shut = new Image();
    open.src = '/images/vision/sailor-moon-eyes-open.png';
    shut.src = '/images/vision/sailor-moon-eyes-closed.png';
    const source = document.createElement('canvas');
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) return;
    const glyphCanvas = document.createElement('canvas');
    glyphCanvas.width = 32; glyphCanvas.height = 32;
    const glyphCtx = glyphCanvas.getContext('2d', { willReadFrequently: true });
    if (!glyphCtx) return;
    let ranked: Array<{ character: string; density: number }> = [];
    let openPixels: Uint8ClampedArray | null = null;
    let shutPixels: Uint8ClampedArray | null = null;
    let columns = 0; let rows = 0; let cellWidth = 0; let cellHeight = 0; let fontSize = 0;
    let paper = [247, 247, 244]; let ink = '#22231f'; let muted = '#777870';
    let start = performance.now(); let last = 0; let frame = 0; let visible = true; let disposed = false;

    const palette = () => {
      const style = getComputedStyle(host);
      ink = style.getPropertyValue('--ink').trim() || '#22231f';
      muted = style.getPropertyValue('--muted').trim() || '#777870';
      const value = style.getPropertyValue('--paper').trim();
      const hex = value.match(/^#([\da-f]{6})$/i)?.[1];
      const match = value.match(/\d+/g);
      paper = hex ? [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
        : match ? match.slice(0, 3).map(Number) : [247, 247, 244];
    };
    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      fontSize = Math.max(6, Math.min(10, rect.width * 0.02));
      out.font = `${fontSize}px "DM Mono", monospace`;
      cellWidth = out.measureText('M').width;
      cellHeight = fontSize * 1.12;
      glyphCtx.font = `${fontSize}px "DM Mono", monospace`;
      glyphCtx.textBaseline = 'top';
      ranked = glyphs.map((character) => {
        glyphCtx.clearRect(0, 0, 32, 32);
        glyphCtx.fillStyle = '#000'; glyphCtx.fillText(character, 0, 0);
        const pixels = glyphCtx.getImageData(0, 0, 32, 32).data;
        let density = 0;
        for (let i = 3; i < pixels.length; i += 4) density += pixels[i] / 255;
        return { character, density: density / (pixels.length / 4) };
      }).sort((a, b) => a.density - b.density);
      columns = Math.floor(rect.width / cellWidth);
      const aspect = open.naturalWidth && open.naturalHeight ? open.naturalWidth / open.naturalHeight : 1.09;
      rows = Math.max(1, Math.round(rect.width / (aspect * cellHeight)));
      canvas.style.height = `${rows * cellHeight}px`;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rows * cellHeight * ratio);
      out.setTransform(ratio, 0, 0, ratio, 0, 0);
      out.font = `${fontSize}px "DM Mono", monospace`;
      out.textBaseline = 'top';
      source.width = columns; source.height = rows;
      if (open.complete && shut.complete && open.naturalWidth && shut.naturalWidth) {
        sourceCtx.clearRect(0, 0, columns, rows); sourceCtx.drawImage(open, 0, 0, columns, rows);
        openPixels = sourceCtx.getImageData(0, 0, columns, rows).data;
        sourceCtx.clearRect(0, 0, columns, rows); sourceCtx.drawImage(shut, 0, 0, columns, rows);
        shutPixels = sourceCtx.getImageData(0, 0, columns, rows).data;
      }
    };
    const update = (time: number) => {
      frame = 0;
      if (!openPixels || !shutPixels || disposed) return;
      if (!reduced.matches && time - last < 45) { frame = requestAnimationFrame(update); return; }
      last = time;
      const elapsed = (time - start) / 1000;
      const opening = reduced.matches ? 1 : smooth(0, 1, (elapsed - 0.35) / 1.05);
      const blink = reduced.matches ? 0 : pulse(elapsed, 2.8, 0.34, 5.4);
      const wink = reduced.matches ? 0 : pulse(elapsed, 4.2, 0.58, 8.2);
      const waveOn = reduced.matches ? 0 : smooth(1.1, 2.5, elapsed);
      out.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      out.font = `${fontSize}px "DM Mono", monospace`; out.textBaseline = 'top';
      const lightPaper = paper[0] > 130;
      let previous = '';
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          const x = (col + 0.5) / columns; const y = (row + 0.5) / rows;
          const side = x < 0.5 ? -1 : 1;
          const hairZone = Math.max(1 - smooth(0.16, 0.39, x), smooth(0.61, 0.84, x)) * smooth(0.34, 0.53, y) * (1 - smooth(0.94, 1, y));
          const wave = Math.sin(elapsed * 0.78 - y * 17 + side * 0.6) * 0.5 + Math.sin(elapsed * 1.13 - y * 29 - side * 0.9) * 0.3 + Math.sin(elapsed * 0.49 - y * 9 + side * 1.8) * 0.2;
          const shifted = Math.max(0, Math.min(columns - 1, Math.round(col + wave * hairZone * waveOn * columns * 0.03)));
          const index = (row * columns + shifted) * 4;
          const eyeL = Math.hypot((x - 0.416) / 0.052, (y - 0.432) / 0.067) < 1.05;
          const eyeR = Math.hypot((x - 0.579) / 0.052, (y - 0.432) / 0.067) < 1.05;
          const closeL = eyeL ? Math.max(1 - opening, blink, wink) : 0;
          const closeR = eyeR ? Math.max(1 - opening, blink) : 0;
          const mix = Math.max(closeL, closeR);
          const rgba = [0, 1, 2, 3].map((channel) => shutPixels![index + channel] * mix + openPixels![index + channel] * (1 - mix));
          const mask = smooth(0.77, 1, y);
          const taper = 1 - mask * smooth(0.35, 0.49, Math.abs(x - 0.5));
          const alpha = rgba[3] / 255 * taper * (1 - smooth(0.985, 1, y));
          if (alpha < 0.035) continue;
          const r = rgba[0]; const g = rgba[1]; const b = rgba[2];
          const lum = luminance(r, g, b);
          const shade = (lightPaper ? 1 - lum : lum) * alpha;
          const goldHair = r > g * 1.08 && g > b * 1.25;
          const blueEye = b > r * 1.1 && b > g * 1.08;
          const warmSkin = r > g * 1.06 && g > b * 1.04 && !goldHair;
          const eyeDetail = x > 0.36 && x < 0.64 && y > 0.36 && y < 0.55;
          let color = shade > 0.4 ? ink : muted;
          if (blueEye && eyeDetail) color = lightPaper ? 'rgb(42, 83, 142)' : 'rgb(136, 181, 241)';
          else if (blueEye) color = lightPaper ? muted : `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
          else if (lum < 0.16) color = ink;
          else if (goldHair && lightPaper) color = `rgb(${Math.round(r * 0.68)},${Math.round(g * 0.68)},${Math.round(b * 0.68)})`;
          else if (warmSkin && lightPaper) color = muted;
          else if (lightPaper && lum > 0.88) color = muted;
          else color = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
          let density = shade;
          if (eyeDetail && blueEye) density = Math.max(density, 0.62);
          let lo = 0; let hi = ranked.length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (ranked[mid].density < density) lo = mid + 1; else hi = mid;
          }
          const lowSide = ranked[Math.max(0, lo - 1)]; const highSide = ranked[lo];
          const character = Math.abs(lowSide.density - density) < Math.abs(highSide.density - density) ? lowSide.character : highSide.character;
          if (color !== previous) { out.fillStyle = color; previous = color; }
          out.fillText(character, col * cellWidth, row * cellHeight);
        }
      }
      if (!reduced.matches) frame = requestAnimationFrame(update);
    };
    const begin = () => {
      if (disposed) return;
      palette(); layout(); start = performance.now();
      if (visible && !reduced.matches) frame = requestAnimationFrame(update);
      else update(start + 50);
    };
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame && !reduced.matches) frame = requestAnimationFrame(update);
      if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
    }, { threshold: 0.01 });
    intersection.observe(host);
    const resize = new ResizeObserver(() => { layout(); if (!frame && visible && !reduced.matches) frame = requestAnimationFrame(update); else if (reduced.matches) update(performance.now()); });
    resize.observe(host);
    const theme = new MutationObserver(() => { palette(); if (reduced.matches) update(performance.now()); });
    theme.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const motion = () => { cancelAnimationFrame(frame); frame = 0; start = performance.now(); if (reduced.matches) update(start + 50); else if (visible) frame = requestAnimationFrame(update); };
    reduced.addEventListener('change', motion);
    void Promise.all([document.fonts.ready, open.decode(), shut.decode()]).then(begin).catch(() => undefined);
    return () => { disposed = true; cancelAnimationFrame(frame); intersection.disconnect(); resize.disconnect(); theme.disconnect(); reduced.removeEventListener('change', motion); };
  }, []);

  return <div className="vision-portrait" role="img" aria-label="Retrato em ASCII da Sailor Moon; ela abre e pisca os olhos, dá uma piscadela, e as mechas do cabelo se movem."><canvas ref={canvasRef} className="vision-portrait-canvas" aria-hidden="true" /></div>;
}
