// Financeiro, etapa 1 (script 52, pedido da Juliana em 30/10/2026; proposta https://claude.ai/artifact/SboYmvuWZKXA5d62B1ntXM).
// Só a administração. Cada turma ou programa de mentoria individual ganha um plano de faturamento montado a partir da proposta
// (valor por módulo ou total; dá para mudar), com uma linha por módulo ou por parcela. No dia do módulo (ou da parcela) a linha
// aparece em "Emitir nota"; com a nota emitida vai para "A receber"; ao marcar o recebimento sai da lista. Despesas: à mão e as
// fixas (que entram sozinhas todo mês). Antes do mês de início do Financeiro, o faturamento de cada mês vem da planilha (fin_meses).
// Regras puras em ../financeiro-regras.js.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { dinheiro, norm } from './vendas.js';
import * as F from '../financeiro-regras.js';

const ABAS = [['geral', 'Visão geral'], ['conferir', 'Conferir'], ['emitir', 'Emitir nota'], ['receber', 'A receber'], ['planos', 'Turmas e mentorias'], ['margem', 'Margem'], ['despesas', 'Despesas'], ['extratos', 'Extratos'], ['mentores', 'Mentores'], ['fechamento', 'Fechamento']];
// sócia = administração que também é mentora (a Cintia não é): só elas veem o fechamento e a distribuição
const ehSocia = (p) => p && p.papel === 'admin' && !!p.tambem_mentor;
// as sócias (despesa pessoal de cada uma): pelos ids em Ajustes, senão pelo primeiro nome
const SOCIAS_NOMES = /^(juliana|viviane|cl[aá]udia)\b/i;
const AVISO_52 = '<div class="aviso">Falta rodar o script <b>52-financeiro.sql</b> no Supabase (SQL Editor → New query → colar → Run). Até lá esta tela fica vazia.</div>';
const PADRAO_CONFIG = { inicio: '2026-11', emissores: { principal: 'Contabilizei', outro: 'Prefeitura' }, imposto_pct: 11.5 };
const selo = (estado) => { const [t, c] = F.ROTULO_ESTADO[estado] || [estado, 'neutro']; return `<span class="selo ${c === 'ruim' ? 'erro' : c}">${t}</span>`; };
const v2 = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2));
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const num = (el) => (el.value === '' ? null : Number(el.value));
const pctBR = (v) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const textoAliquota = (d) => (d.aliquota.estimada ? `${pctBR(d.aliquota.pct)} (estimada em Ajustes: ainda não há impostos pagos nos últimos meses)`
  : `${pctBR(d.aliquota.pct)} (o que foi pago de imposto nos últimos 3 meses ÷ o faturado)`);

// ---------- dados ----------
async function carregar() {
  const pedir = (t, sel = '*', f = (q) => q) => f(sb.from(t).select(sel));
  const [planos, receber, despesas, fixas, meses, config, empresas, turmas, programas, modulos, oportunidades, perfis, extratos, pendentes] = await Promise.all([
    pedir('fin_planos'), pedir('fin_receber'), pedir('fin_despesas', '*', (q) => q.gte('data', `${F.somarMeses(hojeISO().slice(0, 7), -24)}-01`)),
    pedir('fin_despesas_fixas'), pedir('fin_meses'), pedir('configuracoes', 'valor', (q) => q.eq('chave', 'financeiro').maybeSingle()),
    pedir('empresas', 'id, nome, cnpj'), pedir('turmas', 'id, nome, empresa_id, status, inicio, fim_previsto, formato, local, viagem_padrao'),
    pedir('programas', 'id, nome, empresa_id, status, inicio, fim_previsto, sessoes_por_mentorado'),
    pedir('modulos', 'id, turma_id, numero, titulo, data_hora, duracao_min, formato, local'), pedir('oportunidades', 'id, empresa_id, turma_id, programa_id, valor, etapa, titulo'),
    pedir('perfis', 'id, nome, papel, tambem_mentor, ativo', (q) => q.in('papel', ['admin', 'mentor'])),
    // extratos do banco (script 56): saldo de cada conta e quantos movimentos faltam conferir
    pedir('fin_extratos', 'conta, periodo_ate, saldo_final'), pedir('fin_movimentos', 'id', (q) => q.eq('situacao', 'pendente')),
  ]);
  const falta = [planos, receber, despesas, fixas, meses].some((r) => r.error && faltaScript(r.error));
  for (const r of [planos, receber, despesas, fixas, meses, config, empresas, turmas, programas, modulos, oportunidades]) if (r.error && !faltaScript(r.error)) throw r.error;
  const d = {
    falta, planos: planos.data || [], receber: receber.data || [], despesas: despesas.data || [], fixas: fixas.data || [], meses: meses.data || [],
    config: { ...PADRAO_CONFIG, ...((config.data && config.data.valor) || {}) }, empresas: empresas.data || [], turmas: turmas.data || [],
    programas: programas.data || [], modulos: modulos.data || [], oportunidades: oportunidades.data || [], perfis: perfis.data || [],
    extratos: extratos.error ? null : extratos.data || [], movimentosAConferir: pendentes.error ? 0 : (pendentes.data || []).length,
  };
  d.config.emissores = { ...PADRAO_CONFIG.emissores, ...(d.config.emissores || {}) };
  d.empresa = (id) => d.empresas.find((e) => e.id === id) || { nome: '—' };
  d.plano = (id) => d.planos.find((p) => p.id === id) || null;
  d.modulo = (id) => d.modulos.find((m) => m.id === id) || null;
  d.pessoa = (id) => d.perfis.find((p) => p.id === id) || null;
  d.socias = Array.isArray(d.config.socias) && d.config.socias.length ? d.perfis.filter((p) => d.config.socias.includes(p.id))
    : d.perfis.filter((p) => p.ativo !== false && SOCIAS_NOMES.test(p.nome || ''));
  d.aConferir = { planos: d.planos.filter((p) => p.conferir), despesas: d.despesas.filter((x) => x.conferir) };
  // imposto: a alíquota real dos 3 últimos meses (Simples pago ÷ faturado); sem histórico, a de Ajustes
  const real = F.aliquotaReal({ despesas: d.despesas, hoje: hojeISO(), faturado: (m) => F.faturadoNoMes(m, { inicio: d.config.inicio, linhas: d.receber, meses: d.meses }) });
  d.aliquota = real ? { ...real, estimada: false } : { pct: Number(d.config.imposto_pct) || 0, estimada: true };
  // reembolsos que o cliente paga e ainda não foram cobrados (coluna do script 55)
  d.temReembolso = d.despesas.some((x) => 'reembolso_receber_id' in x);
  d.reembolsosACobrar = d.despesas.filter((x) => x.reembolsavel && !x.reembolso_receber_id);
  // "É de…" (turma, mentoria, cliente, sócia ou geral), também usado na conferência do extrato
  d.opcoesOnde = (atual) => opcoesOnde(d, atual);
  d.camposOnde = (v, x) => camposOnde(d, v, x);
  return d;
}

// Acertos que a tela faz sozinha ao abrir: a data das linhas em aberto acompanha o módulo (remarcado) e as despesas fixas do
// mês entram uma vez.
async function acertar(d) {
  const mudancas = [];
  for (const l of d.receber) {
    const m = l.modulo_id && l.situacao === 'aberto' && d.modulo(l.modulo_id);
    const dia = m && F.diaDe(m.data_hora);
    if (m && dia !== l.data) { l.data = dia; mudancas.push(sb.from('fin_receber').update({ data: dia, atualizado_em: new Date().toISOString() }).eq('id', l.id)); }
  }
  const mes = hojeISO().slice(0, 7);
  for (const f of d.fixas.filter((x) => x.ativo)) {
    if (d.despesas.some((x) => x.fixa_id === f.id && x.competencia === mes)) continue;
    const nova = { data: `${mes}-${String(f.dia).padStart(2, '0')}`, descricao: f.descricao, valor: f.valor, categoria: f.categoria, conta: f.conta, fixa_id: f.id, competencia: mes, origem: 'fixa' };
    mudancas.push(sb.from('fin_despesas').insert(nova).select('*').single().then((r) => { if (r.data) d.despesas.push(r.data); }));
  }
  await Promise.allSettled(mudancas);
}

// ---------- tela ----------
export async function render(ctx, el, params) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="aviso">Só a administração vê o Financeiro.</div>'; return; }
  const abas = ABAS.filter(([k]) => k !== 'fechamento' || ehSocia(ctx.perfil));
  const aba = abas.some(([k]) => k === params[0]) ? params[0] : 'geral';
  const d = await carregar();
  d.eu = ctx.perfil.id;
  d.perfil = ctx.perfil;
  if (!d.falta) await acertar(d);
  el.innerHTML = `
    <div class="cab"><div><h1>Financeiro</h1><p class="sub">O faturamento nasce das turmas e mentorias: no dia do módulo ou da parcela, a nota aparece para emitir.</p></div>
      ${d.falta ? '' : '<div class="acoes"><button class="btn" type="button" id="ajustes">Ajustes</button><button class="btn pri" type="button" id="nova-desp">+ Despesa</button></div>'}</div>
    ${d.falta ? AVISO_52 : ''}
    <nav class="abas" aria-label="Partes do Financeiro">${abas.map(([k, t]) => `<button type="button" data-aba="${k}" class="${k === aba ? 'atual' : ''}">${t}${k === 'emitir' ? contador(d) : k === 'extratos' && d.movimentosAConferir ? ` <span class="selo alerta">${d.movimentosAConferir}</span>` : k === 'conferir' && !d.falta && d.aConferir.planos.length + d.aConferir.despesas.length ? ` <span class="selo alerta">${d.aConferir.planos.length + d.aConferir.despesas.length}</span>` : ''}</button>`).join('')}</nav>
    <div id="conteudo"></div>`;
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) location.hash = `#/financeiro/${b.dataset.aba}`; });
  if (d.falta) return;
  const recarregar = () => ctx.irPara(location.hash);
  el.querySelector('#ajustes').addEventListener('click', () => janelaAjustes(d, recarregar));
  el.querySelector('#nova-desp').addEventListener('click', () => formDespesa(d, null, recarregar));
  const alvo = el.querySelector('#conteudo');
  if (aba === 'conferir') return abaConferir(ctx, d, alvo, recarregar);
  if (aba === 'emitir') return abaEmitir(d, alvo, recarregar);
  if (aba === 'receber') return abaReceber(d, alvo, recarregar);
  if (aba === 'planos') return abaPlanos(ctx, d, alvo, recarregar);
  if (aba === 'despesas') return abaDespesas(d, alvo, recarregar, params[1]);
  if (aba === 'extratos') return (await import('./financeiro-extratos.js')).abaExtratos(ctx, d, alvo, recarregar, params.slice(1));
  if (aba === 'mentores') return (await import('./financeiro-mentores.js')).abaMentores(ctx, d, alvo, recarregar, params.slice(1));
  if (aba === 'fechamento') return (await import('./financeiro-fechamento.js')).abaFechamento(ctx, d, alvo, recarregar, params.slice(1));
  const mentores = await (await import('./financeiro-mentores.js')).previsaoMentores(d).catch(() => null);
  if (aba === 'margem') return (await import('./financeiro-margem.js')).abaMargem(ctx, d, alvo, recarregar, mentores);
  d.mentoresSemCadastro = mentores ? mentores.semCadastro : null;
  abaGeral(d, alvo, recarregar, params[1]);
  // visão da direção (previsões, clientes, mentores, indicadores, reserva e dinheiro nas contas)
  return (await import('./financeiro-painel.js')).painelDirecao(d, alvo.querySelector('#fn-direcao'), recarregar, mentores, { socia: ehSocia(ctx.perfil) });
}
function contador(d) {
  if (d.falta) return '';
  const n = d.receber.filter((l) => F.estado(l, hojeISO()) === 'a_emitir').length;
  return n ? ` <span class="selo alerta">${n}</span>` : '';
}

// O que ainda não tem plano: turmas e programas em andamento ou planejados (concluídos nos últimos 120 dias também)
function semPlano(d) {
  const corte = F.somarDias(hojeISO(), -120);
  const vale = (x) => x.status !== 'concluida' && x.status !== 'concluido' ? x.status !== 'pausada' && x.status !== 'pausado' : (x.fim_previsto || '') >= corte;
  return [
    ...d.turmas.filter((t) => vale(t) && !d.planos.some((p) => p.turma_id === t.id)).map((t) => ({ tipo: 'turma', id: t.id, nome: t.nome, empresa_id: t.empresa_id })),
    ...d.programas.filter((p) => vale(p) && !d.planos.some((x) => x.programa_id === p.id)).map((p) => ({ tipo: 'programa', id: p.id, nome: p.nome, empresa_id: p.empresa_id })),
  ];
}
// Módulos da turma que ainda não têm linha no plano (turma ganhou módulo depois)
const modulosSemLinha = (d, plano) => (plano.modo !== 'modulo' || !plano.turma_id ? []
  : d.modulos.filter((m) => m.turma_id === plano.turma_id && !d.receber.some((l) => l.plano_id === plano.id && l.modulo_id === m.id)));

// ---------- visão geral ----------
function abaGeral(d, el, recarregar, mesParam) {
  const hoje = hojeISO();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || '') ? mesParam : hoje.slice(0, 7);
  const ctxMes = { inicio: d.config.inicio, linhas: d.receber, meses: d.meses };
  const faturado = F.faturadoNoMes(mes, ctxMes);
  const meta = (d.meses.find((m) => m.mes === mes) || {}).meta;
  const anoPassado = F.faturadoNoMes(F.somarMeses(mes, -12), ctxMes);
  const estados = d.receber.map((l) => ({ l, e: F.estado(l, hoje) }));
  const aEmitir = estados.filter((x) => x.e === 'a_emitir').map((x) => x.l);
  const aReceber = estados.filter((x) => x.e === 'atrasado' || x.e === 'a_vencer').map((x) => x.l);
  const atrasado = estados.filter((x) => x.e === 'atrasado').map((x) => x.l);
  const recebidoMes = F.soma(d.receber.filter((l) => l.situacao === 'recebido' && F.mesDe(l.recebido_em) === mes), (l) => l.valor_recebido ?? l.valor);
  const despMes = d.despesas.filter((x) => F.mesDe(x.data) === mes);
  const despesas = F.soma(despMes, (x) => x.valor);
  const faltaPlano = semPlano(d);
  const novos = d.planos.map((p) => ({ p, ms: modulosSemLinha(d, p) })).filter((x) => x.ms.length);
  const antesDoInicio = mes < d.config.inicio;

  const ano = mes.slice(0, 4);
  const doAno = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`).map((m) => ({ m, v: F.faturadoNoMes(m, ctxMes), meta: (d.meses.find((x) => x.mes === m) || {}).meta }));
  const maior = Math.max(1, ...doAno.map((x) => Math.max(Number(x.v || 0), Number(x.meta || 0))));
  const anos = [...new Set(d.meses.map((m) => m.mes.slice(0, 4)).concat(ano))].sort();
  const totalAno = (a) => F.soma(Array.from({ length: 12 }, (_, i) => F.faturadoNoMes(`${a}-${String(i + 1).padStart(2, '0')}`, ctxMes)));

  el.innerHTML = `
    <div class="linha" style="margin-bottom:14px">
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, -1)}" aria-label="Mês anterior">‹</button>
      <h2 style="margin:0">${maiuscula(F.nomeMes(mes))}</h2>
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, 1)}" aria-label="Mês seguinte">›</button>
      ${mes !== hoje.slice(0, 7) ? `<button class="btn peq" type="button" data-mes="${hoje.slice(0, 7)}">Este mês</button>` : ''}
    </div>
    ${antesDoInicio ? `<p class="peq apagado" style="margin:-6px 0 12px">Antes de ${F.nomeMes(d.config.inicio)} o faturamento vem da planilha da Cintia. Para mudar o mês de início, use "Ajustes".</p>` : ''}
    <div class="grade g4">
      <div class="cartao numero destaque"><b>${faturado == null ? '—' : dinheiro(faturado)}</b><span>faturado no mês${meta ? ` · ${Math.round((faturado || 0) / meta * 100)}% da meta de ${dinheiro(meta)}` : ''}</span>
        ${anoPassado ? `<span>${F.nomeMes(F.somarMeses(mes, -12), true)}: ${dinheiro(anoPassado)}</span>` : ''}</div>
      <div class="cartao numero"><b>${dinheiro(recebidoMes)}</b><span>recebido no mês</span></div>
      <div class="cartao numero"><b>${dinheiro(F.soma(aReceber, (l) => l.valor))}</b><span>a receber (nota emitida)${atrasado.length ? ` · <b style="font-size:13px;color:var(--erro)">${dinheiro(F.soma(atrasado, (l) => l.valor))} atrasado</b>` : ''}</span></div>
      <div class="cartao numero"><b>${dinheiro(despesas)}</b><span>despesas do mês${faturado ? ` · sobra ${dinheiro(faturado - despesas)}` : ''}</span></div>
    </div>
    <div class="grade g2 mt">
      <div class="cartao"><h3>Para fazer</h3><div class="grade" style="gap:8px">
        ${d.aConferir.planos.length + d.aConferir.despesas.length ? `<a class="pend" href="#/financeiro/conferir"><b>${d.aConferir.planos.length + d.aConferir.despesas.length}</b><span>para conferir: ${[d.aConferir.planos.length && `${d.aConferir.planos.length} plano${d.aConferir.planos.length > 1 ? 's' : ''} de faturamento`, d.aConferir.despesas.length && `${d.aConferir.despesas.length} despesa${d.aConferir.despesas.length > 1 ? 's' : ''}`].filter(Boolean).join(' e ')}</span></a>` : ''}
        ${d.reembolsosACobrar.length ? `<a class="pend" href="#/financeiro/emitir"><b>${d.reembolsosACobrar.length}</b><span>${d.reembolsosACobrar.length === 1 ? 'despesa que o cliente reembolsa' : 'despesas que o cliente reembolsa'} ainda sem cobrança · ${dinheiro(F.soma(d.reembolsosACobrar, (x) => x.valor))} + imposto</span></a>` : ''}
        ${d.movimentosAConferir ? `<a class="pend" href="#/financeiro/extratos"><b>${d.movimentosAConferir}</b><span>${d.movimentosAConferir === 1 ? 'movimento do extrato para conferir' : 'movimentos do extrato para conferir'}</span></a>` : ''}
        ${aEmitir.length ? `<a class="pend" href="#/financeiro/emitir"><b>${aEmitir.length}</b><span>${aEmitir.length === 1 ? 'nota para emitir' : 'notas para emitir'} · ${dinheiro(F.soma(aEmitir, (l) => l.valor))}</span></a>` : ''}
        ${atrasado.length ? `<a class="pend" href="#/financeiro/receber"><b style="color:var(--erro)">${atrasado.length}</b><span>${atrasado.length === 1 ? 'pagamento atrasado' : 'pagamentos atrasados'} · ${dinheiro(F.soma(atrasado, (l) => l.valor))}</span></a>` : ''}
        ${faltaPlano.length ? `<a class="pend" href="#/financeiro/planos"><b>${faltaPlano.length}</b><span>${faltaPlano.length === 1 ? 'turma ou mentoria sem plano de faturamento' : 'turmas e mentorias sem plano de faturamento'}</span></a>` : ''}
        ${d.mentoresSemCadastro ? `<a class="pend" href="#/financeiro/mentores"><b>${d.mentoresSemCadastro}</b><span>${d.mentoresSemCadastro === 1 ? 'mentor parceiro sem cadastro financeiro' : 'mentores parceiros sem cadastro financeiro'}</span></a>` : ''}
        ${novos.map((x) => `<a class="pend" href="#/financeiro/planos"><b>${x.ms.length}</b><span>${x.ms.length === 1 ? 'módulo novo' : 'módulos novos'} em ${esc(x.p.titulo)} sem linha no faturamento</span></a>`).join('')}
        ${!aEmitir.length && !atrasado.length && !faltaPlano.length && !novos.length && !d.aConferir.planos.length && !d.aConferir.despesas.length && !d.reembolsosACobrar.length && !d.movimentosAConferir ? '<p class="apagado">Nada pendente. 🎉</p>' : ''}
      </div></div>
      <div class="cartao"><div class="linha"><h3 style="flex:1">Faturado em ${ano}</h3><button class="btn peq" type="button" id="meses">Metas e meses antigos</button></div>
        <div class="fn-barras" aria-label="Faturado por mês em ${ano}">${doAno.map((x) => `
          <a class="fn-barra${x.m === mes ? ' atual' : ''}" href="#/financeiro/geral/${x.m}" title="${esc(F.nomeMes(x.m))}: ${x.v == null ? 'sem dado' : dinheiro(x.v)}${x.meta ? ` · meta ${dinheiro(x.meta)}` : ''}">
            <span>${maiuscula(F.nomeMes(x.m, true).slice(0, 3))}</span>
            <span class="fn-trilho"><i style="width:${Math.round(Number(x.v || 0) / maior * 100)}%"></i>${x.meta ? `<em style="left:${Math.round(Number(x.meta) / maior * 100)}%"></em>` : ''}</span>
            <span class="fn-v">${x.v == null ? '—' : `${Math.round(x.v / 1000).toLocaleString('pt-BR')} mil`}</span></a>`).join('')}</div>
        <p class="peq apagado mt">Barra = faturado · traço = meta do mês. Clique num mês para ver os números dele.</p>
        <div class="tabela mt"><table><thead><tr><th>Ano</th><th style="text-align:right">Faturado</th></tr></thead><tbody>
          ${anos.map((a) => `<tr><td>${a}</td><td style="text-align:right" class="fn-num">${dinheiro(totalAno(a))}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>
    ${despMes.length ? `<div class="cartao mt"><h3>Despesas de ${F.nomeMes(mes)} por tipo</h3>${barrasCategorias(despMes)}</div>` : ''}
    <div id="fn-direcao"></div>`;
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/financeiro/geral/${b.dataset.mes}`; }));
  el.querySelector('#meses').addEventListener('click', () => janelaMeses(d, ano, recarregar));
}

function barrasCategorias(lista) {
  const por = {};
  for (const x of lista) por[x.categoria] = (por[x.categoria] || 0) + Number(x.valor || 0);
  const linhas = Object.entries(por).sort((a, b) => b[1] - a[1]);
  const maior = Math.max(1, ...linhas.map(([, v]) => v));
  return `<div class="fn-barras">${linhas.map(([k, v]) => `<div class="fn-barra"><span>${esc(F.nomeCategoria(k))}</span><span class="fn-trilho"><i style="width:${Math.round(v / maior * 100)}%"></i></span><span class="fn-v">${dinheiro(v)}</span></div>`).join('')}</div>`;
}

// ---------- conferir ----------
// O que entrou sozinho (da planilha ou montado pela plataforma) e precisa de um olhar: planos com valor a validar e despesas
// sem programa certo. Cada despesa ganha "É de…": uma turma, uma mentoria individual, só o cliente, a despesa pessoal de uma
// sócia ou a Mentorei em geral; "Confirmar" grava e tira da lista.
const nomeTurma = (d, id) => (d.turmas.find((t) => t.id === id) || {}).nome || '';
const nomePrograma = (d, id) => (d.programas.find((p) => p.id === id) || {}).nome || '';
function ondeTexto(d, x) {
  if (x.categoria === 'socia') return `Despesa pessoal de ${esc((d.pessoa(x.pessoa_id) || {}).nome || 'sócia ?')}`;
  return [x.empresa_id && d.empresa(x.empresa_id).nome, x.turma_id && nomeTurma(d, x.turma_id), x.programa_id && nomePrograma(d, x.programa_id),
    x.modulo_id && d.modulo(x.modulo_id) && `Módulo ${d.modulo(x.modulo_id).numero}`].filter(Boolean).map(esc).join(' · ');
}
function valorOnde(x) {
  if (x.categoria === 'socia') return x.pessoa_id ? `s:${x.pessoa_id}` : '';
  if (x.turma_id) return `t:${x.turma_id}`;
  if (x.programa_id) return `p:${x.programa_id}`;
  if (x.empresa_id) return `e:${x.empresa_id}`;
  return x.conferir ? '' : 'g:';
}
function opcoesOnde(d, atual) {
  const emp = (id) => d.empresa(id).nome;
  const ordem = (a, b) => a.rotulo.localeCompare(b.rotulo);
  const ativa = (x) => !/conclu/.test(x.status || '');
  const grupo = (titulo, itens) => (itens.length ? `<optgroup label="${esc(titulo)}">${itens.sort(ordem).map((i) => `<option value="${i.v}"${i.v === atual ? ' selected' : ''}>${esc(i.rotulo)}</option>`).join('')}</optgroup>` : '');
  return `<option value="">É de…</option>
    ${grupo('Turmas', d.turmas.filter((t) => ativa(t) || `t:${t.id}` === atual).map((t) => ({ v: `t:${t.id}`, rotulo: `${emp(t.empresa_id)} · ${t.nome}` })))}
    ${grupo('Mentorias individuais', d.programas.filter((p) => ativa(p) || `p:${p.id}` === atual).map((p) => ({ v: `p:${p.id}`, rotulo: `${emp(p.empresa_id)} · ${p.nome}` })))}
    ${grupo('Só o cliente', d.empresas.filter((e) => d.turmas.some((t) => t.empresa_id === e.id) || d.programas.some((p) => p.empresa_id === e.id) || `e:${e.id}` === atual).map((e) => ({ v: `e:${e.id}`, rotulo: e.nome })))}
    ${grupo('Despesa pessoal de', d.socias.map((p) => ({ v: `s:${p.id}`, rotulo: p.nome })))}
    <optgroup label="Outro"><option value="g:"${atual === 'g:' ? ' selected' : ''}>Mentorei (geral, sem programa)</option></optgroup>`;
}
function camposOnde(d, v, x) {
  const [t, id] = String(v).split(':');
  const base = { empresa_id: null, turma_id: null, programa_id: null, modulo_id: null, pessoa_id: x.pessoa_id || null };   // quem gastou fica
  const cat = x.categoria === 'socia' ? 'outros' : x.categoria;
  if (t === 't') { const tu = d.turmas.find((y) => y.id === id); return { ...base, turma_id: id, empresa_id: tu ? tu.empresa_id : null, modulo_id: x.turma_id === id ? x.modulo_id : null, categoria: cat }; }
  if (t === 'p') { const pr = d.programas.find((y) => y.id === id); return { ...base, programa_id: id, empresa_id: pr ? pr.empresa_id : null, categoria: cat }; }
  if (t === 'e') return { ...base, empresa_id: id, categoria: cat };
  if (t === 's') return { ...base, pessoa_id: id, categoria: 'socia' };
  return { ...base, categoria: cat };
}

function abaConferir(ctx, d, el, recarregar) {
  const { planos, despesas } = d.aConferir;
  const lista = [...despesas].sort((a, b) => a.data.localeCompare(b.data));
  el.innerHTML = `
    ${!planos.length && !lista.length ? '<div class="vazio">Nada para conferir. 🎉</div>' : ''}
    ${planos.length ? `<div class="cartao" style="margin-bottom:14px"><h3>Planos de faturamento para validar (${planos.length})</h3>
      <p class="apagado">Montados com os valores da planilha de faturamento ou sem valor. Abra, confira valores e datas das parcelas e salve: sai desta lista.</p>
      <div class="tabela mt"><table><tbody>${planos.map((p) => `<tr><td><b>${esc(d.empresa(p.empresa_id).nome)}</b><br>${esc(p.titulo)}</td><td>${esc(p.conferir)}</td>
        <td style="white-space:nowrap"><button class="btn peq escuro" type="button" data-plano="${p.id}">Abrir e conferir</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${lista.length ? `<div class="cartao"><h3>Despesas para confirmar (${lista.length})</h3>
      <p class="apagado">Escolha de que programa é cada despesa. Se não for de nenhum, escolha "Despesa pessoal de" e a sócia, ou "Mentorei (geral)". Depois clique em Confirmar.</p>
      <div class="tabela mt"><table><thead><tr><th>Dia</th><th>O que</th><th style="text-align:right">Valor</th><th>Por que conferir</th><th>É de…</th><th></th></tr></thead><tbody>
      ${lista.map((x) => `<tr><td>${dataBR(x.data)}</td><td>${esc(x.descricao)}<br><small class="apagado">${esc(F.nomeCategoria(x.categoria))}</small></td>
        <td class="fn-num" style="text-align:right">${dinheiro(x.valor)}</td><td><small>${esc(x.conferir)}</small></td>
        <td><select data-onde="${x.id}" aria-label="De que programa é" style="max-width:260px">${opcoesOnde(d, valorOnde(x))}</select></td>
        <td style="white-space:nowrap"><button class="btn peq pri" type="button" data-ok="${x.id}">Confirmar</button> <button class="btn peq" type="button" data-editar="${x.id}">Editar</button></td></tr>`).join('')}
      </tbody></table></div></div>` : ''}`;
  el.addEventListener('click', async (ev) => {
    const pl = ev.target.closest('[data-plano]'), ok = ev.target.closest('[data-ok]'), ed = ev.target.closest('[data-editar]');
    if (pl) editorPlano(ctx, d, { plano: d.plano(pl.dataset.plano) }, recarregar);
    if (ed) formDespesa(d, d.despesas.find((x) => x.id === ed.dataset.editar), recarregar);
    if (ok) {
      const x = d.despesas.find((y) => y.id === ok.dataset.ok);
      const v = el.querySelector(`[data-onde="${x.id}"]`).value;
      if (!v) { avisar('Escolha de que é a despesa (ou "Mentorei (geral)").', true); return; }
      const campos = { ...camposOnde(d, v, x), conferir: null };
      const { error } = await sb.from('fin_despesas').update(campos).eq('id', x.id);
      if (error) { avisar(explicarErro(error), true); return; }
      Object.assign(x, campos);
      d.aConferir.despesas = d.aConferir.despesas.filter((y) => y.id !== x.id);
      ok.closest('tr').remove();
      avisar('Despesa confirmada.');
      if (!d.aConferir.despesas.length && !d.aConferir.planos.length) recarregar();
    }
  });
}

// ---------- emitir nota ----------
function blocoReembolsos(d) {
  const lista = d.reembolsosACobrar;
  if (!lista.length) return '';
  const onde = (x) => ondeTexto(d, x) || '<span class="selo alerta">sem cliente</span>';
  return `<div class="cartao" style="margin-bottom:14px"><h3>Despesas que o cliente reembolsa (${lista.length})</h3>
    <p class="apagado">A nota do reembolso também paga imposto: com a alíquota de ${esc(textoAliquota(d))}, cobrar só o valor gasto deixa a Mentorei no prejuízo do imposto. "Cobrar na nota" põe a linha aqui em "Emitir nota".</p>
    ${d.temReembolso ? '' : '<div class="aviso mt">Para marcar o que já foi cobrado, falta rodar o script <b>55</b> no Supabase.</div>'}
    <div class="tabela mt"><table><thead><tr><th>Dia</th><th>O que</th><th>Cliente</th><th style="text-align:right">Gasto</th><th style="text-align:right">Imposto na nota</th><th style="text-align:right">Cobrar para empatar</th><th></th></tr></thead><tbody>
    ${lista.map((x) => `<tr><td>${dataBR(x.data)}</td><td>${esc(x.descricao)}</td><td>${onde(x)}</td><td class="fn-num" style="text-align:right">${dinheiro(x.valor)}</td>
      <td class="fn-num" style="text-align:right">${dinheiro(F.impostoSobre(F.comImpostoIncluido(x.valor, d.aliquota.pct), d.aliquota.pct))}</td>
      <td class="fn-num" style="text-align:right"><b>${dinheiro(F.comImpostoIncluido(x.valor, d.aliquota.pct))}</b></td>
      <td><button class="btn peq escuro" type="button" data-cobrar="${x.id}"${d.temReembolso && x.empresa_id ? '' : ' disabled title="Ligue a despesa a um cliente (Editar) e rode o script 55"'}>Cobrar na nota</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

function janelaCobrar(d, x, recarregar) {
  const pct = d.aliquota.pct;
  const cheio = F.comImpostoIncluido(x.valor, pct);
  const plano = d.planos.find((p) => (x.turma_id && p.turma_id === x.turma_id) || (x.programa_id && p.programa_id === x.programa_id)) || null;
  const j = janela('Cobrar o reembolso do cliente', `<form class="grade" style="gap:12px" novalidate>
    <p><b>${esc(x.descricao)}</b> · ${esc(d.empresa(x.empresa_id).nome)} · gasto de ${dinheiro(x.valor)}</p>
    <label class="check"><input type="radio" name="cb-valor" value="cheio" checked><span>Cobrar <b>${dinheiro(cheio)}</b>: com o imposto da nota incluído (${pctBR(pct)}), sobra exatamente o que foi gasto.</span></label>
    <label class="check"><input type="radio" name="cb-valor" value="gasto"><span>Cobrar só <b>${dinheiro(x.valor)}</b>: a Mentorei paga o imposto de ${dinheiro(F.impostoSobre(x.valor, pct))}.</span></label>
    <label class="check"><input type="radio" name="cb-valor" value="outro"><span>Outro valor: <input type="number" id="cb-outro" min="0" step="0.01" style="max-width:140px" aria-label="Outro valor"></span></label>
    <p class="peq apagado">Alíquota: ${esc(textoAliquota(d))}. ${plano ? `A linha entra no faturamento de "${esc(plano.titulo)}".` : 'A linha entra avulsa, só com o cliente.'}</p>
    <div class="linha"><button class="btn pri" type="submit">Pôr em "Emitir nota"</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 600 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const op = f.querySelector('[name="cb-valor"]:checked').value;
    const valor = op === 'cheio' ? cheio : op === 'gasto' ? Number(x.valor) : num(f.querySelector('#cb-outro'));
    if (!valor) { avisar('Escreva o valor.', true); return; }
    try {
      const { data, error } = await sb.from('fin_receber').insert({ plano_id: plano ? plano.id : null, empresa_id: x.empresa_id, descricao: `Reembolso · ${x.descricao}`.slice(0, 200), data: hojeISO(), valor, situacao: 'aberto',
        observacoes: `Despesa de ${dataBR(x.data)} (${dinheiro(x.valor)}) reembolsada pelo cliente; alíquota usada ${pctBR(pct)}.` }).select('id').single();
      if (error) throw error;
      const r = await sb.from('fin_despesas').update({ reembolso_receber_id: data.id }).eq('id', x.id); if (r.error) throw r.error;
      j.fechar(); avisar('Reembolso pronto para emitir a nota.'); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

function abaEmitir(d, el, recarregar) {
  const hoje = hojeISO();
  const linhas = d.receber.filter((l) => ['a_emitir', 'proximo'].includes(F.estado(l, hoje))).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const quemPaga = (l) => { const p = d.plano(l.plano_id); const e = d.empresa(l.empresa_id); return p && p.pagador_nome ? `${esc(p.pagador_nome)}${p.pagador_cnpj ? `<br><small>${esc(p.pagador_cnpj)}</small>` : ''}` : `${esc(e.nome)}${e.cnpj ? `<br><small>${esc(e.cnpj)}</small>` : ''}`; };
  const linha = (l) => { const p = d.plano(l.plano_id); return `<tr>
      <td><input type="checkbox" data-sel="${l.id}" aria-label="Marcar ${esc(l.descricao)}"></td>
      <td>${dataBR(l.data)}<br>${selo(F.estado(l, hoje))}</td>
      <td><b>${esc(d.empresa(l.empresa_id).nome)}</b><br><small>${esc(p ? p.titulo : '')}</small></td>
      <td>${esc(l.descricao)}</td>
      <td>${quemPaga(l)}</td>
      <td>${esc(d.config.emissores[p ? p.emissor : 'principal'] || '')}</td>
      <td class="fn-num" style="text-align:right">${dinheiro(l.valor)}</td>
      <td><div class="linha" style="gap:6px;flex-wrap:nowrap"><button class="btn peq" type="button" data-texto="${l.id}">Copiar texto</button><button class="btn peq escuro" type="button" data-nota="${l.id}">Nota emitida</button></div></td></tr>`; };
  el.innerHTML = blocoReembolsos(d) + (linhas.length ? `
    <p class="apagado" style="margin-bottom:10px">Módulos e parcelas que já aconteceram (ou acontecem nesta semana) e ainda estão sem nota. Para pôr várias linhas na mesma nota, marque as caixinhas.</p>
    <div class="linha" style="margin-bottom:10px"><button class="btn escuro" type="button" id="nota-varias" disabled>Nota emitida para as marcadas</button><span class="peq apagado" id="soma-sel"></span></div>
    <div class="tabela cartao" style="padding:0"><table><thead><tr><th></th><th>Data</th><th>Cliente</th><th>O que</th><th>Quem paga</th><th>Nota por</th><th style="text-align:right">Valor</th><th></th></tr></thead>
      <tbody>${linhas.map(linha).join('')}</tbody></table></div>`
    : '<div class="vazio">Nenhuma nota para emitir agora. Quando um módulo ou uma parcela chegar, ela aparece aqui.</div>');
  const marcadas = () => [...el.querySelectorAll('[data-sel]:checked')].map((c) => d.receber.find((l) => l.id === c.dataset.sel));
  el.addEventListener('change', (ev) => {
    if (!ev.target.matches('[data-sel]')) return;
    const m = marcadas();
    if (el.querySelector('#nota-varias')) el.querySelector('#nota-varias').disabled = m.length < 1;
    el.querySelector('#soma-sel').textContent = m.length ? `${m.length} marcada${m.length > 1 ? 's' : ''} · ${dinheiro(F.soma(m, (l) => l.valor))}` : '';
  });
  el.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-texto]'), n = ev.target.closest('[data-nota]'), cb = ev.target.closest('[data-cobrar]');
    if (cb) return janelaCobrar(d, d.despesas.find((x) => x.id === cb.dataset.cobrar), recarregar);
    if (t) { const l = d.receber.find((x) => x.id === t.dataset.texto); copiar(F.textoDaNota({ plano: d.plano(l.plano_id), linhas: [l], empresa: d.empresa(l.empresa_id).nome })); }
    if (n) janelaNota(d, [d.receber.find((x) => x.id === n.dataset.nota)], recarregar);
    if (ev.target.id === 'nota-varias') {
      const m = marcadas();
      if (new Set(m.map((l) => l.empresa_id)).size > 1) { avisar('Marque linhas de um cliente só: uma nota é para um cliente.', true); return; }
      janelaNota(d, m, recarregar);
    }
  });
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); avisar('Texto da nota copiado. É só colar no emissor.'); }
  catch (_) { janela('Texto da nota', `<textarea rows="6" style="width:100%" readonly>${esc(texto)}</textarea><p class="peq apagado mt">Selecione e copie.</p>`); }
}

function janelaNota(d, linhas, recarregar) {
  const p = d.plano(linhas[0].plano_id);
  const hoje = hojeISO();
  const uma = linhas.length === 1;
  const j = janela(uma ? 'Nota emitida' : `Nota emitida para ${linhas.length} linhas`, `<form class="grade" style="gap:12px" novalidate>
    <p class="apagado">${esc(d.empresa(linhas[0].empresa_id).nome)} · ${linhas.map((l) => esc(l.descricao)).join(', ')}</p>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="n-num">Número da nota *</label><input type="number" id="n-num" min="1" inputmode="numeric" required></div>
      <div class="campo"><label for="n-em">Emitida em</label><input type="date" id="n-em" value="${hoje}"></div>
      <div class="campo"><label for="n-venc">Vence em</label><input type="date" id="n-venc" value="${F.vencimentoPadrao(hoje, p ? p.prazo_dias : 30)}"></div>
    </div>
    ${uma ? `<div class="campo"><label for="n-valor">Valor da nota (R$)</label><input type="number" id="n-valor" min="0" step="0.01" value="${v2(linhas[0].valor)}"><small>Mude se o valor mudou na negociação.</small></div>`
      : `<p>Total: <b>${dinheiro(F.soma(linhas, (l) => l.valor))}</b></p>`}
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 560 });
  const f = j.corpo.querySelector('form');
  f.querySelector('#n-em').addEventListener('change', (ev) => { if (ev.target.value) f.querySelector('#n-venc').value = F.vencimentoPadrao(ev.target.value, p ? p.prazo_dias : 30); });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const numero = parseInt(f.querySelector('#n-num').value, 10);
    if (!numero) { avisar('Escreva o número da nota.', true); return; }
    const base = { situacao: 'faturado', nota_numero: numero, nota_emitida_em: f.querySelector('#n-em').value || hoje, vencimento: f.querySelector('#n-venc').value || null, atualizado_em: new Date().toISOString() };
    try {
      for (const l of linhas) {
        const corpo = uma && f.querySelector('#n-valor').value !== '' ? { ...base, valor: Number(f.querySelector('#n-valor').value) } : base;
        const { error } = await sb.from('fin_receber').update(corpo).eq('id', l.id); if (error) throw error;
      }
      j.fechar(); avisar(`Nota ${numero} registrada.`); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

// ---------- a receber ----------
function abaReceber(d, el, recarregar) {
  const hoje = hojeISO();
  // uma linha por nota (várias linhas podem estar na mesma nota)
  const porNota = (lista) => {
    const g = new Map();
    for (const l of lista) { const k = `${l.empresa_id}|${l.nota_numero || l.id}`; if (!g.has(k)) g.set(k, []); g.get(k).push(l); }
    return [...g.values()];
  };
  const abertas = porNota(d.receber.filter((l) => l.situacao === 'faturado')).sort((a, b) => (a[0].vencimento || '9').localeCompare(b[0].vencimento || '9'));
  const recentes = porNota(d.receber.filter((l) => l.situacao === 'recebido' && l.recebido_em && l.recebido_em >= F.somarDias(hoje, -60))).sort((a, b) => b[0].recebido_em.localeCompare(a[0].recebido_em));
  const prazo = (g) => {
    const v = g[0].vencimento; if (!v) return '<span class="selo neutro">Sem vencimento</span>';
    const k = F.diasEntre(hoje, v);
    return k < 0 ? `<span class="selo erro">Atrasado ${-k} dia${k === -1 ? '' : 's'}</span>` : k === 0 ? '<span class="selo alerta">Vence hoje</span>' : `<span class="selo neutro">Vence em ${k} dia${k === 1 ? '' : 's'}</span>`;
  };
  const total = (g) => F.soma(g, (l) => l.valor);
  const idsDe = (g) => g.map((l) => l.id).join(',');
  el.innerHTML = `
    <div class="grade g4" style="margin-bottom:14px">
      <div class="cartao numero"><b>${dinheiro(F.soma(abertas.flat(), (l) => l.valor))}</b><span>a receber em ${abertas.length} nota${abertas.length === 1 ? '' : 's'}</span></div>
      <div class="cartao numero"><b style="color:var(--erro)">${dinheiro(F.soma(abertas.filter((g) => g[0].vencimento && g[0].vencimento < hoje).flat(), (l) => l.valor))}</b><span>atrasado</span></div>
    </div>
    ${abertas.length ? `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Nota</th><th>Cliente</th><th>O que</th><th>Vencimento</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
      ${abertas.map((g) => `<tr><td><b>${g[0].nota_numero || '—'}</b><br><small>${dataBR(g[0].nota_emitida_em)}</small></td>
        <td>${esc(d.empresa(g[0].empresa_id).nome)}${d.plano(g[0].plano_id) && d.plano(g[0].plano_id).pagador_nome ? `<br><small>paga: ${esc(d.plano(g[0].plano_id).pagador_nome)}</small>` : ''}</td>
        <td>${g.map((l) => esc(l.descricao)).join('<br>')}</td>
        <td>${dataBR(g[0].vencimento)}<br>${prazo(g)}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(total(g))}</td>
        <td><div class="linha" style="gap:6px;flex-wrap:nowrap"><button class="btn peq escuro" type="button" data-receber="${idsDe(g)}">Recebido</button><button class="btn peq" type="button" data-desfazer-nota="${idsDe(g)}" title="A nota foi cancelada: a linha volta para Emitir nota">Voltar</button></div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma nota esperando pagamento.</div>'}
    ${recentes.length ? `<details class="cartao mt"><summary><b>Recebidos nos últimos 60 dias</b> · ${dinheiro(F.soma(recentes.flat(), (l) => l.valor_recebido ?? l.valor))}</summary>
      <div class="tabela mt"><table><tbody>${recentes.map((g) => `<tr><td>${dataBR(g[0].recebido_em)}</td><td>Nota ${g[0].nota_numero || '—'}</td><td>${esc(d.empresa(g[0].empresa_id).nome)}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(F.soma(g, (l) => l.valor_recebido ?? l.valor))}</td><td><button class="btn peq" type="button" data-desfazer-receb="${idsDe(g)}">Desfazer</button></td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
  const pegar = (ids) => ids.split(',').map((id) => d.receber.find((l) => l.id === id));
  el.addEventListener('click', async (ev) => {
    const r = ev.target.closest('[data-receber]'), dn = ev.target.closest('[data-desfazer-nota]'), dr = ev.target.closest('[data-desfazer-receb]');
    try {
      if (r) janelaRecebido(pegar(r.dataset.receber), recarregar);
      if (dn) {
        for (const l of pegar(dn.dataset.desfazerNota)) { const { error } = await sb.from('fin_receber').update({ situacao: 'aberto', nota_numero: null, nota_emitida_em: null, vencimento: null, atualizado_em: new Date().toISOString() }).eq('id', l.id); if (error) throw error; }
        avisar('As linhas voltaram para "Emitir nota".'); recarregar();
      }
      if (dr) {
        for (const l of pegar(dr.dataset.desfazerReceb)) { const { error } = await sb.from('fin_receber').update({ situacao: 'faturado', recebido_em: null, valor_recebido: null, atualizado_em: new Date().toISOString() }).eq('id', l.id); if (error) throw error; }
        avisar('Recebimento desfeito.'); recarregar();
      }
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

function janelaRecebido(linhas, recarregar) {
  const total = F.soma(linhas, (l) => l.valor);
  const j = janela('Pagamento recebido', `<form class="grade" style="gap:12px" novalidate>
    <p class="apagado">Nota ${linhas[0].nota_numero || '—'} · ${dinheiro(total)}</p>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="r-dia">Recebido em</label><input type="date" id="r-dia" value="${hojeISO()}"></div>
      <div class="campo"><label for="r-valor">Valor que entrou (R$)</label><input type="number" id="r-valor" min="0" step="0.01" value="${v2(total)}"><small>Se veio com desconto de imposto retido, coloque o que caiu na conta.</small></div>
    </div>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 520 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const entrou = num(f.querySelector('#r-valor')) ?? total;
    // o valor que entrou é dividido entre as linhas na proporção de cada uma
    const partes = linhas.map((l) => (total ? F.arred(entrou * Number(l.valor) / total) : 0));
    partes[partes.length - 1] = F.arred(entrou - F.soma(partes.slice(0, -1)));
    try {
      for (const [i, l] of linhas.entries()) {
        const { error } = await sb.from('fin_receber').update({ situacao: 'recebido', recebido_em: f.querySelector('#r-dia').value || hojeISO(), valor_recebido: partes[i], atualizado_em: new Date().toISOString() }).eq('id', l.id);
        if (error) throw error;
      }
      j.fechar(); avisar('Recebimento registrado.'); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

// ---------- turmas e mentorias (planos) ----------
function abaPlanos(ctx, d, el, recarregar) {
  const faltam = semPlano(d);
  const resumo = (p) => {
    const ls = d.receber.filter((l) => l.plano_id === p.id && l.situacao !== 'cancelado');
    return { total: F.soma(ls, (l) => l.valor), recebido: F.soma(ls.filter((l) => l.situacao === 'recebido'), (l) => l.valor_recebido ?? l.valor),
      nota: F.soma(ls.filter((l) => l.situacao === 'faturado'), (l) => l.valor), aberto: F.soma(ls.filter((l) => l.situacao === 'aberto'), (l) => l.valor), n: ls.length };
  };
  const nomeDe = (p) => (p.turma_id ? 'Turma' : p.programa_id ? 'Mentoria individual' : 'Avulso');
  const planos = [...d.planos].sort((a, b) => d.empresa(a.empresa_id).nome.localeCompare(d.empresa(b.empresa_id).nome) || a.titulo.localeCompare(b.titulo));
  el.innerHTML = `
    ${faltam.length ? `<div class="cartao" style="margin-bottom:14px"><h3>Sem plano de faturamento (${faltam.length})</h3>
      <p class="apagado">Turmas e mentorias em andamento ou planejadas. "Montar plano" já traz o valor da proposta, quando há.</p>
      <div class="tabela mt"><table><tbody>${faltam.map((x) => `<tr><td><b>${esc(d.empresa(x.empresa_id).nome)}</b></td><td>${esc(x.nome)}</td><td>${x.tipo === 'turma' ? 'Turma' : 'Mentoria individual'}</td>
        <td style="text-align:right"><button class="btn peq pri" type="button" data-montar="${x.tipo}:${x.id}">Montar plano</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="linha" style="margin-bottom:10px"><input type="search" id="busca" placeholder="Procurar cliente ou turma…" style="width:auto;min-width:240px" aria-label="Procurar cliente ou turma"><span style="flex:1"></span><button class="btn peq" type="button" id="avulso">+ Plano avulso (palestra, diagnóstico…)</button></div>
    ${planos.length ? `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Cliente</th><th>Turma ou mentoria</th><th style="text-align:right">Total</th><th style="text-align:right">Recebido</th><th style="text-align:right">Nota emitida</th><th style="text-align:right">Falta faturar</th><th></th></tr></thead>
      <tbody>${planos.map((p) => { const r = resumo(p); const novos = modulosSemLinha(d, p).length; return `<tr data-linha="${esc(norm(`${d.empresa(p.empresa_id).nome} ${p.titulo}`))}">
        <td><b>${esc(d.empresa(p.empresa_id).nome)}</b></td><td>${esc(p.titulo)}<br><small class="apagado">${nomeDe(p)} · ${p.modo === 'modulo' ? 'por módulo' : 'por parcela'} · ${r.n} linha${r.n === 1 ? '' : 's'}</small>${novos ? `<br><span class="selo alerta">${novos} módulo${novos > 1 ? 's' : ''} sem linha</span>` : ''}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(r.total)}</td><td class="fn-num" style="text-align:right">${dinheiro(r.recebido)}</td><td class="fn-num" style="text-align:right">${dinheiro(r.nota)}</td><td class="fn-num" style="text-align:right">${dinheiro(r.aberto)}</td>
        <td><button class="btn peq" type="button" data-abrir="${p.id}">Abrir</button></td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="vazio">Nenhum plano ainda. Comece pelas turmas e mentorias acima.</div>'}`;
  const busca = el.querySelector('#busca');
  busca.addEventListener('input', () => { const t = norm(busca.value); el.querySelectorAll('[data-linha]').forEach((tr) => { tr.hidden = !!t && !tr.dataset.linha.includes(t); }); });
  el.addEventListener('click', (ev) => {
    const m = ev.target.closest('[data-montar]'), a = ev.target.closest('[data-abrir]');
    if (m) { const [tipo, id] = m.dataset.montar.split(':'); editorPlano(ctx, d, { tipo, id }, recarregar); }
    if (a) editorPlano(ctx, d, { plano: d.plano(a.dataset.abrir) }, recarregar);
    if (ev.target.id === 'avulso') editorPlano(ctx, d, { tipo: 'avulso' }, recarregar);
  });
}

// Proposta mais recente da oportunidade ligada à turma/programa (com os preços, quando foi feita na plataforma)
async function propostaDe(op) {
  if (!op) return null;
  const { data } = await sb.from('propostas').select('id, versao, valor, conteudo, criado_em').eq('oportunidade_id', op.id).order('versao', { ascending: false }).limit(1);
  return (data && data[0]) || null;
}

async function editorPlano(ctx, d, { plano = null, tipo = null, id = null }, recarregar) {
  const hoje = hojeISO();
  const turma = plano ? d.turmas.find((t) => t.id === plano.turma_id) : tipo === 'turma' ? d.turmas.find((t) => t.id === id) : null;
  const programa = plano ? d.programas.find((p) => p.id === plano.programa_id) : tipo === 'programa' ? d.programas.find((p) => p.id === id) : null;
  const op = (plano && d.oportunidades.find((o) => o.id === plano.oportunidade_id))
    || d.oportunidades.find((o) => (turma && o.turma_id === turma.id) || (programa && o.programa_id === programa.id)) || null;
  const mods = turma ? d.modulos.filter((m) => m.turma_id === turma.id).sort((a, b) => a.numero - b.numero) : [];
  const proposta = await propostaDe(op);
  const sug = F.sugestaoDoValor({ oportunidade: op, proposta, temModulos: mods.length > 0 });
  const p = plano ? { ...plano } : {
    empresa_id: (turma || programa || {}).empresa_id || '', turma_id: turma ? turma.id : null, programa_id: programa ? programa.id : null, oportunidade_id: op ? op.id : null,
    titulo: (turma || programa || {}).nome || '', modo: sug.modo, valor_total: sug.valor_total, valor_modulo: sug.valor_modulo, emissor: 'principal', prazo_dias: 30,
    pagador_nome: null, pagador_cnpj: null, descricao_nota: '', observacoes: '',
  };
  // linhas em edição: as do banco (ou nenhuma, num plano novo)
  let linhas = plano ? d.receber.filter((l) => l.plano_id === plano.id).map((l) => ({ ...l })).sort((a, b) => (a.data || '9').localeCompare(b.data || '9')) : [];
  const removidas = [];
  const programaParcelas = programa ? Math.max(1, Math.round((F.diasEntre(programa.inicio || hoje, programa.fim_previsto || F.somarDias(programa.inicio || hoje, 180)) || 180) / 30)) : 1;
  const emissores = d.config.emissores;
  const j = janela(plano ? `Faturamento · ${plano.titulo}` : 'Montar plano de faturamento', `<form class="grade" style="gap:14px" novalidate>
    ${plano && plano.conferir ? `<div class="aviso"><b>Para conferir:</b> ${esc(plano.conferir)} Ao salvar, o plano sai da lista "Conferir".</div>` : ''}
    ${sug.fonte ? `<div class="aviso">De onde veio o valor: <b>${esc(sug.fonte)}</b>${sug.valor_modulo != null ? ` · ${dinheiro(sug.valor_modulo)} por módulo` : sug.valor_total != null ? ` · ${dinheiro(sug.valor_total)}` : ''}. Se a negociação mudou o valor, é só trocar abaixo.</div>`
      : `<div class="aviso">Não achei valor na proposta${op ? '' : ' (esta turma ou mentoria não está ligada a uma oportunidade de vendas)'}. Coloque o valor combinado abaixo.</div>`}
    <div class="grade g2" style="gap:10px">
      ${!turma && !programa ? `<div class="campo"><label for="p-emp">Cliente *</label><select id="p-emp"><option value="">Escolha…</option>${[...d.empresas].sort((a, b) => a.nome.localeCompare(b.nome)).map((e) => `<option value="${e.id}"${e.id === p.empresa_id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>`
        : `<div class="campo"><label>Cliente</label><b>${esc(d.empresa(p.empresa_id).nome)}</b></div>`}
      <div class="campo"><label for="p-titulo">Nome no financeiro *</label><input type="text" id="p-titulo" maxlength="160" value="${esc(p.titulo)}"></div>
    </div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="p-modo">Como cobra</label><select id="p-modo">
        <option value="modulo"${p.modo === 'modulo' ? ' selected' : ''}${mods.length ? '' : ' disabled'}>Por módulo dado${mods.length ? ` (${mods.length} módulos)` : ' (sem módulos)'}</option>
        <option value="parcelas"${p.modo === 'parcelas' ? ' selected' : ''}>Por parcelas com data</option></select></div>
      <div class="campo" data-so="modulo"><label for="p-vmod">Valor por módulo (R$)</label><input type="number" id="p-vmod" min="0" step="0.01" value="${v2(p.valor_modulo)}"><small>Vazio = divide o total pelos módulos.</small></div>
      <div class="campo"><label for="p-total">Valor total (R$)</label><input type="number" id="p-total" min="0" step="0.01" value="${v2(p.valor_total)}"></div>
      <div class="campo" data-so="parcelas"><label for="p-n">Quantas parcelas</label><input type="number" id="p-n" min="1" max="60" value="${programaParcelas}"></div>
      <div class="campo" data-so="parcelas"><label for="p-1a">1ª parcela em</label><input type="date" id="p-1a" value="${(programa && programa.inicio) || (turma && turma.inicio) || hoje}"></div>
    </div>
    <div class="linha"><button class="btn" type="button" id="montar">${linhas.length ? 'Refazer as linhas em aberto' : 'Montar as linhas'}</button><span class="peq apagado">${linhas.length ? 'Só as linhas "Em aberto" são refeitas; as com nota ou recebidas ficam.' : 'Depois confira cada linha: dá para mudar texto, data e valor.'}</span></div>
    <div id="linhas"></div>
    <details${plano ? '' : ' open'}><summary><b>Nota fiscal e pagamento</b></summary><div class="grade mt" style="gap:10px">
      <div class="grade g3" style="gap:10px">
        <div class="campo"><label for="p-emissor">Nota sai por</label><select id="p-emissor"><option value="principal"${p.emissor !== 'outro' ? ' selected' : ''}>${esc(emissores.principal)}</option><option value="outro"${p.emissor === 'outro' ? ' selected' : ''}>${esc(emissores.outro)}</option></select></div>
        <div class="campo"><label for="p-prazo">Vence quantos dias depois da nota</label><input type="number" id="p-prazo" min="0" max="180" value="${p.prazo_dias ?? 30}"></div>
      </div>
      <div class="grade g2" style="gap:10px">
        <div class="campo"><label for="p-pnome">Quem paga, se não for o cliente</label><input type="text" id="p-pnome" placeholder="Ex.: Sescoop/PR" value="${esc(p.pagador_nome || '')}"></div>
        <div class="campo"><label for="p-pcnpj">CNPJ de quem paga</label><input type="text" id="p-pcnpj" value="${esc(p.pagador_cnpj || '')}"></div>
      </div>
      <div class="campo"><label for="p-desc">Texto da nota</label><textarea id="p-desc" rows="2" placeholder="Ex.: Programa de desenvolvimento de lideranças · Gerentes de agência">${esc(p.descricao_nota || '')}</textarea><small>Vai no começo do texto que a tela copia para o emissor; depois vêm os módulos ou a parcela.</small></div>
      <div class="campo"><label for="p-obs">Observações</label><textarea id="p-obs" rows="2">${esc(p.observacoes || '')}</textarea></div>
    </div></details>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button><span style="flex:1"></span>
      ${plano ? '<button class="btn perigo" type="button" id="apagar">Apagar o plano</button>' : ''}</div></form>`, { largura: 920 });
  const f = j.corpo.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const mostrarModo = () => f.querySelectorAll('[data-so]').forEach((c) => { c.hidden = c.dataset.so !== $('#p-modo').value; });
  mostrarModo();
  $('#p-modo').addEventListener('change', mostrarModo);

  const textoSoma = () => {
    const totalLinhas = F.soma(linhas.filter((l) => l.situacao !== 'cancelado'), (l) => l.valor);
    const total = num($('#p-total'));
    return `Soma das linhas: <b>${dinheiro(totalLinhas)}</b>${total != null && Math.abs(total - totalLinhas) >= 0.01 ? ` <span class="selo alerta">diferente do total (${dinheiro(total)})</span>` : ''}`;
  };
  const atualizarSoma = () => { const s = $('#soma'); if (s) s.innerHTML = textoSoma(); };
  const desenhar = () => {
    const faltando = plano && plano.modo === 'modulo' ? mods.filter((m) => !linhas.some((l) => l.modulo_id === m.id)) : [];
    $('#linhas').innerHTML = linhas.length ? `
      ${faltando.length ? `<div class="aviso" style="margin-bottom:8px">${faltando.length} módulo${faltando.length > 1 ? 's' : ''} da turma sem linha: ${faltando.map((m) => `Módulo ${m.numero}`).join(', ')}. <button class="btn peq" type="button" id="incluir-mods">Incluir</button></div>` : ''}
      <div class="tabela"><table><thead><tr><th>O que</th><th>Data</th><th style="text-align:right">Valor (R$)</th><th>Situação</th><th></th></tr></thead><tbody>
      ${linhas.map((l, i) => `<tr><td><input type="text" data-i="${i}" data-c="descricao" value="${esc(l.descricao)}" aria-label="O que"></td>
        <td><input type="date" data-i="${i}" data-c="data" value="${l.data || ''}" aria-label="Data"${l.modulo_id && l.situacao === 'aberto' ? ' title="Acompanha a data do módulo"' : ''}></td>
        <td><input type="number" data-i="${i}" data-c="valor" min="0" step="0.01" value="${v2(l.valor)}" style="max-width:130px;text-align:right" aria-label="Valor"></td>
        <td><select data-i="${i}" data-c="situacao" aria-label="Situação">${Object.entries(F.SITUACOES).map(([k, t]) => `<option value="${k}"${k === l.situacao ? ' selected' : ''}>${t}</option>`).join('')}</select>${l.nota_numero ? `<br><small>nota ${l.nota_numero}</small>` : ''}</td>
        <td>${l.situacao === 'aberto' || !l.id ? `<button class="btn peq perigo" type="button" data-tirar="${i}" aria-label="Tirar a linha">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="linha mt"><button class="btn peq" type="button" id="mais">+ Linha</button><span style="flex:1"></span><span id="soma">${textoSoma()}</span></div>`
      : '<p class="apagado">Ainda sem linhas: clique em "Montar as linhas".</p>';
  };
  desenhar();
  $('#linhas').addEventListener('input', (ev) => {
    const c = ev.target.dataset.c; if (!c) return;
    const l = linhas[Number(ev.target.dataset.i)];
    l[c] = c === 'valor' ? (ev.target.value === '' ? 0 : Number(ev.target.value)) : ev.target.value || null;
    if (c === 'situacao') desenhar(); else atualizarSoma();
  });
  $('#p-total').addEventListener('input', atualizarSoma);
  $('#linhas').addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-tirar]');
    if (t) { const [l] = linhas.splice(Number(t.dataset.tirar), 1); if (l.id) removidas.push(l.id); desenhar(); }
    if (ev.target.id === 'mais') { linhas.push({ descricao: 'Outro valor', data: hoje, valor: 0, situacao: 'aberto', modulo_id: null }); desenhar(); }
    if (ev.target.id === 'incluir-mods') {
      const faltando = mods.filter((m) => !linhas.some((l) => l.modulo_id === m.id));
      const vm = num($('#p-vmod'));
      for (const x of F.linhasPorModulo(faltando, { valorModulo: vm ?? 0 })) linhas.push({ ...x, situacao: 'aberto' });
      linhas.sort((a, b) => (a.data || '9').localeCompare(b.data || '9')); desenhar();
    }
  });
  $('#montar').addEventListener('click', () => {
    const modo = $('#p-modo').value;
    const fixas = linhas.filter((l) => l.situacao !== 'aberto');
    for (const l of linhas.filter((x) => x.situacao === 'aberto' && x.id)) removidas.push(l.id);
    let novas;
    if (modo === 'modulo') {
      // módulos que já têm nota ou foram recebidos não entram de novo; o total que sobra é dividido entre os outros
      const livres = mods.filter((m) => !fixas.some((l) => l.modulo_id === m.id));
      const resto = num($('#p-total')) != null ? num($('#p-total')) - F.soma(fixas.filter((l) => l.situacao !== 'cancelado'), (l) => l.valor) : null;
      novas = F.linhasPorModulo(livres, { valorModulo: num($('#p-vmod')), valorTotal: resto });
    } else {
      const n = Math.max(1, Math.min(60, Number($('#p-n').value) || 1));
      if (num($('#p-total')) == null) { avisar('Coloque o valor total para dividir nas parcelas.', true); return; }
      novas = F.linhasPorParcela({ n, primeira: $('#p-1a').value || hoje, total: num($('#p-total')) - F.soma(fixas.filter((l) => l.situacao !== 'cancelado'), (l) => l.valor), titulo: 'Parcela' });
    }
    linhas = [...fixas, ...novas.map((x) => ({ ...x, situacao: plano ? 'aberto' : F.situacaoInicial(x.data, hoje) }))].sort((a, b) => (a.data || '9').localeCompare(b.data || '9'));
    desenhar();
    if (!plano && linhas.some((l) => l.situacao === 'recebido')) avisar('Linhas de meses anteriores entraram como "Recebido". Mude a situação das que ainda não foram pagas.');
  });
  if (plano) $('#apagar').addEventListener('click', async () => {
    if (d.receber.some((l) => l.plano_id === plano.id && l.situacao !== 'aberto' && l.situacao !== 'cancelado')) { avisar('Este plano tem nota emitida ou recebimento. Cancele as linhas em vez de apagar o plano.', true); return; }
    const b = $('#apagar');
    if (b.dataset.certeza !== '1') { b.dataset.certeza = '1'; b.textContent = 'Clique de novo para apagar'; return; }
    const { error } = await sb.from('fin_planos').delete().eq('id', plano.id);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('Plano apagado.'); recarregar();
  });

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const empresa_id = turma || programa ? p.empresa_id : $('#p-emp').value;
    const titulo = $('#p-titulo').value.trim();
    if (!empresa_id) { avisar('Escolha o cliente.', true); return; }
    if (!titulo) { avisar('Escreva o nome.', true); return; }
    if (!linhas.length) { avisar('Monte as linhas antes de salvar.', true); return; }
    if (linhas.some((l) => !String(l.descricao || '').trim())) { avisar('Toda linha precisa dizer o que é.', true); return; }
    const corpo = {
      empresa_id, titulo, turma_id: p.turma_id || null, programa_id: p.programa_id || null, oportunidade_id: p.oportunidade_id || null,
      modo: $('#p-modo').value, valor_total: num($('#p-total')), valor_modulo: num($('#p-vmod')), emissor: $('#p-emissor').value,
      prazo_dias: Math.max(0, Math.min(180, Number($('#p-prazo').value) || 0)), pagador_nome: $('#p-pnome').value.trim() || null, pagador_cnpj: $('#p-pcnpj').value.trim() || null,
      descricao_nota: $('#p-desc').value.trim() || null, observacoes: $('#p-obs').value.trim() || null, atualizado_em: new Date().toISOString(),
    };
    if (plano && 'conferir' in plano) corpo.conferir = null;
    try {
      let planoId = plano && plano.id;
      if (planoId) { const { error } = await sb.from('fin_planos').update(corpo).eq('id', planoId); if (error) throw error; }
      else { const { data, error } = await sb.from('fin_planos').insert(corpo).select('id').single(); if (error) throw error; planoId = data.id; }
      if (removidas.length) { const { error } = await sb.from('fin_receber').delete().in('id', removidas); if (error) throw error; }
      const agora = new Date().toISOString();
      for (const l of linhas) {
        const reg = { plano_id: planoId, empresa_id, modulo_id: l.modulo_id || null, descricao: String(l.descricao).trim(), data: l.data || null, valor: Number(l.valor) || 0, situacao: l.situacao || 'aberto', atualizado_em: agora };
        if (l.id) { const { error } = await sb.from('fin_receber').update(reg).eq('id', l.id); if (error) throw error; }
        else { const { error } = await sb.from('fin_receber').insert(reg); if (error) throw error; }
      }
      j.fechar(); avisar('Plano de faturamento salvo.'); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

// ---------- despesas ----------
function abaDespesas(d, el, recarregar, mesParam) {
  const hoje = hojeISO();
  const mes = /^\d{4}-\d{2}$/.test(mesParam || '') ? mesParam : hoje.slice(0, 7);
  const lista = d.despesas.filter((x) => F.mesDe(x.data) === mes).sort((a, b) => a.data.localeCompare(b.data));
  const onde = (x) => ondeTexto(d, x);
  el.innerHTML = `
    <div class="linha" style="margin-bottom:14px">
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, -1)}" aria-label="Mês anterior">‹</button>
      <h2 style="margin:0">${maiuscula(F.nomeMes(mes))}</h2>
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, 1)}" aria-label="Mês seguinte">›</button>
      <span style="flex:1"></span><b>${dinheiro(F.soma(lista, (x) => x.valor))}</b>
    </div>
    ${lista.length ? `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Dia</th><th>O que</th><th>Tipo</th><th>Cliente · turma</th><th style="text-align:right">Valor</th><th>Pago</th><th></th></tr></thead><tbody>
      ${lista.map((x) => `<tr><td>${dataBR(x.data)}</td><td>${esc(x.descricao)}${x.fixa_id ? ' <span class="selo neutro">fixa</span>' : ''}${x.reembolsavel ? ` <span class="selo alerta" title="A nota do reembolso paga imposto">cliente reembolsa · imposto ${dinheiro(F.impostoSobre(F.comImpostoIncluido(x.valor, d.aliquota.pct), d.aliquota.pct))}${x.reembolso_receber_id ? ' · cobrado' : ''}</span>` : ''}${x.conferir ? ' <a class="selo alerta" href="#/financeiro/conferir">conferir</a>' : ''}${x.comprovante ? ` <button class="btn peq" type="button" data-comprovante="${esc(x.comprovante)}" title="Ver o comprovante">📎</button>` : ''}</td>
        <td>${esc(F.nomeCategoria(x.categoria))}</td><td>${onde(x) || '<span class="apagado">—</span>'}</td><td class="fn-num" style="text-align:right">${dinheiro(x.valor)}</td>
        <td>${x.pago_em ? `<span class="selo ok">${dataBR(x.pago_em)}</span>` : `<button class="btn peq" type="button" data-pagar="${x.id}">Marcar pago</button>`}</td>
        <td><button class="btn peq" type="button" data-editar="${x.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>
      <div class="cartao mt"><h3>Por tipo</h3>${barrasCategorias(lista)}</div>`
      : '<div class="vazio">Nenhuma despesa neste mês. Use "+ Despesa" no alto.</div>'}
    <div class="cartao mt"><div class="linha"><h3 style="flex:1">Despesas fixas</h3><button class="btn peq" type="button" id="nova-fixa">+ Despesa fixa</button></div>
      <p class="apagado">Entram sozinhas no começo de cada mês (agência, Contabilizei, site, assinaturas…). Para parar, desligue.</p>
      ${d.fixas.length ? `<div class="tabela mt"><table><tbody>${d.fixas.map((x) => `<tr><td>${esc(x.descricao)}</td><td>${esc(F.nomeCategoria(x.categoria))}</td><td>todo dia ${x.dia}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(x.valor)}</td><td>${x.ativo ? '<span class="selo ok">ligada</span>' : '<span class="selo neutro">desligada</span>'}</td>
        <td><button class="btn peq" type="button" data-fixa="${x.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="peq apagado mt">Nenhuma ainda.</p>'}
    </div>`;
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/financeiro/despesas/${b.dataset.mes}`; }));
  el.addEventListener('click', async (ev) => {
    const pg = ev.target.closest('[data-pagar]'), ed = ev.target.closest('[data-editar]'), fx = ev.target.closest('[data-fixa]'), cp = ev.target.closest('[data-comprovante]');
    if (cp) { try { (await import('./financeiro-recibo.js')).abrirComprovante(cp.dataset.comprovante); } catch (e) { avisar(explicarErro(e), true); } return; }
    if (pg) { const { error } = await sb.from('fin_despesas').update({ pago_em: hoje }).eq('id', pg.dataset.pagar); if (error) avisar(explicarErro(error), true); else recarregar(); }
    if (ed) formDespesa(d, d.despesas.find((x) => x.id === ed.dataset.editar), recarregar);
    if (fx) formFixa(d.fixas.find((x) => x.id === fx.dataset.fixa), recarregar);
    if (ev.target.id === 'nova-fixa') formFixa(null, recarregar);
  });
}

const opcoesCategoria = (atual) => F.CATEGORIAS.map(([k, n]) => `<option value="${k}"${k === atual ? ' selected' : ''}>${esc(n)}</option>`).join('');

function formDespesa(d, desp, recarregar) {
  const x = desp || { data: hojeISO(), categoria: 'outros', reembolsavel: false };
  const empresas = [...d.empresas].sort((a, b) => a.nome.localeCompare(b.nome));
  const j = janela(desp ? 'Editar despesa' : 'Nova despesa', `<form class="grade" style="gap:12px" novalidate>
    ${x.conferir ? `<div class="aviso">Para conferir: ${esc(x.conferir)} Ao salvar, sai da lista "Conferir".</div>` : ''}
    <div class="cartao" style="margin:0;padding:12px 14px;background:var(--faixa)">
      <div class="linha"><label class="btn escuro" for="d-foto" style="cursor:pointer">📷 ${x.comprovante ? 'Trocar o recibo' : 'Ler a foto do recibo'}</label>
        <input type="file" id="d-foto" accept="image/*,application/pdf" hidden>
        ${x.comprovante ? '<button class="btn peq" type="button" id="d-ver">Ver o comprovante</button>' : '<span class="peq apagado">Foto ou PDF: a IA preenche dia, valor, tipo e o que foi.</span>'}</div>
      <div id="d-leitura" class="peq mt" hidden></div>
    </div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="d-data">Dia *</label><input type="date" id="d-data" value="${x.data || ''}"></div>
      <div class="campo"><label for="d-valor">Valor (R$) *</label><input type="number" id="d-valor" min="0" step="0.01" value="${v2(x.valor)}"></div>
      <div class="campo"><label for="d-cat">Tipo</label><select id="d-cat">${opcoesCategoria(x.categoria)}</select></div>
    </div>
    <div class="campo"><label for="d-desc">O que foi *</label><input type="text" id="d-desc" maxlength="200" placeholder="Ex.: Passagem Azul Campinas → Goiânia" value="${esc(x.descricao || '')}"></div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="d-emp">Cliente</label><select id="d-emp"><option value="">— nenhum (despesa da Mentorei)</option>${empresas.map((e) => `<option value="${e.id}"${e.id === x.empresa_id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="d-turma">Turma</label><select id="d-turma"></select></div>
      <div class="campo"><label for="d-mod">Módulo</label><select id="d-mod"></select></div>
    </div>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="d-prog">Ou mentoria individual</label><select id="d-prog"></select></div>
      <div class="campo" id="c-socia"><label for="d-socia">Despesa pessoal de</label><select id="d-socia"><option value="">—</option>${d.socias.map((p) => `<option value="${p.id}"${p.id === x.pessoa_id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
    </div>
    <label class="check"><input type="checkbox" id="d-reemb"${x.reembolsavel ? ' checked' : ''}><span>O cliente vai reembolsar esta despesa</span></label>
    <div class="aviso" id="d-imposto" hidden></div>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="d-pago">Pago em</label><input type="date" id="d-pago" value="${x.pago_em || ''}"><small>Vazio = ainda não foi pago.</small></div>
      <div class="campo"><label for="d-conta">Conta</label><select id="d-conta"><option value="">—</option>${['Sicoob', 'Unicred', 'Cartão PJ'].map((c) => `<option${c === x.conta ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
    </div>
    <div class="campo"><label for="d-obs">Observações</label><textarea id="d-obs" rows="2">${esc(x.observacoes || '')}</textarea></div>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button><span style="flex:1"></span>
      ${desp ? '<button class="btn perigo" type="button" id="d-apagar">Apagar</button>' : ''}</div></form>`, { largura: 720 });
  const f = j.corpo.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const turmasDe = () => {
    const e = $('#d-emp').value;
    const ts = d.turmas.filter((t) => !e || t.empresa_id === e).sort((a, b) => a.nome.localeCompare(b.nome));
    $('#d-turma').innerHTML = `<option value="">—</option>${ts.map((t) => `<option value="${t.id}"${t.id === x.turma_id ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}`;
    modulosDe();
  };
  const modulosDe = () => {
    const t = $('#d-turma').value;
    const ms = d.modulos.filter((m) => m.turma_id === t).sort((a, b) => a.numero - b.numero);
    $('#d-mod').innerHTML = `<option value="">—</option>${ms.map((m) => `<option value="${m.id}"${m.id === x.modulo_id ? ' selected' : ''}>Módulo ${m.numero} · ${dataBR(m.data_hora)}</option>`).join('')}`;
    $('#d-mod').disabled = !t;
  };
  const programasDe = () => {
    const e = $('#d-emp').value;
    const ps = d.programas.filter((p) => !e || p.empresa_id === e).sort((a, b) => a.nome.localeCompare(b.nome));
    $('#d-prog').innerHTML = `<option value="">—</option>${ps.map((p) => `<option value="${p.id}"${p.id === x.programa_id ? ' selected' : ''}>${esc(e ? p.nome : `${d.empresa(p.empresa_id).nome} · ${p.nome}`)}</option>`).join('')}`;
  };
  const verSocia = () => { $('#c-socia').hidden = $('#d-cat').value !== 'socia'; };
  turmasDe(); programasDe(); verSocia();
  const verImposto = () => {
    const caixa = $('#d-imposto'); const v = num($('#d-valor'));
    caixa.hidden = !$('#d-reemb').checked;
    if (caixa.hidden) return;
    const pct = d.aliquota.pct;
    caixa.innerHTML = v ? `<b>Atenção: a nota do reembolso paga imposto.</b> Com a alíquota de ${esc(textoAliquota(d))}, para sobrar ${dinheiro(v)} a nota precisa ser de <b>${dinheiro(F.comImpostoIncluido(v, pct))}</b> (imposto de ${dinheiro(F.impostoSobre(F.comImpostoIncluido(v, pct), pct))}). Se cobrar só ${dinheiro(v)}, a Mentorei paga ${dinheiro(F.impostoSobre(v, pct))} de imposto. A cobrança fica em "Emitir nota".`
      : '<b>Atenção: a nota do reembolso paga imposto.</b> Coloque o valor para ver quanto cobrar.';
  };
  verImposto();
  $('#d-reemb').addEventListener('change', verImposto);
  $('#d-valor').addEventListener('input', verImposto);
  let comprovante = x.comprovante || null;
  const leitura = $('#d-leitura');
  if ($('#d-ver')) $('#d-ver').addEventListener('click', async () => { try { (await import('./financeiro-recibo.js')).abrirComprovante(comprovante); } catch (e) { avisar(explicarErro(e), true); } });
  $('#d-foto').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!arq) return;
    const R = await import('./financeiro-recibo.js');
    leitura.hidden = false; leitura.className = 'peq mt';
    try {
      const { caminho, resultado: r } = await R.lerRecibo(arq, (t) => { leitura.textContent = t; });
      comprovante = caminho;
      if (r.data) $('#d-data').value = r.data;
      if (r.valor != null) { $('#d-valor').value = Number(r.valor).toFixed(2); verImposto(); }
      if (r.categoria) $('#d-cat').value = r.categoria;
      $('#d-desc').value = [r.descricao, r.estabelecimento && !String(r.descricao || '').includes(r.estabelecimento) ? r.estabelecimento : ''].filter(Boolean).join(' · ').slice(0, 200);
      const sug = R.sugerirModulo(d, { data: r.data, cidade: r.cidade });
      if (sug) {
        $('#d-emp').value = sug.empresa_id; x.turma_id = sug.turma_id; x.modulo_id = sug.modulo_id; turmasDe(); programasDe();
      }
      verSocia();
      const notas = [r.cidade ? `Cidade: ${r.cidade}${r.uf ? ` (${r.uf})` : ''}` : '', r.pessoa ? `Em nome de: ${r.pessoa}` : '', r.cnpj ? `CNPJ: ${r.cnpj}` : ''].filter(Boolean);
      if (notas.length && !$('#d-obs').value.trim()) $('#d-obs').value = notas.join(' · ');
      leitura.innerHTML = `<span class="selo ok">Lido</span> Confira os campos antes de salvar.${sug ? ` Pela agenda: <b>${esc(sug.texto)}</b>${sug.pela_cidade ? '' : ' (pela data; confira)'}.` : ' Não achei um módulo na agenda perto desta data: escolha o programa, se houver.'}${(r.observacoes || []).length ? `<br>${r.observacoes.map(esc).join(' · ')}` : ''}`;
    } catch (e) {
      if (e.caminho) comprovante = e.caminho;
      leitura.className = 'aviso erro mt'; leitura.textContent = explicarErro(e);
    }
  });
  $('#d-cat').addEventListener('change', verSocia);
  $('#d-emp').addEventListener('change', () => { turmasDe(); programasDe(); });
  $('#d-prog').addEventListener('change', () => { const p = d.programas.find((y) => y.id === $('#d-prog').value); if (p && !$('#d-emp').value) { $('#d-emp').value = p.empresa_id; x.programa_id = p.id; turmasDe(); programasDe(); } });
  $('#d-turma').addEventListener('change', () => {
    const t = d.turmas.find((y) => y.id === $('#d-turma').value);
    if (t && !$('#d-emp').value) { $('#d-emp').value = t.empresa_id; x.turma_id = t.id; turmasDe(); }
    modulosDe();
  });
  if (desp) $('#d-apagar').addEventListener('click', async () => {
    const b = $('#d-apagar');
    if (b.dataset.certeza !== '1') { b.dataset.certeza = '1'; b.textContent = 'Clique de novo para apagar'; return; }
    const { error } = await sb.from('fin_despesas').delete().eq('id', desp.id);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('Despesa apagada.'); recarregar();
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const corpo = {
      data: $('#d-data').value, valor: num($('#d-valor')), categoria: $('#d-cat').value, descricao: $('#d-desc').value.trim(),
      empresa_id: $('#d-emp').value || null, turma_id: $('#d-turma').value || null, modulo_id: $('#d-mod').value || null, programa_id: $('#d-prog').value || null,
      pessoa_id: $('#d-cat').value === 'socia' ? $('#d-socia').value || null : x.pessoa_id || null, conferir: null,
      reembolsavel: $('#d-reemb').checked, pago_em: $('#d-pago').value || null, conta: $('#d-conta').value || null, observacoes: $('#d-obs').value.trim() || null,
    };
    if (!corpo.data || corpo.valor == null || !corpo.descricao) { avisar('Preencha o dia, o valor e o que foi.', true); return; }
    if (corpo.categoria === 'socia' && !corpo.pessoa_id) { avisar('Escolha de qual sócia é a despesa.', true); return; }
    if (!desp || !('conferir' in desp)) delete corpo.conferir;   // antes do script 53 a coluna não existe
    if (comprovante !== (x.comprovante || null)) { corpo.comprovante = comprovante; if (!desp) corpo.origem = 'foto'; }
    const r = desp ? await sb.from('fin_despesas').update(corpo).eq('id', desp.id) : await sb.from('fin_despesas').insert(corpo);
    if (r.error) { avisar(explicarErro(r.error), true); return; }
    j.fechar(); avisar('Despesa salva.'); recarregar();
  });
}

function formFixa(fixa, recarregar) {
  const x = fixa || { dia: 10, categoria: 'outros', ativo: true };
  const j = janela(fixa ? 'Editar despesa fixa' : 'Nova despesa fixa', `<form class="grade" style="gap:12px" novalidate>
    <div class="campo"><label for="x-desc">O que é *</label><input type="text" id="x-desc" maxlength="160" placeholder="Ex.: Contabilizei" value="${esc(x.descricao || '')}"></div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="x-valor">Valor por mês (R$) *</label><input type="number" id="x-valor" min="0" step="0.01" value="${v2(x.valor)}"></div>
      <div class="campo"><label for="x-dia">Dia do mês</label><input type="number" id="x-dia" min="1" max="28" value="${x.dia}"></div>
      <div class="campo"><label for="x-cat">Tipo</label><select id="x-cat">${opcoesCategoria(x.categoria)}</select></div>
    </div>
    <div class="campo"><label for="x-conta">Conta</label><select id="x-conta"><option value="">—</option>${['Sicoob', 'Unicred', 'Cartão PJ'].map((c) => `<option${c === x.conta ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" id="x-ativo"${x.ativo ? ' checked' : ''}><span>Ligada (entra todo mês)</span></label>
    <p class="peq apagado">Mudar o valor vale a partir do próximo mês; a deste mês você muda na própria lista.</p>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 560 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const corpo = { descricao: f.querySelector('#x-desc').value.trim(), valor: num(f.querySelector('#x-valor')), dia: Math.max(1, Math.min(28, Number(f.querySelector('#x-dia').value) || 10)),
      categoria: f.querySelector('#x-cat').value, conta: f.querySelector('#x-conta').value || null, ativo: f.querySelector('#x-ativo').checked };
    if (!corpo.descricao || corpo.valor == null) { avisar('Preencha o que é e o valor.', true); return; }
    const r = fixa ? await sb.from('fin_despesas_fixas').update(corpo).eq('id', fixa.id) : await sb.from('fin_despesas_fixas').insert(corpo);
    if (r.error) { avisar(explicarErro(r.error), true); return; }
    j.fechar(); avisar('Despesa fixa salva.'); recarregar();
  });
}

// ---------- ajustes e meses antigos ----------
function janelaAjustes(d, recarregar) {
  const c = d.config;
  const cu = F.custos(c);
  const j = janela('Ajustes do Financeiro', `<form class="grade" style="gap:12px" novalidate>
    <div class="campo"><label for="a-inicio">A plataforma conta o faturamento a partir de</label><input type="month" id="a-inicio" value="${esc(c.inicio)}">
      <small>Antes deste mês, os números vêm da planilha (fica em "Metas e meses antigos").</small></div>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="a-e1">Nome do CNPJ principal</label><input type="text" id="a-e1" value="${esc(c.emissores.principal)}"></div>
      <div class="campo"><label for="a-e2">Nome do outro CNPJ</label><input type="text" id="a-e2" value="${esc(c.emissores.outro)}"></div>
    </div>
    <div class="campo"><label for="a-imp">Imposto estimado sobre o faturamento (%)</label><input type="number" id="a-imp" min="0" max="40" step="0.1" value="${c.imposto_pct}"><small>Vale só quando não há impostos pagos nos últimos 3 meses. Hoje a plataforma usa ${esc(textoAliquota(d))}.</small></div>
    <details><summary><b>Margem e viagem estimada</b></summary><div class="grade g3 mt" style="gap:10px">
      <div class="campo"><label for="a-hora">Hora de referência dos mentores (R$)</label><input type="number" id="a-hora" min="0" step="1" value="${cu.hora_referencia ?? ''}" placeholder="média dos cadastros"><small>Vazio = média dos mentores que recebem por hora.</small></div>
      <div class="campo"><label for="a-vezes">Hora da sócia = quantas vezes</label><input type="number" id="a-vezes" min="1" step="0.5" value="${cu.socia_vezes}"></div>
      <div class="campo"><label for="a-alvo">Margem desejada (%)</label><input type="number" id="a-alvo" min="0" max="90" step="1" value="${cu.margem_alvo}"></div>
      <div class="campo"><label for="a-pass">Passagem de avião, ida e volta (R$)</label><input type="number" id="a-pass" min="0" step="50" value="${cu.viagem.passagem}"></div>
      <div class="campo"><label for="a-hotel">Hotel, por noite (R$)</label><input type="number" id="a-hotel" min="0" step="10" value="${cu.viagem.hotel}"></div>
      <div class="campo"><label for="a-dia">Refeição e transporte, por dia (R$)</label><input type="number" id="a-dia" min="0" step="10" value="${cu.viagem.dia}"></div>
      <div class="campo"><label for="a-km">Carro, por km (R$)</label><input type="number" id="a-km" min="0" step="0.1" value="${cu.viagem.km}"></div>
      <div class="campo"><label for="a-cidade">Cidade de onde as sócias saem</label><input type="text" id="a-cidade" maxlength="60" value="${esc(cu.cidade_socias)}"></div>
    </div></details>
    ${ehSocia(d.perfil) ? `<details><summary><b>Distribuição das sócias</b></summary><div class="grade g4 mt" style="gap:10px">
      <div class="campo"><label for="a-caixa">Caixa da empresa (%)</label><input type="number" id="a-caixa" min="0" max="100" step="1" value="${cu.caixa_pct}"></div>
      ${d.socias.map((s) => `<div class="campo"><label for="a-p-${s.id}">${esc(s.nome.split(' ')[0])} (%)</label><input type="number" id="a-p-${s.id}" data-socia="${esc(F.primeiroNome(s.nome))}" min="0" max="100" step="1" value="${cu.participacao[F.primeiroNome(s.nome)] ?? 0}"></div>`).join('')}
    </div></details>` : ''}
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 760 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const valor = { ...c, inicio: f.querySelector('#a-inicio').value || c.inicio, emissores: { principal: f.querySelector('#a-e1').value.trim() || 'Contabilizei', outro: f.querySelector('#a-e2').value.trim() || 'Prefeitura' },
      imposto_pct: Number(f.querySelector('#a-imp').value) || 0 };
    const n = (id, padrao) => { const i = f.querySelector(id); return !i || i.value === '' ? padrao : Number(i.value); };
    const participacao = { ...cu.participacao };
    f.querySelectorAll('[data-socia]').forEach((i) => { participacao[i.dataset.socia] = Number(i.value) || 0; });
    valor.custos = { ...(c.custos || {}), hora_referencia: n('#a-hora', null), socia_vezes: n('#a-vezes', cu.socia_vezes), margem_alvo: n('#a-alvo', cu.margem_alvo),
      cidade_socias: f.querySelector('#a-cidade').value.trim() || cu.cidade_socias, caixa_pct: n('#a-caixa', cu.caixa_pct), participacao,
      viagem: { ...cu.viagem, passagem: n('#a-pass', cu.viagem.passagem), hotel: n('#a-hotel', cu.viagem.hotel), dia: n('#a-dia', cu.viagem.dia), km: n('#a-km', cu.viagem.km) } };
    const { error } = await sb.from('configuracoes').upsert({ chave: 'financeiro', valor });
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('Ajustes salvos.'); recarregar();
  });
}

function janelaMeses(d, ano, recarregar) {
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const de = (m) => d.meses.find((x) => x.mes === m) || {};
  const j = janela(`Metas e meses antigos · ${ano}`, `<form novalidate>
    <p class="apagado">A meta vale para qualquer mês. O faturado só conta nos meses antes de ${F.nomeMes(d.config.inicio)}; depois disso, a plataforma soma sozinha.</p>
    <div class="linha mt"><button class="btn peq" type="button" data-ano="${Number(ano) - 1}">‹ ${Number(ano) - 1}</button><button class="btn peq" type="button" data-ano="${Number(ano) + 1}">${Number(ano) + 1} ›</button></div>
    <div class="tabela mt"><table><thead><tr><th>Mês</th><th>Faturado (planilha)</th><th>Meta</th></tr></thead><tbody>
      ${meses.map((m) => `<tr><td>${maiuscula(F.nomeMes(m))}</td>
        <td><input type="number" min="0" step="0.01" data-m="${m}" data-c="faturado_planilha" value="${v2(de(m).faturado_planilha)}"${m >= d.config.inicio ? ' disabled title="Calculado pela plataforma"' : ''}></td>
        <td><input type="number" min="0" step="0.01" data-m="${m}" data-c="meta" value="${v2(de(m).meta)}"></td></tr>`).join('')}</tbody></table></div>
    <div class="linha mt"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 620 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ano]'); if (b) { j.fechar(); janelaMeses(d, b.dataset.ano, recarregar); } });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const linhas = meses.map((m) => {
      const ler = (c) => { const i = f.querySelector(`[data-m="${m}"][data-c="${c}"]`); return i.value === '' ? null : Number(i.value); };
      return { mes: m, faturado_planilha: m >= d.config.inicio ? (de(m).faturado_planilha ?? null) : ler('faturado_planilha'), meta: ler('meta'), atualizado_em: new Date().toISOString() };
    });
    const { error } = await sb.from('fin_meses').upsert(linhas);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('Meses salvos.'); recarregar();
  });
}
