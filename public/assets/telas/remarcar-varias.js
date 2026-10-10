// Remarcar VÁRIAS sessões do mesmo mentorado de uma vez (pedido da Cintia, 2026-10-10: "quero mudar o horário de todas as
// sessões de um mentorado e tenho que ir uma por uma"). Botão "Remarcar várias de uma vez" no Plano de sessões da ficha.
// Regra no alto (novo horário, dia da semana, mover X semanas) e a lista "hoje está → vai ficar", em que dá para ajustar qualquer
// sessão à mão antes de salvar. Sessão concluída ou cancelada não aparece. Confere choques na agenda dos mentores (sem contar as
// próprias sessões que estão mudando), grava, acerta a Google Agenda sessão por sessão (o mesmo caminho do remarcar de uma,
// /api/agenda, sem duplicar) e prepara UMA mensagem de WhatsApp para o mentorado e uma para cada mentor, com todas as datas novas.
import { sb, esc, avisar, explicarErro, isoParaLocal, localParaISO } from '../base.js';
import { somarDias, diaDaSemana } from '../agenda-regras.js';

const DIAS_SEMANA = [[1, 'segunda'], [2, 'terça'], [3, 'quarta'], [4, 'quinta'], [5, 'sexta'], [6, 'sábado']];
const MOVER = [[0, 'Não mover'], [1, '1 semana para frente'], [2, '2 semanas para frente'], [3, '3 semanas para frente'], [4, '4 semanas para frente'],
  [-1, '1 semana para trás'], [-2, '2 semanas para trás']];
const TZ = 'America/Sao_Paulo';
const quando = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
};
const curto = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')} às ${d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
};
const numeros = (l) => (l.length === 1 ? `da sessão ${l[0]}` : `das sessões ${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);

async function pedirAgendaSessao(sessaoId, antes, extra = {}) {
  let r0 = { agenda: 'erro', mensagem: 'Não foi possível falar com a Google Agenda.' };
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch('/api/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ sessao_id: sessaoId, antes, ...extra }) });
    r0 = await r.json().catch(() => r0);
  } catch (_) { /* segue com a mensagem de erro */ }
  return r0;
}

export async function abrirRemarcarVarias(ctx, mentoradoId, aoSalvar = () => {}) {
  const { data: m, error } = await sb.from('mentorados').select(`id, nome, whatsapp, sala_meet, programa:programas(duracao_min),
    perfil:perfis!mentorados_perfil_id_fkey(whatsapp), vinculos:mentor_mentorado(ordem, mentor:perfis(id, nome, whatsapp)),
    sessoes(id, numero, data_hora, duracao_min, concluida_em, situacao, mentor:perfis!sessoes_mentor_id_fkey(id, nome, whatsapp))`).eq('id', mentoradoId).maybeSingle();
  if (error || !m) { avisar(error ? explicarErro(error) : 'Mentorado não encontrado.', true); return; }
  const agora = Date.now();
  // em aberto; já vêm marcadas as que ainda vão acontecer (as que já passaram sem registro ficam desmarcadas)
  const linhas = (m.sessoes || []).filter((s) => !s.concluida_em && s.situacao !== 'cancelada').sort((a, b) => a.numero - b.numero)
    .map((s) => ({ s, antes: s.data_hora ? isoParaLocal(s.data_hora) : '', marcada: !!s.data_hora && new Date(s.data_hora).getTime() >= agora - 3600000, manual: false, novo: '' }));
  if (!linhas.length) { avisar('Este mentorado não tem sessões em aberto para remarcar.', true); return; }
  const duracao = (s) => s.duracao_min || (m.programa && m.programa.duracao_min) || 50;
  const regra = { hora: '', dia: '', semanas: 0 };
  const pelaRegra = (l) => {
    if (!l.antes) return '';
    let dia = l.antes.slice(0, 10), hora = l.antes.slice(11, 16);
    if (regra.dia) { const seg = somarDias(dia, -((diaDaSemana(dia) + 6) % 7)); dia = somarDias(seg, Number(regra.dia) - 1); }
    if (regra.semanas) dia = somarDias(dia, 7 * regra.semanas);
    if (regra.hora) hora = regra.hora;
    return `${dia}T${hora}`;
  };
  const completo = (x) => /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(x || '');
  const passou = (x) => completo(x) && new Date(localParaISO(x)).getTime() < Date.now();   // ex.: "passar para quinta" numa sessão de sábado desta semana
  const muda = (l) => l.marcada && completo(l.novo) && l.novo !== l.antes && !passou(l.novo);

  let mudou = false, aceitouChoques = false, salvo = false;
  const { janela } = await import('./agenda-dados.js');
  const j = janela(`Remarcar várias sessões · ${m.nome}`, `
    <p class="peq apagado">Escolha a mudança e confira a lista antes de salvar: dá para ajustar qualquer sessão à mão. Sessões concluídas não aparecem (ficam trancadas).</p>
    <div class="grade g3 mt" style="gap:10px">
      <div class="campo"><label for="rv-hora">Novo horário</label><input id="rv-hora" type="time"><small>Em branco: cada uma mantém o horário.</small></div>
      <div class="campo"><label for="rv-dia">Dia da semana</label><select id="rv-dia"><option value="">Manter o dia de cada sessão</option>${DIAS_SEMANA.map(([k, n]) => `<option value="${k}">Passar para ${n}</option>`).join('')}</select><small>Fica na mesma semana de cada sessão.</small></div>
      <div class="campo"><label for="rv-semanas">Mover as datas</label><select id="rv-semanas">${MOVER.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
    </div>
    <div class="tabela mt"><table class="rv-tabela">
      <thead><tr><th style="width:36px"><input type="checkbox" id="rv-todas" aria-label="Marcar todas as sessões"></th><th>Sessão</th><th>Hoje está</th><th>Vai ficar</th><th>Mentor</th></tr></thead>
      <tbody>${linhas.map((l, i) => `<tr data-i="${i}">
        <td><input type="checkbox" data-marcar="${i}"${l.marcada ? ' checked' : ''} aria-label="Remarcar a sessão ${l.s.numero}"></td>
        <td><b>${l.s.numero}</b></td>
        <td class="peq">${l.s.data_hora ? esc(curto(l.s.data_hora)) : '<span class="apagado">sem data</span>'}</td>
        <td><div class="linha rv-novo"><input type="date" data-dia="${i}" aria-label="Novo dia da sessão ${l.s.numero}"><input type="time" data-hora="${i}" aria-label="Novo horário da sessão ${l.s.numero}"></div>
          <div class="peq rv-obs" data-obs="${i}"></div></td>
        <td class="peq">${esc(l.s.mentor ? l.s.mentor.nome : '—')}</td></tr>`).join('')}</tbody></table></div>
    <div id="rv-choques" class="mt"></div>
    <div class="linha mt"><button class="btn pri" type="button" id="rv-salvar">Remarcar</button></div>
    <div id="rv-depois" class="mt"></div>`, { largura: 880, aoFechar: () => { if (mudou) aoSalvar(); } });
  const c = j.corpo;
  const btn = c.querySelector('#rv-salvar');

  const desenhar = () => {
    let n = 0;
    linhas.forEach((l, i) => {
      const dia = c.querySelector(`[data-dia="${i}"]`), hora = c.querySelector(`[data-hora="${i}"]`);
      dia.disabled = !l.marcada || salvo; hora.disabled = dia.disabled;
      if (!l.marcada) { l.manual = false; l.novo = l.antes; }
      else if (!l.manual) l.novo = pelaRegra(l);
      if (!l.manual) { dia.value = (l.novo || '').slice(0, 10); hora.value = (l.novo || '').slice(11, 16); }
      const vai = muda(l);
      if (vai) n += 1;
      c.querySelector(`tr[data-i="${i}"]`).classList.toggle('rv-muda', vai);
      const obs = c.querySelector(`[data-obs="${i}"]`);
      obs.textContent = !l.marcada ? '' : !completo(l.novo) ? 'Escolha o dia e o horário' : l.novo === l.antes ? 'Sem mudança'
        : passou(l.novo) ? '⚠ Essa data já passou: escolha outra aqui' : l.manual ? 'Ajustada à mão' : '';
      obs.classList.toggle('rv-alerta', l.marcada && l.novo !== l.antes && passou(l.novo));
    });
    const todas = c.querySelector('#rv-todas'), marc = linhas.filter((l) => l.marcada).length;
    todas.checked = marc === linhas.length; todas.indeterminate = marc > 0 && marc < linhas.length; todas.disabled = salvo;
    if (!salvo) {
      aceitouChoques = false;
      c.querySelector('#rv-choques').replaceChildren();
      btn.disabled = !n;
      btn.textContent = n ? `Remarcar ${n} ${n === 1 ? 'sessão' : 'sessões'}` : 'Remarcar';
    }
  };
  c.querySelector('#rv-hora').addEventListener('input', (ev) => { regra.hora = ev.target.value; desenhar(); });
  c.querySelector('#rv-dia').addEventListener('change', (ev) => { regra.dia = ev.target.value; desenhar(); });
  c.querySelector('#rv-semanas').addEventListener('change', (ev) => { regra.semanas = Number(ev.target.value); desenhar(); });
  c.querySelector('#rv-todas').addEventListener('change', (ev) => { linhas.forEach((l) => { l.marcada = ev.target.checked; }); desenhar(); });
  c.querySelector('tbody').addEventListener('change', (ev) => {
    const k = ev.target.dataset.marcar; if (k == null) return;
    linhas[Number(k)].marcada = ev.target.checked; desenhar();
  });
  c.querySelector('tbody').addEventListener('input', (ev) => {
    const k = ev.target.dataset.dia ?? ev.target.dataset.hora; if (k == null) return;
    const l = linhas[Number(k)];
    const dia = c.querySelector(`[data-dia="${k}"]`).value, hora = c.querySelector(`[data-hora="${k}"]`).value;
    l.manual = true; l.novo = dia && hora ? `${dia}T${hora}` : '';
    desenhar();
  });
  desenhar();

  btn.addEventListener('click', async () => {
    const lista = linhas.filter(muda);
    if (!lista.length || salvo) return;
    btn.disabled = true;
    if (!aceitouChoques) {
      btn.textContent = 'Conferindo a agenda…';
      const { verificarChoques, limparCache } = await import('./agenda-dados.js');
      limparCache();
      const ids = lista.map((l) => l.s.id);   // a hora antiga das que estão mudando não conta como choque
      const avisos = [];
      for (const l of lista) {
        const iguais = lista.filter((x) => x !== l && x.novo === l.novo);
        if (iguais.length) avisos.push(`Sessão ${l.s.numero}: fica no mesmo dia e horário da sessão ${iguais.map((x) => x.s.numero).join(', ')}.`);
        if (!l.s.mentor) continue;
        const ch = await verificarChoques(ctx, { mentorIds: [l.s.mentor.id], inicio: localParaISO(l.novo), duracaoMin: duracao(l.s), ignorar: ids });
        ch.forEach((x) => avisos.push(`Sessão ${l.s.numero}: ${x}`));
      }
      if (avisos.length) {
        c.querySelector('#rv-choques').innerHTML = `<div class="aviso"><b>Atenção na agenda:</b><ul class="peq">${[...new Set(avisos)].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <p class="peq mt">Ajuste a lista acima ou clique de novo para remarcar mesmo assim.</p></div>`;
        aceitouChoques = true; btn.disabled = false; btn.textContent = 'Remarcar mesmo assim';
        return;
      }
    }

    // 1. grava na plataforma, uma por uma (e conta a remarcação, para os números da agenda)
    const depois = c.querySelector('#rv-depois');
    const feitas = [], falhas = [];
    for (const [k, l] of lista.entries()) {
      btn.textContent = `Remarcando ${k + 1} de ${lista.length}…`;
      const novoIso = localParaISO(l.novo);
      const { error: e } = await sb.from('sessoes').update({ data_hora: novoIso, situacao: 'agendada' }).eq('id', l.s.id);
      if (e) { falhas.push(`sessão ${l.s.numero} (${explicarErro(e)})`); continue; }
      const { data: rc } = await sb.from('sessoes').select('remarcacoes').eq('id', l.s.id).maybeSingle();
      if (rc) await sb.from('sessoes').update({ remarcacoes: (rc.remarcacoes || 0) + 1 }).eq('id', l.s.id);
      feitas.push({ l, antesIso: l.s.data_hora, novoIso });
    }
    import('./agenda-dados.js').then(({ limparCache }) => limparCache());
    if (!feitas.length) { avisar(falhas.length ? `Não foi possível remarcar: ${falhas[0]}` : 'Nada foi remarcado.', true); btn.disabled = false; btn.textContent = 'Tentar de novo'; return; }
    mudou = true; salvo = true;
    desenhar();
    btn.disabled = true;
    btn.textContent = feitas.length === 1 ? '1 sessão remarcada' : `${feitas.length} sessões remarcadas`;

    // 2. acerta a Google Agenda, sessão por sessão
    const res = [];
    for (const [k, f] of feitas.entries()) {
      depois.innerHTML = `<p class="peq apagado">Atualizando a Google Agenda: ${k + 1} de ${feitas.length}…</p>`;
      const r = await pedirAgendaSessao(f.l.s.id, f.antesIso);
      res.push({ f, r });
      if (r.agenda === 'desconectada') break;   // as outras dariam o mesmo recado
    }
    const de = (tipo) => res.filter((x) => x.r.agenda === tipo);
    const ok = [...de('atualizada'), ...de('criada')];
    const naoAchou = de('nao_achou'), semPerm = de('sem_permissao'), desligada = de('desconectada');
    const erros = res.filter((x) => !['atualizada', 'criada', 'nao_achou', 'sem_permissao', 'desconectada'].includes(x.r.agenda));
    const num = (l) => l.map((x) => x.f.l.s.numero);
    const textoGoogle = () => [
      ok.length ? `<div class="aviso ok">${ok.length === 1 ? 'O convite' : `${ok.length} convites`} da Google Agenda ${ok.length === 1 ? 'foi atualizado' : 'foram atualizados'} (os mesmos convites, sem duplicar) e o Google avisou os convidados por e-mail.</div>` : '',
      naoAchou.length ? `<div class="aviso mt">Não achei o convite ${numeros(num(naoAchou))} na Google Agenda conectada. Para não duplicar, nenhum convite novo foi criado.
        Se ${naoAchou.length === 1 ? 'ela ainda não tinha' : 'elas ainda não tinham'} convite, clique abaixo.<div class="linha mt"><button class="btn peq" type="button" id="rv-criar">Criar ${naoAchou.length === 1 ? 'o convite' : 'os convites'}</button></div></div>` : '',
      semPerm.length ? `<div class="aviso mt">O convite ${numeros(num(semPerm))} foi criado pela conta <b>${esc(semPerm[0].r.organizador || 'de outra pessoa')}</b>, e só ela pode mudar o horário. Mude lá, na Google Agenda dessa conta. Nada foi duplicado.</div>` : '',
      desligada.length ? '<div class="aviso mt">A Google Agenda não está conectada, então os convites não foram mudados. A administração conecta no Painel.</div>' : '',
      erros.length ? `<div class="aviso erro mt">A Google Agenda não respondeu no caso ${numeros(num(erros))}: ${esc(erros[0].r.mensagem || 'tente de novo mais tarde')}.</div>` : '',
      falhas.length ? `<div class="aviso erro mt">Não foi possível remarcar: ${esc(falhas.join('; '))}.</div>` : '',
    ].join('');

    // 3. WhatsApp: uma mensagem para o mentorado e uma para cada mentor, com todas as datas novas
    const eu = ctx.perfil.nome.split(' ')[0];
    const convite = ok.length > 0;
    const meet = m.sala_meet ? `\n\nA sala do Google Meet continua a mesma:\n${m.sala_meet}` : '';
    const itens = (l) => l.map((f) => `• Sessão ${f.l.s.numero}: ${quando(f.novoIso)}${f.antesIso ? `\n   (antes: ${quando(f.antesIso)})` : ''}`).join('\n');
    const umaOuVarias = (n) => (n === 1 ? ['Uma sessão', 'mudou'] : ['Algumas sessões', 'mudaram']);
    const [qm, vm] = umaOuVarias(feitas.length);
    const txtMentorado = `Olá, ${String(m.nome || '').split(' ')[0]}! Aqui é ${eu}, da Mentorei. ${qm} da sua mentoria ${vm} de dia ou horário:\n\n${itens(feitas)}${meet}${convite ? '\n\nOs convites da agenda com os novos horários foram enviados para o seu e-mail.' : ''}\n\nQualquer dúvida, é só responder aqui.`;
    // os mentores do mentorado (dupla) e quem conduz cada sessão, sem repetir; cada um recebe as sessões que conduz
    const mentores = [...(m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((v) => v.mentor), ...feitas.map((f) => f.l.s.mentor)]
      .filter((x, k, arr) => x && arr.findIndex((y) => y && y.id === x.id) === k)
      .map((x) => ({ ...x, delas: feitas.filter((f) => f.l.s.mentor && f.l.s.mentor.id === x.id) }))
      .filter((x) => x.delas.length);
    const txtMentor = (x) => { const [q, v] = umaOuVarias(x.delas.length); return `Olá, ${x.nome.split(' ')[0]}! Aqui é ${eu}, da Mentorei. ${q} com ${m.nome} ${v} de dia ou horário:\n\n${itens(x.delas)}${meet}${convite ? '\n\nO convite da agenda já foi atualizado.' : ''}`; };
    depois.innerHTML = `<div id="rv-google">${textoGoogle()}</div>
      <p class="peq mt"><b>Agora avise pelo WhatsApp (uma mensagem com todas as datas):</b></p>
      <div class="linha mt"><button class="btn pri" type="button" id="rv-whats-m">Avisar ${esc(String(m.nome || 'mentorado').split(' ')[0])}</button>
        ${mentores.map((x, k) => `<button class="btn pri" type="button" data-whats-mentor="${k}">Avisar ${esc(x.nome.split(' ')[0])} (${x.delas.length} ${x.delas.length === 1 ? 'sessão' : 'sessões'})</button>`).join('')}</div>`;
    avisar(feitas.length === 1 ? 'Sessão remarcada.' : `${feitas.length} sessões remarcadas.`);
    const { janelaWhatsApp } = await import('./equipe.js');
    depois.addEventListener('click', async (ev) => {
      if (ev.target.id === 'rv-whats-m') { janelaWhatsApp({ titulo: `Aviso de remarcação · ${m.nome}`, whatsapp: (m.perfil && m.perfil.whatsapp) || m.whatsapp || '', texto: txtMentorado }); return; }
      const b = ev.target.closest('[data-whats-mentor]');
      if (b) { const x = mentores[Number(b.dataset.whatsMentor)]; janelaWhatsApp({ titulo: `Aviso de remarcação · ${x.nome}`, whatsapp: x.whatsapp || '', texto: txtMentor(x) }); return; }
      if (ev.target.id === 'rv-criar') {
        ev.target.disabled = true; ev.target.textContent = 'Criando…';
        for (const x of naoAchou) x.r = await pedirAgendaSessao(x.f.l.s.id, x.f.antesIso, { criar: true });
        const criados = naoAchou.filter((x) => x.r.agenda === 'criada' || x.r.agenda === 'atualizada');
        ok.push(...criados);
        erros.push(...naoAchou.filter((x) => !criados.includes(x)));
        naoAchou.splice(0);
        c.querySelector('#rv-google').innerHTML = textoGoogle();
      }
    });
  });
}
