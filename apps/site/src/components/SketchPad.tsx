import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react';

type Tool = 'pen' | 'eraser';
type Point = { x: number; y: number; pressure: number };
type Stroke = { color: string; width: number; tool: Tool; points: Point[] };
const PALETTE = [
  { label: 'Grafite', color: '#22231f' }, { label: 'Terracota', color: '#c65d45' },
  { label: 'Azul', color: '#527c91' }, { label: 'Verde', color: '#78885a' },
  { label: 'Ocre', color: '#c49a3a' }, { label: 'Violeta', color: '#8c719a' },
];
const WEIGHTS = [{ label: 'Fino', size: 2 }, { label: 'Médio', size: 4 }, { label: 'Grosso', size: 8 }];
const MAX_POINTS = 5000;

function widthAt(stroke: Stroke, pressure: number) {
  return stroke.width * (0.55 + Math.max(0.1, pressure) * 0.9);
}

function ToolGlyph({ kind }: { kind: Tool | 'clear' }) {
  if (kind === 'clear') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
  if (kind === 'pen') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1L19 8a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" /><path d="m14.8 6.5 3 3" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 15 8.8-9a2 2 0 0 1 2.9 0l4.1 4.2a2 2 0 0 1 0 2.8L13 20H8l-4-4a.7.7 0 0 1 0-1Z" /><path d="m8 20 8-8" /></svg>;
}

export default function SketchPad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const bounds = useRef<DOMRect | null>(null);
  const [color, setColor] = useState(PALETTE[0].color);
  const [weight, setWeight] = useState(4);
  const [tool, setTool] = useState<Tool>('pen');

  const renderStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) => {
    if (!stroke.points.length) return;
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, widthAt(stroke, p.pressure) / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      for (let i = 1; i < stroke.points.length; i += 1) {
        const a = stroke.points[i - 1]; const b = stroke.points[i];
        ctx.lineWidth = widthAt(stroke, (a.pressure + b.pressure) / 2);
        ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    strokes.current.forEach((stroke) => renderStroke(ctx, stroke, w, h));
    if (drawing.current) renderStroke(ctx, drawing.current, w, h);
  }, [renderStroke]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelW = Math.round(width * ratio); const pixelH = Math.round(height * ratio);
    if (canvas.width !== pixelW || canvas.height !== pixelH) { canvas.width = pixelW; canvas.height = pixelH; }
    canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    addEventListener('resize', resize);
    resize();
    return () => { observer.disconnect(); removeEventListener('resize', resize); };
  }, [resize]);

  function point(x: number, y: number, pressure: number, rect: DOMRect): Point {
    return { x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (y - rect.top) / rect.height)), pressure: pressure || 0.5 };
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    bounds.current = rect; pointer.current = event.pointerId;
    drawing.current = { color, width: weight, tool, points: [point(event.clientX, event.clientY, event.pressure, rect)] };
    const ctx = event.currentTarget.getContext('2d');
    if (ctx && drawing.current) renderStroke(ctx, drawing.current, event.currentTarget.clientWidth, event.currentTarget.clientHeight);
  }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = drawing.current; const rect = bounds.current;
    if (!stroke || !rect || pointer.current !== event.pointerId) return;
    event.preventDefault();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const ctx = event.currentTarget.getContext('2d');
    for (const sample of samples) {
      const next = point(sample.clientX, sample.clientY, sample.pressure, rect);
      const previous = stroke.points[stroke.points.length - 1];
      if (stroke.points.length < MAX_POINTS) stroke.points.push(next);
      if (ctx) renderStroke(ctx, { ...stroke, points: [previous, next] }, event.currentTarget.clientWidth, event.currentTarget.clientHeight);
    }
  }
  function finish(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (event && pointer.current !== event.pointerId) return;
    if (drawing.current) strokes.current.push(drawing.current);
    drawing.current = null; pointer.current = null; bounds.current = null;
  }
  function clear() { drawing.current = null; pointer.current = null; bounds.current = null; strokes.current = []; redraw(); }

  return (
    <section className="sketch-section" aria-label="Folha para desenhar">
      <div className="sketch-toolbar" role="group" aria-label="Ferramentas de desenho">
        <div className="sketch-tool-switch" role="group" aria-label="Ferramenta">
          {(['pen', 'eraser'] as const).map((item) => <button className={`sketch-tool-button${tool === item ? ' is-selected' : ''}`} key={item} type="button" aria-label={item === 'pen' ? 'Caneta' : 'Borracha'} aria-pressed={tool === item} title={item === 'pen' ? 'Caneta' : 'Borracha'} onClick={() => setTool(item)}><ToolGlyph kind={item} /></button>)}
        </div>
        <span className="sketch-toolbar-divider" aria-hidden="true" />
        <div className="sketch-palette" role="group" aria-label="Cor do traço">
          {PALETTE.map((swatch) => <button className={`sketch-swatch${color === swatch.color ? ' is-selected' : ''}`} key={swatch.color} type="button" style={{ '--swatch': swatch.color } as CSSProperties} aria-label={`${swatch.label}${color === swatch.color ? ', selecionada' : ''}`} aria-pressed={color === swatch.color} title={swatch.label} onClick={() => { setColor(swatch.color); setTool('pen'); }} />)}
        </div>
        <span className="sketch-toolbar-divider sketch-size-divider" aria-hidden="true" />
        <div className="sketch-size-options" role="group" aria-label="Espessura do traço">
          {WEIGHTS.map((option) => <button className={`sketch-size${weight === option.size ? ' is-selected' : ''}`} key={option.size} type="button" aria-label={`Traço ${option.label.toLowerCase()}`} aria-pressed={weight === option.size} title={`Traço ${option.label.toLowerCase()}`} onClick={() => setWeight(option.size)}><span style={{ width: option.size * 1.7, height: option.size * 1.7 }} /></button>)}
        </div>
        <span className="sketch-toolbar-divider sketch-clear-divider" aria-hidden="true" />
        <button className="sketch-tool-button sketch-clear-button" type="button" aria-label="Apagar tudo" title="Apagar tudo" onClick={clear}><ToolGlyph kind="clear" /></button>
      </div>
      <p className="sketch-hint" aria-hidden="true">Toque e arraste, solte quando terminar</p>
      <canvas ref={canvasRef} className="sketch-canvas" aria-label="Folha de desenho em branco. Use mouse, toque ou caneta para desenhar." tabIndex={0} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onContextMenu={(event) => event.preventDefault()}>Canvas indisponível neste navegador.</canvas>
    </section>
  );
}
