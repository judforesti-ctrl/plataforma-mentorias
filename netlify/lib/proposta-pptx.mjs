// Monta o PowerPoint da proposta comercial a partir do modelo (netlify/lib/modelos/proposta-modelo.pptx, embutido em
// proposta-modelo.mjs) e do conteúdo organizado pela IA (ou editado na tela). Trabalha direto no XML do .pptx:
// troca textos, remove peças que sobram, repete linhas e duplica a página de módulo quantas vezes for preciso.
// MAPA descreve o modelo atual (nomes das caixas de texto por página). Se o modelo mudar, é aqui que se ajusta.
import JSZip from 'jszip';
import { MODELO_B64 } from './modelos/proposta-modelo.mjs';

const POL = 914400; // 1 polegada em EMU
const esc = (t) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Páginas do modelo, pela ordem em que aparecem na apresentação (1 = capa).
export const MAPA = {
  capa: 1, demanda: 2, quem: 3, expertise: 4, socias: 5, visao: 6, modulo: 7, destaque: 9,
  apagar: [8, 9, 10, 11, 12],                       // páginas de exemplo do modelo que não vão para a proposta nova
  metodologia: 13, personalizacao: 14, organizacao: 15, investimento: 16, proximos: 17, frase: 18,
  // grupos de 4 itens (título + texto), com as peças decorativas de cada item
  quatro: {
    demanda: [['Shape 4', 'Shape 5', 'Text 6', 'Text 7', 'Text 8'], ['Shape 9', 'Shape 10', 'Text 11', 'Text 12', 'Text 13'], ['Shape 14', 'Shape 15', 'Text 16', 'Text 17', 'Text 18'], ['Shape 19', 'Shape 20', 'Text 21', 'Text 22', 'Text 23']],
    lista: [['Shape 4', 'Text 5', 'Text 6'], ['Shape 7', 'Text 8', 'Text 9'], ['Shape 10', 'Text 11', 'Text 12'], ['Shape 13', 'Text 14', 'Text 15']],   // expertise, destaque, metodologia
    proximos: [['Shape 4', 'Shape 5', 'Text 6', 'Text 7', 'Text 8'], ['Shape 9', 'Shape 10', 'Text 11', 'Text 12', 'Text 13'], ['Shape 14', 'Shape 15', 'Text 16', 'Text 17', 'Text 18'], ['Shape 19', 'Shape 20', 'Text 21', 'Text 22', 'Text 23']],
  },
  // linhas repetíveis: primeira linha, passo entre linhas e limite de baixo (polegadas)
  visaoLinhas: { grupos: [['Shape 4', 'Text 5', 'Text 6', 'Text 7'], ['Shape 8', 'Text 9', 'Text 10', 'Text 11'], ['Shape 12', 'Text 13', 'Text 14', 'Text 15'], ['Shape 16', 'Text 17', 'Text 18', 'Text 19']], y0: 1.35, passo: 0.73, altura: 0.62, limite: 4.98 },
  orgLinhas: { grupos: [['Shape 10', 'Text 11', 'Text 12', 'Text 13', 'Text 14'], ['Shape 15', 'Text 16', 'Text 17', 'Text 18', 'Text 19'], ['Shape 20', 'Text 21', 'Text 22', 'Text 23', 'Text 24'], ['Shape 25', 'Text 26', 'Text 27', 'Text 28', 'Text 29']], y0: 2.05, passo: 0.55, altura: 0.55, limite: 4.9 },
  topicos: [['Shape 14', 'Text 15'], ['Shape 16', 'Text 17'], ['Shape 18', 'Text 19'], ['Shape 20', 'Text 21'], ['Shape 22', 'Text 23']],
};

// ---------- XML por texto (sem parser: o modelo é regular e isso evita dependências) ----------
function acharShape(xml, nome) {
  const re = /<p:sp>|<p:sp\s[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const fim = xml.indexOf('</p:sp>', m.index);
    if (fim < 0) break;
    const bloco = xml.slice(m.index, fim + 7);
    const nm = bloco.match(/<p:cNvPr\s[^>]*name="([^"]*)"/);
    if (nm && nm[1] === nome) return { inicio: m.index, fim: fim + 7, bloco };
  }
  return null;
}
const pedaco = (s, re) => (s.match(re) || [''])[0];

// Troca o texto de uma caixa mantendo a formatação de cada parágrafo (linhas = quebras de linha).
function comTexto(bloco, texto) {
  const ini = bloco.indexOf('<p:txBody>'), fim = bloco.indexOf('</p:txBody>');
  if (ini < 0 || fim < 0) return bloco;
  const corpo = bloco.slice(ini, fim);
  const paras = corpo.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
  if (!paras.length) return bloco;
  const cabeca = corpo.slice(0, corpo.indexOf('<a:p>'));
  const modelos = paras.map((p) => {
    const fimP = pedaco(p, /<a:endParaRPr[\s\S]*?<\/a:endParaRPr>|<a:endParaRPr[^>]*\/>/);
    let rPr = pedaco(p, /<a:rPr[\s\S]*?<\/a:rPr>|<a:rPr[^>]*\/>/);
    if (!rPr && fimP) rPr = fimP.replace(/a:endParaRPr/g, 'a:rPr');
    return { pPr: pedaco(p, /<a:pPr[\s\S]*?<\/a:pPr>|<a:pPr[^>]*\/>/), rPr, fimP };
  });
  const linhas = String(texto == null ? '' : texto).replace(/\r/g, '').split('\n');
  const novo = linhas.map((l, i) => {
    const m = modelos[Math.min(i, modelos.length - 1)];
    return l.trim() === '' ? `<a:p>${m.pPr}${m.fimP}</a:p>` : `<a:p>${m.pPr}<a:r>${m.rPr}<a:t>${esc(l)}</a:t></a:r>${m.fimP}</a:p>`;
  }).join('');
  return bloco.slice(0, ini) + cabeca + novo + bloco.slice(fim);
}
function definir(xml, nome, texto) {
  if (texto == null) return xml;
  const b = acharShape(xml, nome);
  return b ? xml.slice(0, b.inicio) + comTexto(b.bloco, texto) + xml.slice(b.fim) : xml;
}
function remover(xml, nomes) {
  for (const n of nomes) { const b = acharShape(xml, n); if (b) xml = xml.slice(0, b.inicio) + xml.slice(b.fim); }
  return xml;
}
const lerY = (bloco) => +(bloco.match(/<a:off x="-?\d+" y="(-?\d+)"\/>/) || [0, 0])[1] / POL;
function moverY(xml, nome, yPol) {
  const b = acharShape(xml, nome); if (!b) return xml;
  const novo = b.bloco.replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (_, x) => `<a:off x="${x}" y="${Math.round(yPol * POL)}"/>`);
  return xml.slice(0, b.inicio) + novo + xml.slice(b.fim);
}
// Copia um grupo de peças com nomes novos (sufixo) e deslocadas em dy polegadas.
function clonar(xml, nomes, dy, sufixo) {
  let maxId = 0; xml.replace(/<p:cNvPr\s+id="(\d+)"/g, (_, id) => { maxId = Math.max(maxId, +id); return _; });
  let novos = '';
  for (const n of nomes) {
    const b = acharShape(xml, n); if (!b) continue;
    maxId += 1;
    novos += b.bloco.replace(/<p:cNvPr\s+id="\d+"\s+name="[^"]*"/, `<p:cNvPr id="${maxId}" name="${n} ${sufixo}"`)
      .replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (_, x, y) => `<a:off x="${x}" y="${Math.round(+y + dy * POL)}"/>`);
  }
  return xml.replace('</p:spTree>', `${novos}</p:spTree>`);
}

// Quatro itens (título + texto): preenche os que vierem e apaga os que faltarem.
function quatroItens(xml, grupos, itens, { numeroEm = null } = {}) {
  grupos.forEach((g, i) => {
    const it = (itens || [])[i];
    if (!it) { xml = remover(xml, g); return; }
    const textos = g.filter((n) => n.startsWith('Text'));
    const [tNum, tTit, tTxt] = textos.length === 3 ? textos : [null, textos[0], textos[1]];
    if (tNum && numeroEm) xml = definir(xml, tNum, String(i + 1));
    xml = definir(xml, tTit, it.titulo); xml = definir(xml, tTxt, it.texto);
  });
  return xml;
}
// Linhas repetíveis (visão geral e organização): N linhas, apertando o espaço se forem muitas.
function linhas(xml, cfg, dados, preencher) {
  const n = dados.length, base = cfg.grupos.length;
  const passo = n <= 1 ? cfg.passo : Math.min(cfg.passo, (cfg.limite - cfg.y0 - cfg.altura) / (n - 1));
  for (let i = 0; i < Math.max(n, base); i += 1) {
    const d = dados[i];
    if (i < base) {
      if (!d) { xml = remover(xml, cfg.grupos[i]); continue; }
      for (const nome of cfg.grupos[i]) {
        const b = acharShape(xml, nome); if (!b) continue;
        const desvio = lerY(b.bloco) - (cfg.y0 + i * cfg.passo);      // a peça pode ficar um pouco abaixo da faixa
        xml = moverY(xml, nome, cfg.y0 + i * passo + desvio);
      }
      xml = preencher(xml, cfg.grupos[i], d, i);
    } else {
      const sufixo = `r${i + 1}`;
      const molde = cfg.grupos[base - 1];
      xml = clonar(xml, molde, (i - (base - 1)) * passo, sufixo);
      xml = preencher(xml, molde.map((m) => `${m} ${sufixo}`), d, i);
    }
  }
  return xml;
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
async function duplicarSlide(zip, origem, depoisDe) {
  let n = 0; zip.forEach((p) => { const m = p.match(/^ppt\/slides\/slide(\d+)\.xml$/); if (m) n = Math.max(n, +m[1]); });
  n += 1;
  const caminho = `ppt/slides/slide${n}.xml`;
  zip.file(caminho, await zip.file(origem.caminho).async('string'));
  const relsOrig = zip.file(origem.caminho.replace('slides/', 'slides/_rels/') + '.rels');
  let rels = relsOrig ? await relsOrig.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  rels = rels.replace(/<Relationship\s[^>]*notesSlide[^>]*\/>/g, '');
  zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, rels);
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
  const relsCaminho = s.caminho.replace('slides/', 'slides/_rels/') + '.rels';
  const rels = zip.file(relsCaminho) ? await zip.file(relsCaminho).async('string') : '';
  const notas = pedaco(rels, /<Relationship\s[^>]*notesSlide[^>]*\/>/);
  if (notas) {
    const alvo = pedaco(notas, /Target="[^"]+"/).slice(8, -1).replace('../', 'ppt/');
    zip.remove(alvo); zip.remove(alvo.replace('notesSlides/', 'notesSlides/_rels/') + '.rels');
    ct = ct.replace(new RegExp(`<Override PartName="/${escRe(alvo)}"[^>]*/>`), '');
  }
  ct = ct.replace(new RegExp(`<Override PartName="/${escRe(s.caminho)}"[^>]*/>`), '');
  zip.file('[Content_Types].xml', ct);
  zip.remove(s.caminho); zip.remove(relsCaminho);
}

// ---------- montagem ----------
const juntar = (...p) => p.filter(Boolean).join('  •  ');
const num2 = (i) => String(i + 1).padStart(2, '0');

export async function montarProposta(c) {
  const zip = await JSZip.loadAsync(Buffer.from(MODELO_B64, 'base64'));
  const slides = await lerSlides(zip);
  const pag = (n) => slides[n - 1];
  const editar = async (n, fn) => { const s = typeof n === 'number' ? pag(n) : n; const xml = await zip.file(s.caminho).async('string'); zip.file(s.caminho, fn(xml)); };
  const q = MAPA.quatro;
  const g = (sec) => c[sec] || {};

  // capa
  await editar(MAPA.capa, (x) => { x = definir(x, 'Text 3', g('capa').tipo); x = definir(x, 'Text 4', g('capa').nome); x = definir(x, 'Text 5', g('capa').subtitulo); return definir(x, 'Text 7', g('capa').rodape); });
  // demanda
  await editar(MAPA.demanda, (x) => { x = definir(x, 'Text 3', g('demanda').titulo); x = quatroItens(x, q.demanda, g('demanda').itens, { numeroEm: true }); return definir(x, 'Text 24', g('demanda').frase); });
  // quem desenvolve e sócias: só os títulos variam
  await editar(MAPA.quem, (x) => definir(x, 'Text 3', c.quem_titulo));
  await editar(MAPA.socias, (x) => definir(x, 'Text 19', c.socias_rodape));
  // expertise
  await editar(MAPA.expertise, (x) => { x = definir(x, 'Text 3', g('expertise').titulo); return quatroItens(x, q.lista, g('expertise').itens); });
  // visão geral dos módulos
  const mods = c.modulos || [];
  await editar(MAPA.visao, (x) => {
    x = definir(x, 'Text 3', g('visao').titulo); x = definir(x, 'Text 24', g('visao').rodape);
    return linhas(x, MAPA.visaoLinhas, mods, (xml, gr, m, i) => { xml = definir(xml, gr[1], num2(i)); xml = definir(xml, gr[2], m.titulo_curto || m.titulo); return definir(xml, gr[3], juntar(m.subtitulo, m.quando)); });
  });
  // metodologia, personalização, organização, investimento, próximos passos, frase
  await editar(MAPA.metodologia, (x) => { x = definir(x, 'Text 3', g('metodologia').titulo); return quatroItens(x, q.lista, g('metodologia').itens); });
  await editar(MAPA.personalizacao, (x) => { x = definir(x, 'Text 3', g('personalizacao').titulo); x = quatroItens(x, q.demanda, g('personalizacao').itens, { numeroEm: true }); return definir(x, 'Text 24', g('personalizacao').frase); });
  await editar(MAPA.organizacao, (x) => {
    const o = g('organizacao');
    x = definir(x, 'Text 3', o.titulo); x = definir(x, 'Text 4', o.subtitulo); x = definir(x, 'Text 35', o.rodape);
    (o.colunas || []).slice(0, 4).forEach((t, i) => { x = definir(x, `Text ${6 + i}`, t); });
    return linhas(x, MAPA.orgLinhas, o.linhas || [], (xml, gr, l) => { xml = definir(xml, gr[1], l.c1); xml = definir(xml, gr[2], l.c2); xml = definir(xml, gr[3], l.c3); return definir(xml, gr[4], l.c4); });
  });
  await editar(MAPA.investimento, (x) => {
    const inv = g('investimento');
    x = definir(x, 'Text 3', inv.titulo);
    const op = inv.opcoes || [];
    [['Shape 5', 'Text 6', 'Text 7', 'Text 8'], ['Shape 9', 'Text 10', 'Text 11', 'Text 12']].forEach((gr, i) => {
      if (!op[i]) { x = remover(x, gr); return; }
      x = definir(x, gr[1], op[i].nome); x = definir(x, gr[2], op[i].valor); x = definir(x, gr[3], op[i].descricao);
    });
    x = definir(x, 'Text 13', inv.incluso); return definir(x, 'Text 14', inv.nao_incluso);
  });
  await editar(MAPA.proximos, (x) => { x = definir(x, 'Text 3', g('proximos').titulo); x = quatroItens(x, q.proximos, g('proximos').itens, { numeroEm: true }); return definir(x, 'Text 24', g('proximos').rodape); });
  await editar(MAPA.frase, (x) => definir(x, 'Text 2', c.frase_final));

  // páginas dos módulos (uma por módulo, com destaques opcionais depois do módulo indicado)
  const moldeModulo = pag(MAPA.modulo), moldeDestaque = pag(MAPA.destaque);
  let anterior = pag(MAPA.apagar[MAPA.apagar.length - 1]);           // novas páginas entram depois das de exemplo (que somem no fim)
  const destaques = c.destaques || [];
  for (let i = 0; i < mods.length; i += 1) {
    const m = mods[i];
    const s = await duplicarSlide(zip, moldeModulo, anterior); anterior = s;
    await editar(s, (x) => {
      x = definir(x, 'Text 3', num2(i)); x = definir(x, 'Text 4', m.titulo); x = definir(x, 'Text 5', m.subtitulo);
      x = definir(x, 'Text 8', m.objetivo); x = definir(x, 'Text 11', m.entrega); x = definir(x, 'Text 12', m.quando);
      const t = m.topicos || [];
      MAPA.topicos.forEach((gr, k) => { x = t[k] ? definir(x, gr[1], t[k]) : remover(x, gr); });
      return x;
    });
    for (const d of destaques.filter((d) => d.apos_modulo === i + 1)) {
      const sd = await duplicarSlide(zip, moldeDestaque, anterior); anterior = sd;
      await editar(sd, (x) => { x = definir(x, 'Text 3', d.titulo); return quatroItens(x, q.lista, d.itens); });
    }
  }
  for (const n of [MAPA.modulo, ...MAPA.apagar].filter((v, i, a) => a.indexOf(v) === i)) await apagarSlide(zip, pag(n));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// Conferência de tamanho: avisa os campos que passaram do que cabe na página (a tela mostra para ajustar).
export const LIMITES = { 'capa.nome': 40, 'capa.subtitulo': 110, 'capa.rodape': 120, 'item.titulo': 40, 'item.texto': 125, 'modulo.titulo': 45, 'modulo.subtitulo': 70, 'modulo.objetivo': 125, 'modulo.entrega': 115, 'modulo.topico': 95, 'visao.rodape': 110, 'investimento.descricao': 110, 'investimento.incluso': 150, 'investimento.nao_incluso': 190, 'frase_final': 110 };
export function conferirTamanhos(c) {
  const avisos = [];
  const ver = (rotulo, texto, lim) => { const n = String(texto || '').length; if (n > lim) avisos.push(`${rotulo}: ${n} letras (cabe bem até ${lim})`); };
  ver('Capa · nome', c.capa?.nome, LIMITES['capa.nome']); ver('Capa · subtítulo', c.capa?.subtitulo, LIMITES['capa.subtitulo']); ver('Capa · rodapé', c.capa?.rodape, LIMITES['capa.rodape']);
  for (const [sec, nome] of [['demanda', 'Demanda'], ['expertise', 'Expertise'], ['metodologia', 'Metodologia'], ['personalizacao', 'Personalização'], ['proximos', 'Próximos passos']]) {
    (c[sec]?.itens || []).forEach((it, i) => { ver(`${nome} · item ${i + 1} · título`, it.titulo, LIMITES['item.titulo']); ver(`${nome} · item ${i + 1} · texto`, it.texto, LIMITES['item.texto']); });
  }
  (c.modulos || []).forEach((m, i) => {
    ver(`Módulo ${i + 1} · título`, m.titulo, LIMITES['modulo.titulo']); ver(`Módulo ${i + 1} · subtítulo`, m.subtitulo, LIMITES['modulo.subtitulo']);
    ver(`Módulo ${i + 1} · objetivo`, m.objetivo, LIMITES['modulo.objetivo']); ver(`Módulo ${i + 1} · entrega`, m.entrega, LIMITES['modulo.entrega']);
    (m.topicos || []).forEach((t, k) => ver(`Módulo ${i + 1} · tópico ${k + 1}`, t, LIMITES['modulo.topico']));
  });
  (c.destaques || []).forEach((d, i) => (d.itens || []).forEach((it, k) => { ver(`Destaque ${i + 1} · item ${k + 1} · título`, it.titulo, LIMITES['item.titulo']); ver(`Destaque ${i + 1} · item ${k + 1} · texto`, it.texto, LIMITES['item.texto']); }));
  ver('Visão geral · rodapé', c.visao?.rodape, LIMITES['visao.rodape']);
  (c.investimento?.opcoes || []).forEach((o, i) => ver(`Investimento · opção ${i + 1} · descrição`, o.descricao, LIMITES['investimento.descricao']));
  ver('Investimento · incluso', c.investimento?.incluso, LIMITES['investimento.incluso']); ver('Investimento · não incluso', c.investimento?.nao_incluso, LIMITES['investimento.nao_incluso']);
  ver('Frase final', c.frase_final, LIMITES['frase_final']);
  return avisos;
}
