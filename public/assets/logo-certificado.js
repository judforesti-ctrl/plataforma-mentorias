// Logo do cliente para o certificado (verso, "Realizado para"): tira o fundo sólido (branco ou outra cor) e prepara uma
// versão para cada padrão. O fundo do certificado é bege #F2EADF no claro e azul-petróleo #0E3B44 no escuro: o logo que some
// nele (preto no escuro, branco ou amarelo claro no claro) ganha uma versão de UMA COR SÓ, com a tinta do certificado
// (#0E3B44 no claro, #F2EADF no escuro, as mesmas das assinaturas). A pessoa pode trocar entre "Cores do logo" e "Uma cor só".
// `tratarPixels` é pura (recebe os pixels RGBA) para poder ser testada fora do navegador.
import { abrirImagem } from './assinatura.js';

// versão da regra de tratamento: logo guardado com versão menor é tratado de novo ao abrir a pasta
export const TRATAMENTO_LOGO = 2;
export const FUNDOS = { clara: [242, 234, 223], escura: [14, 59, 68] };
export const TINTAS = { clara: [14, 59, 68], escura: [242, 234, 223] };
const MAIOR_L = 1600, MAIOR_A = 800;
const PERTO = 18, LONGE = 70;          // distância de cor até o fundo: até 18 some, de 18 a 70 vira borda suave
const CONTRASTE_MIN = 2.2, PARTE_VISIVEL = 0.55, SOME = 1.8, PARTE_QUE_SOME = 0.12;   // um pedaço que some (o nome, por exemplo) já pede uma cor só

const dist = (r, g, b, c) => Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminancia = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contraste = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
function mediana(v) { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }

// pixels RGBA → { rgba (sem fundo, recortado), largura, altura, fundoRemovido, sugestao: {clara, escura}, mono: {clara, escura} }
export function tratarPixels(px, w, h) {
  const n = w * h;
  const alfa = new Float32Array(n), cor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { alfa[i] = px[i * 4 + 3] / 255; cor[i * 3] = px[i * 4]; cor[i * 3 + 1] = px[i * 4 + 1]; cor[i * 3 + 2] = px[i * 4 + 2]; }
  // 1. fundo, por camadas (até 4 voltas), sempre olhando a borda do retângulo que ainda tem desenho:
  //    borda quase toda transparente → aperta o retângulo até o desenho (logo salvo com margem transparente);
  //    borda de uma cor só → essa cor vira transparente no logo todo (some também o miolo das letras), com borda suave e sem
  //    "halo" (a cor de fundo é descontada). Da segunda camada em diante, ou depois de uma margem transparente, só sai placa
  //    CLARA (branca ou quase): um contorno fino em volta da placa branca sai, mas um logo que é uma caixa colorida fica.
  let fundoRemovido = false, camadas = 0, apertou = false;
  let rx0 = 0, ry0 = 0, rx1 = w - 1, ry1 = h - 1;
  const caixa = (lim) => {
    let a0 = w, b0 = h, a1 = -1, b1 = -1;
    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) if (alfa[y * w + x] > lim) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
    return a1 < 0 ? null : [a0, b0, a1, b1];
  };
  const bordaDe = (x0, y0, x1, y1) => {
    const b = [];
    for (let x = x0; x <= x1; x++) b.push(y0 * w + x, y1 * w + x);
    for (let y = y0 + 1; y < y1; y++) b.push(y * w + x0, y * w + x1);
    return b;
  };
  const corDe = (lista) => [0, 1, 2].map((k) => mediana(lista.map((i) => cor[i * 3 + k])));
  const claraCor = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.85;
  // contorno fino: logo depois dele (até 6 px para dentro) vem uma placa clara
  const contornoFino = (bg) => {
    for (let d = 1; d <= 6 && rx1 - rx0 > 2 * d && ry1 - ry0 > 2 * d; d++) {
      const b = bordaDe(rx0 + d, ry0 + d, rx1 - d, ry1 - d).filter((i) => alfa[i] >= 0.5);
      if (!b.length) return false;
      const c = corDe(b);
      if (dist(c[0], c[1], c[2], bg) >= 40) return claraCor(c);
    }
    return false;
  };
  for (let volta = 0; volta < 4; volta++) {
    const borda = bordaDe(rx0, ry0, rx1, ry1);
    const opacos = borda.filter((i) => alfa[i] >= 0.5);
    let nova = null;
    if (opacos.length < 0.5 * borda.length) {
      nova = caixa(0.5);
      apertou = true;
    } else {
      const bg = corDe(opacos);
      const parecidos = opacos.filter((i) => dist(cor[i * 3], cor[i * 3 + 1], cor[i * 3 + 2], bg) < 40).length / opacos.length;
      if (parecidos < 0.6) break;
      if ((camadas > 0 || apertou) && !claraCor(bg) && !contornoFino(bg)) break;
      for (let i = 0; i < n; i++) {
        if (alfa[i] === 0) continue;
        const d = dist(cor[i * 3], cor[i * 3 + 1], cor[i * 3 + 2], bg);
        if (d >= LONGE) continue;
        const a = Math.max(0, Math.min(1, (d - PERTO) / (LONGE - PERTO)));
        if (a > 0) for (let k = 0; k < 3; k++) cor[i * 3 + k] = Math.max(0, Math.min(255, (cor[i * 3 + k] - (1 - a) * bg[k]) / a));
        alfa[i] *= a;
      }
      fundoRemovido = true; camadas++;
      nova = caixa(0.04);
    }
    if (!nova || (nova[0] === rx0 && nova[1] === ry0 && nova[2] === rx1 && nova[3] === ry1)) break;
    [rx0, ry0, rx1, ry1] = nova;
  }
  // 2. recorte com margem pequena
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alfa[y * w + x] > 0.04) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('Não encontramos o logo nesta imagem. Envie o arquivo do logo (PNG ou JPG) sem nada em volta.');
  const m = 2;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, rgba = new Uint8ClampedArray(cw * ch * 4);
  const lum = [], claridade = [], idx = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (y + y0) * w + x + x0, o = (y * cw + x) * 4;
    rgba[o] = cor[i * 3]; rgba[o + 1] = cor[i * 3 + 1]; rgba[o + 2] = cor[i * 3 + 2]; rgba[o + 3] = Math.round(alfa[i] * 255);
    if (alfa[i] > 0.5) { lum.push(luminancia(cor[i * 3], cor[i * 3 + 1], cor[i * 3 + 2])); claridade.push((0.299 * cor[i * 3] + 0.587 * cor[i * 3 + 1] + 0.114 * cor[i * 3 + 2]) / 255); idx.push(y * cw + x); }
  }
  // 3. o logo aparece no fundo de cada padrão? (parte com contraste suficiente, e nenhum pedaço grande que some)
  const sugestao = {}, visivel = {};
  for (const v of ['clara', 'escura']) {
    const lf = luminancia(...FUNDOS[v]), total = Math.max(1, lum.length);
    visivel[v] = lum.filter((l) => contraste(l, lf) >= CONTRASTE_MIN).length / total;
    const some = lum.filter((l) => contraste(l, lf) < SOME).length / total;
    sugestao[v] = visivel[v] < PARTE_VISIVEL || some >= PARTE_QUE_SOME ? 'uma_cor' : 'cores';
  }
  // 4. versão de uma cor só: o desenho inteiro vira a tinta, e só o que é quase branco dentro dele fica vazado (a letra
  //    branca dentro do círculo, por exemplo); num logo quase todo claro (branco), o que fica vazado é o quase preto
  const media = claridade.reduce((s, c) => s + c, 0) / Math.max(1, claridade.length);
  const peso = new Float32Array(cw * ch);
  const cheio = media > 0.65 ? (c) => (c - 0.08) / (0.25 - 0.08) : (c) => (0.92 - c) / (0.92 - 0.75);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const o = (y * cw + x) * 4, c = (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) / 255;
    peso[y * cw + x] = (rgba[o + 3] / 255) * Math.max(0, Math.min(1, cheio(c)));
  }
  const mono = {};
  for (const v of ['clara', 'escura']) {
    const out = new Uint8ClampedArray(cw * ch * 4), t = TINTAS[v];
    for (let i = 0; i < cw * ch; i++) { out[i * 4] = t[0]; out[i * 4 + 1] = t[1]; out[i * 4 + 2] = t[2]; out[i * 4 + 3] = Math.round(peso[i] * 255); }
    mono[v] = out;
  }
  return { rgba, largura: cw, altura: ch, fundoRemovido, sugestao, visivel, mono };
}

// ---------- no navegador ----------
const paraBlob = (c) => new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui montar a imagem do logo.'))), 'image/png'));
async function imagem(pixels, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);
  const blob = await paraBlob(c);
  return { blob, url: URL.createObjectURL(blob) };
}

// arquivo ou Blob do logo → { cores, clara_uma_cor, escura_uma_cor } (Blob PNG + endereço), sugestão para cada padrão
export async function prepararLogo(arq) {
  const img = await abrirImagem(arq);
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  const k = Math.min(1, MAIOR_L / iw, MAIOR_A / ih);
  const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
  const t = tratarPixels(g.getImageData(0, 0, w, h).data, w, h);
  const [cores, clara, escura] = await Promise.all([imagem(t.rgba, t.largura, t.altura), imagem(t.mono.clara, t.largura, t.altura), imagem(t.mono.escura, t.largura, t.altura)]);
  return { cores, clara_uma_cor: clara, escura_uma_cor: escura, largura: t.largura, altura: t.altura, fundoRemovido: t.fundoRemovido, sugestao: t.sugestao, visivel: t.visivel };
}
