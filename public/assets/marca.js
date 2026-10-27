// Logo e cores de cada cliente na área do aluno (script 44, pedido da Juliana em 27/10/2026).
// A marca fica na empresa (empresas.marca = { logo: {caminho, largura, altura}, principal, destaque, paleta }) e vale para
// todas as trilhas dela. As cores escolhidas passam por uma conferência de leitura (contraste): a cor principal é o fundo
// escuro com texto branco; a de destaque pinta botões e detalhes. Se uma cor deixaria o texto difícil de ler, o tom é
// ajustado sozinho (mais escuro ou mais claro), sem mudar a cara da cor.

export const MENTOREI = { principal: '#091216', destaque: '#C8AE7C' };

export const PALETAS = [
  { id: 'mentorei', nome: 'Mentorei (padrão)', principal: '#091216', destaque: '#C8AE7C' },
  { id: 'azul', nome: 'Azul', principal: '#0B2545', destaque: '#5FA8E8' },
  { id: 'verde', nome: 'Verde', principal: '#0E3B2C', destaque: '#7AC143' },
  { id: 'verde-agua', nome: 'Verde-água', principal: '#073B3A', destaque: '#3CC3B5' },
  { id: 'vinho', nome: 'Vinho', principal: '#4A0E1E', destaque: '#E6A15A' },
  { id: 'vermelho', nome: 'Vermelho', principal: '#5C0B12', destaque: '#F26B5B' },
  { id: 'laranja', nome: 'Laranja', principal: '#3D1F0A', destaque: '#F28C28' },
  { id: 'roxo', nome: 'Roxo', principal: '#2A1650', destaque: '#B79CEB' },
  { id: 'grafite', nome: 'Grafite', principal: '#1F2328', destaque: '#E3C567' },
];

// ---------- contas de cor ----------
const HEX = /^#?([0-9a-f]{6})$/i;
export const corValida = (c) => HEX.test(String(c || '').trim());
const rgb = (c) => { const h = String(c).trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const hex = (r) => `#${r.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminancia = (c) => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const misturar = (a, b, t) => { const p = rgb(a), q = rgb(b); return hex(p.map((v, i) => v + (q[i] - v) * t)); };
// escurece (ou clareia) aos poucos até o contraste com a cor "contra" chegar no mínimo
function ajustar(cor, contra, minimo, rumo) {
  let c = cor;
  for (let i = 0; i < 40 && contraste(c, contra) < minimo; i += 1) c = misturar(c, rumo, 0.08);
  return c;
}

// Cores prontas para a tela, a partir da marca do cliente (vazia = Mentorei).
export function tema(marca) {
  const m = marca || {};
  const principal = ajustar(corValida(m.principal) ? `#${String(m.principal).trim().replace('#', '')}` : MENTOREI.principal, '#FFFFFF', 7, '#000000');
  let destaque = corValida(m.destaque) ? `#${String(m.destaque).trim().replace('#', '')}` : MENTOREI.destaque;
  destaque = ajustar(destaque, principal, 4.5, '#FFFFFF');                       // detalhe legível em cima do fundo escuro
  const textoBotao = contraste(destaque, '#091216') >= 4.5 ? '#091216' : '#FFFFFF';
  const claro = misturar(destaque, '#FFFFFF', 0.78);                              // fundo dos selos
  const textoClaro = ajustar(misturar(destaque, '#000000', 0.45), claro, 4.5, '#000000');
  return {
    principal, destaque, textoBotao, claro, textoClaro,
    estilo: [`--petroleo:${principal}`, `--petroleo-3:${misturar(principal, '#FFFFFF', 0.12)}`, `--bege:${destaque}`,
      `--bege-escuro:${ajustar(misturar(destaque, '#000000', 0.18), '#FFFFFF', 3, '#000000')}`, `--bege-claro:${claro}`, `--bege-texto:${textoClaro}`,
      `--lima:${destaque}`, `--verde:${destaque}`, `--verde-claro:${claro}`, `--verde-esc:${textoClaro}`, `--tr-btn-texto:${textoBotao}`].join(';'),
  };
}

export const temMarca = (marca) => !!(marca && ((marca.logo && marca.logo.caminho) || corValida(marca.principal) || corValida(marca.destaque)));

// Duas cores do logo (a mais escura e a mais viva), para sugerir a paleta. Precisa de uma imagem já carregada.
export function coresDaImagem(img) {
  const t = 64, cv = document.createElement('canvas');
  const k = Math.min(1, t / Math.max(img.naturalWidth || t, img.naturalHeight || t));
  cv.width = Math.max(1, Math.round((img.naturalWidth || t) * k)); cv.height = Math.max(1, Math.round((img.naturalHeight || t) * k));
  const c = cv.getContext('2d'); c.drawImage(img, 0, 0, cv.width, cv.height);
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  const grupos = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;                                                  // transparente
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 235 && min > 225) continue;                                          // branco do fundo
    const chave = [r, g, b].map((v) => Math.round(v / 32)).join('-');
    const x = grupos.get(chave) || { n: 0, r: 0, g: 0, b: 0, sat: 0 };
    x.n += 1; x.r += r; x.g += g; x.b += b; x.sat += max ? (max - min) / max : 0;
    grupos.set(chave, x);
  }
  const cores = [...grupos.values()].filter((x) => x.n >= 3).map((x) => ({ cor: hex([x.r / x.n, x.g / x.n, x.b / x.n]), n: x.n, sat: x.sat / x.n }));
  if (!cores.length) return null;
  const viva = cores.filter((x) => x.sat > 0.35).sort((a, b) => b.n - a.n)[0] || cores.sort((a, b) => b.n - a.n)[0];
  const escura = cores.slice().sort((a, b) => luminancia(a.cor) - luminancia(b.cor))[0];
  // principal = a mais escura (se for clara demais, a viva escurecida); destaque = a viva
  const principal = luminancia(escura.cor) < 0.08 ? escura.cor : misturar(viva.cor, '#000000', 0.6);
  return { principal, destaque: viva.cor };
}
