// Financeiro, etapa 4 (script 57, 30/10/2026): fechamento do mês e distribuição das sócias, como a aba "Precificação/distribuição"
// da planilha: faturamento − despesas − Simples − INSS (os impostos PAGOS de verdade, pedido dela) = líquido; 10% fica no caixa; o
// resto vai para as sócias pela participação (Ju 40, Vivi 40, Cláudia 20; muda em Ajustes), menos a despesa pessoal de cada uma.
// Decisão dela: a distribuição só as sócias veem (a aba nem aparece para a Cintia; a tabela fin_fechamentos tem RLS eh_socia()).
// "Fechar o mês" guarda o retrato dos números (não muda mais se alguém lançar depois); "Reabrir" apaga o retrato.
// Retiradas = saídas do extrato conferidas como "Retirada de sócia" (etapa 3).
import { sb, esc, dataBR, dataHoraBR, hojeISO, avisar, explicarErro } from '../base.js';
import { faltaScript } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const pct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
export const ehSocia = (perfil) => perfil && perfil.papel === 'admin' && !!perfil.tambem_mentor;

// Números do mês (vivos)
export function numerosDoMes(d, mes) {
  const faturado = F.faturadoNoMes(mes, { inicio: d.config.inicio, linhas: d.receber, meses: d.meses }) || 0;
  return F.fechamento({ faturado, despesas: d.despesas.filter((x) => F.mesDe(x.data) === mes), socias: d.socias, cfg: F.custos(d.config) });
}

export async function abaFechamento(ctx, d, el, recarregar, params) {
  if (!ehSocia(ctx.perfil)) { el.innerHTML = '<div class="aviso">O fechamento e a distribuição só as sócias veem.</div>'; return; }
  const hoje = hojeISO();
  const mes = /^\d{4}-\d{2}$/.test(params[0] || '') ? params[0] : F.somarMeses(hoje.slice(0, 7), -1);
  const ano = mes.slice(0, 4);
  const [fech, ret] = await Promise.all([
    sb.from('fin_fechamentos').select('*').gte('mes', `${ano}-01`).lte('mes', `${ano}-12`),
    sb.from('fin_movimentos').select('data, valor, pessoa_id').eq('acao', 'retirada').gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`),
  ]);
  const semScript = fech.error && faltaScript(fech.error);
  if (fech.error && !semScript) throw fech.error;
  const fechados = new Map((fech.data || []).map((x) => [x.mes, x]));
  const retiradas = ret.error ? null : ret.data || [];
  const salvo = fechados.get(mes);
  const n = salvo ? salvo.numeros : numerosDoMes(d, mes);
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`).filter((m) => m < hoje.slice(0, 7) || m === mes);
  const doMesAno = meses.map((m) => ({ m, n: fechados.has(m) ? fechados.get(m).numeros : numerosDoMes(d, m), fechado: fechados.has(m) }));
  const parteDe = (num, id) => (num.partes.find((p) => p.id === id) || { liquido: 0 }).liquido;
  const retiradoDe = (id) => (retiradas ? F.soma(retiradas.filter((r) => r.pessoa_id === id), (r) => -Number(r.valor)) : null);
  const linha = (rotulo, v, sinal = '−') => `<tr><td>${sinal ? `${sinal} ` : ''}${rotulo}</td><td class="fn-num" style="text-align:right">${dinheiro(v)}</td></tr>`;

  el.innerHTML = `
    <div class="linha" style="margin-bottom:14px">
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, -1)}" aria-label="Mês anterior">‹</button>
      <h2 style="margin:0">${maiuscula(F.nomeMes(mes))}</h2>
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, 1)}" aria-label="Mês seguinte">›</button>
      ${salvo ? `<span class="selo ok">Fechado em ${dataBR(salvo.fechado_em)}</span>` : '<span class="selo alerta">Em aberto</span>'}
    </div>
    ${semScript ? '<div class="aviso">Falta rodar o script <b>57</b> no Supabase para fechar o mês. Os números abaixo já valem.</div>' : ''}
    <div class="grade g2">
      <div class="cartao"><h3>Resultado do mês</h3>
        <div class="tabela mt"><table><tbody>
          ${linha('Faturamento', n.faturado, '')}
          ${linha('Despesas', n.despesas)}
          ${linha('Simples (pago)', n.simples)}
          ${linha('INSS (pago)', n.inss)}
          <tr class="fn-forte"><td>Líquido da Mentorei</td><td class="fn-num" style="text-align:right;${n.liquido < 0 ? 'color:var(--erro)' : ''}">${dinheiro(n.liquido)}</td></tr>
          ${linha(`Caixa da empresa (${pct(n.caixa_pct)})`, n.caixa)}
          <tr class="fn-forte"><td>Para distribuir</td><td class="fn-num" style="text-align:right">${dinheiro(n.distribuir)}</td></tr>
        </tbody></table></div>
        <p class="peq apagado mt">Faturamento pela data dos módulos e parcelas${mes < d.config.inicio ? ' (antes do início do Financeiro: o da planilha)' : ''}. Impostos = os pagos no mês (despesas do tipo Impostos; INSS pelo nome). Despesa pessoal de sócia sai da parte dela.</p>
        ${salvo ? `<p class="peq apagado">Fechado por ${esc((d.pessoa(salvo.fechado_por) || {}).nome || '—')} em ${dataHoraBR(salvo.fechado_em)}. Os números ficaram guardados como estavam.</p>` : ''}
        <div class="linha mt">${semScript ? '' : salvo ? '<button class="btn" type="button" id="fc-reabrir">Reabrir o mês</button>' : '<button class="btn pri" type="button" id="fc-fechar">Fechar o mês</button>'}</div>
      </div>
      <div class="cartao"><h3>Distribuição</h3>
        <div class="tabela mt"><table><thead><tr><th>Sócia</th><th style="text-align:right">Parte</th><th style="text-align:right">Despesa pessoal</th><th style="text-align:right">A receber</th></tr></thead><tbody>
          ${n.partes.map((p) => `<tr><td><b>${esc(p.nome)}</b> <small class="apagado">${pct(p.pct)}</small></td><td class="fn-num" style="text-align:right">${dinheiro(p.bruto)}</td>
            <td class="fn-num" style="text-align:right">${p.pessoais ? `− ${dinheiro(p.pessoais)}` : '—'}</td><td class="fn-num" style="text-align:right;font-weight:700">${dinheiro(p.liquido)}</td></tr>`).join('')}
        </tbody></table></div>
        ${n.distribuir < 0 ? '<div class="aviso erro mt">Mês com prejuízo: não há o que distribuir. O valor negativo abate do que cada sócia tem a receber no ano (tabela abaixo).</div>' : ''}
        ${n.pessoais_sem_socia ? `<div class="aviso mt">${dinheiro(n.pessoais_sem_socia)} em despesa pessoal sem dizer de qual sócia: confira em Financeiro → Conferir.</div>` : ''}
        <p class="peq apagado mt">Participação e caixa mudam em "Ajustes".</p>
      </div>
    </div>
    <div class="cartao mt"><h3>${ano}: devido e retirado</h3>
      <div class="tabela mt"><table><thead><tr><th>Mês</th><th style="text-align:right">Líquido</th><th style="text-align:right">Caixa</th>
        ${d.socias.map((s) => `<th style="text-align:right">${esc(s.nome.split(' ')[0])}</th>`).join('')}<th></th></tr></thead><tbody>
        ${doMesAno.map((x) => `<tr${x.m === mes ? ' class="fn-forte"' : ''}><td><a href="#/financeiro/fechamento/${x.m}">${maiuscula(F.nomeMes(x.m, true))}</a></td>
          <td class="fn-num" style="text-align:right">${dinheiro(x.n.liquido)}</td><td class="fn-num" style="text-align:right">${dinheiro(x.n.caixa)}</td>
          ${d.socias.map((s) => `<td class="fn-num" style="text-align:right">${dinheiro(parteDe(x.n, s.id))}</td>`).join('')}
          <td>${x.fechado ? '<span class="selo ok">fechado</span>' : ''}</td></tr>`).join('')}
        <tr class="fn-forte"><td>Devido no ano</td><td class="fn-num" style="text-align:right">${dinheiro(F.soma(doMesAno, (x) => x.n.liquido))}</td><td class="fn-num" style="text-align:right">${dinheiro(F.soma(doMesAno, (x) => x.n.caixa))}</td>
          ${d.socias.map((s) => `<td class="fn-num" style="text-align:right">${dinheiro(F.soma(doMesAno, (x) => parteDe(x.n, s.id)))}</td>`).join('')}<td></td></tr>
        <tr><td>Retirado no ano</td><td></td><td></td>${d.socias.map((s) => `<td class="fn-num" style="text-align:right">${retiradoDe(s.id) == null ? '—' : dinheiro(retiradoDe(s.id))}</td>`).join('')}<td></td></tr>
        <tr class="fn-forte"><td>Falta retirar</td><td></td><td></td>${d.socias.map((s) => { const r = retiradoDe(s.id); const f = r == null ? null : F.soma(doMesAno, (x) => parteDe(x.n, s.id)) - r; return `<td class="fn-num" style="text-align:right;${f != null && f < 0 ? 'color:var(--erro)' : ''}">${f == null ? '—' : dinheiro(f)}</td>`; }).join('')}<td></td></tr>
      </tbody></table></div>
      <p class="peq apagado mt">Retirado = saídas do extrato conferidas como "Retirada de sócia" (Financeiro → Extratos)${retiradas == null ? '; falta rodar o script 56' : retiradas.length ? '' : '; ainda não há nenhuma: importe os extratos do ano'}. Negativo em "Falta retirar" = retirou mais do que o resultado deu.</p>
    </div>`;
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/financeiro/fechamento/${b.dataset.mes}`; }));
  const fechar = el.querySelector('#fc-fechar'), reabrir = el.querySelector('#fc-reabrir');
  if (fechar) fechar.addEventListener('click', async () => {
    if (mes >= hoje.slice(0, 7) && !confirm('Este mês ainda não acabou. Fechar assim mesmo?')) return;
    const { error } = await sb.from('fin_fechamentos').insert({ mes, numeros: n, fechado_por: d.eu, fechado_em: new Date().toISOString() });
    if (error) { avisar(explicarErro(error), true); return; }
    avisar(`${maiuscula(F.nomeMes(mes))} fechado.`); recarregar();
  });
  if (reabrir) reabrir.addEventListener('click', async () => {
    if (!confirm('Reabrir o mês? Os números voltam a ser calculados com o que estiver lançado.')) return;
    const { error } = await sb.from('fin_fechamentos').delete().eq('mes', mes);
    if (error) { avisar(explicarErro(error), true); return; }
    avisar('Mês reaberto.'); recarregar();
  });
}
