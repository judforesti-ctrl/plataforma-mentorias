// Vendas (Fase 4): pipeline de oportunidades em colunas por etapa, ficha da oportunidade (contatos, próximo contato,
// propostas, histórico, e-mail, WhatsApp e reunião dali mesmo), clientes (empresas e contatos), relatórios e modelos de mensagem.
// Só a administração entra (script 19).
import { sb, esc, avatar, dataBR, dataHoraBR, hojeISO, avisar, explicarErro, localParaISO, isoParaLocal } from '../base.js';
import { janela, api, primeiroNome, faltaScript } from './agenda-dados.js';

export const ETAPAS = [['contato', 'Contato inicial', 10], ['reuniao', 'Reunião / diagnóstico', 25], ['proposta', 'Proposta enviada', 40], ['negociacao', 'Negociação', 70], ['fechado', 'Fechado', 100], ['perdido', 'Perdido', 0]];
const NOME_ETAPA = Object.fromEntries(ETAPAS.map(([k, n]) => [k, n]));
const CHANCE = Object.fromEntries(ETAPAS.map(([k, , c]) => [k, c]));
export const SERVICOS = { palestra: 'Palestra', treinamento: 'Treinamento', workshop: 'Workshop', mentoria_grupo: 'Mentoria em grupo', mentoria_individual: 'Mentoria individual', diagnostico: 'Diagnóstico', outro: 'Outro' };
const MOTIVOS = { preco: 'Preço', momento: 'Momento / sem verba agora', concorrente: 'Fechou com outro', sem_resposta: 'Sem resposta', outro: 'Outro' };
const ORIGENS = ['Indicação', 'LinkedIn', 'Instagram', 'Evento', 'Radar da Liderança', 'Cliente antigo', 'Site', 'Outro'];
const TIPOS_INTERACAO = { email: 'E-mail', whatsapp: 'WhatsApp', reuniao: 'Reunião', ligacao: 'Ligação', nota: 'Anotação', proposta: 'Proposta', etapa: 'Etapa', sistema: 'Sistema' };
const ICONE = { email: '✉', whatsapp: '💬', reuniao: '📅', ligacao: '📞', nota: '📝', proposta: '📄', etapa: '➜', sistema: '⚙' };
const ABAS = [['pipeline', 'Pipeline'], ['clientes', 'Clientes'], ['relatorios', 'Relatórios'], ['modelos', 'Modelos de mensagem']];
const SEL_OP = '*, empresa:empresas(id, nome, tipo, cidade, uf, origem), contato:contatos(id, nome, email, whatsapp), responsavel:perfis!oportunidades_responsavel_id_fkey(id, nome, foto_url)';

export const dinheiro = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 9999);
const aberta = (o) => o.etapa !== 'fechado' && o.etapa !== 'perdido';
// quente = interação há menos de 20 dias; esfriando = mais de 3 meses sem interação
export const temperatura = (o) => { if (!aberta(o)) return null; const d = diasDesde(o.ultima_interacao_em); return d < 20 ? 'quente' : d > 90 ? 'esfriando' : 'morno'; };
const TEMP = { quente: ['Quente', 'selo', '🔥'], morno: ['Morno', 'selo neutro', ''], esfriando: ['Esfriando', 'selo alerta', '❄'] };
const seloTemp = (o) => { const t = temperatura(o); return t ? `<span class="${TEMP[t][1]}" title="Última interação há ${diasDesde(o.ultima_interacao_em)} dias">${TEMP[t][2]} ${TEMP[t][0]}</span>` : ''; };
const chanceDe = (o) => (o.chance == null ? CHANCE[o.etapa] : o.chance);
const atrasado = (o) => aberta(o) && o.proximo_contato_em && new Date(o.proximo_contato_em).getTime() < Date.now();
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const limparFone = (t) => String(t || '').replace(/\D/g, '');
export const linkWhats = (fone, texto) => { let n = limparFone(fone); if (n.length <= 11) n = `55${n}`; return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`; };
// Retorno depois de mandar uma proposta: 4 dias, pulando o fim de semana, às 9h de Brasília (12h UTC).
export const retornoEm4Dias = () => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 4); d.setUTCHours(12, 0, 0, 0);
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2); else if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
};
const OBS_RETORNO = (versao) => `Confirmar se recebeu a proposta${versao ? ` (versão ${versao})` : ''} e tirar dúvidas`;
const SELO_PROPOSTA = { gerando: ['gerando…', 'selo neutro'], rascunho: ['rascunho', 'selo alerta'], aprovada: ['aprovada', 'selo'], enviada: ['enviada', 'selo escuro'], erro: ['erro', 'selo erro'] };
const seloProposta = (p) => (p.status && SELO_PROPOSTA[p.status] ? `<span class="${SELO_PROPOSTA[p.status][1]}">${SELO_PROPOSTA[p.status][0]}</span>` : '');

// filtros do pipeline (continuam ao voltar)
const est = { texto: '', responsavel: '', servico: '', soAbertas: true };

// ---------- dados ----------
async function carregar() {
  const [emp, con, ops, eq] = await Promise.all([
    sb.from('empresas').select('*').order('nome'),
    sb.from('contatos').select('*').order('nome'),
    sb.from('oportunidades').select(SEL_OP).order('criado_em', { ascending: false }),
    sb.from('perfis').select('id, nome, foto_url, papel, tambem_mentor').eq('ativo', true).or('papel.eq.admin,papel.eq.mentor,tambem_mentor.eq.true').order('nome'),
  ]);
  if (con.error && faltaScript(con.error)) return { falta: true };
  for (const r of [emp, con, ops, eq]) if (r.error) throw r.error;
  return { falta: false, empresas: emp.data || [], contatos: con.data || [], oportunidades: ops.data || [], equipe: eq.data || [] };
}
const AVISO_SCRIPT = `<div class="aviso erro">Para o pipeline de vendas funcionar, falta rodar o script <b>19-vendas.sql</b> no Supabase (SQL Editor → New query → colar → Run).</div>`;

export async function render(ctx, el, params) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="aviso">Só a administração vê as vendas.</div>'; return; }
  if (params[0] === 'oportunidade' && params[1]) return paginaOportunidade(ctx, el, params[1]);
  if (params[0] === 'empresa' && params[1]) return paginaEmpresa(ctx, el, params[1]);
  if (params[0] === 'proposta' && params[1]) return (await import('./proposta.js')).paginaProposta(ctx, el, params[1]);
  const aba = ABAS.some(([k]) => k === params[0]) ? params[0] : 'pipeline';
  const d = await carregar();
  const recarregar = () => ctx.irPara(`#/vendas/${aba}`);
  el.innerHTML = `
    <div class="cab"><div><h1>Vendas</h1><p class="sub">Propostas, clientes, próximos contatos e resultados. Toda proposta importada entra aqui sozinha.</p></div>
      <div class="acoes"><a class="btn" href="#/importar-proposta">Importar proposta</a><button class="btn pri" type="button" id="nova-op">+ Nova oportunidade</button></div></div>
    ${d.falta ? AVISO_SCRIPT : ''}
    <nav class="abas" aria-label="Partes de vendas">${ABAS.map(([k, t]) => `<button type="button" data-aba="${k}" class="${k === aba ? 'atual' : ''}">${t}</button>`).join('')}</nav>
    <div id="conteudo"></div>`;
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) location.hash = `#/vendas/${b.dataset.aba}`; });
  el.querySelector('#nova-op').addEventListener('click', () => { if (d.falta) { avisar('Rode o script 19 no Supabase primeiro.', true); return; } formOportunidade(ctx, d, {}, (o) => ctx.irPara(`#/vendas/oportunidade/${o.id}`)); });
  if (d.falta) return;
  const alvo = el.querySelector('#conteudo');
  if (aba === 'clientes') return abaClientes(ctx, alvo, d, recarregar);
  if (aba === 'relatorios') return abaRelatorios(ctx, alvo, d);
  if (aba === 'modelos') return abaModelos(ctx, alvo, recarregar);
  return abaPipeline(ctx, alvo, d, recarregar);
}

// ---------- pipeline em colunas ----------
function abaPipeline(ctx, el, d, recarregar) {
  const contatosDe = (empId) => d.contatos.filter((c) => c.empresa_id === empId);
  el.innerHTML = `
    <div class="linha ag-filtros">
      <input type="search" id="f-texto" placeholder="Empresa ou contato…" value="${esc(est.texto)}" style="width:auto;min-width:220px" aria-label="Procurar por empresa ou contato">
      <select id="f-resp" aria-label="Responsável"><option value="">Qualquer responsável</option>${d.equipe.map((p) => `<option value="${p.id}"${p.id === est.responsavel ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <select id="f-serv" aria-label="Serviço"><option value="">Todos os serviços</option>${Object.entries(SERVICOS).map(([k, n]) => `<option value="${k}"${k === est.servico ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <label class="check" style="align-items:center"><input type="checkbox" id="f-abertas"${est.soAbertas ? ' checked' : ''}><span>Esconder fechados e perdidos com mais de 60 dias</span></label>
    </div>
    <div id="resumo" class="linha peq apagado" style="margin-bottom:10px"></div>
    <div id="kanban" class="kb"></div>
    <p class="peq apagado mt">Clique no cartão para abrir a oportunidade. Para mudar de etapa, use a caixinha no fim do cartão. 🔥 quente = interação há menos de 20 dias · ❄ esfriando = mais de 3 meses sem interação.</p>`;
  const desenhar = () => {
    const t = norm(est.texto);
    const lista = d.oportunidades.filter((o) => {
      if (est.responsavel && o.responsavel_id !== est.responsavel) return false;
      if (est.servico && o.servico !== est.servico) return false;
      if (est.soAbertas && !aberta(o) && diasDesde(o.fechado_em || o.perdido_em || o.atualizado_em) > 60) return false;
      if (t) {
        const nomes = [o.titulo, o.empresa && o.empresa.nome, ...contatosDe(o.empresa_id).map((c) => c.nome)].map(norm).join(' ');
        if (!nomes.includes(t)) return false;
      }
      return true;
    });
    const abertas = lista.filter(aberta);
    el.querySelector('#resumo').innerHTML = `<span><b>${abertas.length}</b> em aberto · <b>${dinheiro(abertas.reduce((a, o) => a + Number(o.valor || 0), 0))}</b> no pipeline</span>
      <span>· projeção ponderada <b>${dinheiro(abertas.reduce((a, o) => a + Number(o.valor || 0) * chanceDe(o) / 100, 0))}</b></span>
      <span>· 🔥 ${abertas.filter((o) => temperatura(o) === 'quente').length} quentes · ❄ ${abertas.filter((o) => temperatura(o) === 'esfriando').length} esfriando</span>`;
    el.querySelector('#kanban').innerHTML = ETAPAS.map(([k, nome]) => {
      const col = lista.filter((o) => o.etapa === k).sort((a, b) => (a.proximo_contato_em || '9').localeCompare(b.proximo_contato_em || '9'));
      return `<div class="kb-col kb-${k}"><div class="kb-topo"><b>${nome}</b><span class="peq apagado">${col.length} · ${dinheiro(col.reduce((a, o) => a + Number(o.valor || 0), 0))}</span></div>
        ${col.map((o) => cartao(o, d)).join('') || '<div class="kb-vazio">—</div>'}</div>`;
    }).join('');
  };
  const cartao = (o, dd) => `<div class="kb-card${atrasado(o) ? ' atrasado' : ''}" data-id="${o.id}">
    <a href="#/vendas/oportunidade/${o.id}" class="kb-link"><b>${esc((o.empresa && o.empresa.nome) || 'Empresa')}</b><span>${esc(o.titulo)}</span></a>
    <div class="kb-meta"><span class="kb-valor">${dinheiro(o.valor)}</span>${seloTemp(o)}</div>
    <div class="kb-meta peq apagado">${o.responsavel ? `${avatar(o.responsavel)} ${esc(primeiroNome(o.responsavel.nome))}` : '<span class="selo erro">sem responsável</span>'}
      ${aberta(o) ? (o.proximo_contato_em ? `<span class="${atrasado(o) ? 'kb-atraso' : ''}">${atrasado(o) ? '⚠ ' : '📅 '}${dataBR(o.proximo_contato_em)}</span>` : '<span class="kb-atraso">sem próximo contato</span>') : `<span>${dataBR(o.fechado_em || o.perdido_em)}</span>`}</div>
    <select class="kb-mover peq" data-mover="${o.id}" aria-label="Mover de etapa">${ETAPAS.map(([k, n]) => `<option value="${k}"${k === o.etapa ? ' selected' : ''}>${k === o.etapa ? n : `Mover para: ${n}`}</option>`).join('')}</select>
  </div>`;
  el.querySelector('#f-texto').addEventListener('input', (ev) => { est.texto = ev.target.value; desenhar(); });
  el.querySelector('#f-resp').addEventListener('input', (ev) => { est.responsavel = ev.target.value; desenhar(); });
  el.querySelector('#f-serv').addEventListener('input', (ev) => { est.servico = ev.target.value; desenhar(); });
  el.querySelector('#f-abertas').addEventListener('change', (ev) => { est.soAbertas = ev.target.checked; desenhar(); });
  el.querySelector('#kanban').addEventListener('change', (ev) => {
    const s = ev.target.closest('[data-mover]'); if (!s) return;
    const o = d.oportunidades.find((x) => x.id === s.dataset.mover);
    if (o && s.value !== o.etapa) mudarEtapa(ctx, o, s.value, recarregar); else if (o) s.value = o.etapa;
  });
  desenhar();
}

// Muda a etapa (perdido pede o motivo; fechado marca a data e oferece criar turma ou programa).
async function mudarEtapa(ctx, o, etapa, recarregar) {
  const gravar = async (extra = {}, textoHist = '') => {
    const corpo = { etapa, chance: null, ...extra };
    if (etapa === 'fechado') { corpo.fechado_em = new Date().toISOString(); corpo.chance = 100; }
    if (etapa === 'perdido') corpo.perdido_em = new Date().toISOString();
    if (etapa !== 'fechado' && etapa !== 'perdido') { corpo.fechado_em = null; corpo.perdido_em = null; corpo.motivo_perda = null; corpo.motivo_perda_texto = null; }
    const { error } = await sb.from('oportunidades').update(corpo).eq('id', o.id);
    if (error) { avisar(explicarErro(error), true); return false; }
    await sb.from('interacoes').insert({ oportunidade_id: o.id, tipo: 'etapa', texto: `${NOME_ETAPA[o.etapa]} → ${NOME_ETAPA[etapa]}${textoHist ? ` · ${textoHist}` : ''}` });
    return true;
  };
  if (etapa === 'perdido') {
    const j = janela('Não fechou: por quê?', `<div class="campo"><label for="p-motivo">Motivo</label><select id="p-motivo">${Object.entries(MOTIVOS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
      <div class="campo mt"><label for="p-texto">Detalhes (opcional)</label><textarea id="p-texto" placeholder="O que o cliente disse"></textarea></div>
      <div class="linha mt2"><button class="btn pri" type="button" id="p-ok">Marcar como perdida</button><button class="btn" type="button" data-fechar>Desistir</button></div>`, { largura: 520, aoFechar: recarregar });
    j.corpo.querySelector('#p-ok').addEventListener('click', async () => {
      const motivo = j.corpo.querySelector('#p-motivo').value, txt = j.corpo.querySelector('#p-texto').value.trim();
      if (await gravar({ motivo_perda: motivo, motivo_perda_texto: txt || null }, `${MOTIVOS[motivo]}${txt ? `: ${txt}` : ''}`)) { avisar('Oportunidade marcada como perdida.'); j.fechar(); }
    });
    return;
  }
  if (etapa === 'fechado') {
    if (!(await gravar())) { recarregar(); return; }
    const j = janela('Fechou! 🎉', `<p>A oportunidade <b>${esc(o.titulo)}</b> foi marcada como fechada${o.valor ? ` (${dinheiro(o.valor)})` : ''}.</p>
      <p class="mt">Agora é hora de colocar na operação:</p>
      <div class="linha mt"><a class="btn pri" href="#/importar-proposta">Criar turma a partir da proposta</a><a class="btn" href="#/painel/novo-programa/${o.empresa_id}">Criar programa de mentoria individual</a><button class="btn" type="button" data-fechar>Depois</button></div>
      <p class="peq apagado mt">Quando a turma é criada pela importação da proposta, ela fica ligada a esta oportunidade sozinha.</p>`, { largura: 560, aoFechar: recarregar });
    void j;
    return;
  }
  if (await gravar()) { avisar(`Movida para ${NOME_ETAPA[etapa]}.`); recarregar(); }
}

// ---------- nova oportunidade / editar ----------
function formOportunidade(ctx, d, { oportunidade = null, empresaId = null } = {}, aoSalvar) {
  const o = oportunidade || {};
  const empSel = o.empresa_id || empresaId || '';
  const html = `<form id="f-op" class="grade" style="gap:12px" novalidate>
    <div class="campo"><label for="o-emp">Empresa *</label><select id="o-emp"><option value="">Escolha…</option>${d.empresas.map((e) => `<option value="${e.id}"${e.id === empSel ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}<option value="nova">+ Nova empresa…</option></select>
      <input type="text" id="o-emp-nome" placeholder="Nome da nova empresa" hidden></div>
    <div class="campo"><label for="o-titulo">O que está sendo vendido *</label><input type="text" id="o-titulo" maxlength="200" placeholder="Ex.: Trilha de líderes · gerentes" value="${esc(o.titulo || '')}"></div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="o-serv">Serviço</label><select id="o-serv">${Object.entries(SERVICOS).map(([k, n]) => `<option value="${k}"${k === (o.servico || 'treinamento') ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="campo"><label for="o-valor">Valor total (R$)</label><input type="number" id="o-valor" min="0" step="0.01" value="${o.valor == null ? '' : o.valor}"></div>
      <div class="campo"><label for="o-etapa">Etapa</label><select id="o-etapa">${ETAPAS.map(([k, n]) => `<option value="${k}"${k === (o.etapa || 'contato') ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="o-resp">Responsável</label><select id="o-resp"><option value="">—</option>${d.equipe.map((p) => `<option value="${p.id}"${p.id === (o.responsavel_id || (oportunidade ? '' : ctx.perfil.id)) ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="o-origem">Como chegou</label><select id="o-origem"><option value="">—</option>${ORIGENS.map((x) => `<option${x === o.origem ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="campo"><label for="o-prev">Previsão de fechar</label><input type="date" id="o-prev" value="${o.fechamento_previsto || ''}"></div></div>
    <div class="campo"><label for="o-obs">Observações</label><textarea id="o-obs" placeholder="Condições, contexto, o que o cliente pediu">${esc(o.observacoes || '')}</textarea></div>
    <div class="linha"><button class="btn pri" type="submit">${oportunidade ? 'Salvar' : 'Criar oportunidade'}</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela(oportunidade ? 'Editar oportunidade' : 'Nova oportunidade', html, { largura: 640 });
  const f = j.corpo.querySelector('#f-op');
  f.querySelector('#o-emp').addEventListener('input', (ev) => { f.querySelector('#o-emp-nome').hidden = ev.target.value !== 'nova'; });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      let empresa_id = f.querySelector('#o-emp').value;
      if (empresa_id === 'nova') {
        const nome = f.querySelector('#o-emp-nome').value.trim();
        if (!nome) throw new Error('Escreva o nome da empresa.');
        const { data, error } = await sb.from('empresas').insert({ nome }).select('id').single(); if (error) throw error; empresa_id = data.id;
      }
      if (!empresa_id) throw new Error('Escolha a empresa.');
      const titulo = f.querySelector('#o-titulo').value.trim();
      if (!titulo) throw new Error('Escreva o que está sendo vendido.');
      const v = f.querySelector('#o-valor').value;
      const corpo = { empresa_id, titulo, servico: f.querySelector('#o-serv').value, valor: v === '' ? null : Number(v), etapa: f.querySelector('#o-etapa').value,
        responsavel_id: f.querySelector('#o-resp').value || null, origem: f.querySelector('#o-origem').value || null, fechamento_previsto: f.querySelector('#o-prev').value || null, observacoes: f.querySelector('#o-obs').value.trim() || null };
      if (corpo.etapa === 'fechado' && !o.fechado_em) corpo.fechado_em = new Date().toISOString();
      if (corpo.etapa === 'perdido' && !o.perdido_em) corpo.perdido_em = new Date().toISOString();
      let salvo;
      if (oportunidade) { const r = await sb.from('oportunidades').update(corpo).eq('id', o.id).select('id').single(); if (r.error) throw r.error; salvo = r.data; }
      else {
        const r = await sb.from('oportunidades').insert({ ...corpo, proximo_contato_por: corpo.responsavel_id }).select('id').single(); if (r.error) throw r.error; salvo = r.data;
        await sb.from('interacoes').insert({ oportunidade_id: salvo.id, tipo: 'sistema', texto: 'Oportunidade criada.' });
      }
      avisar(oportunidade ? 'Salvo.' : 'Oportunidade criada.'); j.fechar(); if (aoSalvar) aoSalvar(salvo);
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

// ---------- página da oportunidade ----------
async function paginaOportunidade(ctx, el, id) {
  const [op, d] = await Promise.all([sb.from('oportunidades').select(SEL_OP).eq('id', id).single(), carregar()]);
  if (op.error) { el.innerHTML = `<div class="aviso erro">${esc(explicarErro(op.error))}</div>`; return; }
  const o = op.data;
  const [props, hist, prog, turm] = await Promise.all([
    sb.from('propostas').select('*').eq('oportunidade_id', id).order('versao', { ascending: false }),
    sb.from('interacoes').select('*, por_perfil:perfis!interacoes_por_fkey(nome)').eq('oportunidade_id', id).order('quando', { ascending: false }),
    sb.from('programas').select('id, nome, status').eq('empresa_id', o.empresa_id),
    sb.from('turmas').select('id, nome, status').eq('empresa_id', o.empresa_id),
  ]);
  const contatos = d.contatos.filter((c) => c.empresa_id === o.empresa_id && c.ativo !== false);
  const recarregar = () => ctx.irPara(`#/vendas/oportunidade/${id}`);
  const nomeDe = (pid) => (d.equipe.find((p) => p.id === pid) || {}).nome || '';
  const prox = o.proximo_contato_em;
  el.innerHTML = `
    <div class="cab"><div><a class="peq" href="#/vendas">← Vendas</a><h1>${esc(o.titulo)}</h1>
      <p class="sub"><a href="#/vendas/empresa/${o.empresa_id}"><b>${esc(o.empresa ? o.empresa.nome : '')}</b></a> · ${SERVICOS[o.servico] || o.servico} · <b>${dinheiro(o.valor)}</b>
        ${o.fechamento_previsto ? ` · previsão ${dataBR(o.fechamento_previsto)}` : ''}</p></div>
      <div class="acoes"><span class="selo ${o.etapa === 'fechado' ? '' : o.etapa === 'perdido' ? 'erro' : 'escuro'}">${NOME_ETAPA[o.etapa]} · ${chanceDe(o)}%</span>${seloTemp(o)}
        <button class="btn" type="button" id="editar">Editar</button></div></div>
    ${o.etapa === 'perdido' ? `<div class="aviso erro" style="margin-bottom:14px">Perdida em ${dataBR(o.perdido_em)}${o.motivo_perda ? ` · ${MOTIVOS[o.motivo_perda]}` : ''}${o.motivo_perda_texto ? `: ${esc(o.motivo_perda_texto)}` : ''}. <button class="btn peq" type="button" data-etapa="negociacao">Reabrir</button></div>` : ''}
    ${o.etapa === 'fechado' ? `<div class="aviso ok" style="margin-bottom:14px">Fechada em ${dataBR(o.fechado_em)}${o.turma_id ? ` · <a href="#/turma/${o.turma_id}">ver a turma</a>` : o.programa_id ? ` · <a href="#/painel/programa/${o.programa_id}">ver o programa</a>` : ' · <a href="#/importar-proposta">criar a turma pela proposta</a>'}.</div>` : ''}
    <div class="linha" style="margin-bottom:14px;gap:8px">
      <span class="peq apagado">Etapa:</span>${ETAPAS.map(([k, n]) => `<button class="btn peq${k === o.etapa ? ' pri' : ''}" type="button" data-etapa="${k}"${k === o.etapa ? ' disabled' : ''}>${n}</button>`).join('')}</div>
    <div class="linha" style="margin-bottom:18px;gap:8px">
      <button class="btn escuro" type="button" data-acao="email">✉ E-mail</button><button class="btn escuro" type="button" data-acao="whats">💬 WhatsApp</button>
      <button class="btn escuro" type="button" data-acao="reuniao">📅 Agendar reunião</button><button class="btn" type="button" data-acao="registrar">📝 Registrar ligação, reunião ou anotação</button></div>
    <div class="grade g2" style="align-items:start">
      <div class="grade" style="gap:14px">
        <div class="cartao${atrasado(o) ? ' pend-bloco urgente' : ''}"><h3>Próximo contato ${atrasado(o) ? '<span class="selo erro">atrasado</span>' : ''}</h3>
          ${aberta(o) ? `<div class="grade g2 mt" style="gap:10px"><div class="campo"><label for="pc-quando">Quando</label><input type="datetime-local" id="pc-quando" value="${isoParaLocal(prox)}"></div>
            <div class="campo"><label for="pc-quem">Quem faz</label><select id="pc-quem"><option value="">—</option>${d.equipe.map((p) => `<option value="${p.id}"${p.id === (o.proximo_contato_por || o.responsavel_id) ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div></div>
            <div class="campo mt"><label for="pc-obs">O que fazer</label><input type="text" id="pc-obs" placeholder="Ex.: ligar para saber se aprovaram a proposta" value="${esc(o.proximo_contato_obs || '')}"></div>
            <div class="linha mt"><button class="btn pri" type="button" id="pc-salvar">Salvar</button><span class="peq apagado">Entra na agenda de quem faz e no Painel do dia.</span></div>` : '<p class="peq apagado mt">Oportunidade encerrada.</p>'}</div>
        <div class="cartao"><div class="linha"><h3 style="flex:1">Contatos na ${esc(o.empresa ? o.empresa.nome : 'empresa')}</h3><button class="btn peq" type="button" id="novo-contato">+ Contato</button></div>
          <div class="lista mt" id="lista-contatos">${contatos.length ? contatos.map((c) => htmlContato(c, o)).join('') : '<p class="apagado">Nenhum contato cadastrado. Adicione quem decide e quem acompanha.</p>'}</div></div>
        <div class="cartao"><h3>Dados da empresa</h3>
          <p class="peq mt">${[o.empresa && o.empresa.tipo, o.empresa && [o.empresa.cidade, o.empresa.uf].filter(Boolean).join('/'), o.empresa && o.empresa.origem && `veio por ${o.empresa.origem}`].filter(Boolean).map(esc).join(' · ') || 'Sem dados ainda.'}</p>
          ${(prog.data || []).length || (turm.data || []).length ? `<p class="peq mt"><b>Já é cliente:</b> ${(prog.data || []).map((p) => `<a href="#/painel/programa/${p.id}">${esc(p.nome)}</a>`).concat((turm.data || []).map((t) => `<a href="#/turma/${t.id}">${esc(t.nome)}</a>`)).join(', ')}</p>` : ''}
          <a class="btn peq mt" href="#/vendas/empresa/${o.empresa_id}">Abrir ficha da empresa</a></div>
      </div>
      <div class="grade" style="gap:14px">
        <div class="cartao"><div class="linha" style="flex-wrap:wrap"><h3 style="flex:1">Propostas</h3>${aberta(o) ? '<button class="btn peq pri" type="button" id="gerar-prop">✨ Gerar com a IA</button>' : ''}<button class="btn peq" type="button" id="nova-prop">+ Registrar proposta</button><a class="btn peq" href="#/importar-proposta">Importar PDF</a></div>
          <div class="lista mt">${(props.data || []).length ? props.data.map((p) => `<div class="ag-bloco"><div class="linha" style="justify-content:space-between"><div><b>Versão ${p.versao}</b> · ${dinheiro(p.valor)}${p.enviada_em ? ` · enviada ${dataBR(p.enviada_em)}` : ''}${p.validade ? ` · vale até ${dataBR(p.validade)}` : ''} ${seloProposta(p)}</div>
            ${p.status ? `<a class="btn peq" href="#/vendas/proposta/${p.id}">${p.status === 'rascunho' ? 'Revisar e aprovar' : p.status === 'aprovada' ? 'Enviar' : p.status === 'gerando' ? 'Acompanhar' : 'Abrir'}</a>` : ''}</div>
            ${p.arquivo ? `<span class="peq apagado">${esc(p.arquivo)}</span>` : ''}${p.resumo ? `<p class="peq mt" style="white-space:pre-wrap">${esc(p.resumo)}</p>` : ''}</div>`).join('') : '<p class="apagado">Nenhuma proposta ainda. Clique em <b>Gerar com a IA</b> e cole o pedido: a proposta sai nos moldes do PowerPoint da Mentorei.</p>'}</div></div>
        ${o.observacoes ? `<div class="cartao"><h3>Observações</h3><p class="peq mt" style="white-space:pre-wrap">${esc(o.observacoes)}</p></div>` : ''}
        <div class="cartao"><h3>Histórico</h3><div class="hist mt">${(hist.data || []).length ? hist.data.map((h) => `<div class="hist-item"><span class="hist-icone">${ICONE[h.tipo] || '•'}</span>
          <div><div class="peq apagado">${dataHoraBR(h.quando)} · ${TIPOS_INTERACAO[h.tipo] || h.tipo}${h.por_perfil ? ` · ${esc(primeiroNome(h.por_perfil.nome))}` : ''}</div><div style="white-space:pre-wrap">${esc(h.texto || '')}</div></div></div>`).join('') : '<p class="apagado">Nada registrado ainda.</p>'}</div></div>
      </div>
    </div>`;

  el.querySelector('#editar').addEventListener('click', () => formOportunidade(ctx, d, { oportunidade: o }, recarregar));
  el.querySelectorAll('[data-etapa]').forEach((b) => b.addEventListener('click', () => mudarEtapa(ctx, o, b.dataset.etapa, recarregar)));
  el.querySelector('#pc-salvar')?.addEventListener('click', async () => {
    const quando = el.querySelector('#pc-quando').value, quem = el.querySelector('#pc-quem').value, obs = el.querySelector('#pc-obs').value.trim();
    const { error } = await sb.from('oportunidades').update({ proximo_contato_em: localParaISO(quando), proximo_contato_por: quem || null, proximo_contato_obs: obs || null }).eq('id', id);
    if (error) { avisar(explicarErro(error), true); return; }
    avisar(quando ? `Próximo contato marcado para ${dataHoraBR(localParaISO(quando))}${quem ? ` com ${primeiroNome(nomeDe(quem))}` : ''}.` : 'Próximo contato removido.');
    import('./agenda-dados.js').then(({ limparCache, avisarGoogle }) => { limparCache(); avisarGoogle(); });
    recarregar();
  });
  el.querySelector('#novo-contato').addEventListener('click', () => formContato(ctx, { empresaId: o.empresa_id }, recarregar));
  el.querySelector('#nova-prop').addEventListener('click', () => formProposta(ctx, o, (props.data || []).length, recarregar));
  el.querySelector('#gerar-prop')?.addEventListener('click', async () => {
    const { janelaGerar } = await import('./proposta.js');
    janelaGerar(ctx, o, (props.data || []).length, (pid) => ctx.irPara(`#/vendas/proposta/${pid}`));
  });
  el.querySelector('#lista-contatos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-c-acao]'); if (!b) return;
    const c = contatos.find((x) => x.id === b.dataset.c);
    if (b.dataset.cAcao === 'editar') formContato(ctx, { contato: c }, recarregar);
    if (b.dataset.cAcao === 'email') janelaEmail(ctx, o, contatos, c, recarregar);
    if (b.dataset.cAcao === 'whats') janelaWhats(ctx, o, contatos, c, recarregar);
    if (b.dataset.cAcao === 'principal') sb.from('oportunidades').update({ contato_id: c.id }).eq('id', id).then(() => { avisar(`${c.nome} é o contato principal.`); recarregar(); });
  });
  el.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
    const principal = contatos.find((c) => c.id === o.contato_id) || contatos[0] || null;
    if (b.dataset.acao === 'email') return janelaEmail(ctx, o, contatos, principal, recarregar);
    if (b.dataset.acao === 'whats') return janelaWhats(ctx, o, contatos, principal, recarregar);
    if (b.dataset.acao === 'registrar') return janelaRegistrar(ctx, o, contatos, recarregar);
    if (b.dataset.acao === 'reuniao') {
      const { carregarAgenda } = await import('./agenda-dados.js');
      const { abrirFormReuniao } = await import('./agenda-semana.js');
      const ag = await carregarAgenda(ctx);
      abrirFormReuniao(ctx, ag, { titulo: `${o.empresa ? o.empresa.nome : ''} · ${o.titulo}`, convidados: contatos.map((c) => c.email).filter(Boolean) }, async (r) => {
        if (r) await sb.from('interacoes').insert({ oportunidade_id: id, contato_id: principal ? principal.id : null, tipo: 'reuniao', texto: `Reunião marcada: ${r.titulo} · ${dataBR(r.dia)} ${String(r.hora_inicio).slice(0, 5)}${r.meet_link ? ` · ${r.meet_link}` : ''}` });
        recarregar();
      });
    }
  }));
}

function htmlContato(c, o) {
  return `<div class="ag-bloco"><div class="linha" style="justify-content:space-between"><div><b>${esc(c.nome)}</b>${c.cargo ? ` · ${esc(c.cargo)}` : ''}${o && o.contato_id === c.id ? ' <span class="selo">principal</span>' : ''}${c.decisor ? ' <span class="selo escuro">decide</span>' : ''}${c.marketing ? ' <span class="selo neutro">recebe marketing</span>' : ''}
      <div class="peq apagado">${[c.email, c.whatsapp].filter(Boolean).map(esc).join(' · ') || 'sem e-mail nem WhatsApp'}</div></div>
    <div class="linha" style="gap:6px">${c.email ? `<button class="btn peq" type="button" data-c="${c.id}" data-c-acao="email">✉</button>` : ''}${c.whatsapp ? `<button class="btn peq" type="button" data-c="${c.id}" data-c-acao="whats">💬</button>` : ''}
      ${o && o.contato_id !== c.id ? `<button class="btn peq" type="button" data-c="${c.id}" data-c-acao="principal" title="Tornar contato principal">★</button>` : ''}<button class="btn peq" type="button" data-c="${c.id}" data-c-acao="editar">Editar</button></div></div></div>`;
}

function formContato(ctx, { contato = null, empresaId = null }, aoSalvar) {
  const c = contato || {};
  const html = `<form id="f-c" class="grade" style="gap:12px" novalidate>
    <div class="campo"><label for="c-nome">Nome *</label><input type="text" id="c-nome" value="${esc(c.nome || '')}" maxlength="120"></div>
    <div class="grade g2" style="gap:10px"><div class="campo"><label for="c-cargo">Cargo</label><input type="text" id="c-cargo" value="${esc(c.cargo || '')}" placeholder="Ex.: Gerente de RH"></div>
      <div class="campo"><label for="c-email">E-mail</label><input type="email" id="c-email" value="${esc(c.email || '')}"></div></div>
    <div class="campo"><label for="c-whats">WhatsApp</label><input type="tel" id="c-whats" value="${esc(c.whatsapp || '')}" placeholder="(54) 99999-0000"></div>
    <label class="check"><input type="checkbox" id="c-decisor"${c.decisor ? ' checked' : ''}><span>É quem decide a contratação</span></label>
    <label class="check"><input type="checkbox" id="c-mkt"${c.marketing ? ' checked' : ''}><span>Aceita receber e-mails de relacionamento da Mentorei (vai para a lista de marketing)</span></label>
    <div class="campo"><label for="c-obs">Observações</label><textarea id="c-obs" placeholder="Como prefere ser contatado, horários, contexto">${esc(c.observacoes || '')}</textarea></div>
    <div class="linha"><button class="btn pri" type="submit">${contato ? 'Salvar' : 'Adicionar contato'}</button>${contato ? '<button class="btn perigo" type="button" id="c-apagar">Remover</button>' : ''}<button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela(contato ? `Contato · ${c.nome}` : 'Novo contato', html, { largura: 600 });
  const f = j.corpo.querySelector('#f-c');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = f.querySelector('#c-nome').value.trim();
    if (!nome) { avisar('Escreva o nome.', true); return; }
    const mkt = f.querySelector('#c-mkt').checked;
    const corpo = { nome, cargo: f.querySelector('#c-cargo').value.trim() || null, email: f.querySelector('#c-email').value.trim().toLowerCase() || null, whatsapp: f.querySelector('#c-whats').value.trim() || null,
      decisor: f.querySelector('#c-decisor').checked, marketing: mkt, observacoes: f.querySelector('#c-obs').value.trim() || null };
    if (mkt && !c.marketing) { corpo.marketing_em = new Date().toISOString(); corpo.marketing_por = ctx.perfil.id; }
    if (!mkt) { corpo.marketing_em = null; corpo.marketing_por = null; }
    const r = contato ? await sb.from('contatos').update(corpo).eq('id', c.id) : await sb.from('contatos').insert({ ...corpo, empresa_id: empresaId });
    if (r.error) { avisar(explicarErro(r.error), true); return; }
    avisar(contato ? 'Contato salvo.' : 'Contato adicionado.'); j.fechar(); if (aoSalvar) aoSalvar();
  });
  f.querySelector('#c-apagar')?.addEventListener('click', async () => {
    if (!window.confirm(`Remover ${c.nome} dos contatos?`)) return;
    const { error } = await sb.from('contatos').update({ ativo: false }).eq('id', c.id);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); if (aoSalvar) aoSalvar();
  });
}

function formProposta(ctx, o, quantas, aoSalvar) {
  const html = `<form id="f-p" class="grade" style="gap:12px" novalidate>
    <div class="grade g3" style="gap:10px"><div class="campo"><label for="p-valor">Valor (R$)</label><input type="number" id="p-valor" min="0" step="0.01" value="${o.valor == null ? '' : o.valor}"></div>
      <div class="campo"><label for="p-env">Enviada em</label><input type="date" id="p-env" value="${hojeISO()}"></div>
      <div class="campo"><label for="p-val">Vale até</label><input type="date" id="p-val"></div></div>
    <div class="campo"><label for="p-arq">Nome do arquivo (opcional)</label><input type="text" id="p-arq" placeholder="Proposta-Empresa-v2.pdf"></div>
    <div class="campo"><label for="p-res">Resumo do que foi proposto</label><textarea id="p-res" placeholder="Carga horária, formato, condições de pagamento"></textarea></div>
    <div class="linha"><button class="btn pri" type="submit">Registrar versão ${quantas + 1}</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela('Registrar proposta enviada', html, { largura: 600 });
  j.corpo.querySelector('#f-p').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const v = f.querySelector('#p-valor').value;
    const corpo = { oportunidade_id: o.id, versao: quantas + 1, valor: v === '' ? null : Number(v), enviada_em: f.querySelector('#p-env').value || null, validade: f.querySelector('#p-val').value || null, arquivo: f.querySelector('#p-arq').value.trim() || null, resumo: f.querySelector('#p-res').value.trim() || null };
    const { error } = await sb.from('propostas').insert(corpo);
    if (error) { avisar(explicarErro(error), true); return; }
    const mud = { ...(corpo.valor != null ? { valor: corpo.valor } : {}) };
    if (aberta(o) && (o.etapa === 'contato' || o.etapa === 'reuniao')) mud.etapa = 'proposta';
    // proposta enviada: o retorno entra na agenda para 4 dias depois
    if (aberta(o)) { mud.proximo_contato_em = retornoEm4Dias(); mud.proximo_contato_por = o.responsavel_id || ctx.perfil.id; mud.proximo_contato_obs = OBS_RETORNO(quantas + 1); }
    if (Object.keys(mud).length) await sb.from('oportunidades').update(mud).eq('id', o.id);
    await sb.from('interacoes').insert({ oportunidade_id: o.id, contato_id: o.contato_id, tipo: 'proposta', texto: `Proposta enviada (versão ${quantas + 1})${corpo.valor != null ? ` · ${dinheiro(corpo.valor)}` : ''}` });
    if (aberta(o)) import('./agenda-dados.js').then(({ limparCache, avisarGoogle }) => { limparCache(); avisarGoogle(); });
    avisar(aberta(o) ? 'Proposta registrada. Retorno marcado para daqui a 4 dias.' : 'Proposta registrada.'); j.fechar(); if (aoSalvar) aoSalvar();
  });
}

// ---------- e-mail, WhatsApp e registro ----------
async function modelos(canal) {
  const { data } = await sb.from('modelos_mensagem').select('*').eq('canal', canal).order('ordem');
  return data || [];
}
export const preencher = (texto, o, c, ctx) => String(texto || '').replace(/\{contato\}/g, c ? primeiroNome(c.nome) : '').replace(/\{empresa\}/g, (o.empresa && o.empresa.nome) || '')
  .replace(/\{responsavel\}/g, primeiroNome((o.responsavel && o.responsavel.nome) || ctx.perfil.nome)).replace(/\{servico\}/g, (SERVICOS[o.servico] || '').toLowerCase()).replace(/\{valor\}/g, dinheiro(o.valor));

async function janelaEmail(ctx, o, contatos, inicial, aoEnviar) {
  const comEmail = contatos.filter((c) => c.email);
  if (!comEmail.length) { avisar('Nenhum contato com e-mail. Adicione o e-mail no contato.', true); return; }
  const ms = await modelos('email');
  const html = `<form id="f-e" class="grade" style="gap:12px" novalidate>
    <div class="grade g2" style="gap:10px"><div class="campo"><label for="e-para">Para</label><select id="e-para">${comEmail.map((c) => `<option value="${c.id}"${inicial && c.id === inicial.id ? ' selected' : ''}>${esc(c.nome)} · ${esc(c.email)}</option>`).join('')}</select></div>
      <div class="campo"><label for="e-modelo">Modelo</label><select id="e-modelo"><option value="">Escrever do zero</option>${ms.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div></div>
    <div class="campo"><label for="e-assunto">Assunto *</label><input type="text" id="e-assunto" maxlength="200"></div>
    <div class="campo"><label for="e-texto">Mensagem *</label><textarea id="e-texto" style="min-height:200px"></textarea><small>Sai de contato@mentorei.com.br, com o visual da Mentorei. As respostas chegam nessa caixa.</small></div>
    <div class="linha"><button class="btn pri" type="submit">Enviar e-mail</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela('E-mail para o cliente', html, { largura: 680 });
  const f = j.corpo.querySelector('#f-e');
  const contatoSel = () => comEmail.find((c) => c.id === f.querySelector('#e-para').value);
  const aplicar = () => { const m = ms.find((x) => x.id === f.querySelector('#e-modelo').value); if (!m) return; f.querySelector('#e-assunto').value = preencher(m.assunto, o, contatoSel(), ctx); f.querySelector('#e-texto').value = preencher(m.texto, o, contatoSel(), ctx); };
  f.querySelector('#e-modelo').addEventListener('input', aplicar);
  f.querySelector('#e-para').addEventListener('input', () => { if (f.querySelector('#e-modelo').value) aplicar(); });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const c = contatoSel(), assunto = f.querySelector('#e-assunto').value.trim(), texto = f.querySelector('#e-texto').value.trim();
    if (!assunto || !texto) { avisar('Preencha assunto e mensagem.', true); return; }
    const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Enviando…';
    const r = await api('/api/vendas-email', { oportunidade_id: o.id, contato_id: c.id, para: c.email, nome: c.nome, assunto, texto });
    if (!r.ok) { avisar(r.mensagem || 'Não consegui enviar.', true); b.disabled = false; b.textContent = 'Enviar e-mail'; return; }
    await sb.from('interacoes').insert({ oportunidade_id: o.id, contato_id: c.id, tipo: 'email', texto: `E-mail para ${c.nome}: ${assunto}\n\n${texto}` });
    avisar(`E-mail enviado para ${c.nome}.`); j.fechar(); if (aoEnviar) aoEnviar();
  });
}

async function janelaWhats(ctx, o, contatos, inicial, aoEnviar) {
  const comFone = contatos.filter((c) => limparFone(c.whatsapp).length >= 10);
  if (!comFone.length) { avisar('Nenhum contato com WhatsApp. Adicione o número no contato.', true); return; }
  const ms = await modelos('whatsapp');
  const html = `<form id="f-w" class="grade" style="gap:12px" novalidate>
    <div class="grade g2" style="gap:10px"><div class="campo"><label for="w-para">Para</label><select id="w-para">${comFone.map((c) => `<option value="${c.id}"${inicial && c.id === inicial.id ? ' selected' : ''}>${esc(c.nome)} · ${esc(c.whatsapp)}</option>`).join('')}</select></div>
      <div class="campo"><label for="w-modelo">Modelo</label><select id="w-modelo"><option value="">Escrever do zero</option>${ms.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div></div>
    <div class="campo"><label for="w-texto">Mensagem *</label><textarea id="w-texto" style="min-height:140px"></textarea><small>Abre o WhatsApp com a mensagem pronta; você confere e aperta enviar lá.</small></div>
    <div class="linha"><button class="btn pri" type="submit">Abrir no WhatsApp</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela('WhatsApp para o cliente', html, { largura: 620 });
  const f = j.corpo.querySelector('#f-w');
  const contatoSel = () => comFone.find((c) => c.id === f.querySelector('#w-para').value);
  const aplicar = () => { const m = ms.find((x) => x.id === f.querySelector('#w-modelo').value); if (m) f.querySelector('#w-texto').value = preencher(m.texto, o, contatoSel(), ctx); };
  f.querySelector('#w-modelo').addEventListener('input', aplicar);
  f.querySelector('#w-para').addEventListener('input', () => { if (f.querySelector('#w-modelo').value) aplicar(); });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const c = contatoSel(), texto = f.querySelector('#w-texto').value.trim();
    if (!texto) { avisar('Escreva a mensagem.', true); return; }
    window.open(linkWhats(c.whatsapp, texto), '_blank', 'noopener');
    await sb.from('interacoes').insert({ oportunidade_id: o.id, contato_id: c.id, tipo: 'whatsapp', texto: `WhatsApp para ${c.nome}: ${texto}` });
    j.fechar(); if (aoEnviar) aoEnviar();
  });
}

function janelaRegistrar(ctx, o, contatos, aoSalvar) {
  const html = `<form id="f-r" class="grade" style="gap:12px" novalidate>
    <div class="grade g3" style="gap:10px"><div class="campo"><label for="r-tipo">O que foi</label><select id="r-tipo">${['ligacao', 'reuniao', 'nota', 'email', 'whatsapp'].map((k) => `<option value="${k}">${TIPOS_INTERACAO[k]}</option>`).join('')}</select></div>
      <div class="campo"><label for="r-com">Com quem</label><select id="r-com"><option value="">—</option>${contatos.map((c) => `<option value="${c.id}"${c.id === o.contato_id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="r-quando">Quando</label><input type="datetime-local" id="r-quando" value="${isoParaLocal(new Date().toISOString())}"></div></div>
    <div class="campo"><label for="r-texto">O que aconteceu *</label><textarea id="r-texto" placeholder="Resumo da conversa, o que o cliente pediu, próximos passos"></textarea></div>
    <div class="linha"><button class="btn pri" type="submit">Registrar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela('Registrar no histórico', html, { largura: 600 });
  j.corpo.querySelector('#f-r').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget, texto = f.querySelector('#r-texto').value.trim();
    if (!texto) { avisar('Escreva o que aconteceu.', true); return; }
    const { error } = await sb.from('interacoes').insert({ oportunidade_id: o.id, contato_id: f.querySelector('#r-com').value || null, tipo: f.querySelector('#r-tipo').value, texto, quando: localParaISO(f.querySelector('#r-quando').value) || new Date().toISOString() });
    if (error) { avisar(explicarErro(error), true); return; }
    avisar('Registrado.'); j.fechar(); if (aoSalvar) aoSalvar();
  });
}

// ---------- empresa (ficha do cliente) ----------
async function paginaEmpresa(ctx, el, id) {
  const [emp, d, prog, turm] = await Promise.all([sb.from('empresas').select('*').eq('id', id).single(), carregar(),
    sb.from('programas').select('id, nome, status, inicio, fim_previsto').eq('empresa_id', id), sb.from('turmas').select('id, nome, status, inicio, fim_previsto').eq('empresa_id', id)]);
  if (emp.error) { el.innerHTML = `<div class="aviso erro">${esc(explicarErro(emp.error))}</div>`; return; }
  const e = emp.data;
  const contatos = d.contatos.filter((c) => c.empresa_id === id && c.ativo !== false);
  const ops = d.oportunidades.filter((o) => o.empresa_id === id);
  const recarregar = () => ctx.irPara(`#/vendas/empresa/${id}`);
  el.innerHTML = `
    <div class="cab"><div><a class="peq" href="#/vendas/clientes">← Clientes</a><h1>${esc(e.nome)}</h1><p class="sub">${ops.filter(aberta).length} oportunidade(s) em aberto · ${ops.filter((o) => o.etapa === 'fechado').length} fechada(s)</p></div>
      <div class="acoes"><button class="btn pri" type="button" id="nova-op">+ Nova oportunidade</button></div></div>
    <div class="grade g2" style="align-items:start">
      <div class="grade" style="gap:14px">
        <div class="cartao"><h3>Dados da empresa</h3><form id="f-emp" class="grade mt" style="gap:10px" novalidate>
          <div class="campo"><label for="em-nome">Nome</label><input type="text" id="em-nome" value="${esc(e.nome)}"></div>
          <div class="grade g3" style="gap:10px">
            <div class="campo"><label for="em-tipo">Tipo</label><select id="em-tipo"><option value="">—</option><option value="cooperativa"${e.tipo === 'cooperativa' ? ' selected' : ''}>Cooperativa</option><option value="empresa"${e.tipo === 'empresa' ? ' selected' : ''}>Empresa</option><option value="outro"${e.tipo === 'outro' ? ' selected' : ''}>Outro</option></select></div>
            <div class="campo"><label for="em-cidade">Cidade</label><input type="text" id="em-cidade" value="${esc(e.cidade || '')}"></div>
            <div class="campo"><label for="em-uf">UF</label><input type="text" id="em-uf" maxlength="2" value="${esc(e.uf || '')}"></div></div>
          <div class="grade g3" style="gap:10px">
            <div class="campo"><label for="em-porte">Porte</label><input type="text" id="em-porte" placeholder="Ex.: 200 pessoas" value="${esc(e.porte || '')}"></div>
            <div class="campo"><label for="em-origem">Como chegou</label><select id="em-origem"><option value="">—</option>${ORIGENS.map((x) => `<option${x === e.origem ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
            <div class="campo"><label for="em-site">Site</label><input type="text" id="em-site" value="${esc(e.site || '')}"></div></div>
          <div class="campo"><label for="em-obs">Observações</label><textarea id="em-obs">${esc(e.observacoes || '')}</textarea></div>
          <div class="linha"><button class="btn pri" type="submit">Salvar</button></div></form></div>
        <div class="cartao"><div class="linha"><h3 style="flex:1">Contatos</h3><button class="btn peq" type="button" id="novo-contato">+ Contato</button></div>
          <div class="lista mt" id="lista-contatos">${contatos.length ? contatos.map((c) => htmlContato(c, null)).join('') : '<p class="apagado">Nenhum contato.</p>'}</div></div>
      </div>
      <div class="grade" style="gap:14px">
        <div class="cartao"><h3>Oportunidades</h3><div class="lista mt">${ops.length ? ops.map((o) => `<a class="item" href="#/vendas/oportunidade/${o.id}" style="grid-template-columns:1fr auto"><span><span class="nome">${esc(o.titulo)}</span><br><span class="info">${SERVICOS[o.servico] || ''} · ${dinheiro(o.valor)} · ${NOME_ETAPA[o.etapa]}${o.responsavel ? ` · ${esc(primeiroNome(o.responsavel.nome))}` : ''}</span></span>${seloTemp(o) || `<span class="selo ${o.etapa === 'fechado' ? '' : 'erro'}">${NOME_ETAPA[o.etapa]}</span>`}</a>`).join('') : '<p class="apagado">Nenhuma oportunidade ainda.</p>'}</div></div>
        <div class="cartao"><h3>Programas e turmas na plataforma</h3><div class="lista mt">${[...(prog.data || []).map((p) => `<a class="item" href="#/painel/programa/${p.id}" style="grid-template-columns:1fr auto"><span><span class="nome">${esc(p.nome)}</span><br><span class="info">Mentoria individual · ${dataBR(p.inicio)} a ${dataBR(p.fim_previsto)}</span></span><span class="selo neutro">${esc(p.status)}</span></a>`),
          ...(turm.data || []).map((t) => `<a class="item" href="#/turma/${t.id}" style="grid-template-columns:1fr auto"><span><span class="nome">${esc(t.nome)}</span><br><span class="info">Turma · ${dataBR(t.inicio)} a ${dataBR(t.fim_previsto)}</span></span><span class="selo neutro">${esc(t.status)}</span></a>`)].join('') || '<p class="apagado">Ainda não é cliente.</p>'}</div></div>
      </div></div>`;
  el.querySelector('#f-emp').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (k) => el.querySelector(`#em-${k}`).value.trim();
    const { error } = await sb.from('empresas').update({ nome: v('nome') || e.nome, tipo: v('tipo') || null, cidade: v('cidade') || null, uf: v('uf').toUpperCase() || null, porte: v('porte') || null, origem: v('origem') || null, site: v('site') || null, observacoes: v('obs') || null }).eq('id', id);
    if (error) { avisar(explicarErro(error), true); return; }
    avisar('Dados da empresa salvos.'); recarregar();
  });
  el.querySelector('#nova-op').addEventListener('click', () => formOportunidade(ctx, d, { empresaId: id }, (o) => ctx.irPara(`#/vendas/oportunidade/${o.id}`)));
  el.querySelector('#novo-contato').addEventListener('click', () => formContato(ctx, { empresaId: id }, recarregar));
  el.querySelector('#lista-contatos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-c-acao]'); if (!b) return;
    const c = contatos.find((x) => x.id === b.dataset.c);
    if (b.dataset.cAcao === 'editar') formContato(ctx, { contato: c }, recarregar);
    else if (b.dataset.cAcao === 'whats') window.open(linkWhats(c.whatsapp, `Olá, ${primeiroNome(c.nome)}! Aqui é ${primeiroNome(ctx.perfil.nome)}, da Mentorei.`), '_blank', 'noopener');
    else if (b.dataset.cAcao === 'email') { const op = ops.find(aberta) || ops[0]; if (op) janelaEmail(ctx, { ...op, empresa: e }, contatos, c, recarregar); else window.location.href = `mailto:${c.email}`; }
  });
}

// ---------- clientes ----------
function abaClientes(ctx, el, d, recarregar) {
  const h = hojeISO();
  el.innerHTML = `<div class="linha ag-filtros"><input type="search" id="c-texto" placeholder="Empresa, contato, cidade…" style="width:auto;min-width:240px" aria-label="Procurar"><button class="btn peq" type="button" id="nova-emp">+ Nova empresa</button>
      <span class="peq apagado">${d.empresas.length} empresas · ${d.contatos.filter((c) => c.ativo !== false).length} contatos · ${d.contatos.filter((c) => c.marketing && c.ativo !== false).length} na lista de marketing</span></div>
    <div class="tabela cartao" style="padding:0"><table id="tab"><thead><tr><th>Empresa</th><th>Tipo · cidade</th><th>Contatos</th><th>Em aberto</th><th>Fechado</th><th>Último contato</th></tr></thead><tbody></tbody></table></div>`;
  const desenhar = () => {
    const t = norm(el.querySelector('#c-texto').value);
    const linhas = d.empresas.filter((e) => {
      if (!t) return true;
      const cs = d.contatos.filter((c) => c.empresa_id === e.id).map((c) => c.nome);
      return norm([e.nome, e.cidade, e.uf, ...cs].join(' ')).includes(t);
    }).map((e) => {
      const cs = d.contatos.filter((c) => c.empresa_id === e.id && c.ativo !== false);
      const ops = d.oportunidades.filter((o) => o.empresa_id === e.id);
      const ab = ops.filter(aberta), fe = ops.filter((o) => o.etapa === 'fechado');
      const ult = ops.map((o) => o.ultima_interacao_em).filter(Boolean).sort().pop();
      return `<tr class="clicavel" data-ir="#/vendas/empresa/${e.id}"><td><b>${esc(e.nome)}</b></td><td class="peq">${[e.tipo, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).map(esc).join(' · ') || '—'}</td>
        <td class="peq">${cs.map((c) => esc(c.nome)).join(', ') || '—'}</td><td>${ab.length ? `${ab.length} · ${dinheiro(ab.reduce((a, o) => a + Number(o.valor || 0), 0))}` : '—'}</td>
        <td>${fe.length ? `${fe.length} · ${dinheiro(fe.reduce((a, o) => a + Number(o.valor || 0), 0))}` : '—'}</td><td class="peq">${ult ? `${dataBR(ult)}${diasDesde(ult) > 90 ? ' ❄' : ''}` : '—'}</td></tr>`;
    });
    el.querySelector('tbody').innerHTML = linhas.join('') || `<tr><td colspan="6" class="apagado">Nenhuma empresa${t ? ' com esse nome' : ''}.</td></tr>`;
  };
  void h;
  el.querySelector('#c-texto').addEventListener('input', desenhar);
  el.querySelector('#tab').addEventListener('click', (ev) => { const tr = ev.target.closest('[data-ir]'); if (tr) location.hash = tr.dataset.ir; });
  el.querySelector('#nova-emp').addEventListener('click', async () => {
    const nome = window.prompt('Nome da empresa:'); if (!nome || !nome.trim()) return;
    const { data, error } = await sb.from('empresas').insert({ nome: nome.trim() }).select('id').single();
    if (error) avisar(explicarErro(error), true); else ctx.irPara(`#/vendas/empresa/${data.id}`);
  });
  desenhar();
}

// ---------- relatórios ----------
async function abaRelatorios(ctx, el, d) {
  const ops = d.oportunidades;
  const h = hojeISO(), mes = h.slice(0, 7), ano = h.slice(0, 4);
  const soma = (l) => l.reduce((a, o) => a + Number(o.valor || 0), 0);
  const abertas = ops.filter(aberta), fechadas = ops.filter((o) => o.etapa === 'fechado'), perdidas = ops.filter((o) => o.etapa === 'perdido');
  const fechMes = fechadas.filter((o) => (o.fechado_em || '').slice(0, 7) === mes), fechAno = fechadas.filter((o) => (o.fechado_em || '').slice(0, 4) === ano);
  const { data: metas } = await sb.from('metas_vendas').select('*');
  const meta = (metas || []).find((m) => String(m.mes).slice(0, 7) === mes);
  const ticket = fechadas.length ? soma(fechadas) / fechadas.length : null;
  const tempo = fechadas.filter((o) => o.fechado_em).map((o) => (new Date(o.fechado_em) - new Date(o.criado_em)) / 86400000);
  const tempoMedio = tempo.length ? Math.round(tempo.reduce((a, b) => a + b, 0) / tempo.length) : null;
  const agrupar = (lista, chave) => { const m = new Map(); for (const o of lista) { const k = chave(o) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(o); } return [...m.entries()].sort((a, b) => soma(b[1]) - soma(a[1])); };
  const tabela = (titulo, grupos, extra = '') => `<div class="cartao"><h3>${titulo}</h3>${extra}<div class="tabela mt"><table><tr><th></th><th>Quantas</th><th>Valor</th></tr>${grupos.map(([k, l]) => `<tr><td>${esc(k)}</td><td>${l.length}</td><td>${dinheiro(soma(l))}</td></tr>`).join('') || '<tr><td colspan="3" class="apagado">Nada ainda.</td></tr>'}</table></div></div>`;
  const meses = []; for (let i = 11; i >= 0; i--) { const dt = new Date(Date.UTC(Number(ano), Number(h.slice(5, 7)) - 1 - i, 1)); meses.push(dt.toISOString().slice(0, 7)); }
  const nomeMes = (m) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  el.innerHTML = `
    <div class="grade g4">
      <div class="cartao numero"><b>${dinheiro(soma(abertas))}</b><span>pipeline em aberto (${abertas.length})</span></div>
      <div class="cartao numero"><b>${dinheiro(abertas.reduce((a, o) => a + Number(o.valor || 0) * chanceDe(o) / 100, 0))}</b><span>projeção ponderada pela chance</span></div>
      <div class="cartao numero"><b>${dinheiro(soma(fechMes))}</b><span>fechado neste mês (${fechMes.length})${meta ? ` · meta ${dinheiro(meta.valor)} · ${Math.round(soma(fechMes) / Number(meta.valor) * 100)}%` : ''}</span></div>
      <div class="cartao numero"><b>${dinheiro(soma(fechAno))}</b><span>fechado no ano (${fechAno.length})</span></div></div>
    <div class="grade g4 mt">
      <div class="cartao numero"><b>${abertas.filter((o) => temperatura(o) === 'quente').length}</b><span>🔥 quentes (interação há menos de 20 dias) · ${dinheiro(soma(abertas.filter((o) => temperatura(o) === 'quente')))}</span></div>
      <div class="cartao numero"><b>${abertas.filter((o) => temperatura(o) === 'esfriando').length}</b><span>❄ esfriando (mais de 3 meses sem interação) · ${dinheiro(soma(abertas.filter((o) => temperatura(o) === 'esfriando')))}</span></div>
      <div class="cartao numero"><b>${ticket == null ? '—' : dinheiro(ticket)}</b><span>ticket médio das fechadas</span></div>
      <div class="cartao numero"><b>${tempoMedio == null ? '—' : `${tempoMedio} dias`}</b><span>tempo médio para fechar</span></div></div>
    <div class="cartao mt"><div class="linha"><h3 style="flex:1">Meta do mês</h3><input type="number" id="meta-valor" min="0" step="100" placeholder="R$" value="${meta ? meta.valor : ''}" style="width:160px"><button class="btn peq" type="button" id="meta-salvar">Salvar meta de ${nomeMes(mes)}</button></div></div>
    <div class="grade g2 mt" style="align-items:start">
      ${tabela('Por etapa (em aberto)', ETAPAS.filter(([k]) => k !== 'fechado' && k !== 'perdido').map(([k, n]) => [n, abertas.filter((o) => o.etapa === k)]))}
      ${tabela('Perdidas: por que não fechou', agrupar(perdidas, (o) => MOTIVOS[o.motivo_perda] || 'Sem motivo'))}
      ${tabela('Por responsável (em aberto)', agrupar(abertas, (o) => (o.responsavel && o.responsavel.nome) || 'Sem responsável'))}
      ${tabela('Fechadas no ano, por responsável', agrupar(fechAno, (o) => (o.responsavel && o.responsavel.nome) || 'Sem responsável'))}
      ${tabela('Por serviço (em aberto)', agrupar(abertas, (o) => SERVICOS[o.servico]))}
      ${tabela('Fechadas no ano, por serviço', agrupar(fechAno, (o) => SERVICOS[o.servico]))}
      ${tabela('De onde vêm (todas)', agrupar(ops, (o) => o.origem || (o.empresa && o.empresa.origem)))}
      <div class="cartao"><h3>Fechado por mês (12 meses)</h3><div class="tabela mt"><table><tr><th>Mês</th><th>Quantas</th><th>Valor</th><th>Meta</th></tr>${meses.map((m) => { const l = fechadas.filter((o) => (o.fechado_em || '').slice(0, 7) === m); const mt = (metas || []).find((x) => String(x.mes).slice(0, 7) === m); return `<tr><td>${nomeMes(m)}</td><td>${l.length}</td><td>${dinheiro(soma(l))}</td><td class="peq apagado">${mt ? dinheiro(mt.valor) : '—'}</td></tr>`; }).join('')}</table></div></div>
    </div>`;
  el.querySelector('#meta-salvar').addEventListener('click', async () => {
    const v = el.querySelector('#meta-valor').value;
    if (v === '') { avisar('Escreva o valor da meta.', true); return; }
    const { error } = await sb.from('metas_vendas').upsert({ mes: `${mes}-01`, valor: Number(v), atualizado_em: new Date().toISOString() });
    if (error) { avisar(explicarErro(error), true); return; }
    avisar('Meta salva.'); ctx.irPara('#/vendas/relatorios');
  });
}

// ---------- modelos de mensagem ----------
async function abaModelos(ctx, el, recarregar) {
  const { data, error } = await sb.from('modelos_mensagem').select('*').order('ordem');
  if (error) { el.innerHTML = `<div class="aviso erro">${esc(explicarErro(error))}</div>`; return; }
  const ms = data || [];
  const bloco = (canal, titulo) => `<div class="cartao"><div class="linha"><h3 style="flex:1">${titulo}</h3><button class="btn peq" type="button" data-novo="${canal}">+ Modelo</button></div>
    <div class="lista mt">${ms.filter((m) => m.canal === canal).map((m) => `<button type="button" class="item" data-editar="${m.id}" style="grid-template-columns:1fr auto;text-align:left;font:inherit;cursor:pointer"><span><span class="nome">${esc(m.nome)}</span>${m.etapa ? ` <span class="selo neutro">${NOME_ETAPA[m.etapa] || m.etapa}</span>` : ''}<br><span class="info">${esc((m.assunto ? `${m.assunto} · ` : '') + m.texto.slice(0, 110))}…</span></span><span class="peq apagado">Editar</span></button>`).join('') || '<p class="apagado">Nenhum modelo.</p>'}</div></div>`;
  el.innerHTML = `<p class="peq apagado" style="margin-bottom:12px">Use {contato}, {empresa}, {responsavel}, {servico} e {valor}: a plataforma troca pelos dados da oportunidade na hora de enviar.</p>
    <div class="grade g2" style="align-items:start">${bloco('email', 'E-mail')}${bloco('whatsapp', 'WhatsApp')}</div>`;
  const form = (m) => {
    const html = `<form id="f-m" class="grade" style="gap:12px" novalidate>
      <div class="grade g3" style="gap:10px"><div class="campo"><label for="m-nome">Nome *</label><input type="text" id="m-nome" value="${esc(m.nome || '')}"></div>
        <div class="campo"><label for="m-canal">Canal</label><select id="m-canal"><option value="email"${m.canal === 'email' ? ' selected' : ''}>E-mail</option><option value="whatsapp"${m.canal === 'whatsapp' ? ' selected' : ''}>WhatsApp</option></select></div>
        <div class="campo"><label for="m-etapa">Etapa (opcional)</label><select id="m-etapa"><option value="">—</option>${ETAPAS.map(([k, n]) => `<option value="${k}"${k === m.etapa ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
      <div class="campo"><label for="m-assunto">Assunto (e-mail)</label><input type="text" id="m-assunto" value="${esc(m.assunto || '')}"></div>
      <div class="campo"><label for="m-texto">Texto *</label><textarea id="m-texto" style="min-height:180px">${esc(m.texto || '')}</textarea></div>
      <div class="linha"><button class="btn pri" type="submit">Salvar</button>${m.id ? '<button class="btn perigo" type="button" id="m-apagar">Apagar</button>' : ''}<button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
    const j = janela(m.id ? 'Editar modelo' : 'Novo modelo', html, { largura: 640 });
    const f = j.corpo.querySelector('#f-m');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const corpo = { nome: f.querySelector('#m-nome').value.trim(), canal: f.querySelector('#m-canal').value, etapa: f.querySelector('#m-etapa').value || null, assunto: f.querySelector('#m-assunto').value.trim() || null, texto: f.querySelector('#m-texto').value.trim() };
      if (!corpo.nome || !corpo.texto) { avisar('Preencha nome e texto.', true); return; }
      const r = m.id ? await sb.from('modelos_mensagem').update(corpo).eq('id', m.id) : await sb.from('modelos_mensagem').insert({ ...corpo, ordem: ms.length + 1 });
      if (r.error) { avisar(explicarErro(r.error), true); return; }
      avisar('Modelo salvo.'); j.fechar(); recarregar();
    });
    f.querySelector('#m-apagar')?.addEventListener('click', async () => { if (!window.confirm('Apagar este modelo?')) return; await sb.from('modelos_mensagem').delete().eq('id', m.id); j.fechar(); recarregar(); });
  };
  el.addEventListener('click', (ev) => {
    const n = ev.target.closest('[data-novo]'); if (n) { form({ canal: n.dataset.novo }); return; }
    const e = ev.target.closest('[data-editar]'); if (e) form(ms.find((m) => m.id === e.dataset.editar));
  });
}

// ---------- cartão do Painel ----------
export async function cartaoVendas(ctx, el) {
  const { data, error } = await sb.from('oportunidades').select('id, titulo, etapa, valor, proximo_contato_em, proximo_contato_obs, ultima_interacao_em, empresa:empresas(nome), quem:perfis!oportunidades_proximo_contato_por_fkey(nome)').not('etapa', 'in', '(fechado,perdido)');
  if (error) { el.innerHTML = ''; return; }
  const ops = data || [];
  const fimHoje = new Date(`${hojeISO()}T23:59:59-03:00`).getTime();
  const pend = ops.filter((o) => o.proximo_contato_em && new Date(o.proximo_contato_em).getTime() <= fimHoje).sort((a, b) => a.proximo_contato_em.localeCompare(b.proximo_contato_em));
  const sem = ops.filter((o) => !o.proximo_contato_em);
  const soma = ops.reduce((a, o) => a + Number(o.valor || 0), 0);
  el.innerHTML = `<div class="cartao destaque"><div class="linha"><h3 style="flex:1">Vendas: contatos para fazer ${pend.length ? `<span class="selo ${pend.some(atrasado) ? 'erro' : 'neutro'}">${pend.length}</span>` : ''}</h3><a class="btn peq" href="#/vendas">Abrir o pipeline</a></div>
    <p class="peq apagado">${ops.length} oportunidade(s) em aberto · ${dinheiro(soma)} · 🔥 ${ops.filter((o) => temperatura(o) === 'quente').length} quentes · ❄ ${ops.filter((o) => temperatura(o) === 'esfriando').length} esfriando${sem.length ? ` · <span style="color:var(--erro)">${sem.length} sem próximo contato marcado</span>` : ''}</p>
    ${pend.length ? `<div class="lista mt">${pend.slice(0, 8).map((o) => `<a class="pend" href="#/vendas/oportunidade/${o.id}"><b style="${atrasado(o) ? 'color:var(--erro)' : ''}">${dataBR(o.proximo_contato_em)}</b><span>${esc(o.empresa ? o.empresa.nome : '')} · ${esc(o.proximo_contato_obs || o.titulo)}${o.quem ? ` · ${esc(primeiroNome(o.quem.nome))}` : ''}</span></a>`).join('')}${pend.length > 8 ? `<p class="peq apagado">e mais ${pend.length - 8}.</p>` : ''}</div>` : '<p class="peq apagado mt">Nenhum contato de venda para hoje.</p>'}</div>`;
}
