// Financeiro → Visão geral, parte de baixo: "Visão da direção" (pedido da Juliana em 30/10/2026: o que ela, como CEO, precisa ter
// à vista). Previsão dos próximos 3 meses (faturamento das turmas e mentorias em andamento e os custos), melhores clientes por
// faturamento e por margem, ranking dos mentores parceiros (quem mais recebeu e quem recebe no mês que vem), indicadores, o fundo
// de reserva (capital de giro; fica em configuracoes.financeiro.reserva) e o dinheiro nas contas (último extrato de cada conta,
// etapa 3). A calculadora de investimentos saiu no mesmo dia: "desnecessária agora".
// Contas puras em ../financeiro-regras.js. Horas das sócias e viagem estimada entram na margem na etapa 4.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';
import { feriadoDe } from '../agenda-regras.js';

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const pct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
// valor redondo, sem centavos (para os números grandes dos indicadores)
const reais = (v) => (v == null ? '—' : dinheiro(Math.round(Number(v))).replace(/,00$/, ''));
const mil = (v) => `${(Number(v || 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;

export async function painelDirecao(d, el, recarregar, mentores, { socia = false } = {}) {
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
  const lancs = Array.isArray(reserva.lancamentos) ? reserva.lancamentos : F.RESERVA_INICIAL;
  const sr = F.saldoReserva(lancs);
  const cobre = sr.saldo != null && fixo ? sr.saldo / fixo : null;

  const total = (c) => F.soma(prev, (x) => x[c]);
  const linhaPrev = (rotulo, c, { forte = false, sinal = false, ajuda = '' } = {}) => `<tr${forte ? ' class="fn-forte"' : ''}><td>${rotulo}${ajuda ? `<br><small class="apagado">${ajuda}</small>` : ''}</td>
    ${prev.map((x) => `<td class="fn-num" style="text-align:right${sinal && x[c] < 0 ? ';color:var(--erro)' : ''}">${dinheiro(x[c])}</td>`).join('')}
    <td class="fn-num" style="text-align:right${sinal && total(c) < 0 ? ';color:var(--erro)' : ''}">${dinheiro(total(c))}</td></tr>`;

  el.innerHTML = `
    <h2 style="margin:28px 0 4px">Visão da direção</h2>
    <p class="apagado" style="margin-bottom:12px">Avisos, previsões, caixa, melhores clientes, mentores, indicadores e o fundo de reserva.</p>
    <div id="pn-atencao"></div>

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

    <div class="cartao mt" id="pn-caixa"></div>

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
      <div class="cartao" id="pn-contas"></div>
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

  // ---- dinheiro nas contas (último extrato importado de cada conta) ----
  const ultimos = new Map();
  for (const x of d.extratos || []) if (x.saldo_final != null && (!ultimos.has(x.conta) || x.periodo_ate > ultimos.get(x.conta).periodo_ate)) ultimos.set(x.conta, x);
  const contas = [...ultimos.values()].sort((a, b) => a.conta.localeCompare(b.conta));
  el.querySelector('#pn-contas').innerHTML = `<div class="linha"><h3 style="flex:1">Dinheiro nas contas</h3><a class="btn peq" href="#/financeiro/extratos">Extratos</a></div>
    ${d.extratos == null ? '<p class="apagado mt">Falta rodar o script 56 no Supabase.</p>' : contas.length ? `
      <div class="cartao numero destaque mt"><b>${dinheiro(F.soma(contas, (x) => x.saldo_final))}</b><span>somando as contas, pelo último extrato de cada uma</span></div>
      <div class="tabela mt"><table><tbody>${contas.map((x) => `<tr><td><b>${esc(x.conta)}</b><br><small class="apagado">extrato até ${dataBR(x.periodo_ate)}${F.diasEntre(x.periodo_ate, hoje) > 15 ? ' · <span style="color:var(--erro)">desatualizado</span>' : ''}</small></td>
        <td class="fn-num" style="text-align:right">${dinheiro(x.saldo_final)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="apagado mt">Ainda não há extrato importado. Suba o extrato do Sicoob e da Unicred em Financeiro → Extratos.</p>'}`;

  // ---- caixa dos próximos 90 dias e avisos ----
  await caixaEAvisos(d, el, { mentores, socia, ultimos: contas, fixo, outrosMedia });
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
      <div class="campo mt"><label for="rs-onde">Aplicação</label><input type="text" id="rs-onde" maxlength="120" placeholder="Ex.: CDB Sicoob, 100% do CDI" value="${esc(reserva.onde || '')}"></div></details>
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
    if (await salvarReserva(d, { ...reserva, lancamentos: [...base, novo], onde: f.querySelector('#rs-onde').value.trim() || null }, recarregar)) j.fechar();
  });
}

// Caixa semana a semana nos próximos 90 dias: começa no saldo do último extrato de cada conta; entra o que as notas e os planos dizem
// (nota emitida no vencimento; módulo ou parcela ainda sem nota na data + prazo do plano); sai o que está lançado e não pago, as
// fixas dos próximos meses (nos dias 5, 15 ou 25 antes do vencimento), os mentores parceiros (dia 5 do mês seguinte, se der), o imposto (dia 20 do mês seguinte, pela alíquota), a
// média dos outros custos e, se quiser, a média das retiradas das sócias. Depois, os avisos do alto da Visão da direção.
async function caixaEAvisos(d, el, { mentores, socia, ultimos, fixo, outrosMedia }) {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const fim = F.somarDias(hoje, 90);
  const depois = (dia) => (dia < hoje ? hoje : dia);
  const [ret, fech] = await Promise.all([
    sb.from('fin_movimentos').select('data, valor').eq('acao', 'retirada').gte('data', `${F.somarMeses(mesAtual, -3)}-01`).lte('data', F.somarDias(`${mesAtual}-01`, -1)),
    socia ? sb.from('fin_fechamentos').select('mes').eq('mes', F.somarMeses(mesAtual, -1)) : Promise.resolve({ data: null, error: null }),
  ]);
  const retiradaMedia = ret.error ? 0 : F.arred(F.soma(ret.data || [], (x) => -Number(x.valor)) / 3);
  const movs = [];
  const emp = (l) => d.empresa(l.empresa_id).nome;
  for (const l of d.receber) {
    if (l.situacao === 'faturado') movs.push({ dia: depois(l.vencimento || hoje), valor: Number(l.valor), rotulo: `${emp(l)} · nota ${l.nota_numero || ''}${l.vencimento && l.vencimento < hoje ? ' (atrasada)' : ''}`, tipo: 'entra' });
    else if (l.situacao === 'aberto' && l.data) {
      const dia = F.somarDias(l.data, Number((d.plano(l.plano_id) || {}).prazo_dias ?? 30));
      if (dia <= fim) movs.push({ dia: depois(dia), valor: Number(l.valor), rotulo: `${emp(l)} · ${l.descricao}`, tipo: 'entra' });
    }
  }
  // contas: no último dia de pagamento (5, 15 ou 25) até o vencimento; atrasada = hoje
  for (const x of d.despesas) if (!x.pago_em && x.data >= F.somarDias(hoje, -45) && x.data <= fim && x.categoria !== 'socia') movs.push({ dia: depois(F.pagamentoDaConta(x.data, feriadoDe)), valor: -Number(x.valor), rotulo: x.descricao, tipo: 'lancada' });
  const meses = [0, 1, 2, 3].map((k) => F.somarMeses(mesAtual, k));
  for (const m of meses.slice(1)) for (const f of d.fixas.filter((y) => y.ativo !== false)) {
    const dia = F.pagamentoDaConta(`${m}-${String(f.dia).padStart(2, '0')}`, feriadoDe);
    if (dia <= fim) movs.push({ dia, valor: -Number(f.valor), rotulo: f.descricao, tipo: 'fixa' });
  }
  for (const m of [F.somarMeses(mesAtual, -1), ...meses.slice(0, 3)]) {
    // mentores: a nota do mês entra no 1º dia de pagamento depois do fim do mês (+3 dias); imposto: dia 20 do mês seguinte
    const pagar = F.pagamentoDaNota({ enviadaEm: `${F.somarMeses(m, 1)}-01`, mesReferencia: m, feriado: feriadoDe }), imp = `${F.somarMeses(m, 1)}-20`;
    if (mentores && pagar <= fim) {
      const v = F.soma(mentores.parceiros, (p) => { const x = mentores.doMes(p.id, m); return x.pago ? 0 : x.total; });
      if (v && (pagar >= hoje || m === F.somarMeses(mesAtual, -1))) movs.push({ dia: depois(pagar), valor: -v, rotulo: `Mentores parceiros de ${F.nomeMes(m)}`, tipo: 'mentores' });
    }
    const jaPagou = d.despesas.some((x) => x.categoria === 'impostos' && F.mesDe(x.data) === F.somarMeses(m, 1));
    const fat = F.faturadoNoMes(m, { inicio: d.config.inicio, linhas: d.receber, meses: d.meses }) || 0;
    if (imp >= hoje && imp <= fim && !jaPagou && fat) movs.push({ dia: imp, valor: -F.impostoSobre(fat, d.aliquota.pct), rotulo: `Imposto sobre ${F.nomeMes(m)} (${String(d.aliquota.pct).replace('.', ',')}%)`, tipo: 'imposto' });
  }
  for (const m of meses) {
    const dia15 = `${m}-15`, dia10 = `${m}-10`;
    if (outrosMedia && dia15 >= hoje && dia15 <= fim) movs.push({ dia: dia15, valor: -outrosMedia, rotulo: 'Outros custos (média)', tipo: 'outros' });
    if (retiradaMedia && dia10 >= hoje && dia10 <= fim) movs.push({ dia: dia10, valor: -retiradaMedia, rotulo: 'Retiradas das sócias (média dos 3 últimos meses)', tipo: 'retirada' });
  }
  const saldo = F.soma(ultimos, (x) => x.saldo_final);
  const box = el.querySelector('#pn-caixa');
  const estado = { retiradas: true };
  let r = null;
  const desenhar = () => {
    const lista = estado.retiradas ? movs : movs.filter((m) => m.tipo !== 'retirada');
    r = F.caixaPorSemana({ hoje, saldo, movimentos: lista });
    const maiores = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 12).sort((a, b) => a.dia.localeCompare(b.dia));
    box.innerHTML = `<div class="linha"><h3 style="flex:1">Caixa dos próximos 90 dias</h3>
        ${retiradaMedia ? `<label class="check" style="font-size:13px"><input type="checkbox" id="cx-ret"${estado.retiradas ? ' checked' : ''}><span>Contar as retiradas das sócias (${dinheiro(retiradaMedia)}/mês)</span></label>` : ''}</div>
      <p class="peq apagado">Começa em ${ultimos.length ? `<b>${dinheiro(saldo)}</b>, o saldo do último extrato de cada conta` : '<b>R$ 0</b>: ainda não há extrato importado (Financeiro → Extratos)'}. O fundo de reserva fica de fora.</p>
      <div class="tabela mt"><table><thead><tr><th>Semana</th><th style="text-align:right">Entra</th><th style="text-align:right">Sai</th><th style="text-align:right">Saldo no fim</th></tr></thead><tbody>
        ${r.semanas.map((w) => `<tr${w === r.menor ? ' class="fn-forte"' : ''}><td>${dataBR(w.de).slice(0, 5)} a ${dataBR(w.ate).slice(0, 5)}</td>
          <td class="fn-num" style="text-align:right;color:var(--ok)">${w.entra ? dinheiro(w.entra) : '—'}</td><td class="fn-num" style="text-align:right;color:var(--erro)">${w.sai ? dinheiro(w.sai) : '—'}</td>
          <td class="fn-num" style="text-align:right;${w.saldo < 0 ? 'color:var(--erro)' : ''}">${dinheiro(w.saldo)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="peq mt">Menor saldo: <b style="${r.menor.saldo < 0 ? 'color:var(--erro)' : ''}">${dinheiro(r.menor.saldo)}</b> na semana de ${dataBR(r.menor.de).slice(0, 5)} · em 90 dias: <b>${dinheiro(r.final)}</b>.</p>
      <details class="mt"><summary>Os maiores valores da conta</summary><div class="tabela mt"><table><tbody>${maiores.map((m) => `<tr><td>${dataBR(m.dia)}</td><td>${esc(m.rotulo)}</td>
        <td class="fn-num" style="text-align:right;color:${m.valor < 0 ? 'var(--erro)' : 'var(--ok)'}">${dinheiro(m.valor)}</td></tr>`).join('')}</tbody></table></div></details>`;
    const cb = box.querySelector('#cx-ret');
    if (cb) cb.addEventListener('change', () => { estado.retiradas = cb.checked; desenhar(); });
  };
  desenhar();

  // ---- avisos ----
  const avisos = [];
  if (r.menor.saldo < 0) avisos.push(['erro', `O caixa fica <b>negativo</b> na semana de ${dataBR(r.menor.de).slice(0, 5)} (${dinheiro(r.menor.saldo)}).`, '#pn-caixa']);
  else if (fixo && r.menor.saldo < fixo) avisos.push(['alerta', `O caixa fica abaixo de um mês de custo fixo na semana de ${dataBR(r.menor.de).slice(0, 5)} (${dinheiro(r.menor.saldo)}).`, '#pn-caixa']);
  const atrasadas = new Map();
  for (const l of d.receber.filter((y) => y.situacao === 'faturado' && y.vencimento && F.diasEntre(y.vencimento, hoje) > 15)) atrasadas.set(l.empresa_id, (atrasadas.get(l.empresa_id) || 0) + Number(l.valor));
  if (atrasadas.size) avisos.push(['erro', `Nota vencida há mais de 15 dias: ${[...atrasadas].map(([id, v]) => `${esc(d.empresa(id).nome)} (${dinheiro(v)})`).join(', ')}.`, '#/financeiro/receber']);
  try {
    const cfg = F.custos(d.config);
    const ruins = (await import('./financeiro-margem.js')).calcularMargens(d, mentores).filter((x) => x.receita > 0 && x.sem_socias_pct != null && x.sem_socias_pct < Number(cfg.margem_alvo || 30))
      .sort((a, b) => a.sem_socias_pct - b.sem_socias_pct);
    if (ruins.length) avisos.push([ruins[0].sem_socias_pct < 0 ? 'erro' : 'alerta', `Margem abaixo de ${cfg.margem_alvo}%: ${ruins.slice(0, 4).map((x) => `${esc(x.empresa)} · ${esc(x.plano.titulo)} (${String(x.sem_socias_pct).replace('.', ',')}%)`).join('; ')}${ruins.length > 4 ? ` e mais ${ruins.length - 4}` : ''}.`, '#/financeiro/margem']);
  } catch (e) { console.warn('margens', e); }
  if (d.extratos != null) {
    const velhas = ultimos.filter((x) => F.diasEntre(x.periodo_ate, hoje) > 15).map((x) => x.conta);
    if (!ultimos.length) avisos.push(['alerta', 'Nenhum extrato importado: o caixa começa do zero.', '#/financeiro/extratos']);
    else if (velhas.length) avisos.push(['alerta', `Extrato desatualizado: ${velhas.join(', ')} (mais de 15 dias).`, '#/financeiro/extratos']);
  }
  if (socia && !fech.error && !(fech.data || []).length && Number(hoje.slice(8, 10)) > 10) avisos.push(['alerta', `${maiuscula(F.nomeMes(F.somarMeses(mesAtual, -1)))} ainda não foi fechado.`, `#/financeiro/fechamento/${F.somarMeses(mesAtual, -1)}`]);
  el.querySelector('#pn-atencao').innerHTML = avisos.length ? `<div class="cartao" style="margin-bottom:14px"><h3>Atenção</h3><div class="grade mt" style="gap:8px">
    ${avisos.map(([tipo, t, link]) => `<div class="aviso${tipo === 'erro' ? ' erro' : ''}" style="box-shadow:none">${t} ${link.startsWith('#/') ? `<a href="${link}">Ver</a>` : ''}</div>`).join('')}</div></div>` : '';
}
