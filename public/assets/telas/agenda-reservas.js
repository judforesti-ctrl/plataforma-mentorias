// Pré-bloqueios: a coordenação reserva datas para um cliente em negociação; cada mentor recebe o convite por e-mail
// e por WhatsApp e responde pelo link (sem precisar entrar na plataforma). Depois de 5 dias, a plataforma pede para
// confirmar ou liberar. Quando o cliente fecha, o pré-bloqueio vira turma com os módulos já nas datas certas.
import { sb, esc, avatar, avisar, explicarErro } from '../base.js';
import { PERIODOS, NOME_PERIODO, HORA_PADRAO, hoje, somarDias, diaCurto, ddmm, diasEntre, diaDe, choques, isoDe, horaDoTexto, periodosDoIntervalo } from '../agenda-regras.js';
import { janela, api, limparCache, faltaScript, primeiroNome, amostra } from './agenda-dados.js';

const QUANDO = [['dia', 'Dia inteiro'], ['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['manha,tarde', 'Manhã e tarde'], ['tarde,noite', 'Tarde e noite'], ['hora', 'Horário exato']];
const SIT = { pre: ['Pré-bloqueio', 'alerta'], confirmada: ['Reservado: cliente confirmou', ''], convertida: ['Virou turma', 'neutro'], liberada: ['Liberado', 'neutro'] };
const RESP = { aguardando: ['Esperando resposta', 'neutro'], aceito: ['Aceitou', ''], recusado: ['Não pode', 'erro'] };

const quandoDe = (x) => (x.hora_inicio ? 'hora' : !x.periodos || x.periodos.length === 3 ? 'dia' : x.periodos.join(','));
const ordemDatas = (r) => (r.datas || []).slice().sort((a, b) => a.dia.localeCompare(b.dia));
const primeiraData = (r) => (ordemDatas(r)[0] || {}).dia || '';
const clienteDe = (r) => (r.empresa && r.empresa.nome) || r.cliente || '';
const linkResposta = (token) => `${location.origin}/reserva.html?t=${token}`;
export const descreverData = (x, formato) => `${diaCurto(x.dia)} · ${formato === 'presencial' ? 'dia inteiro'
  : x.hora_inicio ? `${String(x.hora_inicio).slice(0, 5)}${x.duracao_min ? ` (${x.duracao_min} min)` : ''}`
  : quandoDe(x) === 'dia' ? 'dia inteiro' : x.periodos.map((p) => NOME_PERIODO[p].toLowerCase()).join(' e ')}`;

function textoWhats(ctx, r, m, token) {
  const cliente = clienteDe(r);
  const onde = r.formato === 'presencial'
    ? `Presencial${r.local ? ` em ${r.local}` : ''}${r.com_deslocamento !== false ? ' (a véspera e o dia seguinte ficam reservados para o deslocamento)' : ''}` : 'Online';
  return `Olá, ${primeiroNome(m.nome)}! Aqui é ${primeiroNome(ctx.perfil.nome)}, da Mentorei. Fiz um pré-bloqueio na sua agenda:\n\n*${r.titulo}*${cliente ? ` · ${cliente}` : ''}\n${onde}\n`
    + `${ordemDatas(r).map((x) => `• ${descreverData(x, r.formato)}`).join('\n')}${r.observacoes ? `\n\n${r.observacoes}` : ''}`
    + `\n\nVocê consegue? Responda por este link, é rapidinho:\n${linkResposta(token)}`;
}
async function abrirWhats(ctx, d, r, mentorId) {
  const x = (r.mentores || []).find((y) => y.mentor_id === mentorId);
  const m = d.mentores.find((y) => y.id === mentorId) || { nome: 'mentor' };
  const { janelaWhatsApp } = await import('./equipe.js');
  janelaWhatsApp({ titulo: `Pré-bloqueio · ${m.nome}`, whatsapp: m.whatsapp || '', texto: textoWhats(ctx, r, m, x.token),
    nota: 'O link é pessoal: a resposta cai direto na agenda da plataforma e a coordenação é avisada.' });
}
async function enviarEmails(reservaId, mentorIds = null) {
  const r = await api('/api/agenda-email', { acao: 'convite-reserva', reserva_id: reservaId, mentores: mentorIds });
  if (!r.ok) return { ok: false, mensagem: r.mensagem || 'sem resposta do servidor da plataforma' };
  return r;
}

// ---------- lista ----------
export function abaReservas(ctx, el, d, recarregar) {
  const h = hoje();
  const ord = (a, b) => primeiraData(a).localeCompare(primeiraData(b));
  const atencao = d.reservas.filter((r) => r.situacao === 'pre' && r.lembrar_em <= h).sort(ord);
  const esperando = d.reservas.filter((r) => r.situacao === 'pre' && r.lembrar_em > h).sort(ord);
  const confirmadas = d.reservas.filter((r) => r.situacao === 'confirmada').sort(ord);
  const encerradas = d.reservas.filter((r) => r.situacao === 'liberada' || r.situacao === 'convertida')
    .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em))).slice(0, 20);

  const cartao = (r) => {
    const dias = Math.max(0, diasEntre(diaDe(r.criado_em), h));
    const vencido = r.situacao === 'pre' && r.lembrar_em <= h;
    const ativo = r.situacao === 'pre' || r.situacao === 'confirmada';
    const [st, cls] = SIT[r.situacao];
    const novos = (r.mentores || []).filter((x) => x.respondido_em && !x.visto_em);
    return `<div class="cartao ag-reserva${vencido ? ' urgente' : ''}" data-r="${r.id}">
      <div class="linha"><div style="flex:1;min-width:220px"><h3>${amostra(r.situacao === 'confirmada' ? 'reservado' : 'pre')} ${esc(r.titulo)}</h3>
        <p class="peq apagado">${esc(clienteDe(r) || 'Cliente não informado')} · ${r.formato === 'presencial' ? `presencial${r.local ? ` em ${esc(r.local)}` : ''} · ${r.com_deslocamento !== false ? 'com deslocamento' : 'sem deslocamento'}` : 'online'}
          · criado há ${dias === 0 ? 'menos de 1 dia' : dias === 1 ? '1 dia' : `${dias} dias`}</p></div>
        <span class="selo ${cls}">${st}</span></div>
      ${vencido ? `<div class="aviso mt">Já se passaram ${dias} dias. <b>Confirme com o cliente ou libere a agenda</b> dos mentores.</div>` : ''}
      <div class="chips mt">${ordemDatas(r).map((x) => `<span class="chip ag-chip-data">${esc(descreverData(x, r.formato))}</span>`).join('')}</div>
      <div class="lista mt">${(r.mentores || []).map((x) => {
        const m = d.mentores.find((y) => y.id === x.mentor_id) || { id: x.mentor_id, nome: 'Mentor' };
        const [rt, rc] = RESP[x.resposta];
        return `<div class="ag-resp${x.respondido_em && !x.visto_em ? ' novo' : ''}"><span class="linha" style="gap:8px;flex-wrap:nowrap">${avatar(m)}<b>${esc(m.nome)}</b></span>
          <span class="selo ${rc}">${rt}${x.respondido_em ? ` em ${ddmm(diaDe(x.respondido_em))}` : ''}</span>${x.comentario ? `<span class="peq">“${esc(x.comentario)}”</span>` : ''}
          ${ativo && x.resposta !== 'recusado' ? `<span class="linha ag-resp-acoes"><button class="btn peq pri" type="button" data-whats="${x.mentor_id}">WhatsApp</button>
            <button class="btn peq" type="button" data-email="${x.mentor_id}">${x.email_enviado_em ? 'Reenviar e-mail' : 'Enviar e-mail'}</button></span>` : ''}</div>`;
      }).join('')}</div>
      ${r.observacoes ? `<p class="peq mt"><b>Observações:</b> ${esc(r.observacoes)}</p>` : ''}
      ${novos.length ? `<div class="linha mt"><span class="peq"><b>${novos.length === 1 ? '1 resposta nova' : `${novos.length} respostas novas`}.</b></span><button class="btn peq" type="button" data-visto>Ok, vi</button></div>` : ''}
      ${ativo ? `<div class="linha mt">
        ${r.situacao === 'pre' ? '<button class="btn pri peq" type="button" data-acao="confirmar">Cliente confirmou</button>' : ''}
        <button class="btn peq escuro" type="button" data-acao="turma">Transformar em turma</button>
        ${r.situacao === 'pre' ? '<button class="btn peq" type="button" data-acao="adiar">Lembrar daqui a 5 dias</button>' : ''}
        <button class="btn peq" type="button" data-acao="editar">Mudar</button>
        <button class="btn peq perigo" type="button" data-acao="liberar">Liberar a agenda</button></div>`
        : r.turma_id ? `<p class="peq mt"><a href="#/turma/${r.turma_id}">Abrir a turma criada</a></p>` : ''}
    </div>`;
  };
  const grupo = (titulo, lista, cls = '') => (lista.length ? `<h3 class="mt2${cls ? ' ag-tit-urgente' : ''}">${titulo} <span class="selo ${cls ? 'erro' : 'neutro'}">${lista.length}</span></h3>${lista.map(cartao).join('')}` : '');

  el.innerHTML = `
    <div class="linha" style="margin-bottom:6px"><p class="peq apagado" style="flex:1;min-width:240px">Reserve datas para um cliente em negociação. Cada mentor recebe o convite por e-mail e por WhatsApp
      e responde pelo link. Depois de 5 dias, o pré-bloqueio pede para você confirmar ou liberar.</p>
      <button class="btn pri" type="button" id="r-novo">+ Novo pré-bloqueio</button></div>
    ${d.faltaScript ? '<div class="vazio">Os pré-bloqueios ficam disponíveis depois que o script 14 for rodado no Supabase.</div>' : ''}
    ${grupo('Pedem a sua atenção', atencao, 'urgente')}
    ${grupo('Esperando o cliente', esperando)}
    ${grupo('Reservados (cliente confirmou)', confirmadas)}
    ${!d.faltaScript && !atencao.length && !esperando.length && !confirmadas.length ? '<div class="vazio mt">Nenhum pré-bloqueio em aberto.</div>' : ''}
    ${encerradas.length ? `<details class="mt2"><summary><b>Encerrados</b> (${encerradas.length})</summary>${encerradas.map(cartao).join('')}</details>` : ''}`;

  el.querySelector('#r-novo').addEventListener('click', () => abrirReserva(ctx, d, {}, recarregar));
  el.addEventListener('click', async (ev) => {
    const card = ev.target.closest('[data-r]'); if (!card) return;
    const r = d.reservas.find((x) => x.id === card.dataset.r);
    const w = ev.target.closest('[data-whats]'); if (w) { abrirWhats(ctx, d, r, w.dataset.whats); return; }
    const em = ev.target.closest('[data-email]');
    if (em) {
      em.disabled = true;
      const res = await enviarEmails(r.id, [em.dataset.email]);
      const x = res.resultados && res.resultados[0];
      avisar(x && x.enviado ? 'E-mail enviado.' : (x && x.mensagem) || res.mensagem || 'O e-mail não saiu.', !(x && x.enviado));
      em.disabled = false; if (x && x.enviado) em.textContent = 'Reenviar e-mail';
      return;
    }
    if (ev.target.closest('[data-visto]')) {
      const { error } = await sb.from('agenda_reserva_mentores').update({ visto_em: new Date().toISOString() }).eq('reserva_id', r.id).not('respondido_em', 'is', null);
      if (error) avisar(explicarErro(error), true); else { limparCache(); recarregar(); }
      return;
    }
    const a = ev.target.closest('[data-acao]'); if (!a) return;
    const acao = a.dataset.acao;
    if (acao === 'editar') { abrirReserva(ctx, d, { reserva: r }, recarregar); return; }
    if (acao === 'turma') { converterEmTurma(ctx, d, r, recarregar); return; }
    if (acao === 'liberar' && !window.confirm(`Liberar "${r.titulo}"? As datas voltam a ficar livres na agenda dos mentores.`)) return;
    const mud = acao === 'confirmar' ? { situacao: 'confirmada' } : acao === 'adiar' ? { lembrar_em: somarDias(h, 5) } : { situacao: 'liberada' };
    const { error } = await sb.from('agenda_reservas').update(mud).eq('id', r.id);
    if (error) { avisar(explicarErro(error), true); return; }
    limparCache();
    if (acao === 'liberar') { avisarLiberacao(ctx, d, r, recarregar); return; }
    avisar(acao === 'confirmar' ? 'Reservado: o cliente confirmou. Quando quiser, transforme em turma.' : 'Combinado: lembro de novo daqui a 5 dias.');
    recarregar();
  });
}

function avisarLiberacao(ctx, d, r, recarregar) {
  const quem = (r.mentores || []).filter((x) => x.resposta !== 'recusado').map((x) => d.mentores.find((m) => m.id === x.mentor_id)).filter(Boolean);
  const datas = ordemDatas(r).map((x) => ddmm(x.dia)).join(', ');
  const j = janela('Agenda liberada', `<p>As datas de <b>${esc(r.titulo)}</b> voltaram a ficar livres. Quer avisar os mentores?</p>
    <div class="linha mt">${quem.map((m) => `<button class="btn pri" type="button" data-m="${m.id}">Avisar ${esc(primeiroNome(m.nome))}</button>`).join('') || '<span class="apagado">Nenhum mentor para avisar.</span>'}</div>`,
  { aoFechar: recarregar });
  j.corpo.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-m]'); if (!b) return;
    const m = d.mentores.find((x) => x.id === b.dataset.m);
    const { janelaWhatsApp } = await import('./equipe.js');
    janelaWhatsApp({ titulo: `Agenda liberada · ${m.nome}`, whatsapp: m.whatsapp || '',
      texto: `Olá, ${primeiroNome(m.nome)}! Aqui é ${primeiroNome(ctx.perfil.nome)}, da Mentorei. O pré-bloqueio "${r.titulo}" (${datas}) foi liberado: esses dias estão livres de novo na sua agenda. Obrigada!` });
  });
}

// ---------- novo pré-bloqueio ou mudança ----------
export async function abrirReserva(ctx, d, { reserva = null, dias = [], mentores = [], formato = null }, aoSalvar) {
  if (d.faltaScript) { avisar('Os pré-bloqueios ficam disponíveis depois que o script 14 for rodado no Supabase.', true); return; }
  const r = reserva || {};
  const { data: empresas } = await sb.from('empresas').select('id, nome').order('nome');
  const form = formato || r.formato || 'online';
  const datas = r.id ? ordemDatas(r) : (dias.length ? dias : [{ dia: '', periodos: [...PERIODOS] }]);
  const escolhidos = new Set(r.id ? (r.mentores || []).map((x) => x.mentor_id) : mentores);
  const equipe = d.mentores.slice().sort((a, b) => (b.atende_grupo ? 1 : 0) - (a.atende_grupo ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const linhaData = (x = {}) => `<div class="ag-data-linha">
      <input type="date" class="d-dia" aria-label="Dia" value="${esc(x.dia || '')}">
      <select class="d-quando" aria-label="Quando">${QUANDO.map(([k, t]) => `<option value="${k}"${quandoDe(x) === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <span class="d-hora linha"${quandoDe(x) === 'hora' ? '' : ' hidden'}><input type="time" class="d-hi" aria-label="Começa às" value="${esc(x.hora_inicio ? String(x.hora_inicio).slice(0, 5) : '09:00')}" style="width:auto">
        <input type="number" class="d-dur" aria-label="Duração em minutos" min="15" step="15" value="${x.duracao_min || 120}" style="width:90px"><span class="peq">min</span></span>
      <span class="d-inteiro peq apagado" hidden>dia inteiro</span>
      <button type="button" class="btn peq" data-tirar aria-label="Tirar esta data">✕</button></div>`;
  const html = `<form id="f-res" class="grade" style="gap:14px" novalidate>
    <div class="campo"><label for="r-titulo">Título *</label><input type="text" id="r-titulo" value="${esc(r.titulo || '')}" placeholder="Ex.: Turma de gestores · 3 módulos"></div>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="r-empresa">Cliente</label><select id="r-empresa"><option value="">Cliente novo (ainda não cadastrado)</option>
        ${(empresas || []).map((e) => `<option value="${e.id}"${e.id === r.empresa_id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
      <div class="campo" id="r-cliente-caixa"><label for="r-cliente">Nome do cliente</label><input type="text" id="r-cliente" value="${esc(r.cliente || '')}" placeholder="Ex.: Grupo Exemplo"></div>
    </div>
    <div class="campo"><span class="rotulo">Formato</span><div class="linha">
      <label class="check"><input type="radio" name="r-formato" value="online"${form !== 'presencial' ? ' checked' : ''}><span>Online</span></label>
      <label class="check"><input type="radio" name="r-formato" value="presencial"${form === 'presencial' ? ' checked' : ''}><span>Presencial</span></label></div></div>
    <div class="grade g2" style="gap:10px" id="r-pres"${form === 'presencial' ? '' : ' hidden'}>
      <div class="campo"><label for="r-local">Cidade ou endereço</label><input type="text" id="r-local" value="${esc(r.local || '')}" placeholder="Ex.: Curitiba (PR)"></div>
      <label class="check" style="align-self:end"><input type="checkbox" id="r-desloc"${r.com_deslocamento !== false ? ' checked' : ''}><span>Precisa de deslocamento (pré-bloqueia também a véspera e o dia seguinte)</span></label>
    </div>
    <div class="campo"><span class="rotulo">Datas</span><div id="r-datas" class="grade" style="gap:8px">${datas.map(linhaData).join('')}</div>
      <button type="button" class="btn peq" id="r-mais" style="justify-self:start">+ Outra data</button></div>
    <div class="campo"><span class="rotulo">Mentores</span><p class="peq apagado">Ao lado de cada nome, a plataforma mostra se a pessoa está livre nas datas escolhidas.</p>
      <div id="r-mentores" class="lista">${equipe.map((m) => `<label class="ag-res-mentor"><input type="checkbox" value="${m.id}"${escolhidos.has(m.id) ? ' checked' : ''}>
        <span class="linha" style="gap:8px;flex-wrap:nowrap">${avatar(m)}<span>${esc(m.nome)}${m.atende_grupo ? '' : ' <span class="peq apagado">(individual)</span>'}</span></span>
        <span class="ag-res-st peq" data-st="${m.id}"></span></label>`).join('')}</div></div>
    <div class="campo"><label for="r-obs">Observações (o mentor vê)</label><textarea id="r-obs" style="min-height:70px" placeholder="Tema, público, o que já foi combinado. Não coloque valores.">${esc(r.observacoes || '')}</textarea></div>
    <label class="check"><input type="checkbox" id="r-email" checked><span>${r.id ? 'Mandar e-mail para quem precisa responder de novo (datas mudaram ou mentor novo)' : 'Mandar o convite por e-mail agora'}</span></label>
    <div class="linha"><button class="btn pri" type="submit" id="r-salvar">${r.id ? 'Salvar mudanças' : 'Pré-bloquear e convidar'}</button></div>
  </form>`;
  let salvou = false;
  const j = janela(r.id ? 'Mudar pré-bloqueio' : 'Novo pré-bloqueio', html, { largura: 760, aoFechar: () => { if (salvou) aoSalvar(); } });
  const f = j.corpo.querySelector('#f-res');
  const $ = (s) => f.querySelector(s);

  const lerDatas = () => {
    const pres = (f.querySelector('input[name=r-formato]:checked') || {}).value === 'presencial';
    return [...f.querySelectorAll('.ag-data-linha')].map((l) => {
      const q = l.querySelector('.d-quando').value;
      const dia = l.querySelector('.d-dia').value;
      if (pres) return { dia, periodos: [...PERIODOS], hora_inicio: null, duracao_min: null };
      if (q === 'hora') {
        const hi = l.querySelector('.d-hi').value || '09:00', dur = Number(l.querySelector('.d-dur').value) || 120;
        const h0 = horaDoTexto(hi);
        return { dia, periodos: periodosDoIntervalo(h0, Math.min(24, h0 + dur / 60)), hora_inicio: hi, duracao_min: dur };
      }
      return { dia, periodos: q === 'dia' ? [...PERIODOS] : q.split(','), hora_inicio: null, duracao_min: null };
    }).filter((x) => x.dia);
  };
  const atualizar = () => {
    const pres = (f.querySelector('input[name=r-formato]:checked') || {}).value === 'presencial';
    $('#r-pres').hidden = !pres;
    $('#r-cliente-caixa').hidden = !!$('#r-empresa').value;
    f.querySelectorAll('.ag-data-linha').forEach((l) => {
      l.querySelector('.d-quando').hidden = pres;
      l.querySelector('.d-inteiro').hidden = !pres;
      l.querySelector('.d-hora').hidden = pres || l.querySelector('.d-quando').value !== 'hora';
    });
    const ds = lerDatas();
    for (const m of equipe) {
      const alvo = f.querySelector(`[data-st="${m.id}"]`);
      if (!ds.length) { alvo.textContent = ''; continue; }
      const lista = ds.flatMap((x) => {
        const ini = x.hora_inicio ? Date.parse(isoDe(x.dia, x.hora_inicio)) : null;
        return choques(d.idx, m, { dia: x.dia, ini, fim: ini ? ini + x.duracao_min * 60000 : null, periodos: x.periodos, formato: pres ? 'presencial' : 'online', ignorar: r.id || null });
      });
      alvo.className = `ag-res-st peq ${lista.length ? 'tem' : 'livre'}`;
      alvo.textContent = lista.length ? `⚠ ${lista.length === 1 ? '1 aviso' : `${lista.length} avisos`}` : '✓ livre';
      alvo.title = lista.join('\n');
    }
  };
  f.addEventListener('input', atualizar);
  f.addEventListener('change', atualizar);
  $('#r-mais').addEventListener('click', () => {
    const ult = lerDatas().pop();
    $('#r-datas').insertAdjacentHTML('beforeend', linhaData(ult ? { ...ult, dia: '' } : {}));
    atualizar();
  });
  $('#r-datas').addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-tirar]'); if (!t) return;
    if (f.querySelectorAll('.ag-data-linha').length > 1) { t.closest('.ag-data-linha').remove(); atualizar(); }
  });
  f.querySelector('#r-mentores').addEventListener('click', (ev) => {
    const st = ev.target.closest('.ag-res-st.tem'); if (!st) return;
    ev.preventDefault();
    avisar(st.title.split('\n').slice(0, 3).join(' · '));
  });
  atualizar();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const titulo = $('#r-titulo').value.trim();
    const pres = (f.querySelector('input[name=r-formato]:checked') || {}).value === 'presencial';
    const ds = lerDatas();
    const ids = [...f.querySelectorAll('#r-mentores input:checked')].map((c) => c.value);
    if (!titulo) { avisar('Dê um título ao pré-bloqueio.', true); return; }
    if (!ds.length) { avisar('Escolha pelo menos uma data.', true); return; }
    if (new Set(ds.map((x) => x.dia)).size !== ds.length) { avisar('Há uma data repetida.', true); return; }
    if (ds.some((x) => !x.periodos.length)) { avisar('Confira o horário das datas.', true); return; }
    if (!ids.length) { avisar('Escolha pelo menos um mentor.', true); return; }
    const btn = $('#r-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    const dados = { titulo, empresa_id: $('#r-empresa').value || null, cliente: $('#r-empresa').value ? null : ($('#r-cliente').value.trim() || null),
      formato: pres ? 'presencial' : 'online', local: pres ? ($('#r-local').value.trim() || null) : null, com_deslocamento: pres ? $('#r-desloc').checked : true,
      observacoes: $('#r-obs').value.trim() || null };
    try {
      let id = r.id;
      let precisam = ids; // quem precisa receber o convite
      if (!id) {
        const { data, error } = await sb.from('agenda_reservas').insert({ ...dados, situacao: 'pre', lembrar_em: somarDias(hoje(), 5) }).select('id').single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await sb.from('agenda_reservas').update(dados).eq('id', id);
        if (error) throw error;
      }
      // datas: apaga e grava de novo; se mudaram, quem já tinha respondido responde de novo
      const assinatura = (lista) => JSON.stringify(lista.map((x) => [x.dia, (x.periodos || []).slice().sort(), x.hora_inicio ? String(x.hora_inicio).slice(0, 5) : null, x.duracao_min || null]).sort());
      const mudaramDatas = !r.id || assinatura(ordemDatas(r)) !== assinatura(ds) || (r.formato || 'online') !== dados.formato;
      if (mudaramDatas) {
        if (r.id) { const { error } = await sb.from('agenda_reserva_datas').delete().eq('reserva_id', id); if (error) throw error; }
        const { error } = await sb.from('agenda_reserva_datas').insert(ds.map((x) => ({ reserva_id: id, ...x })));
        if (error) throw error;
      }
      const antes = new Set((r.mentores || []).map((x) => x.mentor_id));
      const sair = [...antes].filter((x) => !ids.includes(x));
      const entrar = ids.filter((x) => !antes.has(x));
      if (sair.length) { const { error } = await sb.from('agenda_reserva_mentores').delete().eq('reserva_id', id).in('mentor_id', sair); if (error) throw error; }
      if (entrar.length) { const { error } = await sb.from('agenda_reserva_mentores').insert(entrar.map((m) => ({ reserva_id: id, mentor_id: m }))); if (error) throw error; }
      if (r.id) {
        const ficaram = ids.filter((x) => antes.has(x));
        if (mudaramDatas && ficaram.length) {
          const { error } = await sb.from('agenda_reserva_mentores').update({ resposta: 'aguardando', respondido_em: null, comentario: null, visto_em: null }).eq('reserva_id', id).in('mentor_id', ficaram);
          if (error) throw error;
        }
        precisam = mudaramDatas ? ids : entrar;
      }
      limparCache();
      salvou = true;
      // e-mail e WhatsApp
      const { data: nova, error: e2 } = await sb.from('agenda_reservas').select('*, empresa:empresas(id, nome), datas:agenda_reserva_datas(*), mentores:agenda_reserva_mentores(*)').eq('id', id).single();
      if (e2) throw e2;
      let res = null;
      if ($('#r-email').checked && precisam.length) res = await enviarEmails(id, precisam);
      mostrarPronto(ctx, d, j, nova, precisam, res, !!r.id);
    } catch (e) {
      btn.disabled = false; btn.textContent = r.id ? 'Salvar mudanças' : 'Pré-bloquear e convidar';
      avisar(faltaScript(e) ? 'Falta rodar o script 14 no Supabase.' : explicarErro(e), true);
    }
  });
}

function mostrarPronto(ctx, d, j, r, precisam, res, editou) {
  const porMentor = new Map(((res && res.resultados) || []).map((x) => [x.mentor_id, x]));
  const lista = (r.mentores || []).filter((x) => precisam.includes(x.mentor_id));
  j.corpo.innerHTML = `<div class="aviso ok"><b>${editou ? 'Pré-bloqueio atualizado.' : 'Pré-bloqueio feito.'}</b> As datas já aparecem na agenda${lista.length ? ', esperando a resposta dos mentores' : ''}.</div>
    ${lista.length ? `<p class="mt"><b>Agora mande também pelo WhatsApp</b> (o link é pessoal de cada um):</p>
      <div class="lista mt">${lista.map((x) => {
        const m = d.mentores.find((y) => y.id === x.mentor_id) || { nome: 'Mentor' };
        const em = porMentor.get(x.mentor_id);
        const st = !res ? '<span class="selo neutro">E-mail não enviado</span>' : em && em.enviado ? '<span class="selo">E-mail enviado</span>' : `<span class="selo alerta">E-mail não saiu${em && em.mensagem ? `: ${esc(em.mensagem)}` : res.mensagem ? `: ${esc(res.mensagem)}` : ''}</span>`;
        return `<div class="ag-resp"><span class="linha" style="gap:8px;flex-wrap:nowrap">${avatar(m)}<b>${esc(m.nome)}</b></span>${st}<span class="linha ag-resp-acoes"><button class="btn peq pri" type="button" data-whats="${x.mentor_id}">WhatsApp</button></span></div>`;
      }).join('')}</div>` : '<p class="peq apagado mt">Ninguém precisa responder de novo.</p>'}
    <div class="linha mt2"><button class="btn" type="button" data-fechar>Concluir</button></div>`;
  j.corpo.addEventListener('click', (ev) => { const w = ev.target.closest('[data-whats]'); if (w) abrirWhats(ctx, d, r, w.dataset.whats); });
}

// ---------- virar turma ----------
async function converterEmTurma(ctx, d, r, recarregar) {
  const [{ data: empresas }, { data: turmas }] = await Promise.all([
    sb.from('empresas').select('id, nome').order('nome'),
    sb.from('turmas').select('id, nome, empresa_id, modulos(numero)').order('criado_em', { ascending: false }),
  ]);
  const porNome = (empresas || []).find((e) => e.nome.trim().toLowerCase() === String(r.cliente || '').trim().toLowerCase());
  const empInicial = r.empresa_id || (porNome && porNome.id) || (r.cliente ? 'nova' : '');
  const quem = (r.mentores || []).filter((x) => x.resposta !== 'recusado');
  const ds = ordemDatas(r);
  const html = `<p class="peq">Vão ser criados <b>${ds.length} módulo${ds.length > 1 ? 's' : ''}</b>, um em cada data (${ds.map((x) => ddmm(x.dia)).join(', ')}), com os mentores marcados abaixo.
      Depois, na turma, você dá o título de cada módulo, confere o horário, o link da sala e envia os slides.</p>
    <div class="campo mt"><label for="c-emp">Empresa</label><select id="c-emp"><option value="">Escolha…</option>
      ${r.cliente && !porNome ? `<option value="nova"${empInicial === 'nova' ? ' selected' : ''}>Cadastrar "${esc(r.cliente)}" como empresa nova</option>` : ''}
      ${(empresas || []).map((e) => `<option value="${e.id}"${e.id === empInicial ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
    <div class="campo mt"><span class="rotulo">Turma</span>
      <label class="check"><input type="radio" name="c-turma" value="nova" checked><span>Turma nova:</span></label>
      <input type="text" id="c-nome" value="${esc(r.titulo)}" aria-label="Nome da turma nova">
      <label class="check mt"><input type="radio" name="c-turma" value="existente"><span>Acrescentar a uma turma que já existe:</span></label>
      <select id="c-existente" aria-label="Turma que já existe"></select></div>
    <div class="campo mt"><span class="rotulo">Mentores</span>${quem.map((x) => {
      const m = d.mentores.find((y) => y.id === x.mentor_id) || { nome: 'Mentor' };
      return `<label class="check"><input type="checkbox" value="${x.mentor_id}" checked><span>${esc(m.nome)}${x.resposta === 'aguardando' ? ' <span class="peq apagado">(ainda não respondeu)</span>' : ''}</span></label>`;
    }).join('') || '<p class="peq apagado">Nenhum mentor aceitou ainda: a turma nasce sem mentor e você escolhe depois.</p>'}</div>
    <div class="linha mt2"><button class="btn pri" type="button" id="c-criar">Criar a turma</button></div>`;
  const j = janela(`Transformar em turma · ${r.titulo}`, html, { largura: 620 });
  const $ = (s) => j.corpo.querySelector(s);
  const atualizarTurmas = () => {
    const emp = $('#c-emp').value;
    const opcoes = (turmas || []).filter((t) => t.empresa_id === emp);
    $('#c-existente').innerHTML = opcoes.length ? opcoes.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join('') : '<option value="">Nenhuma turma desta empresa</option>';
  };
  $('#c-emp').addEventListener('change', atualizarTurmas);
  atualizarTurmas();
  $('#c-criar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    let empresa = $('#c-emp').value;
    const nova = j.corpo.querySelector('input[name=c-turma]:checked').value === 'nova';
    const mentores = [...j.corpo.querySelectorAll('.campo input[type=checkbox]:checked')].map((c) => c.value);
    if (!empresa) { avisar('Escolha a empresa.', true); return; }
    if (nova && !$('#c-nome').value.trim()) { avisar('Dê um nome à turma.', true); return; }
    if (!nova && !$('#c-existente').value) { avisar('Escolha a turma.', true); return; }
    btn.disabled = true; btn.textContent = 'Criando…';
    try {
      if (empresa === 'nova') {
        const { data, error } = await sb.from('empresas').insert({ nome: r.cliente.trim() }).select('id').single();
        if (error) throw error;
        empresa = data.id;
      }
      let turmaId = $('#c-existente').value, inicio = 1;
      if (nova) {
        const { data, error } = await sb.from('turmas').insert({ empresa_id: empresa, nome: $('#c-nome').value.trim(), inicio: ds[0].dia, fim_previsto: ds[ds.length - 1].dia, status: 'planejada' }).select('id').single();
        if (error) throw error;
        turmaId = data.id;
      } else {
        const t = (turmas || []).find((x) => x.id === turmaId);
        inicio = ((t && t.modulos) || []).reduce((a, m) => Math.max(a, m.numero), 0) + 1;
      }
      const linhas = ds.map((x, i) => ({
        turma_id: turmaId, numero: inicio + i, titulo: `Módulo ${inicio + i}`,
        data_hora: isoDe(x.dia, x.hora_inicio || HORA_PADRAO[(x.periodos && x.periodos[0]) || 'manha']),
        duracao_min: x.duracao_min || null, formato: r.formato === 'presencial' ? 'presencial' : 'meet', local: r.formato === 'presencial' ? r.local : null,
      }));
      const { data: mods, error: e2 } = await sb.from('modulos').insert(linhas).select('id');
      if (e2) throw e2;
      if (mentores.length) {
        const vinc = (mods || []).flatMap((m) => mentores.map((id) => ({ modulo_id: m.id, mentor_id: id, com_deslocamento: r.com_deslocamento !== false })));
        const { error } = await sb.from('modulo_mentores').insert(vinc);
        if (error) throw error;
      }
      const { error: e3 } = await sb.from('agenda_reservas').update({ situacao: 'convertida', turma_id: turmaId, empresa_id: empresa }).eq('id', r.id);
      if (e3) throw e3;
      limparCache();
      avisar('Turma criada com os módulos nas datas do pré-bloqueio.');
      j.fechar();
      location.hash = `#/turma/${turmaId}`;
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Criar a turma';
      avisar(explicarErro(e), true);
    }
  });
}
