import { useEffect, useRef, useState } from 'react';
import {
  motion, useMotionTemplate, useMotionValueEvent, useReducedMotion, useScroll, useTransform,
} from 'motion/react';
import { Link, useLocation } from 'react-router-dom';

const SHRINK_RANGE = 180;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const compactSize = () => matchMedia('(max-width: 640px)').matches ? 22 : 26;
const initialSize = () => matchMedia('(max-width: 640px)').matches
  ? Math.max(92, Math.min(innerWidth * 0.24, 148))
  : Math.max(112, Math.min(innerWidth * 0.19, 224));
const savedTheme = () => {
  try { return localStorage.getItem('draw-theme') === 'dark'; } catch { return false; }
};

export default function SiteHeader({ onRepeatProduct }: { onRepeatProduct: () => void }) {
  const location = useLocation();
  const home = location.pathname === '/';
  const vision = location.pathname === '/vision';
  const product = location.pathname === '/product';
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(!home);
  const [dark, setDark] = useState(savedTheme);
  const [brandHover, setBrandHover] = useState(false);
  const [cardHover, setCardHover] = useState(false);
  const [brandFocus, setBrandFocus] = useState(false);
  const [cameraHover, setCameraHover] = useState(false);
  const [cameraCardHover, setCameraCardHover] = useState(false);
  const [cameraFocus, setCameraFocus] = useState(false);
  const [cameraPinned, setCameraPinned] = useState(false);
  const [, setViewport] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraArea = useRef<HTMLDivElement>(null);
  const cameraCard = home && !scrolled && (cameraHover || cameraCardHover || cameraFocus || cameraPinned);
  const definitionCard = (brandHover || cardHover || brandFocus) && !cameraCard;

  const progress = useTransform(scrollY, (y) => home ? (reduced ? 0 : clamp(y / SHRINK_RANGE)) : 1);
  const fontScale = useTransform(progress, (value) => 1 + (compactSize() / initialSize() - 1) * value);
  const invertScale = useTransform(() => 1 / fontScale.get());
  const fontHeight = () => initialSize() * 0.83;
  const logoY = useTransform(progress, (value) => {
    const height = fontHeight();
    const scale = 1 + (compactSize() / initialSize() - 1) * value;
    const atCenter = -height / 2;
    const atTop = 18 + height * scale / 2 - height / 2 - innerHeight / 2;
    return atCenter + (atTop - atCenter) * value;
  });
  const navMax = useTransform(progress, [0, 1], [1440, 1160]);
  const navGutter = useTransform(progress, (p) => (innerWidth <= 640 ? 16 : 64) * p);
  const navWidth = useMotionTemplate`min(calc(100% - ${navGutter}px), ${navMax}px)`;
  const navHeight = useTransform(progress, (p) => {
    const mobile = innerWidth <= 640;
    return (mobile ? 44 : 56) + ((mobile ? 38 : 44) - (mobile ? 44 : 56)) * p;
  });
  const navPadding = useTransform(progress, (p) => {
    const mobile = innerWidth <= 640;
    const large = mobile ? 18 : Math.max(22, Math.min(innerWidth * 0.052, 70));
    const small = mobile ? 12 : Math.max(16, Math.min(innerWidth * 0.02, 28));
    return large + (small - large) * p;
  });
  const productOpacity = useTransform(progress, [0.62, 0.94], [0, 1]);
  const glass = useTransform(progress, [0, 0.22], [0, 44]);
  const border = useTransform(progress, [0, 0.18], [0, 11]);
  const blur = useTransform(progress, [0, 0.2], [0, 28]);
  const webcamOpacity = useTransform(progress, [0, 0.14], [1, 0]);
  const navColor = useMotionTemplate`color-mix(in srgb, var(--paper) ${glass}%, transparent)`;
  const navBorder = useMotionTemplate`color-mix(in srgb, var(--ink) ${border}%, transparent)`;
  const navBlur = useMotionTemplate`blur(${blur}px) saturate(138%)`;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeLater = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setBrandHover(false); setCardHover(false); setCameraHover(false); setCameraCardHover(false);
    }, 160);
  };

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(!home || y > 8));
  useEffect(() => {
    setScrolled(!home);
    setBrandHover(false); setCardHover(false); setBrandFocus(false);
    setCameraHover(false); setCameraCardHover(false); setCameraFocus(false); setCameraPinned(false);
  }, [home, location.pathname]);
  useEffect(() => {
    const resize = () => setViewport((value) => value + 1);
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (scrolled) { setCameraHover(false); setCameraCardHover(false); setCameraFocus(false); setCameraPinned(false); }
  }, [scrolled]);
  useEffect(() => {
    if (!cameraPinned) return;
    const outside = (event: PointerEvent) => {
      if (!cameraArea.current?.contains(event.target as Node)) setCameraPinned(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [cameraPinned]);
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1c19' : '#f7f7f4');
    try { localStorage.setItem('draw-theme', dark ? 'dark' : 'light'); } catch { /* storage is optional */ }
  }, [dark]);
  useEffect(() => () => cancelClose(), []);
  useEffect(() => {
    if (!definitionCard && !cameraCard) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setBrandHover(false); setBrandFocus(false); setCameraHover(false);
      setCameraCardHover(false); setCameraFocus(false); setCameraPinned(false);
    };
    addEventListener('keydown', escape);
    return () => removeEventListener('keydown', escape);
  }, [definitionCard, cameraCard]);

  const cardMotion = (open: boolean) => ({
    initial: false as const,
    animate: open ? 'visible' : 'hidden',
    variants: { hidden: { opacity: 0, y: 9, pointerEvents: 'none' as const }, visible: { opacity: 1, y: 0, pointerEvents: 'auto' as const } },
    transition: { type: 'spring' as const, stiffness: 320, damping: 28 },
  });

  return (
    <>
      <motion.header className={`site-header${!home || scrolled ? ' is-scrolled' : ''}`} style={{ width: navWidth, maxWidth: navMax }}>
        <motion.nav className="nav-shell" style={{ height: navHeight, paddingInline: navPadding, borderRadius: useTransform(progress, [0, 0.2], [0, 18]), backgroundColor: navColor, borderColor: navBorder, backdropFilter: navBlur }} aria-label="Navegação principal">
          <Link className={`nav-link vision-link${vision ? ' is-active' : ''}`} to="/vision" aria-current={vision ? 'page' : undefined}>vision</Link>
          <div className="nav-right">
            <motion.span className="location" whileHover={{ y: -1, color: 'var(--ink)' }} transition={{ duration: 0.2 }}>são paulo, brasil</motion.span>
            <motion.button className="theme-toggle" style={{ scaleY: useTransform(progress, (p) => 1 - p * 0.19) }} type="button" aria-label={`Ativar tema ${dark ? 'claro' : 'escuro'}`} onClick={() => setDark((value) => !value)}>{dark ? 'light' : 'dark'}</motion.button>
          </div>
        </motion.nav>
      </motion.header>

      <motion.div className={`brand-lockup${!home || scrolled ? ' is-scrolled' : ''}`} style={{ top: '50%', y: logoY, x: '-50%', scale: fontScale }}>
        <div className="wordmark-trigger" onMouseEnter={() => { cancelClose(); setBrandHover(true); }} onMouseLeave={closeLater} onFocus={() => { cancelClose(); setBrandFocus(true); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBrandFocus(false); }}>
          <Link className="wordmark" to="/" aria-label="Draw, início">Draw</Link>
          {home && <div className="webcam-interaction" ref={cameraArea}>
            <motion.div className="webcam-anchor" aria-hidden={scrolled} style={{ opacity: reduced ? (scrolled ? 0 : 1) : webcamOpacity, pointerEvents: scrolled ? 'none' : 'auto' }} onMouseEnter={() => { cancelClose(); setBrandHover(false); setCardHover(false); setBrandFocus(false); setCameraHover(true); }} onMouseLeave={closeLater}>
              <button className="webcam-trigger" type="button" aria-label="Sobre a webcam do Draw" aria-controls="webcam-info-card" aria-expanded={cameraCard} tabIndex={scrolled ? -1 : 0} title="Sobre a webcam do Draw" onFocus={() => { cancelClose(); setBrandFocus(false); setCameraFocus(true); }} onBlur={() => setCameraFocus(false)} onClick={() => setCameraPinned((value) => !value)}>
                <svg className="webcam-icon" viewBox="0 0 64 40" aria-hidden="true"><rect x="5" y="4" width="54" height="26" rx="9" /><circle className="webcam-lens" cx="32" cy="17" r="8" /><circle className="webcam-aperture" cx="32" cy="17" r="3" /><circle className="webcam-status" cx="51" cy="12" r="1.5" /><path d="M27 30v3c0 1.8 1.4 3 3 3h4c1.7 0 3-1.3 3-3v-3" /></svg>
              </button>
            </motion.div>
            <motion.aside id="webcam-info-card" className="webcam-card-anchor definition-card" aria-label="Sobre a webcam do Draw" aria-hidden={!cameraCard} style={{ scale: invertScale }} {...cardMotion(cameraCard)} onMouseEnter={() => { cancelClose(); setBrandHover(false); setCardHover(false); setBrandFocus(false); setCameraCardHover(true); }} onMouseLeave={closeLater}>
              <h2>webcam</h2><p className="definition-kind"><em>instrumento</em> · captura</p><p className="definition-phrase">Acompanha o papel e transforma cada traço em tinta digital, em tempo real.</p><p className="definition-note">A primeira camada do Draw.</p>
            </motion.aside>
          </div>}
        </div>
        <motion.div className={`product-label${product ? ' is-active' : ''}`} style={{ opacity: productOpacity, x: useTransform(progress, [0.62, 0.94], [-6, 0]), y: '-50%', scale: invertScale, transformOrigin: 'left center' }} onMouseEnter={() => { cancelClose(); setBrandHover(false); setCardHover(false); }}>
          <Link to="/product" aria-current={product ? 'page' : undefined} onClick={(event) => { if (product) { event.preventDefault(); onRepeatProduct(); } }}><span aria-hidden="true">·</span> product</Link>
        </motion.div>
        <motion.div className="definition-card-anchor" style={{ x: '-50%', scale: invertScale }}>
          <motion.aside className="definition-card" aria-label="Definição de Draw" aria-hidden={!definitionCard} {...cardMotion(definitionCard)} onMouseEnter={() => { cancelClose(); setCardHover(true); }} onMouseLeave={closeLater}>
            <h2>draw</h2><p className="definition-kind"><em>substantivo</em> · conceito</p><p className="definition-phrase">Traçar uma ideia no papel e transformá-la em algo que pode ser compreendido, testado e levado ao mundo.</p><p className="definition-note">Do papel à vida.</p>
          </motion.aside>
        </motion.div>
      </motion.div>
    </>
  );
}
