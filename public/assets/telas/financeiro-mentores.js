// Financeiro, etapa 2 (script 54): mentores parceiros. A Cintia (ou uma sócia) completa o cadastro financeiro de cada mentor,
// confere o valor de cada turma e programa em que ele está, e no fim do mês a plataforma soma as aulas e sessões dadas e calcula
// quanto pagar. Ela ajusta, aprova e marca como pago; ao pagar, cada turma/programa ganha a despesa "Mentores e parceiros" (entra
// na margem). Sócias não entram: recebem pela distribuição.
// Script 60 (31/10, pedido dela): a coordenação lança horas e trabalhos para qualquer mentor (fin_mentor_extras, uma linha cada no
// mês) e o MENTOR PASSA A VER o extrato do mês em #/notas (aulas, sessões, horas lançadas, valor da hora e total) para emitir a nota.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { dinheiro, linkWhats } from './vendas.js';
import * as F from '../financeiro-regras.js';
import { VERSAO as CONTRATO_VERSAO } from '../contrato-mentor.js';

const AVISO_54 = '<div class="aviso">Falta rodar o script <b>54-financeiro-recibos-mentores.sql</b> no Supabase (SQL Editor → New query → colar → Run).</div>';
const v2 = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2));
const num = (el) => (el.value === '' ? null : Number(el.value));
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const opcoesForma = (atual, vazio = '') => `${vazio ? `<option value="">${esc(vazio)}</option>` : ''}${Object.entries(F.FORMAS).map(([k, [n]]) => `<option value="${k}"${k === atual ? ' selected' : ''}>${esc(n)}</option>`).join('')}`;

async function carregar(d) {
  const [cad, vals, pags, mm, sess, ments, vinc] = await Promise.all([
    sb.from('fin_mentores').select('*'), sb.from('fin_mentor_valores').select('*'), sb.from('fin_pagamentos').select('*'),
    sb.from('modulo_mentores').select('mentor_id, modulo_id, com_deslocamento, viagem'),
    sb.from('sessoes').select('id, mentor_id, mentorado_id, data_hora, duracao_min, situacao').in('situacao', ['realizada', 'agendada', 'remarcada']),
    sb.from('mentorados').select('id, nome, programa_id'), sb.from('mentor_mentorado').select('mentor_id, mentorado_id'),
  ]);
  const falta = [cad, vals, pags].some((r) => r.error && faltaScript(r.error));
  for (const r of [cad, vals, pags, mm, sess, ments, vinc]) if (r.error && !faltaScript(r.error)) throw r.error;
  const m = {
    falta, cadastro: cad.data || [], valores: vals.data || [], pagamentos: pags.data || [], modMentores: mm.data || [],
    sessoes: sess.data || [], mentorados: ments.data || [], vinculos: vinc.data || [],
  };
  // quem recebe: mentores da equipe que não são da administração (as sócias são administração e recebem pela distribuição)
  // contrato de prestação de serviço (script 55): quem já assinou a versão atual
  const ct = await sb.from('contratos_mentor').select('perfil_id, aceito_em').eq('versao', CONTRATO_VERSAO);
  // notas fiscais e dados para pagamento que o próprio mentor envia (script 58)
  const [nf, dp] = await Promise.all([sb.from('fin_notas_mentor').select('*'), sb.from('mentor_pagamento_dados').select('*')]);
  m.notas = nf.error ? [] : nf.data || [];
  m.dadosMentor = (id) => (dp.error ? null : (dp.data || []).find((x) => x.perfil_id === id) || null);
  m.notaDoMes = (id, mes) => m.notas.filter((x) => x.perfil_id === id && x.mes_referencia === mes && x.situacao !== 'devolvida');
  m.contrato = (id) => (ct.error ? undefined : ((ct.data || []).find((x) => x.perfil_id === id) || null));
  // horas e trabalhos lançados pela coordenação e recados dos mentores (script 60)
  const [ex, rc] = await Promise.all([sb.from('fin_mentor_extras').select('*').order('data'), sb.from('fin_mentor_recados').select('*').order('criado_em')]);
  m.sem60 = !!(ex.error && faltaScript(ex.error));
  m.extras = ex.error ? [] : ex.data || [];
  m.recados = rc.error ? [] : rc.data || [];
  m.extrasDoMes = (id, mes) => m.extras.filter((x) => x.perfil_id === id && x.mes === mes);
  m.parceiros = d.perfis.filter((p) => p.papel === 'mentor' && p.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  m.cad = (id) => m.cadastro.find((c) => c.perfil_id === id) || null;
  m.mentorado = (id) => m.mentorados.find((x) => x.id === id) || null;
  return m;
}

const rotuloTurma = (d, id) => { const t = d.turmas.find((x) => x.id === id); return t ? `${d.empresa(t.empresa_id).nome} · ${t.nome}` : 'Turma'; };
const rotuloPrograma = (d, id) => { const p = d.programas.find((x) => x.id === id); return p ? `${d.empresa(p.empresa_id).nome} · ${p.nome}` : 'Mentoria individual'; };

// Onde o mentor está: turmas (módulos em que dá aula) e programas (mentorados que acompanha ou sessões que deu)
function alocacoes(d, m, perfilId) {
  const turmas = new Set(), programas = new Set();
  for (const x of m.modMentores.filter((y) => y.mentor_id === perfilId)) { const mod = d.modulo(x.modulo_id); if (mod) turmas.add(mod.turma_id); }
  for (const s of m.sessoes.filter((y) => y.mentor_id === perfilId)) { const mt = m.mentorado(s.mentorado_id); if (mt && mt.programa_id) programas.add(mt.programa_id); }
  for (const v of m.vinculos.filter((y) => y.mentor_id === perfilId)) { const mt = m.mentorado(v.mentorado_id); if (mt && mt.programa_id) programas.add(mt.programa_id); }
  return [...[...turmas].map((id) => ({ chave: `t:${id}`, turma_id: id, rotulo: rotuloTurma(d, id) })), ...[...programas].map((id) => ({ chave: `p:${id}`, programa_id: id, rotulo: rotuloPrograma(d, id) }))]
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}
const valorDe = (m, perfilId, chave) => m.valores.find((v) => v.perfil_id === perfilId && (chave.startsWith('t:') ? v.turma_id === chave.slice(2) : v.programa_id === chave.slice(2))) || null;

// Aulas e sessões que o mentor deu no mês (só o que já aconteceu). previsto = também as aulas e sessões marcadas (previsão do
// painel da Visão geral).
function itensDoMes(d, m, perfilId, mes, previsto = false) {
  const hoje = hojeISO();
  const itens = [];
  for (const x of m.modMentores.filter((y) => y.mentor_id === perfilId)) {
    const mod = d.modulo(x.modulo_id); const dia = mod && F.diaDe(mod.data_hora);
    if (!dia || F.mesDe(dia) !== mes || (dia > hoje && !previsto)) continue;
    itens.push({ chave: `t:${mod.turma_id}`, rotulo: rotuloTurma(d, mod.turma_id), tipo: 'modulo', data: dia, minutos: mod.duracao_min || 0 });
  }
  for (const s of m.sessoes.filter((y) => y.mentor_id === perfilId)) {
    const dia = F.diaDe(s.data_hora); const mt = m.mentorado(s.mentorado_id);
    if (!dia || F.mesDe(dia) !== mes || !mt || (s.situacao !== 'realizada' && !(previsto && dia >= hoje))) continue;
    // sessão sem duração anotada = 1 hora (a base do Isaac era por atendimento: uma sessão = uma hora); o mesmo no extrato do mentor
    itens.push({ chave: `p:${mt.programa_id}`, rotulo: rotuloPrograma(d, mt.programa_id), tipo: 'sessao', data: dia, minutos: s.duracao_min || 60 });
  }
  return itens;
}

export async function abaMentores(ctx, d, el, recarregar, params) {
  const m = await carregar(d);
  if (m.falta) { el.innerHTML = AVISO_54; return; }
  const vista = params[0] === 'pagamentos' ? 'pagamentos' : 'cadastro';
  el.innerHTML = `<div class="linha" style="margin-bottom:12px">
      <button class="btn${vista === 'cadastro' ? ' escuro' : ''}" type="button" data-vista="cadastro">Cadastro financeiro</button>
      <button class="btn${vista === 'pagamentos' ? ' escuro' : ''}" type="button" data-vista="pagamentos">Pagamento do mês</button></div><div id="mt-conteudo"></div>`;
  el.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/financeiro/mentores/${b.dataset.vista}`; }));
  const alvo = el.querySelector('#mt-conteudo');
  if (vista === 'pagamentos') return pagamentos(d, m, alvo, recarregar, params[1]);
  return cadastro(d, m, alvo, recarregar);
}

// ---------- cadastro ----------
function cadastro(d, m, el, recarregar) {
  const linha = (p) => {
    const c = m.cad(p.id); const al = alocacoes(d, m, p.id);
    const conferidos = al.filter((a) => { const v = valorDe(m, p.id, a.chave); return v && v.conferido_em; }).length;
    return `<tr><td><b>${esc(p.nome)}</b></td>
      <td>${c && c.valor != null ? `${esc(F.nomeForma(c.forma))} · ${c.forma === 'percentual' ? `${c.valor}%` : dinheiro(c.valor)}` : '<span class="selo alerta">Completar o cadastro</span>'}</td>
      <td>${c && c.cidade_saida ? esc(c.cidade_saida) : '<span class="apagado">—</span>'}</td>
      <td>${al.length ? `${conferidos} de ${al.length} conferidas` : '<span class="apagado">nenhuma</span>'}</td>
      <td>${(() => { const ct = m.contrato(p.id); return ct === undefined ? '<span class="apagado">—</span>' : ct && ct.aceito_em ? `<span class="selo ok">assinado ${esc(dataBR(ct.aceito_em))}</span>` : '<a class="selo alerta" href="#/contrato">não assinou</a>'; })()}</td>
      <td><button class="btn peq${c ? '' : ' pri'}" type="button" data-editar="${p.id}">${c ? 'Abrir' : 'Completar'}</button></td></tr>`;
  };
  el.innerHTML = `<p class="apagado" style="margin-bottom:10px">Mentores parceiros (as sócias recebem pela distribuição e não entram aqui). O mentor não vê esta tela.</p>
    ${m.parceiros.length ? `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Mentor</th><th>Como recebe</th><th>Sai de</th><th>Turmas e mentorias</th><th>Contrato</th><th></th></tr></thead>
      <tbody>${m.parceiros.map(linha).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum mentor parceiro cadastrado.</div>'}`;
  el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-editar]'); if (b) janelaCadastro(d, m, m.parceiros.find((p) => p.id === b.dataset.editar), recarregar); });
}

function janelaCadastro(d, m, p, recarregar) {
  const c = m.cad(p.id) || { ...F.BASE_ISAAC };   // cadastro novo já vem com a base do Isaac (decisão dela, 30/10)
  const al = alocacoes(d, m, p.id);
  // o que o próprio mentor informou em "Notas fiscais" (script 58) completa o que está vazio aqui
  const dm = (m.dadosMentor && m.dadosMentor(p.id)) || {};
  if (!c.nome_pagamento && dm.nome_pagamento) c.nome_pagamento = dm.nome_pagamento;
  if (!c.documento && dm.documento) c.documento = dm.documento;
  if (!c.pix && dm.pix) c.pix = dm.pix;
  const j = janela(`Cadastro financeiro · ${p.nome}`, `<form class="grade" style="gap:12px" novalidate>
    ${dm.perfil_id ? `<div class="aviso ok">O mentor informou: ${esc(dm.nome_pagamento || '')} · ${esc(dm.tipo === 'pf' ? 'CPF' : 'CNPJ')} ${esc(dm.documento || '')} · PIX (${esc(dm.pix_tipo || '')}) ${esc(dm.pix || '')}${dm.banco ? ` · ${esc(dm.banco)} ag. ${esc(dm.agencia || '')} conta ${esc(dm.conta || '')}` : ''} · atualizado em ${dataBR(dm.atualizado_em)}</div>` : ''}
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="c-forma">Como recebe</label><select id="c-forma">${opcoesForma(c.forma)}</select></div>
      <div class="campo"><label for="c-valor">Valor (R$ ou %)</label><input type="number" id="c-valor" min="0" step="0.01" value="${v2(c.valor)}"></div>
      <div class="campo"><label for="c-cidade">Cidade de onde sai</label><input type="text" id="c-cidade" maxlength="80" placeholder="Ex.: Campinas (SP)" value="${esc(c.cidade_saida || '')}"></div>
    </div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="c-nome">Nome ou razão social para pagar</label><input type="text" id="c-nome" maxlength="160" value="${esc(c.nome_pagamento || '')}"></div>
      <div class="campo"><label for="c-doc">CPF ou CNPJ</label><input type="text" id="c-doc" maxlength="20" value="${esc(c.documento || '')}"></div>
      <div class="campo"><label for="c-pix">Chave PIX</label><input type="text" id="c-pix" maxlength="120" value="${esc(c.pix || '')}"></div>
    </div>
    <label class="check"><input type="checkbox" id="c-nota"${c.emite_nota ? ' checked' : ''}><span>Emite nota fiscal para a Mentorei</span></label>
    <div class="campo"><label for="c-obs">Observações</label><textarea id="c-obs" rows="2">${esc(c.observacoes || '')}</textarea></div>
    <h3>Valor em cada turma e mentoria</h3>
    ${al.length ? `<p class="peq apagado">Vazio = o valor padrão acima. Marque "Conferido" depois de olhar o combinado com o cliente.</p>
      <div class="tabela"><table><thead><tr><th>Turma ou mentoria</th><th>Como recebe</th><th>Valor</th><th>Conferido</th></tr></thead><tbody>
      ${al.map((a, i) => { const v = valorDe(m, p.id, a.chave) || {}; return `<tr><td>${esc(a.rotulo)}</td>
        <td><select data-i="${i}" data-c="forma" aria-label="Como recebe">${opcoesForma(v.forma || '', 'o padrão')}</select></td>
        <td><input type="number" data-i="${i}" data-c="valor" min="0" step="0.01" value="${v2(v.valor)}" style="max-width:120px" aria-label="Valor"></td>
        <td><input type="checkbox" data-i="${i}" data-c="conferido"${v.conferido_em ? ' checked' : ''} aria-label="Conferido"></td></tr>`; }).join('')}</tbody></table></div>`
      : '<p class="apagado">Ainda não está em nenhuma turma ou mentoria.</p>'}
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 820 });
  const f = j.corpo.querySelector('form');
  const $ = (s) => f.querySelector(s);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const agora = new Date().toISOString();
    const corpo = { perfil_id: p.id, forma: $('#c-forma').value, valor: num($('#c-valor')), cidade_saida: $('#c-cidade').value.trim() || null,
      nome_pagamento: $('#c-nome').value.trim() || null, documento: $('#c-doc').value.trim() || null, pix: $('#c-pix').value.trim() || null,
      emite_nota: $('#c-nota').checked, observacoes: $('#c-obs').value.trim() || null, atualizado_em: agora, conferido_em: agora, conferido_por: d.eu };
    try {
      let r = await sb.from('fin_mentores').upsert(corpo, { onConflict: 'perfil_id' }); if (r.error) throw r.error;
      for (const [i, a] of al.entries()) {
        const ler = (c) => f.querySelector(`[data-i="${i}"][data-c="${c}"]`);
        const forma = ler('forma').value || null, valor = num(ler('valor')), conf = ler('conferido').checked;
        const antigo = valorDe(m, p.id, a.chave);
        if (!antigo && !forma && valor == null && !conf) continue;
        const reg = { perfil_id: p.id, turma_id: a.turma_id || null, programa_id: a.programa_id || null, forma, valor, atualizado_em: agora,
          conferido_em: conf ? (antigo && antigo.conferido_em) || agora : null, conferido_por: conf ? (antigo && antigo.conferido_por) || d.eu : null };
        r = antigo ? await sb.from('fin_mentor_valores').update(reg).eq('id', antigo.id) : await sb.from('fin_mentor_valores').insert(reg);
        if (r.error) throw r.error;
      }
      j.fechar(); avisar('Cadastro salvo.'); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

// Cálculo do mês de um mentor pelo cadastro e pelos valores combinados de cada turma/programa
function calcularMes(d, m, perfilId, mes, previsto = false) {
  const c = m.cad(perfilId);
  const extras = F.linhasExtras(m.extrasDoMes(perfilId, mes), c ? { forma: c.forma, valor: c.valor } : null);
  const faturadoTurma = (chave) => (chave.startsWith('t:') ? F.soma(d.receber.filter((l) => l.situacao !== 'cancelado' && F.mesDe(l.data) === mes && (d.plano(l.plano_id) || {}).turma_id === chave.slice(2)), (l) => l.valor) : 0);
  const calc = F.calcularPagamento(itensDoMes(d, m, perfilId, mes, previsto), {
    padrao: c ? { forma: c.forma, valor: c.valor } : null,
    regra: (chave) => { const v = valorDe(m, perfilId, chave); return v && (v.forma || v.valor != null) ? { forma: v.forma || (c && c.forma) || 'hora', valor: v.valor != null ? v.valor : c && c.valor } : null; },
    faturado: faturadoTurma,
  });
  const linhas = [...calc.linhas, ...extras];
  return { linhas, total: F.soma(linhas, (l) => l.total) };
}

// ---------- pagamento do mês ----------
function pagamentos(d, m, el, recarregar, mesParam) {
  const hoje = hojeISO();
  // padrão: o mês passado até o dia 10; depois, o mês atual
  const mes = /^\d{4}-\d{2}$/.test(mesParam || '') ? mesParam : Number(hoje.slice(8, 10)) <= 10 ? F.somarMeses(hoje.slice(0, 7), -1) : hoje.slice(0, 7);
  const cartoes = m.parceiros.map((p) => {
    const salvo = m.pagamentos.find((x) => x.perfil_id === p.id && x.mes === mes) || null;
    const c = m.cad(p.id);
    const calc = calcularMes(d, m, p.id, mes);
    return { p, c, salvo, calc, linhas: salvo ? salvo.linhas : calc.linhas, total: salvo ? Number(salvo.total) : calc.total };
  }).map((x) => ({ ...x, notas: m.notaDoMes(x.p.id, mes), recados: m.recados.filter((r) => r.perfil_id === x.p.id && r.mes === mes) }))
    .filter((x) => x.salvo || x.calc.linhas.length || x.notas.length || x.recados.length);
  const selo = (x) => (!x.salvo ? '<span class="selo neutro">calculado</span>' : x.salvo.situacao === 'pago' ? `<span class="selo ok">pago em ${dataBR(x.salvo.pago_em)}</span>` : x.salvo.situacao === 'aprovado' ? '<span class="selo alerta">aprovado, falta pagar</span>' : '<span class="selo neutro">ajustado</span>');
  const unidade = (l) => (l.forma === 'hora' ? `${String(l.horas).replace('.', ',')} h` : l.forma === 'percentual' ? `${l.valor_unit ?? '?'}% do faturado` : l.forma === 'mensal' ? 'mensal' : `${l.quantidade} ${(F.FORMAS[l.forma] || F.FORMAS.atendimento)[l.quantidade === 1 ? 1 : 2]}`);
  el.innerHTML = `
    <div class="linha" style="margin-bottom:14px">
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, -1)}" aria-label="Mês anterior">‹</button>
      <h2 style="margin:0">${maiuscula(F.nomeMes(mes))}</h2>
      <button class="btn peq" type="button" data-mes="${F.somarMeses(mes, 1)}" aria-label="Mês seguinte">›</button>
      <span style="flex:1"></span><b>${dinheiro(F.soma(cartoes, (x) => x.total))}</b>
    </div>
    <p class="apagado" style="margin-bottom:10px">Somado pelas aulas (módulos) e sessões realizadas no mês, mais as horas lançadas aqui. Confira, ajuste se precisar, aprove e marque como pago: o pagamento vira despesa de cada turma e mentoria. <b>O mentor vê este extrato</b> (em Notas fiscais) para emitir a nota.</p>
    ${m.sem60 ? '<div class="aviso" style="margin-bottom:10px">Falta rodar o script <b>60-extrato-do-mentor.sql</b> no Supabase para lançar horas e o mentor ver o extrato.</div>' : '<div class="linha" style="margin-bottom:12px"><button class="btn" type="button" data-extra-novo="">+ Lançar horas ou trabalho para um mentor</button></div>'}
    ${cartoes.length ? cartoes.map((x) => `<div class="cartao" style="margin-bottom:12px">
      <div class="linha"><h3 style="flex:1">${esc(x.p.nome)}</h3>${selo(x)}<b>${dinheiro(x.total)}</b></div>
      ${x.notas.map((n) => { const dif = F.arred(Number(n.valor) - x.total); return `<div class="aviso mt${Math.abs(dif) < 0.01 ? ' ok' : ''}">Nota fiscal enviada pelo mentor: <b>${dinheiro(n.valor)}</b>${n.numero ? ` (nº ${esc(n.numero)})` : ''} · pagamento previsto ${dataBR(n.pagar_em || n.pagamento_previsto)}${Math.abs(dif) < 0.01 ? ' · confere com o calculado' : ` · <b>diferença de ${dinheiro(dif)}</b> do calculado`}${n.situacao === 'paga' ? ' · paga' : ''}</div>`; }).join('')}
      ${x.recados.map((r) => `<div class="aviso mt">Recado do mentor (${dataBR(r.criado_em)}): ${esc(r.texto)}${r.resposta ? `<br><small>Resposta: ${esc(r.resposta)}</small>` : ''}</div>`).join('')}
      ${!x.c ? '<div class="aviso mt">Sem cadastro financeiro: o valor ficou zerado. <button class="btn peq" type="button" data-cadastro="' + x.p.id + '">Completar o cadastro</button></div>' : ''}
      <div class="tabela mt"><table><thead><tr><th>Turma ou mentoria</th><th>Quanto</th><th style="text-align:right">Valor</th><th style="text-align:right">Total</th></tr></thead><tbody>
        ${x.linhas.map((l) => `<tr><td>${esc(l.rotulo)}${l.extra ? ` <span class="selo neutro">lançado pela coordenação${l.datas && l.datas[0] ? ` · ${dataBR(l.datas[0])}` : ''}</span>${!x.salvo || x.salvo.situacao !== 'pago' ? ` <button class="btn peq" type="button" data-extra-tirar="${esc(l.extra_id)}" data-quem="${x.p.id}" aria-label="Tirar este lançamento">✕</button>` : ''}` : ''}${l.sem_valor ? ' <span class="selo alerta">sem valor da hora</span>' : ''}${l.combinado ? ' <span class="selo neutro">valor combinado</span>' : ''}${l.sem_duracao ? ` <span class="selo alerta">${l.sem_duracao} sem duração</span>` : ''}${l.ajuste ? `<br><small class="apagado">ajuste: ${esc(l.ajuste)}</small>` : ''}</td>
          <td>${esc(unidade(l))}</td><td class="fn-num" style="text-align:right">${l.forma === 'percentual' ? '' : dinheiro(l.valor_unit)}</td><td class="fn-num" style="text-align:right">${l.coberto_pelo_mensal ? '<small class="apagado">no mensal</small>' : dinheiro(l.total)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="linha mt">
        ${!x.salvo || x.salvo.situacao === 'aberto' ? `<button class="btn peq" type="button" data-ajustar="${x.p.id}">Ajustar</button><button class="btn peq escuro" type="button" data-aprovar="${x.p.id}">Aprovar</button>` : ''}
        ${x.salvo && x.salvo.situacao === 'aprovado' ? `<button class="btn peq escuro" type="button" data-pagar="${x.p.id}">Marcar como pago</button><button class="btn peq" type="button" data-reabrir="${x.p.id}">Reabrir</button>` : ''}
        ${x.salvo && x.salvo.situacao === 'pago' ? `<button class="btn peq" type="button" data-desfazer="${x.p.id}">Desfazer o pagamento</button>` : ''}
        ${x.salvo && x.salvo.situacao !== 'pago' ? `<button class="btn peq" type="button" data-recalcular="${x.p.id}">Recalcular</button>` : ''}
        ${m.sem60 || (x.salvo && x.salvo.situacao === 'pago') ? '' : `<button class="btn peq" type="button" data-extra-novo="${x.p.id}">+ Horas ou trabalho</button>`}
        <span style="flex:1"></span><button class="btn peq" type="button" data-extrato="${x.p.id}">Extrato para o mentor</button>
      </div></div>`).join('') : '<div class="vazio">Nenhuma aula ou sessão de mentor parceiro neste mês.</div>'}`;
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/financeiro/mentores/pagamentos/${b.dataset.mes}`; }));
  const achar = (id) => cartoes.find((x) => x.p.id === id);
  const salvar = async (x, extra) => {
    const corpo = { perfil_id: x.p.id, mes, linhas: x.linhas, total: F.soma(x.linhas, (l) => l.total), atualizado_em: new Date().toISOString(), ...extra };
    const r = x.salvo ? await sb.from('fin_pagamentos').update(corpo).eq('id', x.salvo.id) : await sb.from('fin_pagamentos').insert(corpo);
    if (r.error) throw r.error;
  };
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.extraNovo != null) return janelaExtra(d, m, mes, b.dataset.extraNovo || null, cartoes, recarregar);
    if (b.dataset.extraTirar) {
      if (!confirm('Tirar este lançamento? O mentor deixa de ver no extrato dele.')) return;
      try {
        const { error } = await sb.from('fin_mentor_extras').delete().eq('id', b.dataset.extraTirar);
        if (error) throw error;
        const x = achar(b.dataset.quem);
        if (x && x.salvo && x.salvo.situacao !== 'pago') { x.linhas = x.linhas.filter((l) => l.extra_id !== b.dataset.extraTirar); await salvar(x, {}); }
        avisar('Lançamento tirado.'); return recarregar();
      } catch (e) { return avisar(explicarErro(e), true); }
    }
    const id = b.dataset.ajustar || b.dataset.aprovar || b.dataset.pagar || b.dataset.reabrir || b.dataset.desfazer || b.dataset.recalcular || b.dataset.extrato || b.dataset.cadastro;
    const x = id && achar(id);
    try {
      if (b.dataset.cadastro) return janelaCadastro(d, m, m.parceiros.find((p) => p.id === id), recarregar);
      if (!x) return;
      if (b.dataset.ajustar) return janelaAjuste(x, mes, salvar, recarregar);
      if (b.dataset.aprovar) { await salvar(x, { situacao: 'aprovado', aprovado_em: new Date().toISOString(), aprovado_por: d.eu }); avisar('Pagamento aprovado.'); return recarregar(); }
      if (b.dataset.reabrir) { await salvar(x, { situacao: 'aberto', aprovado_em: null, aprovado_por: null }); return recarregar(); }
      if (b.dataset.recalcular) { x.linhas = x.calc.linhas; await salvar(x, { situacao: 'aberto' }); avisar('Recalculado pelas aulas e sessões do mês.'); return recarregar(); }
      if (b.dataset.pagar) return janelaPagar(d, x, mes, recarregar);
      if (b.dataset.desfazer) {
        if (x.salvo.despesas && x.salvo.despesas.length) { const r = await sb.from('fin_despesas').delete().in('id', x.salvo.despesas); if (r.error) throw r.error; }
        await salvar(x, { situacao: 'aprovado', pago_em: null, despesas: [] });
        const pagas = x.notas.filter((n) => n.situacao === 'paga').map((n) => n.id);
        if (pagas.length) await sb.from('fin_notas_mentor').update({ situacao: 'conferida', pago_em: null }).in('id', pagas);
        avisar('Pagamento desfeito: as despesas saíram.'); return recarregar();
      }
      if (b.dataset.extrato) {
        const texto = F.textoExtrato({ nome: x.p.nome, mes, linhas: x.linhas, total: x.total });
        const pf = d.perfis.find((y) => y.id === x.p.id) || {};
        janela(`Extrato de ${x.p.nome}`, `<textarea rows="10" style="width:100%" readonly>${esc(texto)}</textarea>
          <div class="linha mt"><button class="btn pri" type="button" id="ex-copiar">Copiar</button>${pf.whatsapp ? `<a class="btn" target="_blank" rel="noopener" href="${esc(linkWhats(pf.whatsapp, texto))}">Abrir no WhatsApp</a>` : ''}</div>`, { largura: 560 })
          .corpo.querySelector('#ex-copiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(texto); avisar('Extrato copiado.'); } catch (_) { avisar('Selecione o texto e copie.', true); } });
      }
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

// Horas ou trabalho que a coordenação lança para um mentor (script 60): entra no mês como uma linha própria e aparece no extrato dele
function janelaExtra(d, m, mes, perfilId, cartoes, recarregar) {
  const opcoesTurma = [...d.turmas].sort((a, b) => rotuloTurma(d, a.id).localeCompare(rotuloTurma(d, b.id))).map((t) => `<option value="t:${t.id}">${esc(rotuloTurma(d, t.id))}</option>`).join('');
  const opcoesProg = d.programas.map((p) => `<option value="p:${p.id}">${esc(rotuloPrograma(d, p.id))}</option>`).join('');
  const j = janela(`Lançar horas ou trabalho · ${F.nomeMes(mes)}`, `<form class="grade" style="gap:12px" novalidate>
    <p class="apagado">Para o que não está na agenda (preparação, reunião com o cliente, conteúdo, aula extra). Entra no pagamento de ${esc(F.nomeMes(mes))} e o mentor vê no extrato dele, com a descrição.</p>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="ex-quem">Mentor *</label><select id="ex-quem"><option value="">Escolha…</option>${m.parceiros.map((p) => `<option value="${p.id}"${p.id === perfilId ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="ex-dia">Dia</label><input type="date" id="ex-dia" value="${hojeISO().slice(0, 7) === mes ? hojeISO() : `${mes}-01`}"></div>
    </div>
    <div class="campo"><label for="ex-desc">Descrição do trabalho * <small class="apagado">(o mentor vê)</small></label><input type="text" id="ex-desc" maxlength="300" placeholder="Ex.: Preparação do módulo 3 da Sicredi Expansão"></div>
    <div class="campo"><label for="ex-de">É de qual turma ou mentoria? <small class="apagado">(entra na margem dela)</small></label><select id="ex-de"><option value="">Mentorei em geral</option><optgroup label="Turmas">${opcoesTurma}</optgroup><optgroup label="Mentorias">${opcoesProg}</optgroup></select></div>
    <div class="campo"><label>Como calcular</label><div class="linha">
      <label><input type="radio" name="ex-modo" value="horas" checked> Horas × valor da hora</label>
      <label><input type="radio" name="ex-modo" value="valor"> Valor fechado</label></div></div>
    <div class="grade g2" style="gap:10px" id="ex-horas">
      <div class="campo"><label for="ex-h">Horas *</label><input type="number" id="ex-h" min="0.25" step="0.25" inputmode="decimal"></div>
      <div class="campo"><label for="ex-vh">Valor da hora (R$)</label><input type="number" id="ex-vh" min="0" step="0.01" inputmode="decimal"><small class="apagado" id="ex-vh-dica"></small></div>
    </div>
    <div class="campo" id="ex-valor" hidden><label for="ex-v">Valor (R$) *</label><input type="number" id="ex-v" min="0" step="0.01" inputmode="decimal"></div>
    <p><b id="ex-total"></b></p>
    <div class="linha"><button class="btn pri" type="submit">Lançar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 620 });
  const f = j.corpo.querySelector('form');
  const $ = (s) => f.querySelector(s);
  const modo = () => (f.querySelector('input[name="ex-modo"]:checked') || {}).value;
  const atualizar = () => {
    const c = m.cad($('#ex-quem').value);
    const doCadastro = c && c.forma === 'hora' && c.valor != null ? Number(c.valor) : null;
    if (!$('#ex-vh').dataset.mexeu) $('#ex-vh').value = doCadastro != null ? v2(doCadastro) : '';
    $('#ex-vh-dica').textContent = doCadastro != null ? `do cadastro: ${dinheiro(doCadastro)}` : c ? `o cadastro é ${F.nomeForma(c.forma).toLowerCase()}: escreva o valor da hora` : '';
    $('#ex-horas').hidden = modo() !== 'horas'; $('#ex-valor').hidden = modo() !== 'valor';
    const total = modo() === 'valor' ? Number($('#ex-v').value || 0) : F.arred(Number($('#ex-h').value || 0) * Number($('#ex-vh').value || 0));
    $('#ex-total').textContent = total ? `Total: ${dinheiro(total)}` : '';
  };
  f.addEventListener('input', (ev) => { if (ev.target.id === 'ex-vh') ev.target.dataset.mexeu = '1'; atualizar(); });
  f.addEventListener('change', (ev) => { if (ev.target.id === 'ex-quem') delete $('#ex-vh').dataset.mexeu; atualizar(); });
  atualizar();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const quem = $('#ex-quem').value, desc = $('#ex-desc').value.trim(), de = $('#ex-de').value;
    if (!quem) return avisar('Escolha o mentor.', true);
    if (!desc) return avisar('Escreva a descrição do trabalho: o mentor vê no extrato.', true);
    const reg = { perfil_id: quem, mes, data: $('#ex-dia').value || null, descricao: desc, turma_id: de.startsWith('t:') ? de.slice(2) : null, programa_id: de.startsWith('p:') ? de.slice(2) : null };
    if (modo() === 'valor') { const v = num($('#ex-v')); if (!(v > 0)) return avisar('Escreva o valor.', true); reg.valor = v; }
    else {
      const h = num($('#ex-h')), vh = num($('#ex-vh'));
      if (!(h > 0)) return avisar('Escreva as horas.', true);
      if (vh == null) return avisar('Escreva o valor da hora.', true);
      reg.horas = h; reg.valor_hora = vh;
    }
    if (reg.data && reg.data.slice(0, 7) !== mes) return avisar(`O dia precisa ser de ${F.nomeMes(mes)} (ou troque o mês na tela).`, true);
    const x = cartoes.find((y) => y.p.id === quem);
    if (x && x.salvo && x.salvo.situacao === 'pago') return avisar(`O pagamento de ${F.nomeMes(mes)} de ${x.p.nome} já foi feito. Lance no mês seguinte.`, true);
    try {
      const { data, error } = await sb.from('fin_mentor_extras').insert(reg).select('*').single();
      if (error) throw error;
      // pagamento do mês já salvo (ajustado ou aprovado): a linha nova entra nele
      if (x && x.salvo) {
        const c = m.cad(quem);
        const linhas = [...x.salvo.linhas, ...F.linhasExtras([data], c ? { forma: c.forma, valor: c.valor } : null)];
        const u = await sb.from('fin_pagamentos').update({ linhas, total: F.soma(linhas, (l) => l.total), atualizado_em: new Date().toISOString() }).eq('id', x.salvo.id);
        if (u.error) throw u.error;
      }
      j.fechar(); avisar('Lançado. O mentor já vê no extrato dele.'); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

function janelaAjuste(x, mes, salvar, recarregar) {
  const linhas = x.linhas.map((l) => ({ ...l }));
  const j = janela(`Ajustar · ${x.p.nome} · ${F.nomeMes(mes)}`, `<form class="grade" style="gap:12px" novalidate>
    <p class="apagado">Mude a quantidade, as horas ou o valor de uma linha (por exemplo, uma aula que durou menos). O total de cada linha é refeito pela forma de pagamento.</p>
    <div class="tabela"><table><thead><tr><th>Turma ou mentoria</th><th>Quantidade</th><th>Horas</th><th>Valor</th><th>Motivo do ajuste</th></tr></thead><tbody>
      ${linhas.map((l, i) => `<tr><td>${esc(l.rotulo)}<br><small class="apagado">${esc(F.nomeForma(l.forma))}</small></td>
        <td><input type="number" data-i="${i}" data-c="quantidade" min="0" step="1" value="${l.quantidade}" style="max-width:80px" aria-label="Quantidade"></td>
        <td><input type="number" data-i="${i}" data-c="horas" min="0" step="0.25" value="${l.horas}" style="max-width:90px" aria-label="Horas"></td>
        <td><input type="number" data-i="${i}" data-c="valor_unit" min="0" step="0.01" value="${v2(l.valor_unit)}" style="max-width:110px" aria-label="Valor"></td>
        <td><input type="text" data-i="${i}" data-c="ajuste" maxlength="160" value="${esc(l.ajuste || '')}" aria-label="Motivo"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 860 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    f.querySelectorAll('[data-c]').forEach((inp) => { const l = linhas[Number(inp.dataset.i)]; const c = inp.dataset.c; l[c] = c === 'ajuste' ? inp.value.trim() || null : inp.value === '' ? null : Number(inp.value); });
    for (const l of linhas) if (!l.coberto_pelo_mensal) l.total = F.totalDaLinha(l);
    x.linhas = linhas;
    try { await salvar(x, { situacao: 'aberto' }); j.fechar(); avisar('Ajuste salvo.'); recarregar(); } catch (e) { avisar(explicarErro(e), true); }
  });
}

function janelaPagar(d, x, mes, recarregar) {
  const j = janela(`Pagamento de ${x.p.nome}`, `<form class="grade" style="gap:12px" novalidate>
    <p>Total: <b>${dinheiro(x.total)}</b> · ${F.nomeMes(mes)}</p>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="pg-dia">Pago em</label><input type="date" id="pg-dia" value="${hojeISO()}"></div>
      <div class="campo"><label for="pg-conta">Conta</label><select id="pg-conta"><option>Sicoob</option><option>Unicred</option></select></div>
    </div>
    <p class="peq apagado">Cada turma ou mentoria ganha a despesa "Mentores e parceiros" com a parte dela.</p>
    <div class="linha"><button class="btn pri" type="submit">Marcar como pago</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 520 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dia = f.querySelector('#pg-dia').value || hojeISO(), conta = f.querySelector('#pg-conta').value;
    try {
      const semCalculo = !x.linhas.some((l) => Number(l.total) > 0) && x.notas.length;
      const novas = semCalculo ? x.notas.map((n) => ({ data: dia, descricao: `Pagamento de ${x.p.nome} · ${F.nomeMes(mes)} · nota fiscal${n.numero ? ` ${n.numero}` : ''}`, valor: Number(n.valor), categoria: 'parceiros', pessoa_id: x.p.id, pago_em: dia, conta, origem: 'manual' }))
        : x.linhas.filter((l) => Number(l.total) > 0).map((l) => {
        const tId = l.chave.startsWith('t:') ? l.chave.slice(2) : l.turma_id, pId = l.chave.startsWith('p:') ? l.chave.slice(2) : l.programa_id;
        const t = tId ? d.turmas.find((y) => y.id === tId) : null;
        const pr = pId ? d.programas.find((y) => y.id === pId) : null;
        return { data: dia, descricao: `Pagamento de ${x.p.nome} · ${F.nomeMes(mes)} · ${l.rotulo}`, valor: l.total, categoria: 'parceiros', pessoa_id: x.p.id,
          turma_id: t ? t.id : null, programa_id: pr ? pr.id : null, empresa_id: (t || pr || {}).empresa_id || null, pago_em: dia, conta, origem: 'manual' };
      });
      const r = novas.length ? await sb.from('fin_despesas').insert(novas).select('id') : { data: [] };
      if (r.error) throw r.error;
      const corpo = { situacao: 'pago', pago_em: dia, despesas: (r.data || []).map((y) => y.id), atualizado_em: new Date().toISOString() };
      const u = await sb.from('fin_pagamentos').update(corpo).eq('id', x.salvo.id); if (u.error) throw u.error;
      // as notas fiscais do mês (script 58) ficam pagas: o mentor vê "paga em"
      if (x.notas.length) await sb.from('fin_notas_mentor').update({ situacao: 'paga', pago_em: dia }).in('id', x.notas.map((n) => n.id));
      j.fechar(); avisar('Pagamento registrado.'); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

// Para o painel da Visão geral (30/10): quanto cada parceiro vai receber num mês (o pagamento salvo, senão o calculado com as
// aulas e sessões marcadas) e quanto já foi pago. null = falta o script 54.
export async function previsaoMentores(d) {
  const m = await carregar(d);
  if (m.falta) return null;
  // serviços de antes do mês anterior ao início do Financeiro já foram pagos pela planilha
  const antes = F.somarMeses(d.config.inicio || '2026-11', -1);
  const doMes = (perfilId, mes) => {
    const salvo = m.pagamentos.find((x) => x.perfil_id === perfilId && x.mes === mes) || null;
    if (!salvo && mes < antes) return { total: calcularMes(d, m, perfilId, mes, true).total, pago: true, situacao: 'planilha' };
    const total = salvo ? Number(salvo.total) : calcularMes(d, m, perfilId, mes, true).total;
    return { total, pago: !!(salvo && salvo.situacao === 'pago'), situacao: salvo ? salvo.situacao : 'calculado' };
  };
  return {
    m, valorDe: (perfilId, chave) => valorDe(m, perfilId, chave),
    parceiros: m.parceiros, semCadastro: m.parceiros.filter((p) => !m.cad(p.id)).length, doMes,
    totalDoMes: (mes) => F.soma(m.parceiros, (p) => doMes(p.id, mes).total),
  };
}
