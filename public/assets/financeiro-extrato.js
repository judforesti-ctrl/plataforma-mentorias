// Financeiro, etapa 3 (script 56): leitura do extrato do banco e sugestões de conferência. Regras puras (sem banco e sem tela),
// testáveis no Node. Formatos: PDF do Sicoob (internet banking, "HISTÓRICO DE MOVIMENTAÇÃO"), PDF da Unicred ("EXTRATO DE CONTA
// CORRENTE PARA SIMPLES CONFERÊNCIA") e OFX de qualquer banco. O PDF chega aqui já em linhas (a tela junta os pedaços de texto
// de cada linha; colunas distantes vêm separadas por tabulação).

const VALOR = /-?\d{1,3}(?:\.\d{3})*,\d{2}/;
export const numero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const arred = (v) => Math.round(Number(v || 0) * 100) / 100;
// texto para comparar: minúsculo, sem acento, sem pontuação (mantém . - / * dos documentos)
export const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.\-/*]+/g, ' ').replace(/\s+/g, ' ').trim();
const iso = (d, m, a) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const isoBR = (s) => { const [d, m, a] = s.split('/'); return iso(d, m, a); };
const limpa = (s) => String(s || '').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Sicoob (PDF) ----------
export function lerSicoob(linhas) {
  const txt = linhas.join('\n');
  const per = txt.match(/PER[IÍ]ODO:?\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i);
  const conta = (txt.match(/CONTA:\s*([\d.\-]+)/i) || [])[1] || null;
  const de = per ? isoBR(per[1]) : null, ate = per ? isoBR(per[2]) : null;
  // o extrato traz só dia/mês: o ano vem do período (virada de ano: mês menor que o do início = ano do fim)
  const ano = (mm) => (!per ? new Date().getFullYear() : de.slice(0, 4) !== ate.slice(0, 4) && Number(mm) < Number(de.slice(5, 7)) ? ate.slice(0, 4) : de.slice(0, 4));
  const movs = [];
  let saldoInicial = null, saldoDia = null, saldoFinal = null, atual = null, fim = false;
  for (const bruta of linhas) {
    const l = limpa(bruta);
    if (!l) continue;
    if (/^RESUMO\b/i.test(l)) fim = true;
    if (fim) { const m = l.match(/SALDO EM CONTA:?\s*([\d.]+,\d{2})\s*([CD])/i); if (m) saldoFinal = numero(m[1]) * (m[2].toUpperCase() === 'D' ? -1 : 1); continue; }
    const m = l.match(/^(\d{2})\/(\d{2})(?!\/)\s*(.+?)\s+([\d.]+,\d{2})\s*([CD*])$/i);
    if (m) {
      const hist = limpa(m[3]);
      const v = numero(m[4]) * (m[5].toUpperCase() === 'D' ? -1 : 1);
      atual = null;
      if (m[5] === '*' || /BLOQ/i.test(hist)) continue;
      if (/^SALDO ANTERIOR/i.test(hist)) { saldoInicial = v; continue; }
      if (/^SALDO/i.test(hist)) { saldoDia = v; continue; }
      atual = { data: iso(m[1], m[2], ano(m[2])), historico: hist, detalhes: [], documento: null, valor: arred(v) };
      movs.push(atual);
      continue;
    }
    if (!atual) continue;
    if (/^(SICOOB|SISTEMA DE COOP|PLATAFORMA DE SERV|\d{2}\/\d{2}\/\d{4} EXTRATO|COOP\.:|CONTA:|PER[IÍ]ODO|HIST[OÓ]RICO DE MOV|DATA ?HIST)/i.test(l)) continue;
    const doc = l.match(/^DOC\.:\s*(.+)$/i);
    if (doc) { atual.documento = doc[1].trim(); continue; }
    if (/^(Pagamento Pix|Transfer[eê]ncia Pix)$/i.test(l)) continue;
    atual.detalhes.push(l);
  }
  return {
    formato: 'sicoob_pdf', conta: 'Sicoob', numero_conta: conta, de, ate, saldo_inicial: saldoInicial, saldo_final: saldoFinal ?? saldoDia,
    movimentos: movs.map(({ detalhes, ...x }) => ({ ...x, detalhe: detalhes.join(' · ') || null })),
  };
}

// ---------- Unicred (PDF) ----------
export function lerUnicred(linhas) {
  const txt = linhas.map(limpa).join('\n');
  const per = txt.match(/PER[IÍ]ODO DE (\d{2}\/\d{2}\/\d{4}) A (\d{2}\/\d{2}\/\d{4})/i);
  const conta = (txt.match(/CONTA:\s*(\d+)/i) || [])[1] || null;
  const ini = txt.match(/SALDO ANTERIOR:\s*(-?[\d.]+,\d{2})/i);
  const blocos = [];
  let saldoFinal = null, b = null;
  for (const bruta of linhas) {
    const l = String(bruta || '').trim();
    if (!l) continue;
    const sf = l.match(/^Saldo em \d{2}\/\d{2}\/\d{4}\s+(-?[\d.]+,\d{2})/i);
    if (sf) { saldoFinal = numero(sf[1]); b = null; continue; }
    if (/^\d{2}\/\d{2}\/\d{4}\s/.test(l)) { b = l; blocos.push(b); continue; }
    if (b != null && !/^(DATA MOV|COOPERATIVA|CONTA:|CLIENTE:|USU|EXTRATO DE|PER[IÍ]ODO|SALDO ANTERIOR|CENTRAL DE|Limite de|Saldo )/i.test(l)) blocos[blocos.length - 1] = `${blocos[blocos.length - 1]} ${l}`;
  }
  const movs = [];
  for (const bl of blocos) {
    const data = isoBR(bl.slice(0, 10));
    let resto = bl.slice(10).trim();
    // do fim para o começo: saldo (opcional) e valor do lançamento
    const nums = [];
    for (let k = 0; k < 2; k++) {
      const m = resto.match(/\s(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
      if (!m) break;
      nums.unshift(m[1]); resto = resto.slice(0, m.index).trim();
    }
    if (!nums.length) continue;
    const valor = numero(nums[0]);
    // o que sobra: "ID.DOC  HISTÓRICO" (colunas separadas por tabulação ou 2+ espaços; o ID pode ter espaço, como "DEB PIX")
    const partes = resto.split(/\t+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
    const documento = partes.length > 1 ? partes[0] : (resto.split(' ')[0] || null);
    const historico = limpa(partes.length > 1 ? partes.slice(1).join(' ') : resto.split(' ').slice(1).join(' '));
    const nome = historico.match(/\(([^)]+)\)\s*$/);
    movs.push({ data, historico, detalhe: nome && !/^Cr[eé]ditos? Cobran/i.test(nome[1]) ? nome[1] : null, documento, valor: arred(valor) });
  }
  return { formato: 'unicred_pdf', conta: 'Unicred', numero_conta: conta, de: per ? isoBR(per[1]) : null, ate: per ? isoBR(per[2]) : null,
    saldo_inicial: ini ? numero(ini[1]) : null, saldo_final: saldoFinal, movimentos: movs };
}

// ---------- OFX (qualquer banco) ----------
const BANCOS = { 756: 'Sicoob', 136: 'Unicred', 748: 'Sicredi', 1: 'Banco do Brasil', 237: 'Bradesco', 341: 'Itaú', 104: 'Caixa', 33: 'Santander', 260: 'Nubank', 77: 'Inter' };
export function lerOFX(texto) {
  const tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : null; };
  const dia = (s) => (s && /^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
  const banco = Number(tag(texto, 'BANKID'));
  const movs = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]).map((b) => {
    const memo = tag(b, 'MEMO'), nome = tag(b, 'NAME');
    return { data: dia(tag(b, 'DTPOSTED')), valor: arred(Number(String(tag(b, 'TRNAMT') || '0').replace(',', '.'))), historico: limpa(memo || nome || tag(b, 'TRNTYPE') || 'Movimento'),
      detalhe: nome && memo && nome !== memo ? limpa(nome) : null, documento: tag(b, 'CHECKNUM') || tag(b, 'REFNUM'), fitid: tag(b, 'FITID') };
  }).filter((m) => m.data);
  const saldoFinal = tag(texto, 'BALAMT') != null ? Number(String(tag(texto, 'BALAMT')).replace(',', '.')) : null;
  return { formato: 'ofx', conta: BANCOS[banco] || (banco ? `Banco ${banco}` : 'Banco'), numero_conta: tag(texto, 'ACCTID'), de: dia(tag(texto, 'DTSTART')), ate: dia(tag(texto, 'DTEND')),
    saldo_inicial: saldoFinal != null ? arred(saldoFinal - movs.reduce((a, m) => a + m.valor, 0)) : null, saldo_final: saldoFinal, movimentos: movs };
}

// Descobre o formato e lê. linhas = PDF em linhas; texto = arquivo de texto (OFX). null = não reconheci.
export function lerExtrato({ linhas = null, texto = null }) {
  let r = null;
  if (texto && /<OFX>|OFXHEADER/i.test(texto)) r = lerOFX(texto);
  else if (linhas) {
    const t = linhas.join('\n');
    if (/UNICRED/i.test(t) && /EXTRATO DE CONTA CORRENTE/i.test(t)) r = lerUnicred(linhas);
    else if (/SICOOB/i.test(t) && /HIST[OÓ]RICO DE MOVIMENTA/i.test(t)) r = lerSicoob(linhas);
  }
  if (!r) return null;
  const soma = arred(r.movimentos.reduce((a, m) => a + m.valor, 0));
  r.entradas = arred(r.movimentos.filter((m) => m.valor > 0).reduce((a, m) => a + m.valor, 0));
  r.saidas = arred(r.movimentos.filter((m) => m.valor < 0).reduce((a, m) => a + m.valor, 0));
  // confere: saldo inicial + movimentos = saldo final (o banco e a leitura concordam)
  r.diferenca = r.saldo_inicial != null && r.saldo_final != null ? arred(r.saldo_final - r.saldo_inicial - soma) : null;
  r.confere = r.diferenca == null ? null : Math.abs(r.diferenca) < 0.01;
  if (!r.de && r.movimentos.length) r.de = r.movimentos.map((m) => m.data).sort()[0];
  if (!r.ate && r.movimentos.length) r.ate = r.movimentos.map((m) => m.data).sort().slice(-1)[0];
  return r;
}

// Chave de cada movimento (o mesmo período importado de novo não repete). Movimentos iguais no mesmo dia (3 × 8.900) ganham a ordem.
export function comChaves(conta, movimentos) {
  const vistos = new Map();
  return movimentos.map((m) => {
    if (m.fitid) return { ...m, chave: `${conta}|ofx|${m.fitid}` };
    const base = `${conta}|${m.data}|${Number(m.valor).toFixed(2)}|${normal(`${m.historico} ${m.detalhe || ''}`).slice(0, 90)}`;
    const n = (vistos.get(base) || 0) + 1; vistos.set(base, n);
    return { ...m, chave: `${base}|${n}` };
  });
}

// ---------- sugestões ----------
const textoDe = (mov) => normal(`${mov.historico} ${mov.detalhe || ''} ${mov.documento || ''}`);
const GENERICAS = new Set(['ltda', 'cooperativa', 'credito', 'de', 'do', 'da', 'dos', 'das', 'e', 's/a', 'sa', 'me', 'eireli', 'servico', 'servicos', 'nacional', 'brasil', 'livre', 'admissao', 'associados', 'pagamento', 'pix', 'transf']);
// nomes de quem paga que aparecem diferentes no banco
const APELIDOS = [[/aprendizagem d|aprendizagem do coop|servico nacional de aprendizagem/, 'sescoop'], [/confederacao nacional das cooperat/, 'ccs cnc confederacao']];
function palavras(t) { return normal(t).split(/[\s/]+/).filter((p) => p.length >= 4 && !GENERICAS.has(p)); }

// Entrada: notas emitidas (linhas de fin_receber agrupadas pelo número da nota), linhas em aberto e linhas já marcadas como recebidas
// no mesmo dia e valor (ainda sem movimento). nome(linha) = nome do cliente; pagador(linha) = quem paga a nota (Sescoop…).
// ligadas = ids de linhas já ligadas a algum movimento. Devolve candidatos do mais provável ao menos.
export function sugerirEntrada(mov, linhas, { nome = () => '', pagador = () => '', ligadas = new Set() } = {}) {
  let t = textoDe(mov);
  for (const [re, extra] of APELIDOS) if (re.test(t)) t += ` ${extra}`;
  const tp = new Set(t.split(' '));
  const grupos = new Map();
  for (const l of linhas) {
    if (ligadas.has(l.id) || l.situacao === 'cancelado') continue;
    if (l.situacao === 'recebido' && l.recebido_em !== mov.data) continue;
    const k = l.situacao === 'faturado' && l.nota_numero ? `n:${l.empresa_id}:${l.nota_numero}` : `l:${l.id}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }
  const out = [];
  for (const [k, ls] of grupos) {
    const valor = arred(ls.reduce((a, l) => a + Number((l.situacao === 'recebido' ? l.valor_recebido ?? l.valor : l.valor) || 0), 0));
    const l0 = ls[0];
    let score = 0;
    const igual = Math.abs(valor - mov.valor) < 0.01;
    if (igual) score += 50;
    else if (mov.valor < valor && mov.valor >= valor * 0.85) score += 15;          // imposto retido na fonte
    else continue;
    const nomes = palavras(`${nome(l0)} ${pagador(l0)}`);
    const doNome = nomes.some((p) => tp.has(p));
    if (!igual && !doNome) continue;                                              // valor diferente só se o nome de quem paga bate
    if (doNome) score += 30;
    if (l0.situacao === 'recebido') score += 25;
    if (l0.situacao === 'faturado') score += 10;
    if (l0.nota_emitida_em && l0.nota_emitida_em > mov.data) score -= 40;
    if (l0.situacao === 'aberto' && l0.data && l0.data > mov.data) score -= 20;
    out.push({ chave: k, linhas: ls, valor, igual, score, ja_recebido: l0.situacao === 'recebido', nota: l0.situacao === 'faturado' ? l0.nota_numero : null });
  }
  return out.sort((a, b) => b.score - a.score);
}

const REGEX_TARIFA = /tarifa|tar\.|pacote servi|cesta|deb\.parc\.subs|integr parc capital|manutencao de conta|tar cob/;
const REGEX_IMPOSTO = /simples nacional|\bdas\b|darf|receita federal|\binss\b|\bgps\b|prefeitura|iss /;
// Uma regra vale se o texto dela aparece no movimento (e o sentido é o mesmo)
export const regraDoMovimento = (mov, regras) => regras.find((r) => r.sentido === (mov.valor >= 0 ? 'entrada' : 'saida') && r.texto && textoDe(mov).includes(normal(r.texto))) || null;

// Saída: regra aprendida, despesa já lançada (mesmo valor, até 7 dias de diferença), tarifa, imposto ou pagamento para uma sócia
// (a Unicred mostra o nome). despesas = fin_despesas; ligadas = ids de despesas já ligadas a movimentos; socias = perfis.
export function sugerirSaida(mov, { despesas = [], ligadas = new Set(), regras = [], socias = [] } = {}) {
  const regra = regraDoMovimento(mov, regras);
  if (regra) return { tipo: 'regra', regra, automatico: true };
  const v = Math.abs(mov.valor);
  const dist = (x) => Math.abs((new Date(`${x.pago_em || x.data}T12:00:00Z`) - new Date(`${mov.data}T12:00:00Z`)) / 86400000);
  const iguais = despesas.filter((x) => !ligadas.has(x.id) && Math.abs(Number(x.valor) - v) < 0.01 && dist(x) <= 7).sort((a, b) => dist(a) - dist(b));
  if (iguais.length) return { tipo: 'existente', despesa: iguais[0], outras: iguais.slice(1), automatico: iguais.length === 1 || dist(iguais[0]) < dist(iguais[1]) };
  const t = textoDe(mov);
  if (REGEX_TARIFA.test(t)) return { tipo: 'nova', categoria: 'bancarias', descricao: /integr|subs/.test(t) ? 'Integralização de capital na cooperativa' : 'Tarifa do banco', automatico: true };
  if (REGEX_IMPOSTO.test(t)) return { tipo: 'nova', categoria: 'impostos', descricao: limpa(mov.historico), automatico: false };
  // nome da sócia no texto (a Unicred mostra; o Sicoob só mostra parte do CPF): primeiro nome e, se o cadastro tiver, um sobrenome
  const tem = (p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t);
  const socia = socias.find((p) => { const ps = normal(p.nome).split(' ').filter((z) => z.length >= 3); return ps.length && tem(ps[0]) && (ps.length === 1 || ps.slice(1).some(tem)); });
  if (socia) return { tipo: 'retirada', pessoa: socia, automatico: false };
  return null;
}

// Texto que identifica quem recebeu ou pagou, para a regra "lembrar" (o nome do favorecido, o CNPJ ou o pedaço do CPF que o banco mostra)
export function chaveSugerida(mov) {
  const d = `${mov.detalhe || ''} ${mov.historico || ''}`;
  const fav = (mov.detalhe || '').match(/(?:FAV|REM)\.:\s*([^·]+)/i);
  if (fav) return limpa(fav[1]);
  const par = (mov.historico || '').match(/\(([^)]+)\)/);
  if (par && !/cr[eé]ditos? cobran/i.test(par[1])) return limpa(par[1]);
  const cnpj = d.match(/\d{2}\.\d{3}\.\d{3}[ /]?\d{4}-\d{2}/);
  if (cnpj) return cnpj[0];
  const cpf = d.match(/\*{3}\.(\d{3}\.\d{3})-\*{2}/);
  if (cpf) return cpf[1];
  return limpa(mov.historico);
}

// Divide o que entrou entre as linhas da nota, na proporção de cada uma (sem perder centavo)
export function dividirRecebido(valor, linhas) {
  const total = linhas.reduce((a, l) => a + Number(l.valor || 0), 0);
  const partes = linhas.map((l) => (total ? arred(valor * Number(l.valor) / total) : 0));
  if (partes.length) partes[partes.length - 1] = arred(valor - partes.slice(0, -1).reduce((a, x) => a + x, 0));
  return partes;
}
