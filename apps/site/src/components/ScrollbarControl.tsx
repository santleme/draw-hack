import { useState } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';

export default function ScrollbarControl() {
  const { scrollYProgress } = useScroll();
  const [percent, setPercent] = useState(0);
  const thumbY = useTransform(scrollYProgress, [0, 1], [0, 48]);
  useMotionValueEvent(scrollYProgress, 'change', (value) => setPercent(Math.round(value * 100)));

  function seek(y: number, rail: HTMLDivElement) {
    const bounds = rail.getBoundingClientRect();
    const height = bounds.height - 32;
    const ratio = Math.max(0, Math.min(1, (y - bounds.top - 16) / height));
    const thumbRatio = 48 / height;
    const position = Math.max(0, Math.min(1, (ratio - thumbRatio / 2) / (1 - thumbRatio)));
    window.scrollTo({ top: position * (document.documentElement.scrollHeight - innerHeight), behavior: 'auto' });
  }

  function keyboard(key: string) {
    const offset: Record<string, number> = { ArrowDown: 5, PageDown: 20, ArrowUp: -5, PageUp: -20, Home: -100, End: 100 };
    if (!(key in offset)) return;
    const next = Math.max(0, Math.min(100, percent + offset[key]));
    window.scrollTo({ top: (next / 100) * (document.documentElement.scrollHeight - innerHeight), behavior: 'auto' });
  }

  return (
    <div
      className="scrollbar-control"
      role="scrollbar"
      aria-label="Barra de rolagem da página"
      aria-controls="page-content"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seek(event.clientY, event.currentTarget);
      }}
      onPointerMove={(event) => { if (event.buttons === 1) seek(event.clientY, event.currentTarget); }}
      onKeyDown={(event) => {
        if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          keyboard(event.key);
        }
      }}
    >
      <span className="scrollbar-track" aria-hidden="true" />
      <motion.span className="scrollbar-thumb" style={{ y: thumbY }} aria-hidden="true" />
    </div>
  );
}
