// Financeiro, etapa 3 (script 56, 30/10/2026): extrato do banco e conferência das contas. A administração sobe o extrato do
// Sicoob ou da Unicred (o PDF do internet banking, ou OFX); a tela lê os movimentos (../financeiro-extrato.js), confere que o
// saldo bate com o do banco, guarda o arquivo e cada movimento vira uma linha para conferir. O que a plataforma já conhece
// (regras aprendidas, despesa já lançada com o mesmo valor, tarifas, recebimento já marcado) é conferido sozinho; o resto ela
// pergunta: entrada = recebimento de uma nota ou outra entrada; saída = despesa lançada, despesa nova (com "É de…"), retirada
// de sócia (vai para a distribuição da etapa 4), fundo de reserva, transferência entre contas ou nada. "Lembrar" cria a regra.
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';
import * as X from '../financeiro-extrato.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const AVISO_56 = '<div class="aviso">Falta rodar o script <b>56-financeiro-extratos.sql</b> no Supabase (SQL Editor → New query → colar → Run). Até lá não dá para importar o extrato.</div>';
const ACOES = {
  recebimento: 'Recebimento de nota', despesa: 'Despesa já lançada', despesa_nova: 'Despesa nova', retirada: 'Retirada de sócia',
  reserva: 'Fundo de reserva', transferencia: 'Transferência entre contas', entrada: 'Outra entrada', ignorado: 'Não entra nas contas',
};
const ENTRADAS = [['rendimento', 'Rendimento da aplicação'], ['aporte_socias', 'Aporte das sócias'], ['reembolso', 'Reembolso'], ['emprestimo', 'Empréstimo'], ['outra', 'Outra entrada']];

// PDF em linhas: junta os pedaços de texto de cada linha da página (pela altura); colunas distantes ficam separadas por tabulação
export async function linhasDoPdf(arquivo) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const linhas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    const grupos = [];
    for (const it of c.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let g = grupos.find((z) => Math.abs(z.y - y) < 2.5);
      if (!g) { g = { y, itens: [] }; grupos.push(g); }
      g.itens.push({ x, fim: x + (it.width || 0), s: it.str });
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) {
      g.itens.sort((a, b) => a.x - b.x);
      let l = '', fim = null;
      for (const it of g.itens) { if (fim != null) l += it.x - fim > 8 ? '\t' : it.x - fim > 0.8 ? ' ' : ''; l += it.s; fim = it.fim; }
      linhas.push(l.replace(/\s+$/, ''));
    }
  }
  return linhas;
}

async function carregar() {
  const desde = F.somarDias(new Date().toISOString().slice(0, 10), -550);
  const [ext, movs, regras] = await Promise.all([
    sb.from('fin_extratos').select('*').order('periodo_ate', { ascending: false }),
    sb.from('fin_movimentos').select('*').gte('data', desde).order('data', { ascending: false }),
    sb.from('fin_regras_extrato').select('*').order('criado_em'),
  ]);
  const falta = [ext, movs, regras].some((r) => r.error && faltaScript(r.error));
  for (const r of [ext, movs, regras]) if (r.error && !faltaScript(r.error)) throw r.error;
  return { falta, extratos: ext.data || [], movimentos: movs.data || [], regras: regras.data || [] };
}

// ---------- sugestão e conferência de um movimento ----------
function sugestao(x, mov) {
  const { d } = x;
  if (mov.valor >= 0) {
    const regra = X.regraDoMovimento(mov, x.regras);
    if (regra) return { tipo: 'regra', regra, automatico: true };
    const todos = X.sugerirEntrada(mov, d.receber, { nome: (l) => d.empresa(l.empresa_id).nome, pagador: (l) => (d.plano(l.plano_id) || {}).pagador_nome || '', ligadas: x.ligR });
    if (!todos.length) return null;
    const c = todos[0];
    return { tipo: 'recebimento', cand: c, todos, automatico: c.ja_recebido && c.igual && (todos.length === 1 || todos[1].score < c.score) };
  }
  return X.sugerirSaida(mov, { despesas: d.despesas, ligadas: x.ligD, regras: x.regras, socias: d.socias });
}
function rotuloNota(d, c) {
  const l0 = c.linhas[0];
  return `${c.nota ? `Nota ${c.nota}` : esc(l0.descricao)} · ${esc(d.empresa(l0.empresa_id).nome)} · ${dinheiro(c.valor)}${c.ja_recebido ? ' (já marcada como recebida)' : ''}`;
}
function textoSugestao(x, s) {
  const { d } = x;
  if (s.tipo === 'regra') return `${ACOES[s.regra.acao === 'despesa' ? 'despesa_nova' : s.regra.acao]}${s.regra.descricao ? ` · ${esc(s.regra.descricao)}` : ''}${s.regra.pessoa_id ? ` · ${esc((d.pessoa(s.regra.pessoa_id) || {}).nome || '')}` : ''} <small class="apagado">(regra)</small>`;
  if (s.tipo === 'recebimento') return rotuloNota(d, s.cand);
  if (s.tipo === 'existente') return `Despesa lançada: ${esc(s.despesa.descricao)} (${dataBR(s.despesa.data)})`;
  if (s.tipo === 'nova') return `Despesa nova: ${esc(F.nomeCategoria(s.categoria))} · ${esc(s.descricao)}`;
  if (s.tipo === 'retirada') return `Retirada de ${esc(s.pessoa.nome)}`;
  return '';
}
// a escolha que a sugestão representa
function escolhaDe(s) {
  if (s.tipo === 'regra') {
    const r = s.regra;
    return { acao: r.acao === 'despesa' ? 'despesa_nova' : r.acao, regra_id: r.id, categoria: r.categoria, descricao: r.descricao, pessoa_id: r.pessoa_id, obs: r.observacao,
      onde: { empresa_id: r.empresa_id, turma_id: r.turma_id, programa_id: r.programa_id } };
  }
  if (s.tipo === 'recebimento') return { acao: 'recebimento', linhas: s.cand.linhas };
  if (s.tipo === 'existente') return { acao: 'despesa', despesa: s.despesa };
  if (s.tipo === 'nova') return { acao: 'despesa_nova', categoria: s.categoria, descricao: s.descricao, onde: {} };
  if (s.tipo === 'retirada') return { acao: 'retirada', pessoa_id: s.pessoa.id };
  return null;
}

async function mudarReserva(d, mudar) {
  const reserva = d.config.reserva || {};
  const lancs = Array.isArray(reserva.lancamentos) ? reserva.lancamentos : F.RESERVA_INICIAL;
  const nova = { ...reserva, lancamentos: mudar(lancs) };
  const { reserva: _, ...resto } = d.config;
  const { error } = await sb.from('configuracoes').upsert({ chave: 'financeiro', valor: { ...resto, reserva: nova } });
  if (error) throw error;
  d.config.reserva = nova;
}

async function aplicar(x, mov, e) {
  const { d } = x;
  const agora = new Date().toISOString();
  const reg = { situacao: 'conciliado', acao: e.acao, receber_ids: [], despesa_id: null, pessoa_id: e.pessoa_id || null, regra_id: e.regra_id || null,
    observacao: e.obs || null, desfazer: null, conciliado_por: d.eu, conciliado_em: agora };
  if (e.acao === 'recebimento') {
    const ls = e.linhas;
    reg.receber_ids = ls.map((l) => l.id);
    if (!ls.every((l) => l.situacao === 'recebido')) {
      reg.desfazer = { receber: ls.map((l) => ({ id: l.id, situacao: l.situacao, recebido_em: l.recebido_em || null, valor_recebido: l.valor_recebido ?? null })) };
      const partes = X.dividirRecebido(mov.valor, ls);
      for (const [i, l] of ls.entries()) {
        const mud = { situacao: 'recebido', recebido_em: mov.data, valor_recebido: partes[i], atualizado_em: agora };
        const { error } = await sb.from('fin_receber').update(mud).eq('id', l.id);
        if (error) throw error;
        Object.assign(l, mud);
      }
    }
    reg.receber_ids.forEach((id) => x.ligR.add(id));
  } else if (e.acao === 'despesa') {
    const dp = e.despesa;
    reg.despesa_id = dp.id;
    const mud = {};
    if (!dp.pago_em) mud.pago_em = mov.data;
    if (!dp.conta) mud.conta = mov.conta;
    if (Object.keys(mud).length) {
      reg.desfazer = { despesa: { id: dp.id, pago_em: dp.pago_em || null, conta: dp.conta || null } };
      const { error } = await sb.from('fin_despesas').update(mud).eq('id', dp.id);
      if (error) throw error;
      Object.assign(dp, mud);
    }
    x.ligD.add(dp.id);
  } else if (e.acao === 'despesa_nova') {
    const o = e.onde || {};
    const nova = { data: mov.data, descricao: e.descricao || mov.historico, valor: Math.abs(mov.valor), categoria: e.categoria || 'outros',
      empresa_id: o.empresa_id || null, turma_id: o.turma_id || null, programa_id: o.programa_id || null, modulo_id: o.modulo_id || null, pessoa_id: o.pessoa_id || null,
      pago_em: mov.data, conta: mov.conta, origem: 'extrato', observacoes: [mov.historico, mov.detalhe].filter(Boolean).join(' · ').slice(0, 300) };
    const { data, error } = await sb.from('fin_despesas').insert(nova).select('*').single();
    if (error) throw error;
    d.despesas.push(data);
    reg.despesa_id = data.id;
    reg.desfazer = { apagar_despesa: data.id };
    x.ligD.add(data.id);
  } else if (e.acao === 'reserva') {
    const id = `mov:${mov.id}`;
    await mudarReserva(d, (l) => [...l.filter((z) => z.id !== id), { id, data: mov.data, tipo: mov.valor < 0 ? 'aporte' : 'resgate', valor: Math.abs(mov.valor), obs: `Pelo extrato do ${mov.conta}`, em: agora }]);
    reg.desfazer = { reserva: id };
  }
  const { error } = await sb.from('fin_movimentos').update(reg).eq('id', mov.id);
  if (error) throw error;
  Object.assign(mov, reg);
}

async function desfazer(x, mov) {
  const u = mov.desfazer || {};
  for (const r of u.receber || []) {
    const { error } = await sb.from('fin_receber').update({ situacao: r.situacao, recebido_em: r.recebido_em, valor_recebido: r.valor_recebido, atualizado_em: new Date().toISOString() }).eq('id', r.id);
    if (error) throw error;
  }
  if (u.despesa) { const { error } = await sb.from('fin_despesas').update({ pago_em: u.despesa.pago_em, conta: u.despesa.conta }).eq('id', u.despesa.id); if (error) throw error; }
  if (u.apagar_despesa) { const { error } = await sb.from('fin_despesas').delete().eq('id', u.apagar_despesa); if (error) throw error; }
  if (u.reserva) await mudarReserva(x.d, (l) => l.filter((z) => z.id !== u.reserva));
  const { error } = await sb.from('fin_movimentos').update({ situacao: 'pendente', acao: null, receber_ids: [], despesa_id: null, pessoa_id: null, regra_id: null,
    observacao: null, desfazer: null, conciliado_por: null, conciliado_em: null }).eq('id', mov.id);
  if (error) throw error;
}

// O que a plataforma já sabe conferir sozinha (regras, despesa lançada com o mesmo valor, tarifas, recebimento já marcado)
async function conferirSozinho(x, movs) {
  let n = 0;
  for (const m of movs.filter((y) => y.situacao === 'pendente').sort((a, b) => a.data.localeCompare(b.data))) {
    const s = sugestao(x, m);
    if (!s || !s.automatico) continue;
    try { await aplicar(x, m, escolhaDe(s)); n++; } catch (e) { console.warn('conferir sozinho', e); }
  }
  return n;
}

// ---------- tela ----------
export async function abaExtratos(ctx, d, el, recarregar, params) {
  const e = await carregar();
  if (e.falta) { el.innerHTML = AVISO_56; return; }
  const x = { d, ...e, ligR: new Set(e.movimentos.flatMap((m) => m.receber_ids || [])), ligD: new Set(e.movimentos.map((m) => m.despesa_id).filter(Boolean)) };
  const filtro = ['conferidos', 'todos'].includes(params[0]) ? params[0] : 'conferir';
  const conta = params[1] || '';
  const ultimos = new Map();
  for (const ex of x.extratos) if (!ultimos.has(ex.conta) || ex.periodo_ate > ultimos.get(ex.conta).periodo_ate) ultimos.set(ex.conta, ex);
  const contas = [...new Set([...ultimos.keys(), ...x.movimentos.map((m) => m.conta)])].sort();
  const pend = x.movimentos.filter((m) => m.situacao === 'pendente');
  const lista = x.movimentos.filter((m) => (filtro === 'conferir' ? m.situacao === 'pendente' : filtro === 'conferidos' ? m.situacao === 'conciliado' : true) && (!conta || m.conta === conta));
  const sugs = new Map(lista.filter((m) => m.situacao === 'pendente').map((m) => [m.id, sugestao(x, m)]));
  const feito = (m) => {
    if (m.acao === 'recebimento') { const ls = d.receber.filter((l) => (m.receber_ids || []).includes(l.id)); return ls.length ? `${ls[0].nota_numero ? `Nota ${ls[0].nota_numero} · ` : ''}${esc(d.empresa(ls[0].empresa_id).nome)}` : ''; }
    if (m.acao === 'despesa' || m.acao === 'despesa_nova') { const dp = d.despesas.find((y) => y.id === m.despesa_id); return dp ? `${esc(dp.descricao)} · ${esc(F.nomeCategoria(dp.categoria))}` : ''; }
    if (m.acao === 'retirada') return esc((d.pessoa(m.pessoa_id) || {}).nome || '');
    return esc(m.observacao || '');
  };
  const hrefFiltro = (f, c = conta) => `#/financeiro/extratos/${f}${c ? `/${encodeURIComponent(c)}` : ''}`;

  el.innerHTML = `
    <div class="grade g3" style="margin-bottom:14px">
      ${contas.length ? contas.map((c) => { const u = ultimos.get(c); return `<div class="cartao numero"><b>${u && u.saldo_final != null ? dinheiro(u.saldo_final) : '—'}</b><span>${esc(c)}${u ? ` · saldo em ${dataBR(u.periodo_ate)}` : ''}</span></div>`; }).join('')
        : '<div class="cartao"><p class="apagado">Nenhum extrato importado ainda. Baixe o extrato do Sicoob e da Unicred no internet banking (PDF, ou OFX se tiver) e clique em "Importar extrato".</p></div>'}
    </div>
    <div class="linha" style="margin-bottom:10px">
      <a class="btn peq${filtro === 'conferir' ? ' escuro' : ''}" href="${hrefFiltro('conferir')}">Para conferir${pend.length ? ` (${pend.length})` : ''}</a>
      <a class="btn peq${filtro === 'conferidos' ? ' escuro' : ''}" href="${hrefFiltro('conferidos')}">Conferidos</a>
      <a class="btn peq${filtro === 'todos' ? ' escuro' : ''}" href="${hrefFiltro('todos')}">Todos</a>
      ${contas.length > 1 ? `<select id="ex-conta" aria-label="Conta"><option value="">Todas as contas</option>${contas.map((c) => `<option${c === conta ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      <span style="flex:1"></span><button class="btn pri" type="button" id="ex-importar">📄 Importar extrato</button>
    </div>
    ${lista.length ? `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Dia</th><th>O que o banco diz</th><th style="text-align:right">Valor</th><th>O que é</th><th></th></tr></thead><tbody>
      ${lista.map((m) => { const s = sugs.get(m.id); return `<tr>
        <td class="fn-num">${dataBR(m.data)}${contas.length > 1 ? `<br><small class="apagado">${esc(m.conta)}</small>` : ''}</td>
        <td>${esc(m.historico)}${m.detalhe ? `<br><small class="apagado">${esc(m.detalhe)}</small>` : ''}</td>
        <td class="fn-num" style="text-align:right;font-weight:700;color:${m.valor < 0 ? 'var(--erro)' : 'var(--ok)'}">${dinheiro(m.valor)}</td>
        <td>${m.situacao === 'conciliado' ? `<span class="selo ok">${esc(ACOES[m.acao] || 'Conferido')}</span> ${feito(m)}` : s ? `<span class="selo neutro">Sugestão</span> ${textoSugestao(x, s)}` : '<span class="apagado">—</span>'}</td>
        <td style="white-space:nowrap">${m.situacao === 'conciliado' ? `<button class="btn peq" type="button" data-desfazer="${m.id}">Desfazer</button>`
          : `${s ? `<button class="btn peq escuro" type="button" data-ok="${m.id}">Confirmar</button> ` : ''}<button class="btn peq${s ? '' : ' pri'}" type="button" data-abrir="${m.id}">${s ? 'Outra coisa' : 'Conferir'}</button>`}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="vazio">${filtro === 'conferir' ? (x.movimentos.length ? 'Tudo conferido. 🎉' : 'Nenhum movimento ainda: importe o primeiro extrato.') : 'Nada aqui.'}</div>`}
    <details class="cartao mt"><summary><b>Extratos importados</b> (${x.extratos.length})</summary>
      ${x.extratos.length ? `<div class="tabela mt"><table><tbody>${x.extratos.map((ex) => `<tr><td><b>${esc(ex.conta)}</b>${ex.numero_conta ? ` <small class="apagado">${esc(ex.numero_conta)}</small>` : ''}</td>
        <td>${dataBR(ex.periodo_de)} a ${dataBR(ex.periodo_ate)}</td><td>${ex.novos} novo${ex.novos === 1 ? '' : 's'} de ${ex.movimentos}</td>
        <td class="fn-num" style="text-align:right">${ex.saldo_final != null ? dinheiro(ex.saldo_final) : ''}</td>
        <td>${ex.caminho ? `<button class="btn peq" type="button" data-arquivo="${esc(ex.caminho)}">Arquivo</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="apagado mt">Nenhum.</p>'}
    </details>
    <details class="cartao mt"><summary><b>O que a plataforma já sabe conferir sozinha</b> (${x.regras.length} regra${x.regras.length === 1 ? '' : 's'})</summary>
      <p class="peq apagado mt">Além das regras abaixo: tarifas do banco, despesa já lançada com o mesmo valor (até 7 dias de diferença) e recebimento já marcado no mesmo dia. Uma regra nasce quando você marca "Lembrar" ao conferir.</p>
      ${x.regras.length ? `<div class="tabela mt"><table><tbody>${x.regras.map((r) => `<tr><td>Quando o extrato tiver <b>${esc(r.texto)}</b> (${r.sentido === 'entrada' ? 'entrada' : 'saída'})</td>
        <td>${esc(ACOES[r.acao === 'despesa' ? 'despesa_nova' : r.acao])}${r.categoria ? ` · ${esc(F.nomeCategoria(r.categoria))}` : ''}${r.descricao ? ` · ${esc(r.descricao)}` : ''}${r.pessoa_id ? ` · ${esc((d.pessoa(r.pessoa_id) || {}).nome || '')}` : ''}</td>
        <td><button class="btn peq" type="button" data-tirar-regra="${r.id}" aria-label="Apagar a regra">✕</button></td></tr>`).join('')}</tbody></table></div>` : ''}
    </details>`;

  const sel = el.querySelector('#ex-conta');
  if (sel) sel.addEventListener('change', () => { location.hash = hrefFiltro(filtro, sel.value); });
  el.querySelector('#ex-importar').addEventListener('click', () => janelaImportar(x, recarregar));
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const mov = x.movimentos.find((m) => m.id === (b.dataset.ok || b.dataset.abrir || b.dataset.desfazer));
    try {
      if (b.dataset.ok && mov) { b.disabled = true; await aplicar(x, mov, escolhaDe(sugs.get(mov.id))); avisar('Conferido.'); return recarregar(); }
      if (b.dataset.abrir && mov) return janelaMovimento(x, mov, sugs.get(mov.id), recarregar);
      if (b.dataset.desfazer && mov) {
        if (!confirm('Desfazer a conferência deste movimento? O que ela mudou volta como estava.')) return;
        await desfazer(x, mov); avisar('Desfeito.'); return recarregar();
      }
      if (b.dataset.tirarRegra) {
        if (!confirm('Apagar esta regra? O que já foi conferido com ela continua como está.')) return;
        const { error } = await sb.from('fin_regras_extrato').delete().eq('id', b.dataset.tirarRegra);
        if (error) throw error;
        return recarregar();
      }
      if (b.dataset.arquivo) {
        const { data, error } = await sb.storage.from('financeiro').createSignedUrl(b.dataset.arquivo, 600);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener');
      }
    } catch (er) { b.disabled = false; avisar(explicarErro(er), true); }
  });
}

// ---------- conferir um movimento ----------
function janelaMovimento(x, mov, s, recarregar) {
  const { d } = x;
  const entrada = mov.valor >= 0;
  const op = (v, rotulo, corpo = '', marcado = false) => `<div class="cartao" style="padding:10px 12px"><label class="check"><input type="radio" name="o" value="${v}"${marcado ? ' checked' : ''}><span><b>${rotulo}</b></span></label>
    ${corpo ? `<div class="mt" data-sub="${v}" hidden>${corpo}</div>` : ''}</div>`;
  const pre = s ? (s.tipo === 'regra' ? (s.regra.acao === 'despesa' ? 'despesa_nova' : s.regra.acao) : s.tipo === 'recebimento' ? 'recebimento' : s.tipo === 'existente' ? 'despesa' : s.tipo === 'nova' ? 'despesa_nova' : s.tipo) : '';
  let html = '';
  if (entrada) {
    const cands = X.sugerirEntrada(mov, d.receber, { nome: (l) => d.empresa(l.empresa_id).nome, pagador: (l) => (d.plano(l.plano_id) || {}).pagador_nome || '', ligadas: x.ligR });
    // todas as notas emitidas e linhas em aberto (para quando o valor não bate: imposto retido, juros, pagamento junto)
    const grupos = new Map();
    for (const l of d.receber.filter((y) => !x.ligR.has(y.id) && (y.situacao === 'faturado' || (y.situacao === 'aberto' && y.data && y.data <= F.somarDias(mov.data, 45))))) {
      const k = l.situacao === 'faturado' && l.nota_numero ? `n:${l.empresa_id}:${l.nota_numero}` : `l:${l.id}`;
      if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(l);
    }
    x.gruposNota = grupos;
    const outras = [...grupos.entries()].map(([k, ls]) => ({ k, ls, rot: `${ls[0].nota_numero && ls[0].situacao === 'faturado' ? `Nota ${ls[0].nota_numero}` : ls[0].descricao} · ${d.empresa(ls[0].empresa_id).nome} · ${dinheiro(F.soma(ls, (l) => l.valor))}` }))
      .sort((a, b) => a.rot.localeCompare(b.rot));
    x.candsNota = cands;
    html += op('recebimento', 'Recebimento de nota', `
      ${cands.length ? cands.slice(0, 6).map((c, i) => `<label class="check"><input type="radio" name="c" value="${i}"${i === 0 ? ' checked' : ''}><span>${rotuloNota(d, c)}${c.igual ? ' <span class="selo ok">valor igual</span>' : ''}</span></label>`).join('') : '<p class="peq apagado">Nenhuma nota com esse valor.</p>'}
      <label class="check"><input type="radio" name="c" value="outra"${cands.length ? '' : ' checked'}><span>Outra nota:</span></label>
      <select id="mv-outra" aria-label="Outra nota"><option value="">Escolha…</option>${outras.map((o) => `<option value="${esc(o.k)}">${esc(o.rot)}</option>`).join('')}</select>
      <small class="apagado">Se o valor for diferente (imposto retido, por exemplo), o que entrou é dividido entre as linhas da nota.</small>`, pre === 'recebimento');
    html += op('entrada', 'Outra entrada', `<select id="mv-tipo-entrada">${ENTRADAS.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select>`, pre === 'entrada');
    html += op('reserva', 'Resgate do fundo de reserva', '<small class="apagado">Sai do fundo de reserva e entra na conta.</small>', pre === 'reserva');
    html += op('transferencia', 'Transferência entre contas da Mentorei', '', pre === 'transferencia');
  } else {
    const v = Math.abs(mov.valor);
    const iguais = d.despesas.filter((y) => !x.ligD.has(y.id) && Math.abs(Number(y.valor) - v) < 0.01 && Math.abs(F.diasEntre(y.pago_em || y.data, mov.data)) <= 40)
      .sort((a, b) => Math.abs(F.diasEntre(a.pago_em || a.data, mov.data)) - Math.abs(F.diasEntre(b.pago_em || b.data, mov.data))).slice(0, 6);
    x.iguais = iguais;
    if (iguais.length) html += op('despesa', 'Despesa que já está lançada', iguais.map((y, i) => `<label class="check"><input type="radio" name="dp" value="${i}"${i === 0 ? ' checked' : ''}><span>${esc(y.descricao)} · ${dataBR(y.data)} · ${esc(F.nomeCategoria(y.categoria))}</span></label>`).join(''), pre === 'despesa');
    const sn = s && s.tipo === 'nova' ? s : s && s.tipo === 'regra' ? s.regra : {};
    html += op('despesa_nova', 'Despesa nova', `<div class="grade g2" style="gap:10px">
        <div class="campo"><label for="mv-cat">Tipo</label><select id="mv-cat">${F.CATEGORIAS.filter(([k]) => k !== 'socia').map(([k, n]) => `<option value="${k}"${k === (sn.categoria || 'outros') ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="campo"><label for="mv-onde">É de</label><select id="mv-onde">${d.opcoesOnde('g:')}</select></div></div>
      <div class="campo mt"><label for="mv-desc">Descrição</label><input type="text" id="mv-desc" maxlength="160" value="${esc(sn.descricao || [mov.historico, X.chaveSugerida(mov)].filter((t, i, a) => t && a.indexOf(t) === i).join(' · '))}"></div>`, pre === 'despesa_nova' || !pre);
    html += op('retirada', 'Retirada de sócia', `<select id="mv-socia">${d.socias.map((p) => `<option value="${p.id}"${s && s.tipo === 'retirada' && s.pessoa.id === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <small class="apagado">Entra na distribuição das sócias (etapa 4), não nas despesas.</small>`, pre === 'retirada');
    html += op('reserva', 'Aplicação no fundo de reserva', '<small class="apagado">Sai da conta e entra no fundo de reserva.</small>', pre === 'reserva');
    html += op('transferencia', 'Transferência entre contas da Mentorei', '', pre === 'transferencia');
  }
  html += op('ignorado', 'Não entra nas contas', '', pre === 'ignorado');
  const j = janela(`${entrada ? 'Entrada' : 'Saída'} de ${dinheiro(Math.abs(mov.valor))} · ${dataBR(mov.data)}`, `<form class="grade" style="gap:10px" novalidate>
    <p class="apagado">${esc(mov.conta)} · ${esc(mov.historico)}${mov.detalhe ? ` · ${esc(mov.detalhe)}` : ''}</p>
    ${html}
    <div class="campo"><label for="mv-obs">Observação</label><input type="text" id="mv-obs" maxlength="200"></div>
    <div id="mv-lembrar" hidden><label class="check"><input type="checkbox" id="mv-lembrar-ok"><span>Lembrar: quando o extrato tiver o texto abaixo, fazer isso sozinho</span></label>
      <input type="text" id="mv-texto" maxlength="120" value="${esc(X.chaveSugerida(mov))}" aria-label="Texto que o extrato tem" class="mt"></div>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 680 });
  const f = j.corpo.querySelector('form');
  const $ = (q) => f.querySelector(q);
  const mostrar = () => {
    const o = (f.querySelector('input[name="o"]:checked') || {}).value;
    f.querySelectorAll('[data-sub]').forEach((z) => { z.hidden = z.dataset.sub !== o; });
    $('#mv-lembrar').hidden = !o || o === 'recebimento' || o === 'despesa';
  };
  f.addEventListener('change', mostrar);
  mostrar();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const o = (f.querySelector('input[name="o"]:checked') || {}).value;
    if (!o) { avisar('Escolha o que é este movimento.', true); return; }
    const obs = $('#mv-obs').value.trim() || null;
    let e = { acao: o, obs };
    if (o === 'recebimento') {
      const c = (f.querySelector('input[name="c"]:checked') || {}).value;
      const linhas = c === 'outra' || c == null ? x.gruposNota.get($('#mv-outra').value) : x.candsNota[Number(c)].linhas;
      if (!linhas) { avisar('Escolha a nota.', true); return; }
      e.linhas = linhas;
    } else if (o === 'despesa') e.despesa = x.iguais[Number((f.querySelector('input[name="dp"]:checked') || {}).value || 0)];
    else if (o === 'despesa_nova') {
      const campos = d.camposOnde($('#mv-onde').value || 'g:', { categoria: $('#mv-cat').value });
      e = { ...e, categoria: campos.categoria, descricao: $('#mv-desc').value.trim() || mov.historico, onde: campos };
    } else if (o === 'retirada') e.pessoa_id = $('#mv-socia').value;
    else if (o === 'entrada') e.obs = [ENTRADAS.find(([k]) => k === $('#mv-tipo-entrada').value)[1], obs].filter(Boolean).join(' · ');
    try {
      const lembrar = !$('#mv-lembrar').hidden && $('#mv-lembrar-ok').checked;
      let regra = null;
      if (lembrar) {
        const texto = $('#mv-texto').value.trim();
        if (texto.length < 3) { avisar('Escreva o texto que o extrato tem (pelo menos 3 letras).', true); return; }
        const r = await sb.from('fin_regras_extrato').insert({ texto, sentido: entrada ? 'entrada' : 'saida', acao: e.acao === 'despesa_nova' ? 'despesa' : e.acao,
          categoria: e.categoria || null, descricao: e.descricao || null, empresa_id: (e.onde || {}).empresa_id || null, turma_id: (e.onde || {}).turma_id || null,
          programa_id: (e.onde || {}).programa_id || null, pessoa_id: e.pessoa_id || (e.onde || {}).pessoa_id || null, observacao: e.obs || null }).select('*').single();
        if (r.error) throw r.error;
        regra = r.data; x.regras.push(regra); e.regra_id = regra.id;
      }
      await aplicar(x, mov, e);
      const mais = regra ? await conferirSozinho(x, x.movimentos) : 0;
      j.fechar();
      avisar(mais ? `Conferido. A regra nova conferiu mais ${mais}.` : 'Conferido.');
      recarregar();
    } catch (er) { avisar(explicarErro(er), true); }
  });
}

// ---------- importar ----------
function janelaImportar(x, recarregar) {
  let importou = false;
  const j = janela('Importar extrato do banco', `<div class="grade" style="gap:12px">
    <p>Baixe o extrato no internet banking do <b>Sicoob</b> ou da <b>Unicred</b> (o PDF serve; OFX também) e escolha o arquivo aqui. Pode ser de qualquer período: o que já foi importado não repete.</p>
    <input type="file" id="ix-arq" accept=".pdf,.ofx,.qfx,application/pdf">
    <div id="ix-res" aria-live="polite"></div></div>`, { largura: 640, aoFechar: () => { if (importou) recarregar(); } });
  const res = j.corpo.querySelector('#ix-res');
  j.corpo.querySelector('#ix-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0];
    if (!arq) return;
    res.innerHTML = '<p class="apagado">Lendo o extrato…</p>';
    try {
      const ofx = /\.(ofx|qfx)$/i.test(arq.name);
      const r = X.lerExtrato(ofx ? { texto: await arq.text() } : { linhas: await linhasDoPdf(arq) });
      if (!r) { res.innerHTML = '<div class="aviso erro">Não reconheci este extrato. Por enquanto a plataforma lê o PDF do Sicoob, o PDF da Unicred e arquivos OFX. Mande o arquivo para o Claude ver.</div>'; return; }
      if (!r.movimentos.length) { res.innerHTML = '<div class="aviso">Não achei nenhum movimento neste extrato.</div>'; return; }
      const movs = X.comChaves(r.conta, r.movimentos);
      const ja = new Set();
      for (let i = 0; i < movs.length; i += 100) {
        const q = await sb.from('fin_movimentos').select('chave').in('chave', movs.slice(i, i + 100).map((m) => m.chave));
        if (q.error) throw q.error;
        (q.data || []).forEach((y) => ja.add(y.chave));
      }
      const novos = movs.filter((m) => !ja.has(m.chave));
      res.innerHTML = `<div class="cartao">
        <p><b>${esc(r.conta)}</b>${r.numero_conta ? ` · conta ${esc(r.numero_conta)}` : ''} · ${dataBR(r.de)} a ${dataBR(r.ate)}</p>
        <div class="tabela mt"><table><tbody>
          <tr><td>Saldo no começo</td><td class="fn-num" style="text-align:right">${dinheiro(r.saldo_inicial)}</td></tr>
          <tr><td>Entradas</td><td class="fn-num" style="text-align:right;color:var(--ok)">${dinheiro(r.entradas)}</td></tr>
          <tr><td>Saídas</td><td class="fn-num" style="text-align:right;color:var(--erro)">${dinheiro(r.saidas)}</td></tr>
          <tr class="fn-forte"><td>Saldo no fim</td><td class="fn-num" style="text-align:right">${dinheiro(r.saldo_final)}</td></tr></tbody></table></div>
        <p class="mt">${r.confere ? '<span class="selo ok">Os números batem com o saldo do banco</span>' : r.confere === false ? `<span class="selo erro">A soma não bate com o saldo do banco (diferença de ${dinheiro(r.diferenca)})</span> Importe assim mesmo e avise o Claude.` : ''}</p>
        <p class="mt">${movs.length} movimento${movs.length === 1 ? '' : 's'}: <b>${novos.length} novo${novos.length === 1 ? '' : 's'}</b>${ja.size ? `, ${ja.size} já estava${ja.size === 1 ? '' : 'm'} na plataforma` : ''}.</p>
        <div class="linha mt"><button class="btn pri" type="button" id="ix-ok">${novos.length ? `Importar ${novos.length}` : 'Guardar o saldo'}</button></div></div>`;
      res.querySelector('#ix-ok').addEventListener('click', async (e2) => {
        e2.target.disabled = true;
        res.querySelector('#ix-ok').textContent = 'Importando…';
        try {
          // o arquivo original fica guardado na pasta privada (se não der, importa mesmo assim)
          let caminho = `extratos/${X.normal(r.conta).replace(/[^a-z0-9]+/g, '-')}/${r.de}_${r.ate}_${Date.now()}.${ofx ? 'ofx' : 'pdf'}`;
          const up = await sb.storage.from('financeiro').upload(caminho, arq, { contentType: ofx ? 'application/x-ofx' : 'application/pdf' });
          if (up.error) { console.warn('arquivo do extrato', up.error); caminho = null; }
          const ex = await sb.from('fin_extratos').insert({ conta: r.conta, numero_conta: r.numero_conta, arquivo: arq.name, caminho, formato: r.formato, periodo_de: r.de, periodo_ate: r.ate,
            saldo_inicial: r.saldo_inicial, saldo_final: r.saldo_final, movimentos: movs.length, novos: novos.length }).select('*').single();
          if (ex.error) throw ex.error;
          const gravados = [];
          for (let i = 0; i < novos.length; i += 200) {
            const linhas = novos.slice(i, i + 200).map((m) => ({ extrato_id: ex.data.id, conta: r.conta, data: m.data, historico: m.historico, detalhe: m.detalhe || null, documento: m.documento || null, valor: m.valor, chave: m.chave, situacao: 'pendente', receber_ids: [] }));
            const q = await sb.from('fin_movimentos').upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true }).select('*');
            if (q.error) throw q.error;
            gravados.push(...(q.data || []));
          }
          importou = true;
          x.movimentos.push(...gravados);
          const sozinhos = await conferirSozinho(x, gravados);
          const faltam = gravados.length - sozinhos;
          res.innerHTML = `<div class="aviso ok">Importado: ${gravados.length} movimento${gravados.length === 1 ? '' : 's'}. A plataforma conferiu sozinha <b>${sozinhos}</b>${faltam ? `; faltam <b>${faltam}</b> para você conferir` : ''}.</div>
            <div class="linha mt"><button class="btn pri" type="button" data-fechar>Ver os movimentos</button></div>`;
        } catch (er) { avisar(explicarErro(er), true); e2.target.disabled = false; }
      });
    } catch (er) { console.error(er); res.innerHTML = `<div class="aviso erro">Não consegui ler o arquivo: ${esc(explicarErro(er))}</div>`; }
  });
}
