// Financeiro, etapa 4 (30/10/2026): margem de cada turma e mentoria, com o que já foi lançado e o que ainda vai custar.
// Pedido dela: simular a margem com as horas dos mentores e das sócias (hora da sócia = 3 × a hora de referência dos mentores) e
// com a viagem estimada (avião: véspera e dia seguinte). Conta (financeiro-regras.js `margem`):
//   receita = linhas do plano (menos canceladas); lançado = despesas ligadas à turma/programa (menos impostos e despesa pessoal);
//   mentores parceiros = aulas e sessões de meses ainda não pagos, pelo cadastro financeiro (pago vira despesa = lançado);
//   viagem = módulos presenciais de hoje em diante sem despesa de viagem lançada, por pessoa que se desloca (o que a empresa paga
//   não entra; avião, carro com km ou "não viaja" em fin_planos.estimativa, script 57); imposto = alíquota real;
//   horas das sócias = todas as aulas e sessões delas × hora da sócia (custo de oportunidade: elas recebem pela distribuição).
// "Simular um programa" faz a mesma conta para uma proposta nova e diz o preço para chegar à margem desejada.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';
import { quemCuidaDaViagem } from '../agenda-regras.js';

const pct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const horasBR = (min) => `${(Math.round(min / 6) / 10).toLocaleString('pt-BR')} h`;
const VIAGEM = new Set(F.VIAGEM);
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Margem de todos os planos ligados a turma ou programa. mentores = previsaoMentores(d) (null sem o script 54).
export function calcularMargens(d, mentores) {
  const hoje = hojeISO();
  const cfg = F.custos(d.config);
  const m = mentores && mentores.m;
  const hora = F.horaReferencia(cfg, m ? m.cadastro : []);
  const horaSocia = hora * Number(cfg.socia_vezes || 3);
  const socias = new Set(d.socias.map((s) => s.id));
  const pagos = new Set(m ? m.pagamentos.filter((p) => p.situacao === 'pago').map((p) => `${p.perfil_id}|${p.mes}`) : []);
  const cidadeDe = (pessoa) => (socias.has(pessoa) ? cfg.cidade_socias : ((m && m.cad(pessoa)) || {}).cidade_saida) || '';
  const nomeDe = (id) => (d.pessoa(id) || {}).nome || 'Mentor';
  return d.planos.filter((p) => p.turma_id || p.programa_id).map((plano) => {
    const linhas = d.receber.filter((l) => l.plano_id === plano.id && l.situacao !== 'cancelado');
    const receita = F.soma(linhas, (l) => l.valor);
    const doPlano = (x) => (plano.turma_id && x.turma_id === plano.turma_id) || (plano.programa_id && x.programa_id === plano.programa_id);
    const lancadas = d.despesas.filter((x) => doPlano(x) && x.categoria !== 'impostos' && x.categoria !== 'socia');
    const chave = plano.turma_id ? `t:${plano.turma_id}` : `p:${plano.programa_id}`;
    // aulas e sessões do plano: [{ pessoa, dia, minutos, modulo }]
    const itens = [];
    if (plano.turma_id && m) for (const mm of m.modMentores) {
      const mod = d.modulo(mm.modulo_id);
      if (mod && mod.turma_id === plano.turma_id) itens.push({ pessoa: mm.mentor_id, dia: F.diaDe(mod.data_hora), minutos: mod.duracao_min || 0, modulo: mod, mm });
    }
    if (plano.programa_id && m) for (const s of m.sessoes) {
      const mt = m.mentorado(s.mentorado_id);
      if (mt && mt.programa_id === plano.programa_id) itens.push({ pessoa: s.mentor_id, dia: F.diaDe(s.data_hora), minutos: s.duracao_min || 60 });
    }
    // mentores parceiros ainda não pagos
    let parceiros = 0;
    const porParceiro = new Map();
    for (const i of itens) {
      if (socias.has(i.pessoa) || !i.dia || pagos.has(`${i.pessoa}|${F.mesDe(i.dia)}`)) continue;
      const cad = m.cad(i.pessoa);
      const r = mentores.valorDe(i.pessoa, chave);
      const forma = (r && r.forma) || (cad && cad.forma) || 'hora';
      const valor = Number((r && r.valor != null ? r.valor : cad && cad.valor) || 0);
      const v = forma === 'hora' ? i.minutos / 60 * valor : forma === 'atendimento' || forma === 'modulo' ? valor : 0;
      parceiros += v;
      const p = porParceiro.get(i.pessoa) || { nome: nomeDe(i.pessoa), vezes: 0, minutos: 0, valor: 0, semCadastro: !cad };
      p.vezes++; p.minutos += i.minutos; p.valor += v; porParceiro.set(i.pessoa, p);
    }
    // percentual do faturado combinado com algum parceiro: sobre a receita do plano, uma vez
    if (m) for (const pid of new Set(itens.map((i) => i.pessoa).filter((x) => !socias.has(x)))) {
      const r = mentores.valorDe(pid, chave), cad = m.cad(pid);
      const forma = (r && r.forma) || (cad && cad.forma);
      if (forma === 'percentual') { const v = receita * Number((r && r.valor != null ? r.valor : cad && cad.valor) || 0) / 100; parceiros += v; const p = porParceiro.get(pid) || { nome: nomeDe(pid), vezes: 0, minutos: 0, valor: 0 }; p.valor += v; p.percentual = true; porParceiro.set(pid, p); }
    }
    // horas das sócias
    const minSocias = itens.filter((i) => socias.has(i.pessoa)).reduce((a, i) => a + Number(i.minutos || 0), 0);
    const porSocia = d.socias.map((s) => ({ nome: s.nome, minutos: itens.filter((i) => i.pessoa === s.id).reduce((a, i) => a + Number(i.minutos || 0), 0) })).filter((x) => x.minutos);
    // viagens futuras estimadas
    const turma = plano.turma_id ? d.turmas.find((t) => t.id === plano.turma_id) : null;
    const viagens = [];
    for (const i of itens.filter((y) => y.modulo && y.dia >= hoje && y.modulo.formato === 'presencial' && y.mm.com_deslocamento !== false)) {
      const real = d.despesas.some((x) => x.modulo_id === i.modulo.id && VIAGEM.has(x.categoria));
      const k = `${i.modulo.id}:${i.pessoa}`;
      const salvo = ((plano.estimativa || {}).viagens || {})[k];
      const cidade = cidadeDe(i.pessoa);
      const mesmaCidade = cidade && i.modulo.local && normal(i.modulo.local).includes(normal(cidade).split(/[\s(,/-]+/)[0]);
      const modo = salvo ? salvo.modo : mesmaCidade ? 'nao' : 'aviao';
      const quem = quemCuidaDaViagem(i.mm.viagem, turma && turma.viagem_padrao);
      const paga = { passagem: quem.passagem.paga === 'empresa', hotel: quem.hotel.paga === 'empresa', transporte: quem.transporte.paga === 'empresa' };
      const c = real ? { total: 0 } : F.custoViagem({ modo, km: salvo && salvo.km }, cfg.viagem, paga);
      viagens.push({ k, modulo: i.modulo, pessoa: i.pessoa, nome: nomeDe(i.pessoa), dia: i.dia, modo, km: salvo && salvo.km, real, paga, cidade, ...c });
    }
    const r = F.margem({ receita, reais: F.soma(lancadas, (x) => x.valor), parceiros, viagens: F.soma(viagens, (v) => v.total), socias: minSocias / 60 * horaSocia, pct: d.aliquota.pct });
    return { plano, empresa: d.empresa(plano.empresa_id).nome, linhas, lancadas, itens, porParceiro: [...porParceiro.values()], porSocia, minSocias, listaViagens: viagens, hora, horaSocia, ...r };
  });
}

export async function abaMargem(ctx, d, el, recarregar, mentores) {
  const lista = calcularMargens(d, mentores).filter((x) => x.receita > 0).sort((a, b) => (a.com_socias_pct ?? 0) - (b.com_socias_pct ?? 0));
  const cfg = F.custos(d.config);
  const hora = lista[0] ? lista[0].hora : F.horaReferencia(cfg, mentores ? mentores.m.cadastro : []);
  const tot = (c) => F.soma(lista, (x) => x[c]);
  const cor = (v) => (v == null ? '' : v < 0 ? 'var(--erro)' : v < Number(cfg.margem_alvo || 30) ? 'var(--bege-escuro)' : 'var(--ok)');
  el.innerHTML = `
    <div class="linha" style="margin-bottom:10px"><p class="apagado" style="flex:1;margin:0">Hora de referência dos mentores: <b>${dinheiro(hora)}</b> · hora das sócias: <b>${dinheiro(hora * Number(cfg.socia_vezes || 3))}</b> (${cfg.socia_vezes} ×). Muda em "Ajustes".</p>
      <button class="btn pri" type="button" id="mg-simular">Simular um programa</button></div>
    ${!mentores ? '<div class="aviso">Sem o script 54 a conta não tem os mentores parceiros nem as horas das sócias.</div>' : ''}
    ${lista.length ? `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Turma ou mentoria</th><th style="text-align:right">Receita</th><th style="text-align:right">Lançado</th>
      <th style="text-align:right">Ainda vai custar</th><th style="text-align:right">Imposto</th><th style="text-align:right">Margem</th><th style="text-align:right">Com as horas das sócias</th><th></th></tr></thead><tbody>
      ${lista.map((x, i) => `<tr><td><b>${esc(x.empresa)}</b><br><small class="apagado">${esc(x.plano.titulo)}</small></td>
        <td class="fn-num" style="text-align:right">${dinheiro(x.receita)}</td><td class="fn-num" style="text-align:right">${dinheiro(x.reais)}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(x.parceiros + x.viagens)}${x.viagens ? `<br><small class="apagado">viagem ${dinheiro(x.viagens)}</small>` : ''}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(x.imposto)}</td>
        <td class="fn-num" style="text-align:right;font-weight:700;color:${cor(x.sem_socias_pct)}">${pct(x.sem_socias_pct)}<br><small>${dinheiro(x.sem_socias)}</small></td>
        <td class="fn-num" style="text-align:right;font-weight:700;color:${cor(x.com_socias_pct)}">${pct(x.com_socias_pct)}<br><small>${dinheiro(x.com_socias)}</small></td>
        <td><button class="btn peq" type="button" data-ver="${i}">Ver a conta</button></td></tr>`).join('')}
      <tr class="fn-forte"><td>Total</td><td class="fn-num" style="text-align:right">${dinheiro(tot('receita'))}</td><td class="fn-num" style="text-align:right">${dinheiro(tot('reais'))}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(tot('parceiros') + tot('viagens'))}</td><td class="fn-num" style="text-align:right">${dinheiro(tot('imposto'))}</td>
        <td class="fn-num" style="text-align:right">${pct(tot('receita') ? tot('sem_socias') / tot('receita') * 100 : null)}<br><small>${dinheiro(tot('sem_socias'))}</small></td>
        <td class="fn-num" style="text-align:right">${pct(tot('receita') ? tot('com_socias') / tot('receita') * 100 : null)}<br><small>${dinheiro(tot('com_socias'))}</small></td><td></td></tr>
      </tbody></table></div>` : '<div class="vazio">Nenhuma turma ou mentoria com plano de faturamento.</div>'}
    <p class="peq apagado mt">Verde = margem acima de ${cfg.margem_alvo}% · bege = abaixo · vermelho = prejuízo. "Ainda vai custar" = mentores parceiros de meses ainda não pagos e viagens de hoje em diante sem despesa lançada (estimadas). "Com as horas das sócias" desconta as horas das sócias como se fossem pagas (${cfg.socia_vezes} × a hora de referência).</p>`;
  el.querySelector('#mg-simular').addEventListener('click', () => simular(d, hora, cfg));
  el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ver]'); if (b) janelaConta(d, lista[Number(b.dataset.ver)], cfg, recarregar); });
}

function janelaConta(d, x, cfg, recarregar) {
  const linha = (rotulo, v, extra = '') => `<tr><td>${rotulo}${extra ? `<br><small class="apagado">${extra}</small>` : ''}</td><td class="fn-num" style="text-align:right">${dinheiro(v)}</td></tr>`;
  const porCat = {};
  for (const y of x.lancadas) porCat[y.categoria] = (porCat[y.categoria] || 0) + Number(y.valor || 0);
  const j = janela(`Margem · ${x.empresa} · ${x.plano.titulo}`, `
    <div class="tabela"><table><tbody>
      ${linha('Receita', x.receita, `${x.linhas.length} linha${x.linhas.length === 1 ? '' : 's'} do plano`)}
      ${Object.entries(porCat).map(([k, v]) => linha(`− ${esc(F.nomeCategoria(k))} (lançado)`, v)).join('')}
      ${x.porParceiro.map((p) => linha(`− ${esc(p.nome)} (ainda não pago)`, p.valor, p.percentual ? '% do faturado' : `${p.vezes} aula${p.vezes === 1 ? '' : 's'} ou sessõ${p.vezes === 1 ? 'ão' : 'es'} · ${horasBR(p.minutos)}${p.semCadastro ? ' · sem cadastro financeiro: conta zero' : ''}`)).join('')}
      ${x.listaViagens.length ? linha('− Viagens estimadas', x.viagens, 'detalhe abaixo') : ''}
      ${linha(`− Imposto (${pct(d.aliquota.pct)})`, x.imposto)}
      <tr class="fn-forte"><td>Margem</td><td class="fn-num" style="text-align:right">${dinheiro(x.sem_socias)} · ${pct(x.sem_socias_pct)}</td></tr>
      ${x.porSocia.map((s) => linha(`− Horas de ${esc(s.nome)}`, s.minutos / 60 * x.horaSocia, `${horasBR(s.minutos)} × ${dinheiro(x.horaSocia)}`)).join('')}
      <tr class="fn-forte"><td>Com as horas das sócias</td><td class="fn-num" style="text-align:right">${dinheiro(x.com_socias)} · ${pct(x.com_socias_pct)}</td></tr>
    </tbody></table></div>
    ${x.listaViagens.length ? `<h4 class="mt">Viagens de hoje em diante</h4>
      <p class="peq apagado">Avião = passagem + ${cfg.viagem.noites_aviao} noites + ${cfg.viagem.dias_aviao} dias de refeição e transporte. Carro = km ida e volta × ${dinheiro(cfg.viagem.km)} + ${cfg.viagem.noites_carro} noite + ${cfg.viagem.dias_carro} dias. O que a empresa paga não entra.</p>
      <div class="tabela"><table><tbody>${x.listaViagens.map((v, i) => `<tr><td>${dataBR(v.dia)} · Módulo ${v.modulo.numero}<br><small class="apagado">${esc(v.nome)}${v.cidade ? ` (sai de ${esc(v.cidade)})` : ''} → ${esc(v.modulo.local || 'local a definir')}</small></td>
        <td>${v.real ? '<span class="selo ok">despesa lançada</span>' : `<select data-modo="${i}" aria-label="Como vai"><option value="aviao"${v.modo === 'aviao' ? ' selected' : ''}>Avião</option><option value="carro"${v.modo === 'carro' ? ' selected' : ''}>Carro</option><option value="nao"${v.modo === 'nao' ? ' selected' : ''}>Não viaja</option></select>
          <input type="number" data-km="${i}" min="0" step="10" placeholder="km ida e volta" value="${v.km || ''}" style="max-width:130px${v.modo === 'carro' ? '' : ';display:none'}" aria-label="Quilômetros ida e volta">`}
          ${Object.entries(v.paga).filter(([, s]) => s).length ? `<br><small class="apagado">a empresa paga: ${Object.entries(v.paga).filter(([, s]) => s).map(([k]) => k).join(', ')}</small>` : ''}</td>
        <td class="fn-num" style="text-align:right">${dinheiro(v.total)}</td></tr>`).join('')}</tbody></table></div>
      <div class="linha mt"><button class="btn pri" type="button" id="mg-salvar">Salvar as viagens</button><span class="peq apagado" id="mg-msg"></span></div>` : ''}`, { largura: 760 });
  j.corpo.querySelectorAll('[data-modo]').forEach((s) => s.addEventListener('change', () => { j.corpo.querySelector(`[data-km="${s.dataset.modo}"]`).style.display = s.value === 'carro' ? '' : 'none'; }));
  const b = j.corpo.querySelector('#mg-salvar');
  if (b) b.addEventListener('click', async () => {
    const viagens = { ...((x.plano.estimativa || {}).viagens || {}) };
    j.corpo.querySelectorAll('[data-modo]').forEach((s) => {
      const v = x.listaViagens[Number(s.dataset.modo)];
      const km = Number(j.corpo.querySelector(`[data-km="${s.dataset.modo}"]`).value) || null;
      viagens[v.k] = { modo: s.value, km: s.value === 'carro' ? km : null };
    });
    const { error } = await sb.from('fin_planos').update({ estimativa: { ...(x.plano.estimativa || {}), viagens } }).eq('id', x.plano.id);
    if (error) { j.corpo.querySelector('#mg-msg').textContent = /estimativa/.test(error.message || '') ? 'Falta rodar o script 57 no Supabase.' : explicarErro(error); return; }
    j.fechar(); avisar('Viagens salvas.'); recarregar();
  });
}

// Simular um programa novo: mesma conta, para uma proposta que ainda não existe
function simular(d, hora, cfg) {
  const j = janela('Simular um programa', `<form class="grade" style="gap:12px" novalidate>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="sm-n">Módulos ou sessões</label><input type="number" id="sm-n" min="1" step="1" value="6"></div>
      <div class="campo"><label for="sm-h">Horas em cada um</label><input type="number" id="sm-h" min="0" step="0.5" value="4"></div>
      <div class="campo"><label for="sm-preco">Preço de cada um (R$)</label><input type="number" id="sm-preco" min="0" step="100" value="8900"></div>
    </div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="sm-quem">Quem dá</label><select id="sm-quem"><option value="socia">Uma sócia</option><option value="parceiro">Mentor parceiro</option><option value="dupla">Sócia + mentor parceiro</option></select></div>
      <div class="campo"><label for="sm-hp">Hora do mentor parceiro (R$)</label><input type="number" id="sm-hp" min="0" step="10" value="${hora}"></div>
      <div class="campo"><label for="sm-pres">Presenciais</label><input type="number" id="sm-pres" min="0" step="1" value="0"><small>Quantos dos módulos têm viagem.</small></div>
    </div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="sm-modo">Viagem</label><select id="sm-modo"><option value="aviao">Avião</option><option value="carro">Carro</option></select></div>
      <div class="campo"><label for="sm-km">Km ida e volta (carro)</label><input type="number" id="sm-km" min="0" step="10" value="200"></div>
      <div class="campo"><label for="sm-outros">Outros custos do programa (R$)</label><input type="number" id="sm-outros" min="0" step="50" value="0"><small>Material, impressão…</small></div>
    </div>
    <div class="campo"><label for="sm-alvo">Margem desejada (%)</label><input type="number" id="sm-alvo" min="0" max="90" step="1" value="${cfg.margem_alvo}" style="max-width:120px"></div>
    <div id="sm-res" aria-live="polite"></div></form>`, { largura: 760 });
  const f = j.corpo.querySelector('form');
  const n = (id) => Number(f.querySelector(id).value) || 0;
  const conta = () => {
    const mods = n('#sm-n'), horas = n('#sm-h') * mods, receita = n('#sm-preco') * mods, quem = f.querySelector('#sm-quem').value;
    const pessoas = quem === 'dupla' ? 2 : 1;
    const parceiros = quem === 'socia' ? 0 : horas * n('#sm-hp');
    const socias = quem === 'parceiro' ? 0 : horas * hora * Number(cfg.socia_vezes || 3);
    const viagens = n('#sm-pres') * pessoas * F.custoViagem({ modo: f.querySelector('#sm-modo').value, km: n('#sm-km') }, cfg.viagem).total;
    const r = F.margem({ receita, reais: n('#sm-outros'), parceiros, viagens, socias, pct: d.aliquota.pct });
    const alvo = n('#sm-alvo');
    const minimo = F.precoPara({ custos: n('#sm-outros') + parceiros + viagens + socias, pct: d.aliquota.pct, alvo });
    f.querySelector('#sm-res').innerHTML = `<div class="tabela"><table><tbody>
      <tr><td>Receita</td><td class="fn-num" style="text-align:right">${dinheiro(r.receita)}</td></tr>
      <tr><td>− Mentor parceiro</td><td class="fn-num" style="text-align:right">${dinheiro(r.parceiros)}</td></tr>
      <tr><td>− Viagens</td><td class="fn-num" style="text-align:right">${dinheiro(r.viagens)}</td></tr>
      <tr><td>− Outros custos</td><td class="fn-num" style="text-align:right">${dinheiro(r.reais)}</td></tr>
      <tr><td>− Imposto (${pct(d.aliquota.pct)})</td><td class="fn-num" style="text-align:right">${dinheiro(r.imposto)}</td></tr>
      <tr class="fn-forte"><td>Margem</td><td class="fn-num" style="text-align:right">${dinheiro(r.sem_socias)} · ${pct(r.sem_socias_pct)}</td></tr>
      <tr><td>− Horas das sócias (${(horas).toLocaleString('pt-BR')} h × ${dinheiro(hora * cfg.socia_vezes)})</td><td class="fn-num" style="text-align:right">${dinheiro(r.socias)}</td></tr>
      <tr class="fn-forte"><td>Com as horas das sócias</td><td class="fn-num" style="text-align:right">${dinheiro(r.com_socias)} · ${pct(r.com_socias_pct)}</td></tr></tbody></table></div>
      ${minimo ? `<div class="aviso mt">Para ter <b>${alvo}%</b> de margem contando as horas das sócias, o programa precisa custar pelo menos <b>${dinheiro(minimo)}</b> (${dinheiro(minimo / Math.max(1, mods))} por módulo).</div>` : ''}`;
  };
  f.addEventListener('input', conta);
  f.addEventListener('submit', (ev) => ev.preventDefault());
  conta();
}
