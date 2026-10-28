// Assinatura para o certificado: tira o fundo da foto ou do escaneamento e devolve duas imagens PNG transparentes,
// tinta azul-petróleo #0E3B44 (padrão claro) e tinta bege #F2EADF (padrão escuro).
// É o mesmo cálculo de docs/certificados/referencia/assinatura.py (testado), reescrito para rodar no navegador:
// brilho do papel por regiões (mediana 31 × 31 numa versão 4 vezes menor, corrige a sombra da foto de celular), a diferença de
// brilho vira transparência com bordas suaves, pontinhos soltos saem, recorte com margem pequena.
// `mascaraTinta` é pura (recebe os pixels RGBA) para poder ser conferida com a referência fora do navegador.

export const TINTAS = { clara: [14, 59, 68], escura: [242, 234, 223] };
export const SEM_TINTA = 'Não encontramos a assinatura na imagem. Use caneta escura em papel branco, sem pauta.';
const MAIOR = 2400, LARGURA_FINAL = 1600;

// índice espelhado nas bordas, como o modo "reflect" da referência (d c b a | a b c d | d c b a)
const espelho = (i, n) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return i; };

// mediana 31 × 31 com histograma deslizante (valores em quartos de brilho: 0 a 1020)
function mediana31(v, w, h) {
  const R = 15, MEIO = 480, NB = 1024, out = new Float32Array(w * h), hist = new Int32Array(NB);
  const q = new Int16Array(w * h);
  for (let i = 0; i < v.length; i++) q[i] = Math.max(0, Math.min(NB - 1, Math.round(v[i] * 4)));
  for (let y = 0; y < h; y++) {
    hist.fill(0);
    const linhas = []; for (let dy = -R; dy <= R; dy++) linhas.push(espelho(y + dy, h) * w);
    for (const l of linhas) for (let dx = -R; dx <= R; dx++) hist[q[l + espelho(dx, w)]]++;
    let med = 0, abaixo = 0;
    while (abaixo + hist[med] <= MEIO) { abaixo += hist[med]; med++; }
    out[y * w] = med / 4;
    for (let x = 1; x < w; x++) {
      const sai = espelho(x - R - 1, w), entra = espelho(x + R, w);
      for (const l of linhas) {
        const a = q[l + sai]; hist[a]--; if (a < med) abaixo--;
        const b = q[l + entra]; hist[b]++; if (b < med) abaixo++;
      }
      while (abaixo > MEIO) { med--; abaixo -= hist[med]; }
      while (abaixo + hist[med] <= MEIO) { abaixo += hist[med]; med++; }
      out[y * w + x] = med / 4;
    }
  }
  return out;
}

// aumenta a imagem do papel para o tamanho original (bilinear, centros dos pixels alinhados)
function bilinear(v, w, h, W, H) {
  const out = new Float32Array(W * H), sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    let fy = (y + 0.5) * sy - 0.5; fy = Math.max(0, Math.min(h - 1, fy));
    const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      let fx = (x + 0.5) * sx - 0.5; fx = Math.max(0, Math.min(w - 1, fx));
      const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = v[y0 * w + x0] * (1 - tx) + v[y0 * w + x1] * tx, b = v[y1 * w + x0] * (1 - tx) + v[y1 * w + x1] * tx;
      out[y * W + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

function percentil(v, p) {
  if (!v.length) return 255;
  const s = Float32Array.from(v).sort(), k = p * (s.length - 1), i = Math.floor(k);
  return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (k - i) : s[i];
}

// pixels RGBA (já virados e reduzidos) → transparência da tinta recortada { alfa, largura, altura }
export function mascaraTinta(rgba, w, h) {
  const n = w * h, lum = new Float32Array(n), alfaOrig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    alfaOrig[i] = rgba[i * 4 + 3] / 255;
  }
  // papel: brilho típico do fundo, numa versão 4 vezes menor, com correção de iluminação desigual
  const w4 = Math.ceil(w / 4), h4 = Math.ceil(h / 4), peq = new Float32Array(w4 * h4);
  for (let y = 0; y < h4; y++) for (let x = 0; x < w4; x++) peq[y * w4 + x] = lum[y * 4 * w + x * 4];
  const fundo = bilinear(mediana31(peq, w4, h4), w4, h4, w, h);
  const opacos = []; let transparentes = 0;
  for (let i = 0; i < n; i++) { if (alfaOrig[i] > 0.5) opacos.push(lum[i]); if (alfaOrig[i] < 0.99) transparentes++; }
  const piso = opacos.length ? percentil(opacos, 0.6) : 255;
  let alfa = new Float32Array(n);
  const jaTransparente = transparentes / n > 0.05;   // PNG já sem fundo: respeita a transparência original
  for (let i = 0; i < n; i++) {
    let a = Math.max(0, Math.min(1, (Math.max(fundo[i], piso) - lum[i] - 28) / 70));
    if (jaTransparente) a = Math.max(a * (alfaOrig[i] > 0.5 ? 1 : 0), alfaOrig[i] * (lum[i] < 200 ? 1 : 0));
    alfa[i] = a;
  }
  // tira pontinhos soltos (poeira, textura do papel): partes ligadas pelos lados menores que o mínimo
  const rot = new Int32Array(n), tamanhos = [0], pilha = new Int32Array(n);
  let partes = 0;
  for (let i = 0; i < n; i++) {
    if (rot[i] || alfa[i] <= 0.35) continue;
    partes++; let topo = 0, tam = 0; pilha[topo++] = i; rot[i] = partes;
    while (topo) {
      const j = pilha[--topo]; tam++;
      const x = j % w, viz = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w];
      for (const k of viz) if (k >= 0 && k < n && !rot[k] && alfa[k] > 0.35) { rot[k] = partes; pilha[topo++] = k; }
    }
    tamanhos.push(tam);
  }
  if (partes) {
    const minimo = Math.max(30, 0.0004 * n);
    // mantém as partes grandes e um contorno de 3 pixels em volta (dilatação em cruz, 3 vezes)
    let marca = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (rot[i] && tamanhos[rot[i]] >= minimo) marca[i] = 1;
    for (let it = 0; it < 3; it++) {
      const nova = marca.slice();
      for (let i = 0; i < n; i++) {
        if (marca[i]) continue;
        const x = i % w;
        if ((x > 0 && marca[i - 1]) || (x < w - 1 && marca[i + 1]) || (i >= w && marca[i - w]) || (i + w < n && marca[i + w])) nova[i] = 1;
      }
      marca = nova;
    }
    for (let i = 0; i < n; i++) if (!marca[i]) alfa[i] = 0;
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alfa[y * w + x] > 0.15) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error(SEM_TINTA);
  const m = Math.floor(0.03 * Math.max(x1 - x0, y1 - y0)) + 4;
  const cy0 = Math.max(0, y0 - m), cy1 = Math.min(h, y1 + m), cx0 = Math.max(0, x0 - m), cx1 = Math.min(w, x1 + m);
  const cw = cx1 - cx0, ch = cy1 - cy0, recorte = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) recorte[y * cw + x] = alfa[(y + cy0) * w + x + cx0];
  alfa = null;
  return { alfa: recorte, largura: cw, altura: ch };
}

// ---------- no navegador ----------
const HEIC = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
let carregandoHeic = null;
const ehHeic = (arq) => /heic|heif/i.test(arq.type) || /\.(heic|heif)$/i.test(arq.name || '');
function heic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (!carregandoHeic) carregandoHeic = new Promise((ok, falha) => {
    const sc = document.createElement('script'); sc.src = HEIC;
    sc.onload = () => ok(window.heic2any);
    sc.onerror = () => { carregandoHeic = null; falha(new Error('Não consegui abrir a foto do iPhone (HEIC). Tente de novo ou mande a foto em JPG.')); };
    document.head.appendChild(sc);
  });
  return carregandoHeic;
}

async function abrirImagem(arq) {
  let blob = arq;
  if (ehHeic(arq)) { const conv = await heic2any(); const r = await conv({ blob: arq, toType: 'image/jpeg', quality: 0.95 }); blob = Array.isArray(r) ? r[0] : r; }
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (_) { /* tenta pela imagem comum */ }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode(); return img;
  } catch (_) { throw new Error('Não conseguimos abrir esta imagem. Envie uma foto em JPG, PNG, WEBP ou HEIC.'); } finally { URL.revokeObjectURL(url); }
}

const tela = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const paraBlob = (c) => new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui montar a imagem.'))), 'image/png'));

// arquivo → { clara, escura } (Blob PNG + endereço para mostrar), largura e altura
export async function prepararAssinatura(arq) {
  const img = await abrirImagem(arq);
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  const k = Math.min(1, MAIOR / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
  const c = tela(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
  await new Promise((ok) => setTimeout(ok, 30));   // deixa a tela mostrar "Preparando…"
  const { alfa, largura, altura } = mascaraTinta(g.getImageData(0, 0, w, h).data, w, h);
  const saida = {};
  for (const [v, [r, gr, b]] of Object.entries(TINTAS)) {
    const p = tela(largura, altura), pg = p.getContext('2d'), d = pg.createImageData(largura, altura);
    for (let i = 0; i < alfa.length; i++) { d.data[i * 4] = r; d.data[i * 4 + 1] = gr; d.data[i * 4 + 2] = b; d.data[i * 4 + 3] = Math.round(alfa[i] * 255); }
    pg.putImageData(d, 0, 0);
    let fim = p;
    if (largura > LARGURA_FINAL) {
      fim = tela(LARGURA_FINAL, Math.round((altura * LARGURA_FINAL) / largura));
      const fg = fim.getContext('2d'); fg.imageSmoothingQuality = 'high'; fg.drawImage(p, 0, 0, fim.width, fim.height);
    }
    const blob = await paraBlob(fim);
    saida[v] = { blob, url: URL.createObjectURL(blob) };
    saida.largura = fim.width; saida.altura = fim.height;
  }
  return saida;
}
