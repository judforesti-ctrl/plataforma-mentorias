// Remarcar uma sessão: muda o dia e o horário, acerta o convite da Google Agenda (se estiver conectada)
// e prepara as mensagens de WhatsApp para o mentorado e para o mentor.
import { sb, esc, avisar, explicarErro, isoParaLocal, localParaISO } from '../base.js';

const quando = (iso) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
};

export async function abrirRemarcar(ctx, sessaoId, aoSalvar = () => {}) {
  const { data: s, error } = await sb.from('sessoes').select(`id, numero, data_hora, concluida_em,
    mentor:perfis!sessoes_mentor_id_fkey(id, nome, whatsapp),
    mentorado:mentorados(*, perfil:perfis!mentorados_perfil_id_fkey(whatsapp),
      vinculos:mentor_mentorado(ordem, mentor:perfis(id, nome, whatsapp)))`).eq('id', sessaoId).maybeSingle();
  if (error || !s) { avisar(error ? explicarErro(error) : 'Sessão não encontrada.', true); return; }
  if (s.concluida_em) { avisar('Esta sessão já foi concluída e não pode ser remarcada.', true); return; }
  const m = s.mentorado || {};
  const local = isoParaLocal(s.data_hora);

  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(9,18,22,.55);z-index:40;display:grid;place-items:center;padding:16px';
  fundo.innerHTML = `<div class="cartao" role="dialog" aria-modal="true" aria-label="Remarcar sessão" style="width:100%;max-width:520px;max-height:90vh;overflow:auto">
    <div class="linha"><h3 style="flex:1">Remarcar sessão ${s.numero} · ${esc(m.nome || '')}</h3><button class="btn peq" data-fechar>Fechar</button></div>
    <p class="peq apagado mt">Hoje está marcada para: <b>${s.data_hora ? esc(quando(s.data_hora)) : 'sem data'}</b></p>
    <div class="grade g2 mt" style="gap:10px">
      <div class="campo"><label for="r-dia">Novo dia</label><input id="r-dia" type="date" value="${esc(local.slice(0, 10))}"></div>
      <div class="campo"><label for="r-hora">Novo horário</label><input id="r-hora" type="time" value="${esc(local.slice(11, 16))}"></div>
    </div>
    <div class="linha mt"><button class="btn pri" id="r-salvar">Remarcar</button></div>
    <div id="r-depois" class="mt"></div>
  </div>`;
  document.body.appendChild(fundo);
  let mudou = false;
  const fechar = () => { fundo.remove(); if (mudou) aoSalvar(); };
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });

  fundo.querySelector('#r-salvar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const dia = fundo.querySelector('#r-dia').value, hora = fundo.querySelector('#r-hora').value;
    if (!dia || !hora) { avisar('Escolha o novo dia e o horário.', true); return; }
    const novo = localParaISO(`${dia}T${hora}`);
    if (s.data_hora && new Date(novo).getTime() === new Date(s.data_hora).getTime()) { avisar('O dia e o horário são os mesmos de antes.', true); return; }
    btn.disabled = true; btn.textContent = 'Remarcando…';

    // 1. grava na plataforma
    const { error: e } = await sb.from('sessoes').update({ data_hora: novo, situacao: 'agendada' }).eq('id', s.id);
    if (e) { avisar(explicarErro(e), true); btn.disabled = false; btn.textContent = 'Remarcar'; return; }
    mudou = true;

    // 2. acerta a Google Agenda
    const depois = fundo.querySelector('#r-depois');
    depois.innerHTML = '<p class="peq apagado">Sessão remarcada. Atualizando a agenda…</p>';
    let ag = { agenda: 'erro', mensagem: 'Não foi possível falar com a Google Agenda.' };
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/api/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ sessao_id: s.id, antes: s.data_hora }) });
      ag = await r.json().catch(() => ag);
    } catch (_) { /* segue com a mensagem de erro */ }
    const convite = ag.agenda === 'atualizada' || ag.agenda === 'criada';
    const status = ag.agenda === 'atualizada' ? `<div class="aviso ok">O convite da Google Agenda foi atualizado e o Google avisou os convidados por e-mail${ag.link ? ` · <a href="${esc(ag.link)}" target="_blank" rel="noopener">ver na agenda</a>` : ''}.</div>`
      : ag.agenda === 'criada' ? `<div class="aviso ok">Não achei o convite antigo na agenda conectada, então criei um convite novo com a mesma sala do Meet e o Google enviou aos convidados${ag.link ? ` · <a href="${esc(ag.link)}" target="_blank" rel="noopener">ver na agenda</a>` : ''}. Se existir um convite antigo, apague-o na agenda de quem o criou.</div>`
      : ag.agenda === 'desconectada' ? '<div class="aviso">A Google Agenda não está conectada, então o convite não foi mudado. A administração conecta no Painel.</div>'
      : `<div class="aviso erro">${esc(ag.mensagem || 'A agenda não foi atualizada.')}</div>`;

    // 3. mensagens de WhatsApp
    const eu = ctx.perfil.nome.split(' ')[0];
    const meet = m.sala_meet ? `\n\nA sala do Google Meet continua a mesma:\n${m.sala_meet}` : '';
    const antes = s.data_hora ? `\nAntes: ${quando(s.data_hora)}` : '';
    const txtMentorado = `Olá, ${String(m.nome || '').split(' ')[0]}! Aqui é ${eu}, da Mentorei. A sua sessão ${s.numero} de mentoria foi remarcada.\n${antes}\nAgora: ${quando(novo)}${meet}${convite ? '\n\nO convite da agenda com o novo horário foi enviado para o seu e-mail.' : ''}\n\nQualquer dúvida, é só responder aqui.`;
    // quem conduz a sessão primeiro, depois os outros mentores do mentorado (dupla), sem repetir
    const mentores = [s.mentor, ...(m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((v) => v.mentor)]
      .filter((x, k, arr) => x && arr.findIndex((y) => y && y.id === x.id) === k);
    const txtMentor = (x) => `Olá, ${x.nome.split(' ')[0]}! Aqui é ${eu}, da Mentorei. A sessão ${s.numero} com ${m.nome} foi remarcada.\n${antes}\nAgora: ${quando(novo)}${meet}${convite ? '\n\nO convite da agenda já foi atualizado.' : ''}`;
    depois.innerHTML = `${status}
      <p class="peq mt"><b>Agora avise pelo WhatsApp:</b></p>
      <div class="linha mt"><button class="btn pri" id="r-whats-m">Avisar ${esc(String(m.nome || 'mentorado').split(' ')[0])}</button>
        ${mentores.map((x, k) => `<button class="btn pri" data-whats-mentor="${k}">Avisar ${esc(x.nome.split(' ')[0])} (mentoria)</button>`).join('')}</div>
      ${mentores.length ? '' : '<p class="peq apagado mt">Esta sessão não tem mentor ligado na plataforma.</p>'}`;
    btn.textContent = 'Remarcada';
    const { janelaWhatsApp } = await import('./equipe.js');
    depois.querySelector('#r-whats-m').addEventListener('click', () => janelaWhatsApp({ titulo: `Aviso de remarcação · ${m.nome}`,
      whatsapp: (m.perfil && m.perfil.whatsapp) || m.whatsapp || '', texto: txtMentorado }));
    depois.querySelectorAll('[data-whats-mentor]').forEach((b) => b.addEventListener('click', () => {
      const x = mentores[Number(b.dataset.whatsMentor)];
      janelaWhatsApp({ titulo: `Aviso de remarcação · ${x.nome}`, whatsapp: x.whatsapp || '', texto: txtMentor(x) });
    }));
  });
}

