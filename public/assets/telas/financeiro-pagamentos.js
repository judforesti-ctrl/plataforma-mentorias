// Financeiro → Agenda de pagamentos (script 58, 30/10/2026). Decisão da Juliana: pagar 3 vezes ao mês, nos dias 5, 15 e 25 (fim de
// semana ou feriado: nota de mentor no dia útil seguinte; conta com vencimento no dia útil antes), a menos que seja algo fora da curva.
// Entram: notas fiscais dos mentores parceiros (enviadas por eles em #/notas; data prevista calculada no envio; "Mudar a data" =
// pagar_em), contas fixas (no último dia de pagamento até o vencimento) e outras despesas lançadas e ainda não pagas.
// A nota do mentor mostra o valor que a plataforma calcula para o mês (aulas e sessões × cadastro) para conferir; "Pagar" leva ao
// Pagamento do mês do mentor, que lança as despesas por turma e marca a nota como paga.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import { feriadoDe } from '../agenda-regras.js';
import * as F from '../financeiro-regras.js';

const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const comDia = (dia) => `${dataBR(dia)} (${DIA_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]})`;
const SITUACAO = { recebida: ['Recebida: conferir', 'alerta'], conferida: ['Conferida', 'ok'], paga: ['Paga', 'ok'], devolvida: ['Devolvida', 'erro'] };

export async function abaPagamentos(ctx, d, el, recarregar, mentores) {
  const hoje = hojeISO();
  const [notasR, dadosR] = await Promise.all([
    sb.from('fin_notas_mentor').select('*').gte('mes_referencia', F.somarMeses(hoje.slice(0, 7), -6)).order('enviada_em'),
    sb.from('mentor_pagamento_dados').select('*'),
  ]);
  const semNotas = notasR.error && faltaScript(notasR.error);
  if (notasR.error && !semNotas) throw notasR.error;
  const notas = notasR.data || [];
  const dados = new Map((dadosR.data || []).map((x) => [x.perfil_id, x]));
  const proximos = F.proximosPagamentos(hoje, 6, feriadoDe);
  const ultimo = proximos[proximos.length - 1];
  const itens = [];
  // notas dos mentores
  for (const n of notas.filter((x) => x.situacao !== 'paga' && x.situacao !== 'devolvida')) {
    const calc = mentores ? mentores.doMes(n.perfil_id, n.mes_referencia) : null;
    itens.push({ tipo: 'nota', n, dia: n.pagar_em || n.pagamento_previsto, valor: Number(n.valor), calc });
  }
  // contas fixas (deste mês e dos dois próximos)
  for (const k of [0, 1, 2]) {
    const mes = F.somarMeses(hoje.slice(0, 7), k);
    for (const f of d.fixas.filter((x) => x.ativo !== false)) {
      const venc = `${mes}-${String(f.dia).padStart(2, '0')}`;
      const desp = d.despesas.find((x) => x.fixa_id === f.id && x.competencia === mes);
      if (desp && desp.pago_em) continue;
      const dia = F.pagamentoDaConta(venc, feriadoDe);
      if (dia > ultimo) continue;
      itens.push({ tipo: 'fixa', f, desp, mes, venc, dia, valor: Number((desp || f).valor) });
    }
  }
  // outras despesas lançadas e não pagas
  for (const x of d.despesas.filter((y) => !y.pago_em && !y.fixa_id && y.categoria !== 'socia' && y.data >= F.somarDias(hoje, -60))) {
    const dia = x.data < hoje ? x.data : F.pagamentoDaConta(x.data, feriadoDe);
    if (dia <= ultimo) itens.push({ tipo: 'conta', x, dia, valor: Number(x.valor) });
  }
  const atrasados = itens.filter((i) => i.dia < hoje);
  // um bloco por dia: os dias de pagamento e qualquer outro dia em que caia algo (conta que vence em fim de semana, data mudada)
  const dias = [...new Set([...proximos, ...itens.map((i) => i.dia).filter((x) => x >= hoje)])].sort();
  const grupo = (dia) => itens.filter((i) => i.dia === dia);
  const linha = (i) => {
    if (i.tipo === 'nota') {
      const p = d.pessoa(i.n.perfil_id) || {};
      const dd = dados.get(i.n.perfil_id);
      const [t, c] = SITUACAO[i.n.situacao] || [i.n.situacao, 'neutro'];
      const dif = i.calc && i.calc.total ? F.arred(i.valor - i.calc.total) : null;
      return `<tr><td><span class="selo neutro">Nota de mentor</span></td>
        <td><b>${esc(p.nome || 'Mentor')}</b> · ${esc(F.nomeMes(i.n.mes_referencia))}${i.n.numero ? ` · nota ${esc(i.n.numero)}` : ''}<br>
          <small class="apagado">${dd ? `${esc(dd.nome_pagamento || '')} · ${esc(dd.documento || '')} · PIX ${esc(dd.pix || '—')}` : 'sem dados para pagamento'}${i.n.pagar_em ? ' · <b>data mudada (fora da curva)</b>' : ''}</small>
          ${i.n.observacao ? `<br><small>Recado: ${esc(i.n.observacao)}</small>` : ''}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(i.valor)}<br><small class="apagado">${i.calc ? `calculado ${dinheiro(i.calc.total)}` : ''}</small>
          ${dif == null ? '' : Math.abs(dif) < 0.01 ? '<br><span class="selo ok">confere</span>' : `<br><span class="selo alerta">diferença ${dinheiro(dif)}</span>`}</td>
        <td><span class="selo ${c}">${t}</span></td>
        <td style="white-space:nowrap"><button class="btn peq" type="button" data-arquivo="${esc(i.n.arquivo)}">Ver a nota</button>
          ${i.n.situacao === 'recebida' ? `<button class="btn peq escuro" type="button" data-conferir="${i.n.id}">Conferida</button>` : ''}
          <a class="btn peq pri" href="#/financeiro/mentores/pagamentos/${i.n.mes_referencia}">Pagar</a>
          <button class="btn peq" type="button" data-data="${i.n.id}">Mudar a data</button>
          <button class="btn peq" type="button" data-devolver="${i.n.id}">Devolver</button></td></tr>`;
    }
    if (i.tipo === 'fixa') return `<tr><td><span class="selo neutro">Conta fixa</span></td><td><b>${esc(i.f.descricao)}</b><br><small class="apagado">vence ${dataBR(i.venc)}${i.f.conta ? ` · ${esc(i.f.conta)}` : ''}</small></td>
      <td class="fn-num" style="text-align:right">${dinheiro(i.valor)}</td><td></td>
      <td><button class="btn peq" type="button" data-pagar-fixa="${i.f.id}|${i.mes}">Marcar como paga</button></td></tr>`;
    return `<tr><td><span class="selo neutro">Conta</span></td><td><b>${esc(i.x.descricao)}</b><br><small class="apagado">${esc(F.nomeCategoria(i.x.categoria))} · lançada em ${dataBR(i.x.data)}</small></td>
      <td class="fn-num" style="text-align:right">${dinheiro(i.valor)}</td><td></td>
      <td><button class="btn peq" type="button" data-pagar-conta="${i.x.id}">Marcar como paga</button></td></tr>`;
  };
  const tabela = (lista) => `<div class="tabela"><table><tbody>${lista.sort((a, b) => a.dia.localeCompare(b.dia) || a.tipo.localeCompare(b.tipo)).map(linha).join('')}</tbody></table></div>`;
  const recebidas = notas.filter((n) => n.situacao === 'recebida').length;
  el.innerHTML = `
    ${semNotas ? '<div class="aviso">Falta rodar o script <b>58</b> no Supabase: até lá as notas dos mentores não aparecem aqui (as contas sim).</div>' : ''}
    <p class="apagado" style="margin-bottom:12px">Pagamentos nos dias 5, 15 e 25. Nota de mentor: o primeiro desses dias pelo menos 3 dias depois do envio (fim de semana ou feriado: dia útil seguinte). Conta: o último desses dias antes do vencimento. Algo fora da curva: "Mudar a data".</p>
    <div class="grade g3" style="margin-bottom:14px">${proximos.slice(0, 3).map((p) => { const g = grupo(p); return `<div class="cartao numero"><b>${dinheiro(F.soma(g, (i) => i.valor))}</b><span>${comDia(p)} · ${g.length} pagamento${g.length === 1 ? '' : 's'}</span></div>`; }).join('')}</div>
    ${recebidas ? `<div class="aviso" style="margin-bottom:12px">${recebidas} nota${recebidas === 1 ? '' : 's'} fiscal${recebidas === 1 ? '' : 'is'} de mentor recebida${recebidas === 1 ? '' : 's'} para conferir.</div>` : ''}
    ${atrasados.length ? `<div class="cartao" style="margin-bottom:12px;border-left:5px solid var(--erro)"><h3>Atrasados</h3>${tabela(atrasados)}</div>` : ''}
    ${dias.map((p) => { const g = grupo(p); return `<div class="cartao" style="margin-bottom:12px"><div class="linha"><h3 style="flex:1">${comDia(p)}${proximos.includes(p) ? '' : ' <small class="apagado">fora dos dias 5, 15 e 25</small>'}</h3><b>${dinheiro(F.soma(g, (i) => i.valor))}</b></div>
      ${g.length ? tabela(g) : '<p class="apagado">Nada para pagar.</p>'}</div>`; }).join('')}
    ${notas.filter((n) => n.situacao === 'paga' || n.situacao === 'devolvida').length ? `<details class="cartao"><summary><b>Notas já pagas ou devolvidas</b></summary><div class="tabela mt"><table><tbody>
      ${notas.filter((n) => n.situacao === 'paga' || n.situacao === 'devolvida').reverse().map((n) => `<tr><td>${esc((d.pessoa(n.perfil_id) || {}).nome || '')} · ${esc(F.nomeMes(n.mes_referencia))}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(n.valor)}</td><td>${n.situacao === 'paga' ? `paga em ${dataBR(n.pago_em)}` : `devolvida: ${esc(n.devolvida_motivo || '')}`}</td>
        <td><button class="btn peq" type="button" data-arquivo="${esc(n.arquivo)}">Ver a nota</button></td></tr>`).join('')}</tbody></table></div></details>` : ''}`;

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const nota = (id) => notas.find((n) => n.id === id);
    try {
      if (b.dataset.arquivo) {
        const { data, error } = await sb.storage.from('financeiro').createSignedUrl(b.dataset.arquivo, 600);
        if (error) throw error;
        return window.open(data.signedUrl, '_blank', 'noopener');
      }
      if (b.dataset.conferir) {
        const { error } = await sb.from('fin_notas_mentor').update({ situacao: 'conferida', conferida_por: d.eu, conferida_em: new Date().toISOString() }).eq('id', b.dataset.conferir);
        if (error) throw error;
        avisar('Nota conferida.'); return recarregar();
      }
      if (b.dataset.devolver) {
        const motivo = prompt('Por que a nota volta para o mentor? (ele vê este recado)');
        if (!motivo) return;
        const { error } = await sb.from('fin_notas_mentor').update({ situacao: 'devolvida', devolvida_motivo: motivo.slice(0, 300) }).eq('id', b.dataset.devolver);
        if (error) throw error;
        avisar('Nota devolvida ao mentor.'); return recarregar();
      }
      if (b.dataset.data) return janelaData(nota(b.dataset.data), recarregar);
      if (b.dataset.pagarFixa) {
        const [fid, mes] = b.dataset.pagarFixa.split('|');
        const f = d.fixas.find((x) => x.id === fid);
        const desp = d.despesas.find((x) => x.fixa_id === fid && x.competencia === mes);
        const r = desp ? await sb.from('fin_despesas').update({ pago_em: hoje }).eq('id', desp.id)
          : await sb.from('fin_despesas').insert({ data: `${mes}-${String(f.dia).padStart(2, '0')}`, descricao: f.descricao, valor: f.valor, categoria: f.categoria, conta: f.conta, fixa_id: f.id, competencia: mes, origem: 'fixa', pago_em: hoje });
        if (r.error) throw r.error;
        avisar('Marcada como paga.'); return recarregar();
      }
      if (b.dataset.pagarConta) {
        const { error } = await sb.from('fin_despesas').update({ pago_em: hoje }).eq('id', b.dataset.pagarConta);
        if (error) throw error;
        avisar('Marcada como paga.'); return recarregar();
      }
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

function janelaData(n, recarregar) {
  const j = janela('Mudar a data do pagamento', `<form class="grade" style="gap:12px" novalidate>
    <p class="apagado">Previsto pela regra: ${comDia(n.pagamento_previsto)}. Use só para o que for fora da curva; o mentor vê a data nova.</p>
    <div class="campo"><label for="pd-dia">Pagar em</label><input type="date" id="pd-dia" value="${n.pagar_em || n.pagamento_previsto}"></div>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button>${n.pagar_em ? '<button class="btn" type="button" id="pd-voltar">Voltar para a regra</button>' : ''}<button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 480 });
  const salvar = async (dia) => {
    const { error } = await sb.from('fin_notas_mentor').update({ pagar_em: dia }).eq('id', n.id);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('Data do pagamento salva.'); recarregar();
  };
  j.corpo.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); salvar(j.corpo.querySelector('#pd-dia').value || null); });
  const v = j.corpo.querySelector('#pd-voltar');
  if (v) v.addEventListener('click', () => salvar(null));
}
