import { useEffect, useRef } from 'react';
import VisionAsciiPortrait from '../components/VisionAsciiPortrait';

const paragraphs = [
  'A gente pensa primeiro no papel. Antes de abrir menus, escolher ferramentas ou ajustar camadas, vem um gesto simples: desenhar para descobrir.',
  'Draw transforma esse gesto em uma ponte em tempo real. Uma câmera acompanha os traços; visão computacional os converte em modelos que podem chegar ao CAD, à robótica e a simuladores — sem interromper o pensamento.',
  'A visão é que o desenho não termine na captura. Uma linha pode se tornar uma peça, uma parede ou o caminho de um robô. A simulação devolve respostas enquanto a pessoa ainda desenha, para que ideia e modelo evoluam juntos.',
  'Começamos pela fundação: capturar cada traço com fidelidade, inclusive ao apagar e corrigir. O destino é mais ambicioso: pensar no papel e criar diretamente nos sistemas que projetam, testam e dão forma ao mundo.',
];

export default function VisionPage() {
  const headlineA = useRef<HTMLSpanElement>(null);
  const headlineB = useRef<HTMLSpanElement>(null);
  const copyRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const signoff = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const lines = [
      ...(headlineA.current ? [{ node: headlineA.current, text: 'O papel é só', pace: 53 }] : []),
      ...(headlineB.current ? [{ node: headlineB.current, text: 'o início.', pace: 53 }] : []),
      ...paragraphs.flatMap((text, index) => copyRefs.current[index]
        ? [{ node: copyRefs.current[index]!, text, pace: 27 }]
        : []),
      ...(signoff.current ? [{ node: signoff.current, text: 'do papel à vida, sem perder o gesto.', pace: 29 }] : []),
    ];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) {
      lines.forEach(({ node, text }) => { node.textContent = text; });
      return;
    }
    let lineIndex = 0;
    let characterIndex = 0;
    let timer = 0;
    const type = () => {
      if (reduce.matches) {
        lines.forEach(({ node, text }) => { node.textContent = text; });
        return;
      }
      const line = lines[lineIndex];
      if (!line) return;
      if (characterIndex >= line.text.length) {
        lineIndex += 1;
        characterIndex = 0;
        timer = window.setTimeout(type, lineIndex < lines.length ? 260 : 0);
        return;
      }
      const char = line.text[characterIndex++];
      line.node.append(document.createTextNode(char));
      const pause = '.!?'.includes(char) ? 260 : char === ',' ? 125 : ';:—'.includes(char) ? 160 : 0;
      timer = window.setTimeout(type, (char === ' ' ? 12 : line.pace) + pause);
    };
    timer = window.setTimeout(type, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="vision-page" id="page-content">
      <VisionAsciiPortrait />
      <header className="vision-intro">
        <h1 className="vision-headline" aria-label="O papel é só o início.">
          <span className="vision-title-line" aria-hidden="true" ref={headlineA} />
          <span className="vision-title-line" aria-hidden="true" ref={headlineB} />
        </h1>
      </header>
      <div className="vision-copy">
        {paragraphs.map((text, index) => (
          <p aria-label={text} key={text} ref={(node) => { copyRefs.current[index] = node; }} />
        ))}
      </div>
      <p className="vision-signoff" aria-label="do papel à vida, sem perder o gesto.">
        <span aria-hidden="true" ref={signoff} />
      </p>
    </main>
  );
}
