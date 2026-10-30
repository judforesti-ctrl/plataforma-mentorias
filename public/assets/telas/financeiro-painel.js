// Financeiro → Visão geral, parte de baixo: "Visão da direção" (pedido da Juliana em 30/10/2026: o que ela, como CEO, precisa ter
// à vista). Previsão dos próximos 3 meses (faturamento das turmas e mentorias em andamento e os custos), melhores clientes por
// faturamento e por margem, ranking dos mentores parceiros (quem mais recebeu e quem recebe no mês que vem), indicadores, o fundo
// de reserva (capital de giro; fica em configuracoes.financeiro.reserva) e uma calculadora de investimentos simples.
// Contas puras em ../financeiro-regras.js. Horas das sócias e viagem estimada entram na margem na etapa 4.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const pct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
// valor redondo, sem centavos (para os números grandes dos indicadores)
const reais = (v) => (v == null ? '—' : dinheiro(Math.round(Number(v))).replace(/,00$/, ''));
const mil = (v) => `${(Number(v || 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
// Valor que a Juliana informou em 30/10/2026 (falta o extrato): vale até o primeiro lançamento de verdade
const RESERVA_INICIAL = [{ id: 'informado-2026-10-30', data: '2026-10-30', tipo: 'saldo', valor: 62000, obs: 'Valor aproximado informado pela Juliana. Falta o extrato.', provisorio: true }];

export async function painelDirecao(d, el, recarregar, mentores) {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const ano = hoje.slice(0, 4);
  const empresaDaDespesa = (x) => {
    if (x.empresa_id) return x.empresa_id;
    const t = x.turma_id && d.turmas.find((y) => y.id === x.turma_id);
    if (t) return t.empresa_id;
    const p = x.programa_id && d.programas.find((y) => y.id === x.programa_id);
    if (p) return p.empresa_id;
    const m = x.modulo_id && d.modulo(x.modulo_id);
    const tm = m && d.turmas.find((y) => y.id === m.turma_id);
    return tm ? tm.empresa_id : null;
  };

  // ---- números de base ----
  const ctxMes = { inicio: d.config.inicio, linhas: d.receber, meses: d.meses };
  const mesesDoAno = Array.from({ length: Number(mesAtual.slice(5)) }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const faturadoAno = F.soma(mesesDoAno, (m) => F.faturadoNoMes(m, ctxMes));
  const despAno = d.despesas.filter((x) => x.data >= `${ano}-01-01` && x.data <= hoje && x.categoria !== 'socia');
  const custosAno = F.soma(despAno, (x) => x.valor);
  const variaveisAno = F.soma(despAno.filter((x) => !x.fixa_id && x.categoria !== 'impostos'), (x) => x.valor);
  const fixo = F.soma(d.fixas.filter((f) => f.ativo !== false), (f) => f.valor);
  const pctVariavel = faturadoAno ? variaveisAno / faturadoAno * 100 : 0;
  const equilibrio = F.pontoDeEquilibrio({ fixo, pctImposto: d.aliquota.pct, pctVariavel });
  // outros custos variáveis (viagem, impressão, material…): média dos 3 últimos meses fechados
  const ultimos3 = [1, 2, 3].map((k) => F.somarMeses(mesAtual, -k));
  const outrosMedia = F.arred(F.soma(d.despesas.filter((x) => ultimos3.includes(F.mesDe(x.data)) && !x.fixa_id && !['parceiros', 'impostos', 'socia'].includes(x.categoria)), (x) => x.valor) / 3);
  // prazo de recebimento: notas recebidas nos últimos 12 meses
  const recebidas = d.receber.filter((l) => l.situacao === 'recebido' && l.nota_emitida_em && l.recebido_em && l.recebido_em >= F.somarDias(hoje, -365));
  const prazoMedio = recebidas.length ? Math.round(recebidas.reduce((a, l) => a + Math.max(0, F.diasEntre(l.nota_emitida_em, l.recebido_em)), 0) / recebidas.length) : null;
  const atrasado = F.soma(d.receber.filter((l) => F.estado(l, hoje) === 'atrasado'), (l) => l.valor);
  const emitidoAberto = F.soma(d.receber.filter((l) => l.situacao === 'faturado'), (l) => l.valor);

  // ---- previsão ----
  const proximos = [1, 2, 3].map((k) => F.somarMeses(mesAtual, k));
  const prev = F.previsaoMeses({ meses: proximos, linhas: d.receber, fixas: d.fixas, mentores: (m) => (mentores ? mentores.totalDoMes(m) : 0), outrosVariaveis: outrosMedia, pct: d.aliquota.pct });
  const semData = d.receber.filter((l) => l.situacao === 'aberto' && !l.data);
  const ativosSemPlano = d.turmas.filter((t) => t.status !== 'concluida' && t.status !== 'pausada' && !d.planos.some((p) => p.turma_id === t.id)).length
    + d.programas.filter((p) => p.status !== 'concluido' && p.status !== 'pausado' && !d.planos.some((x) => x.programa_id === p.id)).length;
  const meta = (m) => (d.meses.find((x) => x.mes === m) || {}).meta;

  // ---- reserva ----
  const reserva = d.config.reserva || {};
  const lancs = Array.isArray(reserva.lancamentos) ? reserva.lancamentos : RESERVA_INICIAL;
  const sr = F.saldoReserva(lancs);
  const cobre = sr.saldo != null && fixo ? sr.saldo / fixo : null;

  const total = (c) => F.soma(prev, (x) => x[c]);
  const linhaPrev = (rotulo, c, { forte = false, sinal = false, ajuda = '' } = {}) => `<tr${forte ? ' class="fn-forte"' : ''}><td>${rotulo}${ajuda ? `<br><small class="apagado">${ajuda}</small>` : ''}</td>
    ${prev.map((x) => `<td class="fn-num" style="text-align:right${sinal && x[c] < 0 ? ';color:var(--erro)' : ''}">${dinheiro(x[c])}</td>`).join('')}
    <td class="fn-num" style="text-align:right${sinal && total(c) < 0 ? ';color:var(--erro)' : ''}">${dinheiro(total(c))}</td></tr>`;

  el.innerHTML = `
    <h2 style="margin:28px 0 4px">Visão da direção</h2>
    <p class="apagado" style="margin-bottom:12px">Previsões, melhores clientes, mentores, indicadores e o fundo de reserva.</p>

    <div class="cartao"><h3>Próximos 3 meses</h3>
      <p class="peq apagado">Faturamento = o que está nos planos das turmas e mentorias (módulos e parcelas com data). Custos = fixas + mentores parceiros pelas aulas e sessões marcadas + outros custos pela média + imposto.</p>
      <div class="tabela mt"><table><thead><tr><th></th>${prev.map((x) => `<th style="text-align:right">${maiuscula(F.nomeMes(x.mes, true))}</th>`).join('')}<th style="text-align:right">Total</th></tr></thead><tbody>
        <tr class="fn-forte"><td>Faturamento previsto</td>${prev.map((x) => `<td class="fn-num" style="text-align:right">${dinheiro(x.faturado)}${meta(x.mes) ? `<br><small class="apagado">${Math.round(x.faturado / meta(x.mes) * 100)}% da meta</small>` : ''}<br><small class="apagado">${x.clientes} cliente${x.clientes === 1 ? '' : 's'}</small></td>`).join('')}<td class="fn-num" style="text-align:right">${dinheiro(total('faturado'))}</td></tr>
        ${linhaPrev('Despesas fixas', 'fixas')}
        ${linhaPrev('Mentores parceiros', 'parceiros', { ajuda: mentores ? (mentores.semCadastro ? `${mentores.semCadastro} sem cadastro financeiro: contam zero` : 'pelas aulas e sessões marcadas') : 'falta o script 54' })}
        ${linhaPrev('Outros custos', 'outros', { ajuda: 'viagem, impressão, material… (média dos 3 últimos meses)' })}
        ${linhaPrev(`Imposto (${pct(d.aliquota.pct)})`, 'imposto')}
        ${linhaPrev('Custos previstos', 'custos', { forte: true })}
        ${linhaPrev('Sobra prevista', 'resultado', { forte: true, sinal: true })}
      </tbody></table></div>
      ${ativosSemPlano || semData.length ? `<div class="aviso mt">${[ativosSemPlano && `<a href="#/financeiro/planos">${ativosSemPlano} turma${ativosSemPlano > 1 ? 's' : ''} ou mentoria${ativosSemPlano > 1 ? 's' : ''} em andamento sem plano de faturamento</a>: o previsto pode ser maior.`, semData.length && `${dinheiro(F.soma(semData, (l) => l.valor))} em parcelas ainda sem data (fora da conta).`].filter(Boolean).join(' ')}</div>` : ''}
    </div>

    <div class="grade g2 mt">
      <div class="cartao" id="pn-clientes"></div>
      <div class="cartao" id="pn-mentores"></div>
    </div>

    <h3 style="margin:22px 0 10px">Indicadores</h3>
      <div class="grade g4 fn-ind">
        <div class="cartao numero"><b>${faturadoAno ? pct((faturadoAno - custosAno) / faturadoAno * 100) : '—'}</b><span>margem de ${ano} até hoje · sobra ${dinheiro(faturadoAno - custosAno)} de ${dinheiro(faturadoAno)}</span></div>
        <div class="cartao numero"><b>${reais(fixo)}</b><span>custo fixo por mês (${d.fixas.filter((f) => f.ativo !== false).length} despesas fixas)</span></div>
        <div class="cartao numero"><b>${reais(equilibrio)}</b><span>ponto de equilíbrio: faturamento do mês que paga o fixo, o imposto e os custos variáveis (${pct(pctVariavel)} do faturado)</span></div>
        <div class="cartao numero"><b>${cobre == null ? '—' : `${cobre.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`}</b><span>de custo fixo cobertos pela reserva</span></div>
        <div class="cartao numero"><b>${prazoMedio == null ? '—' : `${prazoMedio} dias`}</b><span>${prazoMedio == null ? 'prazo médio de recebimento (aparece quando houver notas recebidas pela plataforma)' : 'prazo médio entre a nota e o dinheiro na conta'}</span></div>
        <div class="cartao numero"><b>${reais(emitidoAberto)}</b><span>em notas emitidas esperando pagamento${atrasado ? ` · <b style="font-size:13px;color:var(--erro)">${dinheiro(atrasado)} atrasado (${pct(atrasado / emitidoAberto * 100)})</b>` : ''}</span></div>
        <div class="cartao numero" id="pn-concentracao"></div>
        <div class="cartao numero" id="pn-ticket"></div>
      </div>

    <div class="grade g2 mt">
      <div class="cartao" id="pn-reserva"></div>
      <div class="cartao" id="pn-calc"></div>
    </div>`;

  // ---- melhores clientes ----
  const estadoCli = { por: 'faturado', periodo: 'ano' };
  const periodos = { ano: [`Este ano até hoje`, `${ano}-01-01`, hoje], doze: ['Últimos 12 meses', F.somarDias(hoje, -365), hoje], anoTodo: [`${ano} inteiro (com o previsto)`, `${ano}-01-01`, `${ano}-12-31`] };
  const desenharClientes = () => {
    const [rotulo, de, ate] = periodos[estadoCli.periodo];
    const lista = F.rankingClientes({ linhas: d.receber, despesas: d.despesas, de, ate, empresaDaDespesa, pct: d.aliquota.pct }).filter((c) => c.faturado > 0)
      .sort((a, b) => b[estadoCli.por] - a[estadoCli.por]);
    const top = lista.slice(0, 10);
    const maior = Math.max(1, ...top.map((c) => Math.abs(c[estadoCli.por])));
    const tot = F.soma(lista, (c) => c.faturado);
    const tres = F.soma([...lista].sort((a, b) => b.faturado - a.faturado).slice(0, 3), (c) => c.faturado);
    const box = el.querySelector('#pn-clientes');
    box.innerHTML = `<div class="linha"><h3 style="flex:1">Melhores clientes</h3>
        <button class="btn peq${estadoCli.por === 'faturado' ? ' escuro' : ''}" type="button" data-por="faturado">Faturamento</button>
        <button class="btn peq${estadoCli.por === 'margem' ? ' escuro' : ''}" type="button" data-por="margem">Margem</button></div>
      <div class="campo mt"><label for="pn-periodo" class="peq">Período</label><select id="pn-periodo">${Object.entries(periodos).map(([k, [t]]) => `<option value="${k}"${k === estadoCli.periodo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      ${top.length ? `<div class="fn-barras mt">${top.map((c, i) => `<div class="fn-barra" title="Faturado ${dinheiro(c.faturado)} · custos ${dinheiro(c.custos)} · imposto ${dinheiro(c.imposto)} · margem ${dinheiro(c.margem)}">
          <span>${i + 1}. ${esc(d.empresa(c.empresa_id).nome)}</span>
          <span class="fn-trilho"><i style="width:${Math.max(0, Math.round(c[estadoCli.por] / maior * 100))}%${c[estadoCli.por] < 0 ? ';background:var(--erro)' : ''}"></i></span>
          <span class="fn-v">${estadoCli.por === 'faturado' ? mil(c.faturado) : `${mil(c.margem)} · ${pct(c.margem_pct)}`}</span></div>`).join('')}</div>
        <p class="peq apagado mt">Margem = faturado − custos ligados ao cliente (mentores, viagens, impressão, material) − imposto (${pct(d.aliquota.pct)}). Ainda sem as horas das sócias e a viagem estimada (etapa 4). Passe o mouse para ver os números.</p>` : `<p class="apagado mt">Nenhum faturamento em: ${esc(rotulo.toLowerCase())}.</p>`}`;
    box.querySelectorAll('[data-por]').forEach((b) => b.addEventListener('click', () => { estadoCli.por = b.dataset.por; desenharClientes(); }));
    box.querySelector('#pn-periodo').addEventListener('change', (ev) => { estadoCli.periodo = ev.target.value; desenharClientes(); });
    el.querySelector('#pn-concentracao').innerHTML = `<b>${tot ? pct(tres / tot * 100) : '—'}</b><span>do faturamento (${esc(rotulo.toLowerCase())}) nos 3 maiores clientes${tot && tres / tot > 0.5 ? ' · <b style="font-size:13px;color:var(--erro)">muito concentrado</b>' : ''}</span>`;
    el.querySelector('#pn-ticket').innerHTML = `<b>${lista.length ? reais(tot / lista.length) : '—'}</b><span>faturado por cliente (${lista.length} cliente${lista.length === 1 ? '' : 's'}, ${esc(rotulo.toLowerCase())})</span>`;
  };
  desenharClientes();

  // ---- mentores parceiros ----
  const nomePerfil = (id) => (d.pessoa(id) || {}).nome || null;
  const recebidosAno = F.rankingRecebido(d.despesas, { de: `${ano}-01-01`, ate: hoje, nome: nomePerfil }).slice(0, 10);
  const maiorRec = Math.max(1, ...recebidosAno.map((r) => r.total));
  const proximoMes = F.somarMeses(mesAtual, 1), mesAnterior = F.somarMeses(mesAtual, -1);
  const aReceber = mentores ? mentores.parceiros.map((p) => ({ p, atual: mentores.doMes(p.id, mesAtual), antes: mentores.doMes(p.id, mesAnterior) }))
    .map((x) => ({ ...x, total: x.atual.pago ? 0 : x.atual.total, falta: x.antes.pago ? 0 : x.antes.total })).filter((x) => x.total || x.falta).sort((a, b) => b.total - a.total) : [];
  const maiorAR = Math.max(1, ...aReceber.map((x) => x.total));
  el.querySelector('#pn-mentores').innerHTML = `<h3>Mentores parceiros</h3>
    <h4 class="mt">Quem mais recebeu em ${ano}</h4>
    ${recebidosAno.length ? `<div class="fn-barras mt">${recebidosAno.map((r, i) => `<div class="fn-barra" title="${r.vezes} pagamento${r.vezes === 1 ? '' : 's'}"><span>${i + 1}. ${esc(r.nome)}${r.cadastro ? '' : ' <small class="apagado">(sem cadastro)</small>'}</span>
      <span class="fn-trilho"><i style="width:${Math.round(r.total / maiorRec * 100)}%"></i></span><span class="fn-v">${dinheiro(r.total)}</span></div>`).join('')}</div>` : '<p class="apagado">Nenhum pagamento a parceiros neste ano.</p>'}
    <h4 class="mt">A receber em ${F.nomeMes(proximoMes)} <small class="apagado">(aulas e sessões de ${F.nomeMes(mesAtual)})</small></h4>
    ${!mentores ? '<p class="apagado">Falta rodar o script 54.</p>' : aReceber.length ? `<div class="fn-barras mt">${aReceber.map((x, i) => `<a class="fn-barra" href="#/financeiro/mentores/pagamentos/${mesAtual}" title="${x.atual.situacao === 'calculado' ? 'calculado pelas aulas e sessões (as marcadas até o fim do mês entram)' : x.atual.situacao}">
      <span>${i + 1}. ${esc(x.p.nome)}${x.falta ? `<br><small style="color:var(--erro)">falta pagar ${dinheiro(x.falta)} de ${F.nomeMes(mesAnterior, true)}</small>` : ''}</span>
      <span class="fn-trilho"><i style="width:${Math.round(x.total / maiorAR * 100)}%"></i></span><span class="fn-v">${dinheiro(x.total)}</span></a>`).join('')}</div>
      <p class="peq apagado mt">Total: <b>${dinheiro(F.soma(aReceber, (x) => x.total))}</b>${mentores.semCadastro ? ` · ${mentores.semCadastro} mentor${mentores.semCadastro > 1 ? 'es' : ''} sem cadastro financeiro conta${mentores.semCadastro > 1 ? 'm' : ''} zero` : ''}. O mentor não vê esta tela.</p>` : `<p class="apagado">Nenhuma aula ou sessão de parceiro em ${F.nomeMes(mesAtual)}${mentores.semCadastro ? ` (ou falta o cadastro financeiro de ${mentores.semCadastro})` : ''}.</p>`}`;

  // ---- fundo de reserva ----
  const desenharReserva = () => {
    const ult = [...lancs].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 6);
    el.querySelector('#pn-reserva').innerHTML = `<div class="linha"><h3 style="flex:1">Fundo de reserva</h3><button class="btn peq pri" type="button" id="rs-novo">Atualizar</button></div>
      <p class="peq apagado">O capital de giro da Mentorei${reserva.onde ? ` · ${esc(reserva.onde)}` : ''}.</p>
      <div class="cartao numero destaque mt"><b>${sr.saldo == null ? '—' : dinheiro(sr.saldo)}</b><span>saldo em ${sr.data ? dataBR(sr.data) : '—'}${sr.ultimoExtrato && sr.ultimoExtrato.provisorio ? ' · valor aproximado, falta o extrato' : ''}</span>
        ${cobre != null ? `<span>cobre ${cobre.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses de custo fixo (${dinheiro(fixo)}/mês)</span>` : ''}</div>
      <div class="tabela mt"><table><tbody>${ult.map((l) => `<tr><td>${dataBR(l.data)}</td><td>${esc(F.TIPOS_RESERVA[l.tipo] || l.tipo)}${l.obs ? `<br><small class="apagado">${esc(l.obs)}</small>` : ''}</td>
        <td class="fn-num" style="text-align:right">${l.tipo === 'resgate' ? '−' : ''}${dinheiro(l.valor)}</td><td>${l.provisorio ? '' : `<button class="btn peq" type="button" data-tirar="${esc(l.id)}" aria-label="Tirar este lançamento">✕</button>`}</td></tr>`).join('')}</tbody></table></div>
      <p class="peq apagado mt">"Saldo do extrato" recomeça a conta com o valor do banco; aporte, resgate e rendimento somam ou tiram dali em diante.</p>`;
    el.querySelector('#rs-novo').addEventListener('click', () => janelaReserva(d, reserva, lancs, recarregar));
    el.querySelectorAll('[data-tirar]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Tirar este lançamento do fundo de reserva?')) return;
      await salvarReserva(d, { ...reserva, lancamentos: lancs.filter((l) => l.id !== b.dataset.tirar) }, recarregar);
    }));
  };
  desenharReserva();

  // ---- calculadora ----
  calculadora(el.querySelector('#pn-calc'), { inicial: sr.saldo || 0, taxa: reserva.taxa_ano });
}

async function salvarReserva(d, reserva, recarregar) {
  const { reserva: _, ...resto } = d.config;
  const { error } = await sb.from('configuracoes').upsert({ chave: 'financeiro', valor: { ...resto, reserva } });
  if (error) { avisar(explicarErro(error), true); return false; }
  avisar('Fundo de reserva atualizado.'); recarregar();
  return true;
}

function janelaReserva(d, reserva, lancs, recarregar) {
  const j = janela('Atualizar o fundo de reserva', `<form class="grade" style="gap:12px" novalidate>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="rs-tipo">O que foi</label><select id="rs-tipo">${Object.entries(F.TIPOS_RESERVA).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
      <div class="campo"><label for="rs-data">Dia</label><input type="date" id="rs-data" value="${hojeISO()}"></div>
      <div class="campo"><label for="rs-valor">Valor (R$)</label><input type="number" id="rs-valor" min="0" step="0.01" required></div>
    </div>
    <div class="campo"><label for="rs-obs">Observação</label><input type="text" id="rs-obs" maxlength="160" placeholder="Ex.: extrato do Sicoob de 31/10"></div>
    <details><summary>Onde o dinheiro está aplicado</summary>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo"><label for="rs-onde">Aplicação</label><input type="text" id="rs-onde" maxlength="120" placeholder="Ex.: CDB Sicoob, 100% do CDI" value="${esc(reserva.onde || '')}"></div>
        <div class="campo"><label for="rs-taxa">Rende ao ano (%)</label><input type="number" id="rs-taxa" min="0" max="100" step="0.01" value="${reserva.taxa_ano ?? ''}"><small>A calculadora começa com esta taxa.</small></div>
      </div></details>
    <p class="peq apagado">Com o primeiro "Saldo do extrato", o valor aproximado de 62 mil deixa de valer.</p>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 620 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const valor = Number(f.querySelector('#rs-valor').value);
    if (!(valor > 0)) { avisar('Escreva o valor.', true); return; }
    const tipo = f.querySelector('#rs-tipo').value;
    const novo = { id: crypto.randomUUID(), data: f.querySelector('#rs-data').value || hojeISO(), tipo, valor, obs: f.querySelector('#rs-obs').value.trim() || null, por: d.eu, em: new Date().toISOString() };
    // o valor aproximado sai quando chega o primeiro saldo de extrato; aporte/resgate/rendimento continuam somando a ele
    const base = tipo === 'saldo' ? lancs.filter((l) => !l.provisorio) : lancs;
    const taxa = f.querySelector('#rs-taxa').value;
    if (await salvarReserva(d, { ...reserva, lancamentos: [...base, novo], onde: f.querySelector('#rs-onde').value.trim() || null, taxa_ano: taxa === '' ? null : Number(taxa) }, recarregar)) j.fechar();
  });
}

function calculadora(box, { inicial, taxa }) {
  box.innerHTML = `<h3>Calculadora de investimentos</h3>
    <p class="peq apagado">Simulação simples, com juros compostos. Não é recomendação de investimento.</p>
    <form class="grade g2 mt" style="gap:10px" novalidate>
      <div class="campo"><label for="cl-ini">Valor de hoje (R$)</label><input type="number" id="cl-ini" min="0" step="100" value="${Math.round(inicial)}"></div>
      <div class="campo"><label for="cl-ap">Por mês (R$)</label><input type="number" id="cl-ap" step="100" value="0"><small>Aporte; negativo = retirada.</small></div>
      <div class="campo"><label for="cl-tx">Rende ao ano (%)</label><input type="number" id="cl-tx" min="0" max="100" step="0.1" value="${taxa ?? 12}"><small>${taxa == null ? 'Exemplo: troque pela taxa da aplicação.' : 'A taxa guardada no fundo de reserva.'}</small></div>
      <div class="campo"><label for="cl-m">Por quantos meses</label><input type="number" id="cl-m" min="1" max="600" step="1" value="12"></div>
      <div class="campo"><label for="cl-meta">Quero chegar a (R$, opcional)</label><input type="number" id="cl-meta" min="0" step="1000" placeholder="Ex.: 100000"></div>
      <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="cl-isento"><span>Isento de imposto de renda (LCI, LCA, poupança)</span></label>
    </form>
    <div id="cl-res" class="mt" aria-live="polite"></div>`;
  const $ = (s) => box.querySelector(s);
  const conta = () => {
    const ent = { inicial: Number($('#cl-ini').value) || 0, aporte: Number($('#cl-ap').value) || 0, taxaAno: Number($('#cl-tx').value) || 0, meses: Number($('#cl-m').value) || 12, isento: $('#cl-isento').checked };
    const r = F.simularInvestimento(ent);
    const meta = Number($('#cl-meta').value) || 0;
    const kMeta = meta ? F.mesesParaMeta({ ...ent, meta }) : null;
    const quando = (k) => F.nomeMes(F.somarMeses(hojeISO().slice(0, 7), k));
    // até 12 barras ao longo do prazo
    const passo = Math.max(1, Math.ceil(r.serie.length / 12));
    const pontos = r.serie.filter((x, i) => (i + 1) % passo === 0 || i === r.serie.length - 1);
    const maior = Math.max(1, ...pontos.map((x) => x.saldo));
    $('#cl-res').innerHTML = `<div class="grade g2" style="gap:10px">
        <div class="cartao numero destaque"><b>${dinheiro(r.liquido)}</b><span>no fim, já sem o imposto${r.acabou ? '' : ` · ${quando(r.serie.length)}`}</span></div>
        <div class="cartao numero"><b>${dinheiro(r.rendimento)}</b><span>de rendimento (${ent.taxaAno ? `≈ ${String(r.taxaMes).replace('.', ',')}% ao mês` : 'sem taxa'})</span></div>
        <div class="cartao numero"><b>${dinheiro(r.investido)}</b><span>que saiu do bolso (valor de hoje + aportes)</span></div>
        <div class="cartao numero"><b>${dinheiro(r.imposto)}</b><span>${ent.isento ? 'isento de imposto de renda' : `de imposto de renda (${String(r.ir).replace('.', ',')}% sobre o rendimento)`}</span></div>
      </div>
      ${r.acabou ? `<div class="aviso erro mt">Com essa retirada, o dinheiro acaba em <b>${r.acabou} meses</b> (${quando(r.acabou)}).</div>` : ''}
      ${meta ? `<div class="aviso mt">${kMeta === 0 ? 'Você já tem esse valor.' : kMeta ? `Chega a ${dinheiro(meta)} em <b>${kMeta} meses</b> (${quando(kMeta)}).` : `Com esses números, não chega a ${dinheiro(meta)}.`}</div>` : ''}
      <div class="fn-barras mt" aria-label="Saldo ao longo do tempo">${pontos.map((x) => `<div class="fn-barra"><span>${x.k} ${x.k === 1 ? 'mês' : 'meses'}</span><span class="fn-trilho"><i style="width:${Math.round(x.saldo / maior * 100)}%"></i></span><span class="fn-v">${dinheiro(x.saldo)}</span></div>`).join('')}</div>`;
  };
  box.querySelector('form').addEventListener('input', conta);
  box.querySelector('form').addEventListener('submit', (ev) => ev.preventDefault());
  conta();
}
