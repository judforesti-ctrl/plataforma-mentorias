// Monta o PowerPoint da proposta comercial a partir de um dos dois modelos da Mentorei (claro ou escuro, embutidos em
// modelos/proposta-modelos.mjs) e do conteúdo escrito pela IA (ou editado na tela). Trabalha direto no XML do .pptx:
// troca textos mantendo a formatação, mede cada texto com as larguras reais da fonte Inter (proposta-letras.mjs) para
// diminuir a letra quando não cabe (e avisar), ajusta selos, título da capa, cartões e tabela à quantidade de itens,
// põe o logo do cliente e monta a página de investimento com os preços digitados na tela (a IA nunca escreve valores).
// Os dois modelos têm as MESMAS peças com os mesmos nomes (só mudam as cores): MAPA vale para os dois.
// As páginas institucionais (números da Mentorei, sócias, contatos) ficam como estão no modelo.
import JSZip from 'jszip';
import { MODELOS_B64 } from './modelos/proposta-modelos.mjs';
import { LETRAS } from './proposta-letras.mjs';
import { descreverPreco, precosValidos, normalizarConteudo, MODELO_PADRAO } from '../../public/assets/proposta-comum.js';

const POL = 914400;                                      // 1 polegada em EMU
const emu = (p) => Math.round(p * POL);
const esc = (t) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pedaco = (s, re) => (s.match(re) || [''])[0];
const limpo = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
const num2 = (i) => String(i + 1).padStart(2, '0');
const RE_RPR = /<a:rPr\b[^>]*?\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/;
const RE_FIMP = /<a:endParaRPr\b[^>]*?\/>|<a:endParaRPr\b[^>]*>[\s\S]*?<\/a:endParaRPr>/;
const RE_PPR = /<a:pPr\b[^>]*?\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/;
const RELS_VAZIO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
const TIPO_IMAGEM = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

// ---------- o modelo: páginas (1 = capa) e peças ----------
export const MAPA = {
  capa: 1, demanda: 2, quem: 3, expertise: 4, socias: 5, visao: 6, modulo: 7, destaque: 10,
  apagar: [7, 8, 9, 10, 11],                         // molde do módulo, exemplos e molde da página extra
  metodologia: 12, personalizacao: 13, organizacao: 14, investimento: 15, proximos: 16, frase: 17,
  demandaItens: [['texto-14', 'texto-15'], ['texto-19', 'texto-20'], ['texto-24', 'texto-25'], ['texto-29', 'texto-30']],
  expertiseItens: [['icone-52', 'texto-53', 'texto-54'], ['icone-57', 'texto-58', 'texto-59'], ['icone-62', 'texto-63', 'texto-64'], ['icone-67', 'texto-68', 'texto-69']],
  visaoCartoes: [
    ['cartao-96', 'texto-97', 'icone-fundo-98', 'icone-99', 'texto-100', 'texto-101', 'selo-102', 'selo-texto-103'],
    ['cartao-104', 'texto-105', 'icone-fundo-106', 'icone-107', 'texto-108', 'texto-109', 'selo-110', 'selo-texto-111'],
    ['cartao-112', 'texto-113', 'icone-fundo-114', 'icone-115', 'texto-116', 'texto-117', 'selo-118', 'selo-texto-119'],
    ['cartao-120', 'texto-121', 'icone-fundo-122', 'icone-123', 'texto-124', 'texto-125', 'selo-126', 'selo-texto-127'],
  ],
  topicos: [['divisor-141', 'texto-142', 'topico-143'], ['divisor-144', 'texto-145', 'topico-146'], ['divisor-147', 'texto-148', 'topico-149'], ['divisor-150', 'texto-151', 'topico-152'], ['divisor-153', 'texto-154', 'topico-155']],
  destaqueItens: [['icone-215', 'produto-216', 'texto-217'], ['icone-220', 'produto-221', 'texto-222'], ['icone-225', 'produto-226', 'texto-227'], ['icone-230', 'produto-231', 'texto-232']],
  metodologiaItens: [['icone-264', 'texto-266', 'texto-267'], ['icone-270', 'texto-272', 'texto-273'], ['icone-276', 'texto-278', 'texto-279'], ['icone-282', 'texto-284', 'texto-285']],
  personalizacaoItens: [['texto-291', 'texto-292'], ['texto-296', 'texto-297'], ['texto-301', 'texto-302'], ['texto-306', 'texto-307']],
  proximosItens: [['texto-331', 'texto-332'], ['texto-336', 'texto-337'], ['texto-341', 'texto-342'], ['texto-346', 'texto-347']],
};
// Onde está o desenho de cada ícone dentro do modelo (página, peça).
const ICONE_PECA = {
  banco: [4, 'icone-52'], conversa: [4, 'icone-57'], crescimento: [4, 'icone-62'], quebra_cabeca: [4, 'icone-67'],
  pessoa_lupa: [6, 'icone-99'], aperto_de_maos: [6, 'icone-115'], check: [6, 'icone-123'],
  cofrinho: [10, 'icone-215'], escudo: [10, 'icone-220'], estetoscopio: [10, 'icone-225'], ampulheta: [10, 'icone-230'],
  pasta: [12, 'icone-264'], pessoas: [12, 'icone-270'], lupa: [12, 'icone-276'], ferramenta: [12, 'icone-282'],
};

// ---------- medida dos textos (larguras reais da Inter) ----------
const FONTES = {};
for (const [k, f] of Object.entries(LETRAS)) FONTES[k] = { base: f.base.split(',').map(Number), extras: f.extras, linha: f.linha };
// largura em polegadas; spc = espaçamento entre letras como no XML (centésimos de ponto)
export function larguraTexto(texto, fonte, pt, spc = 0) {
  const f = FONTES[fonte] || FONTES.regular;
  let soma = 0, n = 0;
  for (const ch of String(texto)) {
    const cp = ch.codePointAt(0); n += 1;
    soma += cp >= 32 && cp <= 255 ? f.base[cp - 32] : (f.extras[cp] || 600);
  }
  return (soma / 1000 * pt + n * spc / 100) / 72;
}
// quantas linhas o texto ocupa numa caixa desta largura
function contarLinhas(texto, largura, fonte, pt, spc) {
  let linhas = 0;
  for (const par of String(texto).split('\n')) {
    linhas += 1; let atual = '';
    for (const p of par.split(/\s+/).filter(Boolean)) {
      const t = atual ? `${atual} ${p}` : p;
      if (!atual || larguraTexto(t, fonte, pt, spc) <= largura) atual = t; else { linhas += 1; atual = p; }
    }
  }
  return linhas;
}

// ---------- peças do XML (sem parser: o modelo é regular e isso evita dependências) ----------
function acharPeca(xml, nome) {
  const re = /<p:(sp|pic|graphicFrame|cxnSp)(?=[\s>])[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const fecha = `</p:${m[1]}>`;
    const fim = xml.indexOf(fecha, m.index);
    if (fim < 0) break;
    const bloco = xml.slice(m.index, fim + fecha.length);
    const nm = bloco.match(/<p:cNvPr\s[^>]*?name="([^"]*)"/);
    if (nm && nm[1] === nome) return { inicio: m.index, fim: fim + fecha.length, bloco };
    re.lastIndex = fim + fecha.length;
  }
  return null;
}
const trocar = (p, pc, novo) => { p.xml = p.xml.slice(0, pc.inicio) + novo + p.xml.slice(pc.fim); };
function remover(p, nomes) { for (const n of nomes) { const pc = acharPeca(p.xml, n); if (pc) trocar(p, pc, ''); } }
function lerCaixa(bloco) {
  const o = bloco.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/); const e = bloco.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  return { x: o ? +o[1] / POL : 0, y: o ? +o[2] / POL : 0, w: e ? +e[1] / POL : 0, h: e ? +e[2] / POL : 0 };
}
function caixa(p, nome) { const pc = acharPeca(p.xml, nome); return pc ? lerCaixa(pc.bloco) : null; }
function mover(p, nome, { x, y, w, h }) {
  const pc = acharPeca(p.xml, nome); if (!pc) return;
  const novo = pc.bloco
    .replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (_, ox, oy) => `<a:off x="${x != null ? emu(x) : ox}" y="${y != null ? emu(y) : oy}"/>`)
    .replace(/<a:ext cx="(\d+)" cy="(\d+)"\/>/, (_, cx, cy) => `<a:ext cx="${w != null ? emu(w) : cx}" cy="${h != null ? emu(h) : cy}"/>`);
  trocar(p, pc, novo);
}
const maiorId = (xml) => { let n = 1; xml.replace(/<p:cNvPr\s+id="(\d+)"/g, (_, id) => { n = Math.max(n, +id); return _; }); return n; };
// Copia peças com nomes novos (nome + sufixo); a posição é acertada depois.
function clonar(p, nomes, sufixo) {
  let id = maiorId(p.xml), novos = '';
  for (const n of nomes) {
    const pc = acharPeca(p.xml, n); if (!pc) continue;
    id += 1;
    novos += pc.bloco.replace(/<p:cNvPr\s+id="\d+"\s+name="[^"]*"/, `<p:cNvPr id="${id}" name="${n} ${sufixo}"`);
  }
  p.xml = p.xml.replace('</p:spTree>', `${novos}</p:spTree>`);
  return nomes.map((n) => `${n} ${sufixo}`);
}

// ---------- textos ----------
const comTamanho = (tag, pt) => {
  if (!tag || pt == null) return tag;
  const sz = Math.round(pt * 100);
  return /\ssz="\d+"/.test(tag) ? tag.replace(/\ssz="\d+"/, ` sz="${sz}"`) : tag.replace(/^<a:(rPr|endParaRPr)/, `<a:$1 sz="${sz}"`);
};
// Formatação de uma caixa: pPr de cada parágrafo, estilos de letra (rPr) na ordem em que aparecem, fim de parágrafo.
function formatos(corpo) {
  const paras = corpo.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
  const pprs = paras.map((x) => pedaco(x, RE_PPR));
  const rprs = [];
  for (const x of paras) for (const r of x.match(/<a:r>[\s\S]*?<\/a:r>/g) || []) { const rp = pedaco(r, RE_RPR); if (rp && !rprs.includes(rp)) rprs.push(rp); }
  const fimP = pedaco(paras[0] || '', RE_FIMP) || '<a:endParaRPr lang="pt-BR"/>';
  if (!rprs.length) rprs.push(fimP.replace(/a:endParaRPr/g, 'a:rPr'));
  return { pprs, rprs, fimP };
}
// conteudo: texto (com \n = novo parágrafo) ou lista de parágrafos; cada parágrafo é texto ou lista de [texto, nº do estilo].
function paragrafos(conteudo) {
  if (Array.isArray(conteudo)) return conteudo.map((par) => (typeof par === 'string' ? [[par, 0]] : par));
  return String(conteudo == null ? '' : conteudo).replace(/\r/g, '').split('\n').map((l) => [[l, 0]]);
}
function escreverCorpo(bloco, conteudo, pt) {
  const m = bloco.match(/<(p|a):txBody>([\s\S]*?)<\/\1:txBody>/);
  if (!m) return bloco;
  const corpo = m[2];
  const f = formatos(corpo);
  const iniP = corpo.indexOf('<a:p>');
  const cabeca = iniP < 0 ? corpo : corpo.slice(0, iniP);
  const novo = paragrafos(conteudo).map((runs, i) => {
    const pPr = f.pprs[Math.min(i, f.pprs.length - 1)] || '';
    const rs = runs.filter(([t]) => t != null && String(t) !== '')
      .map(([t, e]) => `<a:r>${comTamanho(f.rprs[Math.min(e || 0, f.rprs.length - 1)], pt)}<a:t>${esc(t)}</a:t></a:r>`).join('');
    return `<a:p>${pPr}${rs}${comTamanho(f.fimP, pt)}</a:p>`;
  }).join('');
  return bloco.replace(m[0], () => `<${m[1]}:txBody>${cabeca}${novo}</${m[1]}:txBody>`);
}
const textoDe = (conteudo) => paragrafos(conteudo).map((runs) => runs.map(([t]) => t || '').join('')).join('\n');
const textoOriginal = (bloco) => (bloco.match(/<a:t>([^<]*)<\/a:t>/g) || []).map((t) => t.slice(5, -6)).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

function metricas(bloco) {
  const rPr = pedaco(bloco, RE_RPR) || pedaco(bloco, RE_FIMP);
  const extra = /typeface="\+mj-lt"/.test(rPr) || /<p:ph\s[^>]*type="(title|ctrTitle)"/.test(bloco);
  const negrito = /<a:rPr\b[^>]*\sb="1"/.test(bloco);
  return {
    pt: +((rPr.match(/\ssz="(\d+)"/) || [0, 1800])[1]) / 100,
    spc: +((rPr.match(/\sspc="(-?\d+)"/) || [0, 0])[1]),
    fonte: extra ? 'extrabold' : negrito ? 'bold' : 'regular',
    ln: +((bloco.match(/<a:lnSpc>\s*<a:spcPct val="(\d+)"\s*\/>/) || [0, 100000])[1]) / 100000,
    ...lerCaixa(bloco),
  };
}
// Escreve o texto numa caixa; se não couber, diminui a letra (até `min` do tamanho original) e, se ainda assim
// não couber, registra um aviso para a tela mostrar.
function T(ctx, p, nome, conteudo, rotulo, { min = 0.82, linhas: maxLinhas = null } = {}) {
  if (conteudo == null) return;
  const pc = acharPeca(p.xml, nome); if (!pc) return;
  let bloco = escreverCorpo(pc.bloco, conteudo, null);
  const texto = textoDe(conteudo).trim();
  if (texto) {
    const m = metricas(bloco);
    const cabe = (pt) => {
      const alturaLinha = pt * (FONTES[m.fonte] || FONTES.regular).linha * m.ln / 72;
      const disponiveis = maxLinhas || Math.max(1, Math.floor((m.h + 0.04) / alturaLinha));
      const precisa = contarLinhas(texto, m.w * 0.985, m.fonte, pt, m.spc * pt / m.pt);
      return { ok: precisa <= disponiveis, precisa, disponiveis };
    };
    let pt = m.pt;
    let r = cabe(pt);
    if (!r.ok) {
      const piso = Math.max(7, m.pt * min);
      while (!r.ok && pt - 0.5 >= piso) { pt -= 0.5; r = cabe(pt); }
      bloco = escreverCorpo(pc.bloco, conteudo, pt);
      if (!r.ok && rotulo && ctx) {
        const r0 = cabe(m.pt);
        const larguraTotal = texto.split('\n').reduce((s, l) => s + larguraTexto(l, m.fonte, m.pt, m.spc), 0);
        const cabem = Math.max(10, Math.floor(texto.length * Math.min(1, (r0.disponiveis * m.w * 0.9) / Math.max(larguraTotal, 0.01))));
        ctx.avisos.push(`${rotulo}: o texto está grande para o espaço (${texto.length} letras; cabem umas ${cabem}). Encurte.`);
      }
    }
  }
  trocar(p, pc, bloco);
}
// Título com a parte final marcada (fundo colorido), como nos títulos do modelo.
const titulo2 = (t) => {
  const o = t && typeof t === 'object' ? t : { texto: '', destaque: String(t || '') };
  let a = String(o.texto || ''); const d = String(o.destaque || '').trim();
  if (a && d && !/\s$/.test(a)) a += ' ';
  return [[[a, 0], [d, 1]]];
};
// Começo em negrito e o resto normal (tópicos e títulos dos cartões da página extra).
const comNegrito = (destaque, resto) => {
  const d = limpo(destaque), r = limpo(resto);
  return d ? [[[d, 0], [r ? ` ${r}` : '', 1]]] : [[[r, 1]]];
};
// Selo (pílula) que acompanha o tamanho do texto: a folga dos lados é a mesma do modelo.
function selo(ctx, p, fundo, nomeTexto, texto, rotulo, { min = 0.5, max = 9 } = {}) {
  const pc = acharPeca(p.xml, nomeTexto); if (!pc) return;
  const m0 = metricas(pc.bloco);
  const folga = Math.max(0.2, m0.w - larguraTexto(textoOriginal(pc.bloco), m0.fonte, m0.pt, m0.spc));
  const w = Math.min(max, Math.max(min, larguraTexto(texto, m0.fonte, m0.pt, m0.spc) + folga));
  mover(p, fundo, { w }); mover(p, nomeTexto, { w });
  T(ctx, p, nomeTexto, texto, rotulo, { linhas: 1 });
}

// ---------- páginas da apresentação ----------
async function lerSlides(zip) {
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  const alvo = {};
  for (const r of rels.match(/<Relationship\s[^>]*\/>/g) || []) alvo[pedaco(r, /Id="[^"]+"/).slice(4, -1)] = pedaco(r, /Target="[^"]+"/).slice(8, -1);
  return (pres.match(/<p:sldId\s[^>]*\/>/g) || []).map((t) => {
    const rId = pedaco(t, /r:id="[^"]+"/).slice(6, -1);
    return { tag: t, id: +pedaco(t, /\sid="\d+"/).replace(/\D/g, ''), rId, caminho: `ppt/${alvo[rId]}` };
  });
}
const relsDe = (caminho) => caminho.replace('slides/', 'slides/_rels/') + '.rels';
async function abrir(zip, s) {
  const r = zip.file(relsDe(s.caminho));
  return { s, xml: await zip.file(s.caminho).async('string'), rels: r ? await r.async('string') : RELS_VAZIO };
}
function guardar(zip, p) {
  // português no corretor do PowerPoint
  zip.file(p.s.caminho, p.xml.replace(/\slang="en-US"/g, ' lang="pt-BR"'));
  zip.file(relsDe(p.s.caminho), p.rels);
}
async function duplicarSlide(zip, origem, depoisDe) {
  let n = 0; zip.forEach((c) => { const m = c.match(/^ppt\/slides\/slide(\d+)\.xml$/); if (m) n = Math.max(n, +m[1]); });
  n += 1;
  const caminho = `ppt/slides/slide${n}.xml`;
  zip.file(caminho, await zip.file(origem.caminho).async('string'));
  const relsOrig = zip.file(relsDe(origem.caminho));
  const rels = (relsOrig ? await relsOrig.async('string') : RELS_VAZIO).replace(/<Relationship\s[^>]*notesSlide[^>]*\/>/g, '');
  zip.file(relsDe(caminho), rels);
  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace('</Types>', `<Override PartName="/${caminho}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file('[Content_Types].xml', ct);
  let prels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  let maxR = 0; prels.replace(/Id="rId(\d+)"/g, (_, x) => { maxR = Math.max(maxR, +x); return _; });
  const rId = `rId${maxR + 1}`;
  prels = prels.replace('</Relationships>', `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/></Relationships>`);
  zip.file('ppt/_rels/presentation.xml.rels', prels);
  let pres = await zip.file('ppt/presentation.xml').async('string');
  let maxId = 255;
  for (const t of pres.match(/<p:sldId\s[^>]*\/>/g) || []) maxId = Math.max(maxId, +pedaco(t, /\sid="\d+"/).replace(/\D/g, '') || 0);
  const tag = `<p:sldId id="${maxId + 1}" r:id="${rId}"/>`;
  pres = pres.replace(depoisDe.tag, `${depoisDe.tag}${tag}`);
  zip.file('ppt/presentation.xml', pres);
  return { tag, id: maxId + 1, rId, caminho };
}
async function apagarSlide(zip, s) {
  const pres = await zip.file('ppt/presentation.xml').async('string');
  zip.file('ppt/presentation.xml', pres.replace(s.tag, ''));
  const prels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  zip.file('ppt/_rels/presentation.xml.rels', prels.replace(new RegExp(`<Relationship\\s[^>]*Id="${s.rId}"[^>]*/>`), ''));
  let ct = await zip.file('[Content_Types].xml').async('string');
  const rc = relsDe(s.caminho);
  const rels = zip.file(rc) ? await zip.file(rc).async('string') : '';
  const notas = pedaco(rels, /<Relationship\s[^>]*notesSlide[^>]*\/>/);
  if (notas) {
    const alvo = pedaco(notas, /Target="[^"]+"/).slice(8, -1).replace('../', 'ppt/');
    zip.remove(alvo); zip.remove(alvo.replace('notesSlides/', 'notesSlides/_rels/') + '.rels');
    ct = ct.replace(new RegExp(`<Override PartName="/${escRe(alvo)}"[^>]*/>`), '');
  }
  ct = ct.replace(new RegExp(`<Override PartName="/${escRe(s.caminho)}"[^>]*/>`), '');
  zip.file('[Content_Types].xml', ct);
  zip.remove(s.caminho); zip.remove(rc);
}

// ---------- ícones e imagens ----------
const alvoDoRel = (rels, rid) => { const r = (rels.match(new RegExp(`<Relationship\\s[^>]*Id="${escRe(rid)}"[^>]*/>`)) || [''])[0]; return pedaco(r, /Target="[^"]+"/).slice(8, -1); };
function relImagem(p, alvo) {
  for (const r of p.rels.match(/<Relationship\s[^>]*\/>/g) || []) if (r.includes(`Target="${alvo}"`)) return pedaco(r, /Id="[^"]+"/).slice(4, -1);
  let maxR = 0; p.rels.replace(/Id="rId(\d+)"/g, (_, x) => { maxR = Math.max(maxR, +x); return _; });
  const rid = `rId${maxR + 1}`;
  p.rels = p.rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${TIPO_IMAGEM}" Target="${alvo}"/></Relationships>`);
  return rid;
}
async function lerIcones(zip, slides) {
  const mapa = {};
  for (const [chave, [pag, nome]] of Object.entries(ICONE_PECA)) {
    const p = await abrir(zip, slides[pag - 1]);
    const pc = acharPeca(p.xml, nome);
    const rid = pc && (pc.bloco.match(/r:embed="([^"]+)"/) || [])[1];
    if (rid) mapa[chave] = alvoDoRel(p.rels, rid);
  }
  return mapa;
}
function icone(ctx, p, nomePic, chave) {
  const alvo = chave && ctx.icones[chave]; if (!alvo) return;
  const pc = acharPeca(p.xml, nomePic); if (!pc) return;
  const rid = relImagem(p, alvo);
  trocar(p, pc, pc.bloco.replace(/r:embed="[^"]+"/, `r:embed="${rid}"`));
}
function tamanhoPng(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ---------- montagem ----------
const juntar = (...p) => p.map(limpo).filter(Boolean).join('  •  ');
const quatro = (lista) => (Array.isArray(lista) ? lista : []).slice(0, 4);

export async function montarProposta(conteudo, { logo = null } = {}) {
  const c = normalizarConteudo(conteudo) || {};
  const modelo = MODELOS_B64[c.modelo] ? c.modelo : MODELO_PADRAO;
  const zip = await JSZip.loadAsync(Buffer.from(MODELOS_B64[modelo], 'base64'));
  const slides = await lerSlides(zip);
  const ctx = { avisos: [], icones: await lerIcones(zip, slides) };
  const pag = (n) => slides[n - 1];
  const editar = async (s, fn) => { const p = await abrir(zip, typeof s === 'number' ? pag(s) : s); fn(p); guardar(zip, p); };
  const g = (k) => c[k] || {};
  const secao = limpo(c.secao).toUpperCase() || null;

  // 1. capa
  await editar(MAPA.capa, (p) => {
    const capa = g('capa');
    if (capa.tipo) selo(ctx, p, 'selo-1', 'selo-texto-2', limpo(capa.tipo).toUpperCase(), 'Capa · tipo', { max: 4.6 });
    tituloCapa(ctx, p, limpo(capa.nome));
    T(ctx, p, 'texto-3', limpo(capa.subtitulo1), 'Capa · subtítulo', { linhas: 1 });
    T(ctx, p, 'texto-4', limpo(capa.subtitulo2), 'Capa · segunda linha', { linhas: 1 });
    T(ctx, p, 'texto-6', limpo(capa.linha1), 'Capa · cliente e público', { linhas: 1 });
    T(ctx, p, 'texto-8', limpo(capa.linha2), 'Capa · carga e formato', { linhas: 1 });
    logoCliente(zip, p, logo);
  });
  // 2. o que entendemos da demanda
  await editar(MAPA.demanda, (p) => {
    const d = g('demanda');
    MAPA.demandaItens.forEach(([t, x], i) => { const it = quatro(d.itens)[i] || {}; T(ctx, p, t, limpo(it.titulo), `Demanda · item ${i + 1} · título`, { linhas: 1 }); T(ctx, p, x, limpo(it.texto), `Demanda · item ${i + 1} · texto`); });
    if (limpo(d.frase)) selo(ctx, p, 'selo-31', 'selo-texto-32', limpo(d.frase), 'Demanda · frase', { max: 9 }); else remover(p, ['selo-31', 'selo-texto-32']);
  });
  // 3. quem desenvolve (números da Mentorei ficam como no modelo) e 5. sócias
  await editar(MAPA.quem, (p) => { if (c.quem_titulo) T(ctx, p, 'Text 0', titulo2(c.quem_titulo), 'Quem desenvolve · título', { min: 0.85 }); });
  await editar(MAPA.socias, (p) => { if (c.socias_rodape) T(ctx, p, 'texto-93', limpo(c.socias_rodape), 'Sócias · linha de baixo', { linhas: 1 }); });
  // 4. expertise
  await editar(MAPA.expertise, (p) => {
    const e = g('expertise');
    if (e.titulo) T(ctx, p, 'Text 0', titulo2(e.titulo), 'Expertise · título', { min: 0.85 });
    MAPA.expertiseItens.forEach(([ic, t, x], i) => {
      const it = quatro(e.itens)[i] || {};
      icone(ctx, p, ic, it.icone); T(ctx, p, t, limpo(it.titulo), `Expertise · item ${i + 1} · título`, { linhas: 1 }); T(ctx, p, x, limpo(it.texto), `Expertise · item ${i + 1} · texto`);
    });
  });
  // 6. visão geral dos módulos (cartões acompanham a quantidade)
  const mods = (Array.isArray(c.modulos) ? c.modulos : []).slice(0, 6);
  await editar(MAPA.visao, (p) => {
    const v = g('visao');
    if (secao) T(ctx, p, 'secao-95', secao, null);
    if (v.titulo) T(ctx, p, 'Text 0', titulo2(v.titulo), 'Visão geral · título', { min: 0.85 });
    T(ctx, p, 'texto-128', limpo(v.rodape), 'Visão geral · rodapé', { linhas: 1 });
    cartoesVisao(ctx, p, mods);
  });
  // 12–17: metodologia, personalização, organização, investimento, próximos passos, frase
  await editar(MAPA.metodologia, (p) => {
    if (secao) T(ctx, p, 'secao-261', secao, null);
    MAPA.metodologiaItens.forEach(([ic, t, x], i) => {
      const it = quatro(g('metodologia').itens)[i] || {};
      icone(ctx, p, ic, it.icone); T(ctx, p, t, limpo(it.titulo), `Metodologia · item ${i + 1} · título`); T(ctx, p, x, limpo(it.texto), `Metodologia · item ${i + 1} · texto`);
    });
  });
  await editar(MAPA.personalizacao, (p) => {
    const d = g('personalizacao');
    MAPA.personalizacaoItens.forEach(([t, x], i) => { const it = quatro(d.itens)[i] || {}; T(ctx, p, t, limpo(it.titulo), `Personalização · item ${i + 1} · título`, { linhas: 1 }); T(ctx, p, x, limpo(it.texto), `Personalização · item ${i + 1} · texto`); });
    if (limpo(d.frase)) selo(ctx, p, 'selo-308', 'selo-texto-309', limpo(d.frase), 'Personalização · frase', { max: 9 }); else remover(p, ['selo-308', 'selo-texto-309']);
  });
  await editar(MAPA.organizacao, (p) => organizacao(ctx, p, g('organizacao'), mods));
  await editar(MAPA.investimento, (p) => investimento(ctx, p, c));
  await editar(MAPA.proximos, (p) => {
    MAPA.proximosItens.forEach(([t, x], i) => { const it = quatro(g('proximos').itens)[i] || {}; T(ctx, p, t, limpo(it.titulo), `Próximos passos · ${i + 1} · título`, { linhas: 1 }); T(ctx, p, x, limpo(it.texto), `Próximos passos · ${i + 1} · texto`); });
    // validade da proposta junto do contato (o resto do selo fica como no modelo)
    const dias = Number(c.validade_dias) || 0;
    const pc = acharPeca(p.xml, 'selo-texto-349');
    if (dias && pc) selo(ctx, p, 'selo-348', 'selo-texto-349', `Proposta válida por ${dias} dias  •  ${textoOriginal(pc.bloco)}`, null, { max: 9 });
  });
  await editar(MAPA.frase, (p) => { if (c.frase_final) T(ctx, p, 'Text 0', fraseFinal(c.frase_final), 'Frase final', { min: 0.7 }); });

  // páginas dos módulos (uma por módulo) e páginas extras depois do módulo indicado
  const moldeModulo = pag(MAPA.modulo), moldeDestaque = pag(MAPA.destaque);
  let anterior = pag(MAPA.apagar[MAPA.apagar.length - 1]);
  const destaques = (Array.isArray(c.destaques) ? c.destaques : []).slice(0, 2);
  const rotulo = limpo(c.rotulo_modulo).toUpperCase();
  const posicao = (d) => { const n = Number(d.apos_modulo); return n >= 1 && n <= mods.length ? n : mods.length; };
  for (let i = 0; i < mods.length; i += 1) {
    const m = mods[i] || {};
    const s = await duplicarSlide(zip, moldeModulo, anterior); anterior = s;
    await editar(s, (p) => paginaModulo(ctx, p, m, i, rotulo));
    for (const d of destaques.filter((x) => posicao(x) === i + 1)) {
      const sd = await duplicarSlide(zip, moldeDestaque, anterior); anterior = sd;
      await editar(sd, (p) => paginaDestaque(ctx, p, d, secao));
    }
  }
  for (const n of [...new Set(MAPA.apagar)]) await apagarSlide(zip, pag(n));

  // título do arquivo (aparece nas propriedades)
  const core = zip.file('docProps/core.xml');
  if (core) {
    let x = await core.async('string');
    const titulo = esc(`Proposta Mentorei · ${limpo(g('capa').nome) || 'Proposta'}`);
    x = /<dc:title>/.test(x) ? x.replace(/<dc:title>[\s\S]*?<\/dc:title>/, () => `<dc:title>${titulo}</dc:title>`) : x.replace('</cp:coreProperties>', () => `<dc:title>${titulo}</dc:title></cp:coreProperties>`);
    x = x.replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator>Mentorei</dc:creator>');
    zip.file('docProps/core.xml', x);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, avisos: ctx.avisos, modelo };
}

// Título grande da capa: o maior tamanho de letra em que o nome cabe em até 2 linhas (ou 3, em letra menor).
function tituloCapa(ctx, p, nome) {
  if (!nome) return;
  const pc = acharPeca(p.xml, 'Text 0'); if (!pc) return;
  const m = metricas(pc.bloco);
  const largura = m.w * 0.97;
  const palavras = nome.split(/\s+/);
  let escolha = null;
  for (let pt = m.pt; pt >= 28; pt -= 2) {
    const spc = m.spc * pt / m.pt;
    const linhas = []; let atual = ''; let ok = true;
    for (const w of palavras) {
      if (larguraTexto(w, 'extrabold', pt, spc) > largura) { ok = false; break; }
      const t = atual ? `${atual} ${w}` : w;
      if (!atual || larguraTexto(t, 'extrabold', pt, spc) <= largura) atual = t; else { linhas.push(atual); atual = w; }
    }
    if (atual) linhas.push(atual);
    if (ok && linhas.length <= (pt >= 42 ? 2 : 3)) { escolha = { pt, linhas }; break; }
  }
  if (!escolha) { escolha = { pt: 28, linhas: [nome] }; ctx.avisos.push(`Capa · nome: "${nome}" é comprido para a capa. Prefira um nome mais curto.`); }
  trocar(p, pc, escreverCorpo(pc.bloco, escolha.linhas.join('\n'), escolha.pt));
}

// Logo do cliente na capa (no espaço do modelo, sobre fundo branco); sem logo, o espaço e o traço somem.
function logoCliente(zip, p, logo) {
  const tam = logo && logo.dados ? tamanhoPng(logo.dados) : null;
  if (!tam) { remover(p, ['logo-cliente-espaco', 'logo-cliente-texto', 'divisor-logos']); return; }
  const esp = caixa(p, 'logo-cliente-espaco');
  if (!esp) return;
  remover(p, ['logo-cliente-texto']);
  const pc = acharPeca(p.xml, 'logo-cliente-espaco');
  if (pc) {
    const novo = pc.bloco.replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/, '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>')
      .replace(/<a:ln\b[^>]*>[\s\S]*?<\/a:ln>|<a:ln\b[^>]*\/>/, '<a:ln><a:noFill/></a:ln>');
    trocar(p, pc, novo);
  }
  const folga = 0.07;
  const k = Math.min((esp.w - 2 * folga) / tam.w, (esp.h - 2 * folga) / tam.h);
  const w = tam.w * k, h = tam.h * k;
  const x = esp.x + (esp.w - w) / 2, y = esp.y + (esp.h - h) / 2;
  zip.file('ppt/media/logo-cliente.png', logo.dados);
  const rid = relImagem(p, '../media/logo-cliente.png');
  const id = maiorId(p.xml) + 1;
  const pic = `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="logo-cliente" descr="Logo do cliente"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  p.xml = p.xml.replace('</p:spTree>', `${pic}</p:spTree>`);
}

// Cartões da visão geral: até 4 lado a lado no tamanho do modelo; 5 ou 6 ficam mais estreitos (letra menor).
function cartoesVisao(ctx, p, mods) {
  const base = MAPA.visaoCartoes;
  const n = Math.max(1, mods.length);
  const grupos = base.map((g) => g.slice());
  for (let i = base.length; i < n; i += 1) grupos.push(clonar(p, base[base.length - 1], `c${i + 1}`));
  for (let i = n; i < base.length; i += 1) remover(p, base[i]);
  const x0 = caixa(p, base[0][0]).x, larguraTotal = 9.0;
  const vao = n >= 5 ? 0.18 : 0.23;
  const W = n === 1 ? (larguraTotal - vao) / 2 : (larguraTotal - (n - 1) * vao) / n;
  const k = Math.min(1, W / 2.08);
  grupos.slice(0, n).forEach((gr, i) => {
    const [cartao, numero, fundo, ic, tit, desc, sf, st] = gr;
    const m = mods[i] || {};
    const X = x0 + i * (W + vao);
    const dentro = 0.24 * Math.max(k, 0.8);
    const tf = 0.46 * Math.max(k, 0.75), ti = 0.23 * Math.max(k, 0.75);
    const cf = caixa(p, fundo);
    mover(p, cartao, { x: X, w: W });
    mover(p, numero, { x: X + dentro, w: Math.min(1.2, W - 2 * dentro) });
    if (cf) {
      mover(p, fundo, { x: X + W - dentro - tf, w: tf, h: tf });
      mover(p, ic, { x: X + W - dentro - tf + (tf - ti) / 2, y: cf.y + (tf - ti) / 2, w: ti, h: ti });
    }
    mover(p, tit, { x: X + dentro, w: W - 2 * dentro });
    mover(p, desc, { x: X + dentro, w: W - 2 * dentro });
    mover(p, sf, { x: X + dentro }); mover(p, st, { x: X + dentro });
    const pcN = acharPeca(p.xml, numero);
    if (pcN) trocar(p, pcN, escreverCorpo(pcN.bloco, num2(i), k < 1 ? metricas(pcN.bloco).pt * Math.max(k, 0.7) : null));
    icone(ctx, p, ic, m.icone);
    if (k < 1) for (const [nome, pisoPt] of [[tit, 10], [desc, 8.5]]) {
      const pc = acharPeca(p.xml, nome); if (pc) trocar(p, pc, escreverCorpo(pc.bloco, 'x', Math.max(pisoPt, metricas(pc.bloco).pt * k)));
    }
    T(ctx, p, tit, limpo(m.titulo_curto || m.titulo), `Visão geral · módulo ${i + 1} · título curto`);
    T(ctx, p, desc, limpo(m.chamada || m.subtitulo), `Visão geral · módulo ${i + 1} · frase`);
    const q = limpo(m.quando_curto || m.quando);
    if (q) selo(ctx, p, sf, st, q, `Visão geral · módulo ${i + 1} · período`, { min: 0.6, max: W - 2 * dentro });
    else remover(p, [sf, st]);
  });
}

function paginaModulo(ctx, p, m, i, rotulo) {
  const r = `Módulo ${i + 1}`;
  if (rotulo) T(ctx, p, 'etiqueta-129', rotulo, null);
  T(ctx, p, 'texto-130', num2(i), null);
  T(ctx, p, 'Text 0', limpo(m.titulo), `${r} · título`, { min: 0.8 });
  T(ctx, p, 'texto-131', limpo(m.subtitulo), `${r} · subtítulo`);
  const q = limpo(m.quando);
  if (q) selo(ctx, p, 'selo-132', 'selo-texto-133', q, `${r} · período`, { min: 1.0, max: 2.6 }); else remover(p, ['selo-132', 'selo-texto-133']);
  T(ctx, p, 'texto-136', limpo(m.objetivo), `${r} · objetivo`);
  T(ctx, p, 'texto-139', limpo(m.entrega), `${r} · entrega prática`);
  const tops = (Array.isArray(m.topicos) ? m.topicos : []).slice(0, 5);
  MAPA.topicos.forEach(([div, n, t], k) => {
    const tp = tops[k];
    if (!tp) { remover(p, [div, n, t]); return; }
    const o = typeof tp === 'object' ? tp : { destaque: '', texto: String(tp) };
    T(ctx, p, t, comNegrito(o.destaque, o.texto), `${r} · tópico ${k + 1}`);
  });
}

function paginaDestaque(ctx, p, d, secao) {
  if (secao) T(ctx, p, 'secao-211', secao, null);
  T(ctx, p, 'Text 0', titulo2(d.titulo), 'Página extra · título', { min: 0.85 });
  if (limpo(d.subtitulo)) T(ctx, p, 'texto-212', limpo(d.subtitulo), 'Página extra · subtítulo', { linhas: 1 }); else remover(p, ['texto-212']);
  MAPA.destaqueItens.forEach(([ic, prod, x], i) => {
    const it = quatro(d.itens)[i] || {};
    icone(ctx, p, ic, it.icone);
    T(ctx, p, prod, comNegrito(it.destaque, it.texto_destaque), `Página extra · item ${i + 1} · título`);
    T(ctx, p, x, limpo(it.texto), `Página extra · item ${i + 1} · texto`);
  });
}

// Tabela da organização: uma linha por item; barras coloridas juntam as linhas seguidas do mesmo período.
function organizacao(ctx, p, o, mods) {
  if (o.titulo) T(ctx, p, 'Text 0', titulo2(o.titulo), 'Organização · título', { min: 0.85 });
  T(ctx, p, 'texto-312', limpo(o.subtitulo), 'Organização · subtítulo', { linhas: 1 });
  let linhas = (Array.isArray(o.linhas) ? o.linhas : []).filter((l) => l && (l.c1 || l.c2 || l.c3 || l.c4)).slice(0, 8);
  if (!linhas.length) linhas = mods.map((m, i) => ({ c1: '', c2: '', c3: num2(i), c4: limpo(m.titulo) }));
  const pc = acharPeca(p.xml, 'tabela-jornada');
  if (!pc || !linhas.length) return;
  const cab = lerCaixa(pc.bloco);
  const trs = pc.bloco.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || [];
  if (trs.length < 2) return;
  const altCab = +(trs[0].match(/<a:tr h="(\d+)"/) || [0, 384048])[1] / POL;
  const altModelo = +(trs[1].match(/<a:tr h="(\d+)"/) || [0, 512064])[1] / POL;
  const h = Math.min(altModelo, altModelo * (trs.length - 1) / linhas.length);
  const preencher = (tr, valores, altura) => {
    let k = 0;
    const novo = tr.replace(/<a:tc\b[\s\S]*?<\/a:tc>/g, (tc) => escreverCorpo(tc, limpo(valores[k++] || ''), null));
    return altura ? novo.replace(/<a:tr h="\d+"/, `<a:tr h="${emu(altura)}"`) : novo;
  };
  const colunas = Array.isArray(o.colunas) ? o.colunas : [];
  const novoCab = colunas.length ? preencher(trs[0], colunas.map((t) => limpo(t).toUpperCase()), null) : trs[0];
  const meio = trs[1], ultima = trs[trs.length - 1];
  const corpo = linhas.map((l, i) => preencher(i === linhas.length - 1 ? ultima : meio, [l.c1, l.c2, l.c3, l.c4], h)).join('');
  const iniT = pc.bloco.indexOf('<a:tr '), fimT = pc.bloco.lastIndexOf('</a:tr>') + '</a:tr>'.length;
  let bloco = pc.bloco.slice(0, iniT) + novoCab + corpo + pc.bloco.slice(fimT);
  bloco = bloco.replace(/(<p:xfrm>\s*<a:off[^>]*\/>\s*)<a:ext cx="(\d+)" cy="\d+"\/>/, (_, a, cx) => `${a}<a:ext cx="${cx}" cy="${emu(altCab + h * linhas.length)}"/>`);
  trocar(p, pc, bloco);
  // cartão de fundo e rodapé acompanham a altura da tabela
  const cartao = caixa(p, 'cartao-313');
  const fimTabela = cab.y + altCab + h * linhas.length;
  if (cartao) mover(p, 'cartao-313', { h: fimTabela + 0.06 - cartao.y });
  mover(p, 'texto-314', { y: fimTabela + 0.22 });
  T(ctx, p, 'texto-314', limpo(o.rodape), 'Organização · rodapé', { linhas: 1 });
  // barras: uma por grupo de linhas seguidas com o mesmo período (coluna 1), alternando as duas cores do modelo
  const moldes = ['marca-manha', 'marca-tarde'].map((n) => acharPeca(p.xml, n)).filter(Boolean).map((x) => x.bloco);
  remover(p, ['marca-manha', 'marca-tarde']);
  if (!moldes.length) return;
  const { x: xBarra, w: wBarra } = lerCaixa(moldes[0]);
  const grupos = [];
  linhas.forEach((l, i) => { const k = limpo(l.c1).toLowerCase(); const ult = grupos[grupos.length - 1]; if (ult && k && ult.k === k) ult.fim = i; else grupos.push({ k, ini: i, fim: i }); });
  let id = maiorId(p.xml), novas = '';
  grupos.forEach((gr, j) => {
    id += 1;
    const y = cab.y + altCab + gr.ini * h + Math.min(0.09, h * 0.16);
    const alt = (gr.fim - gr.ini + 1) * h - Math.min(0.08, h * 0.15);
    novas += moldes[j % moldes.length]
      .replace(/<p:cNvPr\s+id="\d+"\s+name="[^"]*"/, `<p:cNvPr id="${id}" name="marca-${j + 1}"`)
      .replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, `<a:off x="${emu(xBarra)}" y="${emu(y)}"/>`)
      .replace(/<a:ext cx="(\d+)" cy="(\d+)"\/>/, `<a:ext cx="${emu(wBarra)}" cy="${emu(alt)}"/>`);
  });
  p.xml = p.xml.replace('</p:spTree>', `${novas}</p:spTree>`);
}

// Investimento: as caixas mostram os preços digitados na tela (1 a 3 opções). Com uma opção só, a caixa da direita
// mostra o escopo escrito pela IA. "Incluso" vem da IA; condições de pagamento e validade vêm da tela.
function investimento(ctx, p, c) {
  const inv = c.investimento || {};
  const precos = precosValidos(c.precos);
  const esq = { painel: 'painel-investimento', rot: 'texto-318', val: 'texto-319', txt: 'texto-320' };
  const dir = { cartao: 'cartao-317', rot: 'texto-321', val: 'texto-322', txt: 'texto-323' };
  const caixaEsq = caixa(p, esq.painel), caixaDir = caixa(p, dir.cartao);
  if (!caixaEsq || !caixaDir) return;
  const recuo = caixa(p, esq.rot).x - caixaEsq.x;
  const preencher = (cx, op, i) => {
    const d = descreverPreco(op);
    T(ctx, p, cx.rot, limpo(op.nome) || (i === 0 ? limpo(inv.nome_oferta) : '') || `Opção ${i + 1}`, `Investimento · opção ${i + 1} · nome`, { linhas: 1 });
    T(ctx, p, cx.val, d.valor, null, { linhas: 1, min: 0.6 });
    const linhas = d.linhas.length ? d.linhas : (i === 0 && limpo(inv.descricao_oferta) ? [limpo(inv.descricao_oferta)] : ['']);
    T(ctx, p, cx.txt, linhas.join('\n'), `Investimento · opção ${i + 1} · descrição`);
  };
  const lista = precos.length ? precos : [{ nome: '', valor: null }];
  if (lista.length >= 3) {
    // três caixas mais estreitas: a do meio é uma cópia da caixa da direita
    const vao = 0.25;
    const W = (caixaDir.x + caixaDir.w - caixaEsq.x - 2 * vao) / 3;
    const meio = clonar(p, [dir.cartao, dir.rot, dir.val, dir.txt], 'meio');
    const mid = { cartao: meio[0], rot: meio[1], val: meio[2], txt: meio[3] };
    const xs = [caixaEsq.x, caixaEsq.x + W + vao, caixaEsq.x + 2 * (W + vao)];
    const pcPainel = acharPeca(p.xml, esq.painel);
    if (pcPainel) {
      const corte = Math.round((1 - W / caixaEsq.w) * 100000);
      trocar(p, pcPainel, pcPainel.bloco.replace(/<a:srcRect[^>]*\/>/, '').replace(/(<a:blip\b[^>]*?\/>|<a:blip\b[^>]*>[\s\S]*?<\/a:blip>)/, `$1<a:srcRect r="${corte}"/>`));
    }
    mover(p, esq.painel, { x: xs[0], w: W });
    [[esq, xs[0]], [mid, xs[1]], [dir, xs[2]]].forEach(([cx, x]) => {
      if (cx.cartao) mover(p, cx.cartao, { x, w: W });
      for (const k of ['rot', 'val', 'txt']) mover(p, cx[k], { x: x + recuo, w: W - 2 * recuo });
    });
    preencher(esq, lista[0], 0); preencher(mid, lista[1], 1); preencher(dir, lista[2], 2);
  } else {
    preencher(esq, lista[0], 0);
    if (lista[1]) preencher(dir, lista[1], 1);
    else {
      const e = inv.escopo || {};
      T(ctx, p, dir.rot, limpo(e.rotulo) || 'Escopo contemplado', 'Investimento · escopo · título', { linhas: 1 });
      T(ctx, p, dir.val, limpo(e.destaque) || 'Conteúdo + prática', 'Investimento · escopo · destaque', { linhas: 1, min: 0.7 });
      T(ctx, p, dir.txt, limpo(e.texto), 'Investimento · escopo · texto');
    }
  }
  const incluso = limpo(inv.incluso).replace(/^Incluso:\s*/i, '') || 'customização dos conteúdos, casos, apresentação e material digital.';
  T(ctx, p, 'incluso', [[['Incluso:', 0], [` ${incluso}`, 1]]], 'Investimento · incluso');
  const pagamento = limpo(c.pagamento);
  const rodape = juntar(
    limpo(inv.nao_incluso) || 'Não incluso: logística, materiais impressos e despesas de viagem.',
    pagamento ? `Pagamento: ${pagamento.replace(/^pagamento:\s*/i, '')}` : 'Condições de pagamento a combinar',
  );
  const pcR = acharPeca(p.xml, 'texto-325');
  if (pcR) {
    const m = metricas(pcR.bloco);
    if (contarLinhas(rodape, m.w, m.fonte, m.pt, m.spc) > 1) mover(p, 'texto-325', { y: m.y - 0.08, h: m.h + 0.2 });
  }
  T(ctx, p, 'texto-325', rodape, 'Investimento · rodapé (não incluso, pagamento e validade)', { linhas: 2 });
}

function fraseFinal(f) {
  const o = f && typeof f === 'object' ? f : { antes: String(f || ''), destaque: '', depois: '' };
  const tira = (t) => limpo(t).replace(/^[“"]+|[”"]+$/g, '');
  const partes = [tira(o.antes), tira(o.destaque), tira(o.depois)];
  // uma frase por linha, como no modelo; a do meio com o fundo colorido
  const usadas = partes.map((t, i) => [t, i === 1 ? 1 : 0]).filter(([t]) => t);
  if (!usadas.length) return [[['', 0]]];
  usadas[0][0] = `“${usadas[0][0]}`;
  usadas[usadas.length - 1][0] += '”';
  return usadas.map((u) => [u]);
}
