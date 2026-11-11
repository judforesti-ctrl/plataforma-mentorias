// Importar a planilha de controle da Cintia ("Controle de NF e recebimentos.xlsx", aba "Faturamento AAAA") no Financeiro
// (11/11/2026, pedido da Juliana: "um campo onde a Cintia possa importar a planilha que ela ainda usa para emissão de notas, até
// ela parar de usar a planilha e usar só a plataforma"). Regras puras, sem banco e sem tela (testáveis no Node):
// 1. lerAba: acha os blocos de cada mês (linha "Data | Cliente | Valor | … | Emissão NF | Data depósito") e lê cada linha:
//    cliente (texto livre), valor, dia (o dd/mm escrito no texto vale mais que a coluna Data, que às vezes é o dia da nota),
//    nota enviada/emitida (e quando), número da nota quando aparece, e o depósito. Linhas sem valor ficam de lado.
// 2. casar: liga cada linha da planilha a uma linha a receber da plataforma pelo nome (cliente, turma, plano), valor, dia e
//    número da parcela/turma/módulo; cada linha da plataforma só é usada uma vez.
// 3. mudancasDe: o que a planilha traz de novo para aquela linha (nota emitida, número, recebido), nunca voltando atrás.
import { arred, somarDias, diasEntre } from './financeiro-regras.js';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const normal = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');

// Número de série do Excel (dias desde 30/12/1899) → AAAA-MM-DD
export function diaDoExcel(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 36000 || n > 60000) return null;
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}
const valido = (a, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 2000 && a <= 2100;
// Primeiro dd/mm(/aaaa) do texto. "so2" = só dia com dois algarismos (no texto do cliente, "9/11" é a parcela 9 de 11)
export function diaDoTexto(t, ano, { so2 = false } = {}) {
  const s = String(t ?? '');
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso && valido(+iso[1], +iso[2], +iso[3])) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const re = so2 ? /(?:^|[^\d/])(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?(?![\d/])/g : /(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/g;
  for (const m of s.matchAll(re)) {
    const ini = m.index + m[0].search(/\d/);
    if (/parcela\s*$/i.test(s.slice(0, ini)) || s[ini - 1] === '(') continue;   // "Parcela 10/11" e "(6/7)" são parcelas
    const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ano;
    if (valido(a, +m[2], +m[1])) return `${a}-${pad(m[2])}-${pad(m[1])}`;
  }
  return null;
}
export function diaDaCelula(v, ano) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return diaDoExcel(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getTime() + 12 * 3600000).toISOString().slice(0, 10);
  return diaDoTexto(v, ano);
}
// "R$ 10.273,00" → 10273 ; 8450 → 8450
export function valorDe(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? arred(v) : null;
  const s = String(v ?? '').replace(/r\$/i, '').replace(/\s/g, '');
  if (!/\d/.test(s)) return null;
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? arred(n) : null;
}
// Parcela ou número de turma/módulo escrito no texto
export function parcelaDe(t) {
  const s = normal(t);
  const p = s.match(/parcela\s*(\d{1,2})\s*\/\s*(\d{1,2})/) || s.match(/\((\d{1,2})\s*\/\s*(\d{1,2})\)/) || s.match(/(?:^|[^\d/])(\d)\s*\/\s*(\d{1,2})(?![\d/])/);
  return p && Number(p[1]) <= Number(p[2]) ? `${Number(p[1])}/${Number(p[2])}` : null;
}
const numeroApos = (s, re) => { const m = normal(s).match(re); return m ? Number(m[1]) : null; };
export const turmaDe = (t) => numeroApos(t, /\bturma\s*(\d{1,2})\b/);
export const moduloDe = (t) => numeroApos(t, /\b(?:modulo|encontro)\s*(\d{1,2})\b/);

// Ajusta o ano de uma data que ficou com o ano errado na planilha (ex.: depósito "07/04/2025" de um módulo de 03/2026)
function acertarAno(dia, perto, { antes = 60, depois = 240 } = {}) {
  if (!dia || !perto) return { dia, corrigido: false };
  const k = diasEntre(perto, dia);
  if (k >= -antes && k <= depois) return { dia, corrigido: false };
  for (const delta of [1, -1]) {
    const outro = `${Number(dia.slice(0, 4)) + delta}${dia.slice(4)}`;
    const k2 = diasEntre(perto, outro);
    if (k2 >= -antes && k2 <= depois) return { dia: outro, corrigido: true };
  }
  return { dia, corrigido: false };
}

// Lista "- NF 599 (17/09) – Sicoob Confederação: R$ 8.070,00" que a Cintia às vezes escreve ao lado do mês
export function notaSolta(t, ano) {
  const m = normal(t).match(/nf\s*(\d{3,6})\s*\((\d{1,2})\/(\d{1,2})\)\s*[–-]\s*([^:]+):\s*r\$\s*([\d.,]+)/);
  if (!m) return null;
  return { numero: Number(m[1]), dia: `${ano}-${pad(m[3])}-${pad(m[2])}`, nome: m[4].trim(), valor: valorDe(m[5]) };
}

// ---------- 1. ler a aba ----------
// linhas = a aba como lista de linhas (SheetJS: sheet_to_json(ws, { header: 1, raw: true, defval: null })); ano = o da aba
export function lerAba(linhas, ano) {
  const blocos = [];
  let atual = null;
  for (let i = 0; i < linhas.length; i++) {
    const r = linhas[i] || [];
    const c = r.map(normal);
    if (c[0] === 'data' && c[1] === 'cliente' && c.includes('valor')) {   // 2026: Data | Cliente | Valor …; 2025: Data | Cliente | Programa | Valor …
      let mes = null;
      for (let k = 1; k <= 3 && i - k >= 0 && !mes; k++) {
        const m = normal((linhas[i - k] || [])[0]).match(/faturamento\s+([a-z]+)/);
        if (m && MESES.includes(m[1])) mes = MESES.indexOf(m[1]) + 1;
      }
      const col = (re) => c.findIndex((x) => re.test(x));
      atual = { linha: i + 1, mesTitulo: mes, col: { valor: c.indexOf('valor'), programa: col(/^programa/), obs: col(/^custos/), resultado: col(/^resultado|^pagamento/), emissao: col(/^emissao/), deposito: col(/deposito/) }, itens: [], semValor: [], notasSoltas: [] };
      blocos.push(atual);
      continue;
    }
    if (!atual) continue;
    if (/^faturamento\s/.test(c[0])) { atual = null; continue; }
    for (const x of r.slice(Math.max(atual.col.deposito, 6) + 1)) { const nf = notaSolta(x, ano); if (nf) atual.notasSoltas.push(nf); }
    const programa = atual.col.programa >= 0 && r[atual.col.programa] != null ? ` · ${r[atual.col.programa]}` : '';
    const cliente = r[1] == null ? '' : `${r[1]}${programa}`.replace(/\s+/g, ' ').trim();
    if (!cliente) continue;   // linha de total do mês
    const valor = valorDe(r[atual.col.valor]);
    if (!valor) { atual.semValor.push({ linha: i + 1, cliente }); continue; }
    const pega = (k) => (k >= 0 ? r[k] : null);
    const textoEmissao = pega(atual.col.emissao) == null ? '' : String(pega(atual.col.emissao));
    const obs = [pega(atual.col.obs), pega(atual.col.resultado)].filter((x) => x != null && typeof x !== 'number').map(String).join(' · ');
    atual.itens.push({ linha: i + 1, cliente, valor, colunaData: diaDaCelula(r[0], ano), textoEmissao, obs, depositoBruto: pega(atual.col.deposito) });
  }
  // o mês de cada bloco: o do título; sem título, o mês que mais aparece na coluna Data
  for (const b of blocos) {
    let mes = b.mesTitulo;
    if (!mes) {
      const cont = {};
      for (const it of b.itens) if (it.colunaData && it.colunaData.startsWith(String(ano))) { const m = Number(it.colunaData.slice(5, 7)); cont[m] = (cont[m] || 0) + 1; }
      mes = Number(Object.entries(cont).sort((a, x) => x[1] - a[1])[0]?.[0]) || null;
    }
    b.mes = mes ? `${ano}-${pad(mes)}` : null;
    for (const it of b.itens) completarItem(it, b, ano);
  }
  return blocos.filter((b) => b.mes);
}

function completarItem(it, b, ano) {
  const inicioMes = `${b.mes}-01`;
  // o dia escrito no texto ("… 10/11") vale mais que a coluna Data
  let doTexto = diaDoTexto(it.cliente, ano, { so2: true });
  if (doTexto) doTexto = acertarAno(doTexto, inicioMes, { antes: 200, depois: 200 }).dia;
  it.dia = doTexto || it.colunaData || null;
  it.mes = b.mes;
  it.parcela = parcelaDe(it.cliente);
  it.turma = turmaDe(it.cliente);
  it.modulo = moduloDe(it.cliente);
  const e = normal(it.textoEmissao), o = normal(it.obs);
  // nota: "NF enviada 16/10", "nf emitida", "Emitida" (coluna de custos nos primeiros meses); "lembrete pagamento" não é nota
  it.notaEmitida = (/(nf|nota).*(enviad|emitid)|^emitid|enviad[ao] para/.test(e) && !/lembrete/.test(e)) || /^emitida$/.test(o);
  const base = it.dia || it.colunaData || inicioMes;
  const emissao = it.notaEmitida ? diaDoTexto(it.textoEmissao, ano) : null;
  it.emissao = emissao ? acertarAno(emissao, base, { antes: 45, depois: 200 }).dia : null;
  const subst = o.match(/substitu\w*\s+pela\s+nf\s*(\d{3,6})/);
  const noTexto = e.match(/\bnf\s*(?:n[o°º.]?\s*)?(\d{3,6})\b/);
  it.nota = subst ? Number(subst[1]) : noTexto ? Number(noTexto[1]) : null;
  const dep = diaDaCelula(it.depositoBruto, ano);
  const acerto = acertarAno(dep, base, { antes: 45, depois: 200 });
  it.deposito = acerto.dia;
  it.depositoCorrigido = acerto.corrigido;
  it.semNota = /sem nota/.test(normal(it.cliente));
  delete it.depositoBruto;
}

// ---------- 2. casar com as linhas da plataforma ----------
const GENERICAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'com', 'para', 'por', 'ref', 'referente', 'parcela', 'modulo', 'modulos', 'programa', 'turma',
  'mentoria', 'individual', 'nf', 'nota', 'enviada', 'vencimento', 'todo', 'dia', 'encontro', 'cnpj', 'sescoop', 'pagam', 'conta', 'novo', 'sem', 'pgto', 'pagamento', 'emitir',
  'que', 'como', 'outro', 'valor', 'palestra', 'palestras', 'lideres', 'lideranca', 'liderancas', 'gerentes', 'gerente', 'coord', 'areas', 'cooperativa']);
export const palavras = (t) => normal(t).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length >= 3 && !GENERICAS.has(w) && !/^\d+$/.test(w));
// apelidos da planilha → nome na plataforma
const APELIDOS = [[/\bisud?orus\b/, 'isidorus'], [/\bhope\b/, 'adidas'], [/\bmarcia\b/, 'marcia delivery'], [/\bdani\b/, 'dani'], [/\bgroove\b/, 'groove']];

// contexto: { linhas (fin_receber), plano(id), empresa(id), pagador }
export function textoDaLinha(l, { plano, empresa }) {
  const p = plano(l.plano_id);
  return [empresa(l.empresa_id).nome, p && p.titulo, p && p.pagador_nome, l.descricao].filter(Boolean).join(' ');
}
const numeroDaLinha = (l) => { const m = normal(l.descricao).match(/(?:modulo|parcela)\s*(\d{1,2})/); return m ? Number(m[1]) : null; };

export function pontos(it, l, ctx) {
  if (l.situacao === 'cancelado') return -1;
  const alvo = new Set(palavras(textoDaLinha(l, ctx)));
  let texto = it.cliente;
  for (const [re, ap] of APELIDOS) if (re.test(normal(texto))) texto += ` ${ap}`;
  const minhas = [...new Set(palavras(texto))];
  if (!minhas.length) return -1;
  const comuns = minhas.filter((w) => alvo.has(w) || [...alvo].some((a) => a.length >= 5 && w.length >= 5 && (a.startsWith(w.slice(0, 5)) || w.startsWith(a.slice(0, 5)))));
  if (!comuns.length) return -1;
  const nome = comuns.length / Math.min(minhas.length, 2);   // duas palavras em comum já bastam: quem decide é o valor e o dia
  const mesmoValor = Math.abs(Number(l.valor) - it.valor) < 0.5;
  let p = Math.min(1, nome) * 60 + (mesmoValor ? 30 : 0);
  const k = it.dia && l.data ? Math.abs(diasEntre(it.dia, l.data)) : null;
  if (k != null) p += Math.max(0, 20 - k / 2);
  const p2 = ctx.plano(l.plano_id);
  // parcela / turma / módulo escritos dos dois lados: iguais somam, diferentes tiram
  const num = numeroDaLinha(l);
  if (it.parcela && /parcela/.test(normal(l.descricao))) p += num === Number(it.parcela.split('/')[0]) ? 25 : -45;
  if (it.turma && p2 && /turma\s*\d/.test(normal(p2.titulo))) p += normal(p2.titulo).includes(`turma ${it.turma}`) ? 20 : -45;
  if (it.modulo && /modulo/.test(normal(l.descricao))) p += num === it.modulo ? 15 : -10;   // a planilha às vezes conta os módulos do programa todo
  // para ser a mesma linha: mesmo valor (com dia perto ou sem dia) ou parcela igual
  const parcelaIgual = it.parcela && num === Number(it.parcela.split('/')[0]) && /parcela/.test(normal(l.descricao));
  if (!mesmoValor && !parcelaIgual) return -1;
  if (k != null && k > 40 && !parcelaIgual) return -1;
  return p;
}

export function casar(itens, ctx) {
  const pares = [];
  itens.forEach((it, i) => ctx.linhas.forEach((l) => { const p = pontos(it, l, ctx); if (p >= 50) pares.push({ i, l, p }); }));
  pares.sort((a, b) => b.p - a.p);
  const usadoItem = new Set(), usadaLinha = new Set();
  const res = itens.map((it) => ({ item: it, linha: null, pontos: 0 }));
  for (const x of pares) {
    if (usadoItem.has(x.i) || usadaLinha.has(x.l.id)) continue;
    usadoItem.add(x.i); usadaLinha.add(x.l.id);
    Object.assign(res[x.i], { linha: x.l, pontos: Math.round(x.p) });
  }
  // sem par: a linha mais parecida (mesmo nome, valor diferente), só como dica
  for (const r of res.filter((x) => !x.linha)) {
    let melhor = null;
    for (const l of ctx.linhas) {
      if (usadaLinha.has(l.id) || l.situacao === 'cancelado') continue;
      const alvo = new Set(palavras(textoDaLinha(l, ctx)));
      const n = palavras(r.item.cliente).filter((w) => alvo.has(w)).length;
      const k = r.item.dia && l.data ? Math.abs(diasEntre(r.item.dia, l.data)) : 99;
      const perto = Math.abs(Number(l.valor) - r.item.valor) <= 0.25 * r.item.valor;   // valor diferente, mas não muito
      if (n >= 2 && k <= 45 && perto && (!melhor || n > melhor.n || (n === melhor.n && k < melhor.k))) melhor = { l, n, k };
    }
    r.parecida = melhor ? melhor.l : null;
  }
  return res;
}

// ---------- 3. o que muda ----------
// Só avança: aberto → nota emitida → recebido. Nunca apaga número de nota nem data que já está na plataforma.
export function mudancasDe(item, l, { prazo = 30 } = {}) {
  const novo = {};
  const textos = [];
  const temNota = item.notaEmitida || item.deposito || item.nota;
  if (temNota && l.situacao === 'aberto' && !item.semNota) {
    novo.situacao = 'faturado';
    novo.nota_emitida_em = item.emissao || l.nota_emitida_em || item.dia || l.data;
    novo.vencimento = l.vencimento || somarDias(novo.nota_emitida_em, prazo);
    textos.push(`nota emitida${item.emissao ? ` em ${br(item.emissao)}` : ''}`);
  } else if (item.emissao && !l.nota_emitida_em && l.situacao !== 'aberto') {
    novo.nota_emitida_em = item.emissao;
    textos.push(`nota emitida em ${br(item.emissao)}`);
  }
  if (item.nota && !l.nota_numero) { novo.nota_numero = item.nota; textos.push(`nota nº ${item.nota}`); }
  if (item.deposito && l.situacao !== 'recebido' && l.situacao !== 'cancelado') {
    novo.situacao = 'recebido';
    novo.recebido_em = item.deposito;
    novo.valor_recebido = l.valor_recebido ?? Number(l.valor);
    textos.push(`recebido em ${br(item.deposito)}${item.depositoCorrigido ? ' (ano corrigido)' : ''}`);
  } else if (item.deposito && l.situacao === 'recebido' && !l.recebido_em) {
    novo.recebido_em = item.deposito;
    textos.push(`recebido em ${br(item.deposito)}`);
  }
  return { novo, textos };
}
const br = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

// Situação de uma linha nova criada pela planilha
export function linhaNova(item, { prazo = 30 } = {}) {
  const l = { situacao: 'aberto', valor: item.valor, data: item.dia || `${item.mes}-01`, descricao: item.cliente.slice(0, 200) };
  const { novo } = mudancasDe(item, { ...l, nota_numero: null, nota_emitida_em: null, vencimento: null }, { prazo });
  return { ...l, ...novo };
}

// Total de cada mês da planilha: o do quadro do alto da aba ("MÊS RECEITA", coluna do ano), que é a conta da própria Cintia
// (a soma do Excel não conta valor escrito como texto, ex. "R$ 17.424,00"); mês sem número no quadro = soma das linhas.
export function resumoDaAba(linhas, ano) {
  const t = {};
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const r = linhas[i] || [];
    const c = r.findIndex((x) => x === ano || x === String(ano));
    if (c < 0) continue;
    for (let k = i + 1; k < Math.min(linhas.length, i + 16); k++) {
      const dia = diaDaCelula((linhas[k] || [])[c], ano);
      const v = (linhas[k] || [])[c + 1];
      if (dia && dia.startsWith(`${ano}-`) && typeof v === 'number') t[dia.slice(0, 7)] = arred(v);
    }
    if (Object.keys(t).length) break;
  }
  return t;
}
export const totaisDosMeses = (blocos, resumo = {}) => {
  const t = {};
  for (const b of blocos) t[b.mes] = arred((t[b.mes] || 0) + b.itens.reduce((a, x) => a + x.valor, 0));
  return { ...t, ...resumo };
};
// Notas soltas ("NF 599 (17/09) – Sicoob Confederação: R$ 8.070") ligadas a linhas do mesmo bloco pelo valor e nome
export function numerosDasNotasSoltas(bloco) {
  for (const nf of bloco.notasSoltas) {
    const cands = bloco.itens.filter((it) => !it.nota && Math.abs(it.valor - nf.valor) < 0.5);
    const nome = palavras(nf.nome);
    const bons = cands.filter((it) => { const p = new Set(palavras(it.cliente)); return nome.some((w) => p.has(w) || [...p].some((q) => q.startsWith(w.slice(0, 5)))); });
    if (bons.length === 1) { bons[0].nota = nf.numero; if (!bons[0].emissao) bons[0].emissao = nf.dia; }
  }
}
