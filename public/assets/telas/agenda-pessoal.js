// Agenda pessoal (Gmail, Hotmail/Outlook...) dentro da plataforma: cada pessoa cola uma vez o link secreto da própria agenda
// e as reuniões que os clientes marcam direto com ela aparecem na agenda daqui, com o nome, ocupando o horário.
// O servidor (/api/agenda-pessoal) lê a agenda a cada 15 minutos; o link nunca volta para a tela. Só leitura.
import { esc, avatar, horaBR, avisar } from '../base.js';
import { diaDe, diaCurto } from '../agenda-regras.js';
import { janela, api, primeiroNome, limparCache } from './agenda-dados.js';

const RESP = { aceito: 'aceito', talvez: 'respondeu "talvez"', sem_resposta: 'convite ainda sem resposta (responda na sua agenda)' };
const FALTA_SCRIPT = '<div class="aviso erro mt">Falta rodar o script <b>24-agenda-pessoal.sql</b> no Supabase para ligar as agendas pessoais.</div>';

const quandoTexto = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const dia = diaDe(iso);
  const h = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `${dia === h ? 'hoje' : diaCurto(dia)}, ${horaBR(d.toISOString())}`;
};

// Quando é um compromisso pessoal, em texto: "seg, 12/10 · 14:00 às 15:00" ou "qua, 21/10 a sex, 23/10 · dia inteiro".
export function quandoPessoal(p) {
  const ini = Date.parse(p.inicio), fim = Date.parse(p.fim);
  const d0 = diaDe(p.inicio), d1 = diaDe(new Date(fim - 1).toISOString());
  if (p.dia_inteiro) return d0 === d1 ? `${diaCurto(d0)} · dia inteiro` : `${diaCurto(d0)} a ${diaCurto(d1)} · dia inteiro`;
  const hi = horaBR(new Date(ini).toISOString()), hf = horaBR(new Date(fim).toISOString());
  return d0 === d1 ? `${diaCurto(d0)} · ${hi} às ${hf}` : `${diaCurto(d0)}, ${hi} a ${diaCurto(d1)}, ${hf}`;
}

// Detalhes de um compromisso pessoal (na janela do compromisso e na janela do dia).
export function htmlDetalhesPessoal(p, { nome = '' } = {}) {
  const link = p.link && /^https:\/\//i.test(p.link) ? p.link : '';
  return `${link ? `<div class="linha mt"><a class="btn pri peq" href="${esc(link)}" target="_blank" rel="noopener">Entrar na reunião</a></div>` : ''}
    ${p.local ? `<p class="peq mt"><b>Local:</b> ${esc(p.local)}</p>` : ''}
    ${p.organizador ? `<p class="peq mt"><b>Marcada por:</b> ${esc(p.organizador)}${p.organizador_email && p.organizador_email !== p.organizador ? ` (${esc(p.organizador_email)})` : ''}</p>` : ''}
    ${RESP[p.resposta] && p.resposta !== 'aceito' ? `<p class="peq mt"><b>Resposta:</b> ${esc(RESP[p.resposta])}</p>` : ''}
    ${p.ocupa === false ? '<p class="peq mt">Na agenda de origem está marcado como <b>disponível</b>: aparece aqui, mas não ocupa o horário.</p>' : ''}
    <p class="peq apagado mt">Vem da agenda pessoal${nome ? ` de ${esc(primeiroNome(nome))}` : ''}. Para mudar ou cancelar, use a própria agenda (Gmail, Outlook):
      a plataforma só lê e se atualiza sozinha em até 15 minutos.</p>`;
}

export function abrirPessoal(e, nome = '') {
  const p = e.origem || {};
  janela(p.titulo || e.titulo, `<p><b>${esc(quandoPessoal(p))}</b></p>${htmlDetalhesPessoal(p, { nome })}
    <div class="linha mt2"><button class="btn" type="button" data-fechar>Fechar</button></div>`, { largura: 520 });
}

// ---------- passo a passo ----------
const AJUDA = `
  <details class="mt"><summary><b>Onde pego o link no Gmail (Google Agenda)</b></summary><ol class="peq">
    <li>No <b>computador</b>, abra <b>calendar.google.com</b> com a conta em que os clientes mandam os convites.</li>
    <li>Clique na <b>engrenagem</b> (em cima, à direita) e em <b>Configurações</b>.</li>
    <li>Na coluna da esquerda, em <b>Configurações das minhas agendas</b>, clique no <b>seu nome</b>.</li>
    <li>Desça a página até <b>Integrar agenda</b>. Em <b>Endereço secreto no formato iCal</b>, clique no botão de copiar (dois quadradinhos). Se o Google pedir, confirme.</li>
    <li>Volte aqui, cole no campo acima e clique no botão <b>Ligar</b>.</li></ol>
    <p class="peq apagado">Atenção: é o endereço <b>secreto</b>, não o "endereço público". Se essa opção não aparecer (contas da empresa), avise a coordenação.</p></details>
  <details class="mt"><summary><b>Onde pego o link no Hotmail ou Outlook</b></summary><ol class="peq">
    <li>No <b>computador</b>, abra <b>outlook.live.com</b> (Hotmail) ou <b>outlook.office.com</b> (Outlook da empresa) e entre na sua conta.</li>
    <li>Clique na <b>engrenagem</b> (Configurações), depois em <b>Calendário</b> e em <b>Calendários compartilhados</b>.</li>
    <li>Em <b>Publicar um calendário</b>, escolha <b>Calendário</b> e <b>Pode exibir todos os detalhes</b>. Clique em <b>Publicar</b>.</li>
    <li>Aparecem dois links: clique no link <b>ICS</b> (o que termina em <b>.ics</b>) e em <b>Copiar link</b>.</li>
    <li>Volte aqui, cole no campo acima e clique no botão <b>Ligar</b>.</li></ol>
    <p class="peq apagado">No Outlook, as mudanças podem levar algumas horas para chegar ao link (isso é do próprio Outlook).</p></details>
  <p class="peq apagado mt">O link é secreto: quem tem o link vê a agenda. Ele fica guardado só no servidor da plataforma e não aparece para mais ninguém.
    Compromissos marcados como <b>Particular</b> na sua agenda aparecem aqui só como "Particular".</p>`;

const htmlForm = (id, rotulo = 'Cole aqui o link da sua agenda', botao = 'Ligar minha agenda') => `
  <div class="campo mt"><label for="${id}">${rotulo}</label>
    <div class="linha"><input type="url" id="${id}" placeholder="https://calendar.google.com/calendar/ical/…" autocomplete="off" style="flex:1;min-width:220px">
      <button class="btn pri" type="button" data-ligar>${botao}</button></div></div>`;

const htmlResultado = (r) => `<div class="aviso ok mt"><b>Pronto! Encontrei ${r.total} ${r.total === 1 ? 'compromisso' : 'compromissos'}</b> (de 30 dias atrás a 6 meses à frente).
  ${(r.proximos || []).length ? `Os próximos:<ul class="peq" style="margin:6px 0 0 18px">${r.proximos.map((x) => `<li>${esc(x.dia_inteiro ? `${diaCurto(diaDe(x.inicio))} · dia inteiro` : quandoTexto(x.inicio))} · ${esc(x.titulo)}</li>`).join('')}</ul>` : ''}
  <p class="peq mt">Daqui para frente a plataforma confere a agenda sozinha a cada 15 minutos.</p></div>`;

function htmlSituacao(st) {
  if (!st.ligada) return '';
  const lido = st.lido_em ? `Última leitura: ${esc(quandoTexto(st.lido_em))} · ${st.total} ${st.total === 1 ? 'compromisso' : 'compromissos'}.` : 'Ainda não foi lida.';
  return `${st.erro ? `<div class="aviso erro mt"><b>A agenda não está sendo lida.</b> ${esc(st.erro)}${st.lido_em ? `<br><span class="peq">Última leitura que deu certo: ${esc(quandoTexto(st.lido_em))}.</span>` : ''}</div>` : ''}
    <div class="aviso ${st.erro ? '' : 'ok'} mt"><b>Ligada:</b> ${esc(st.nomeOrigem || 'Agenda')}${st.conta ? ` (${esc(st.conta)})` : ''}. ${lido}</div>`;
}

// Liga a agenda a partir do campo; devolve a resposta do servidor (ou null se deu erro, já avisado).
async function ligar(campo, botao, perfilId = null) {
  const url = campo.value.trim();
  if (!url) { avisar('Cole o link da agenda no campo.', true); campo.focus(); return null; }
  botao.disabled = true;
  const antes = botao.textContent;
  botao.textContent = 'Lendo a agenda…';
  const r = await api('/api/agenda-pessoal', { acao: 'ligar', url, ...(perfilId ? { perfil_id: perfilId } : {}) });
  botao.disabled = false; botao.textContent = antes;
  if (!r.ok) { avisar(r.mensagem || 'Não consegui ligar a agenda agora.', true); return null; }
  limparCache();
  return r;
}

// ---------- cartão da própria pessoa (Minha agenda) ----------
export async function cartaoAgendaPessoal(ctx, el, { aoMudar = null } = {}) {
  el.innerHTML = '<div class="cartao"><h3>Minha agenda pessoal aqui dentro</h3><p class="peq apagado mt">Carregando…</p></div>';
  const st = await api('/api/agenda-pessoal', { acao: 'status' });
  const desenhar = (s, resultado = null) => {
    const ligada = s.ligada;
    el.innerHTML = `<div class="cartao"><h3>Minha agenda pessoal aqui dentro</h3>
      <p class="peq mt">Reuniões que os clientes marcam direto com você (e o resto da sua agenda do Gmail ou do Hotmail) aparecem aqui sozinhas, com o nome,
        e ocupam o horário: assim ninguém marca nada por cima. A plataforma só <b>lê</b> a sua agenda, nunca muda nada nela.</p>
      ${!s.ok ? `<p class="peq mt">${esc(s.mensagem || 'Não consegui conferir agora.')}</p>` : s.script === false ? FALTA_SCRIPT : `
        ${resultado ? htmlResultado(resultado) : ''}
        ${htmlSituacao(s)}
        ${ligada ? `<div class="linha mt"><button class="btn" type="button" data-acao="atualizar">Atualizar agora</button>
            <button class="btn" type="button" data-acao="trocar">Trocar o link</button>
            <button class="btn perigo" type="button" data-acao="desligar" style="margin-left:auto">Desligar</button></div>
          <div data-troca${s.erro ? '' : ' hidden'}>${htmlForm('ap-url', 'Cole aqui o link novo')}${AJUDA}</div>`
        : `${htmlForm('ap-url')}${AJUDA}`}`}</div>`;
    el.querySelector('[data-ligar]')?.addEventListener('click', async (ev) => {
      const r = await ligar(el.querySelector('#ap-url'), ev.currentTarget);
      if (r) { desenhar({ ...r, ok: true, script: true }, r); if (aoMudar) aoMudar(); }
    });
    el.querySelector('#ap-url')?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); el.querySelector('[data-ligar]').click(); } });
    el.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
      const acao = b.dataset.acao;
      if (acao === 'trocar') { const t = el.querySelector('[data-troca]'); t.hidden = !t.hidden; if (!t.hidden) el.querySelector('#ap-url').focus(); return; }
      if (acao === 'desligar' && !window.confirm('Desligar a sua agenda pessoal? Os compromissos dela saem da plataforma (na sua agenda do Gmail ou do Hotmail nada muda).')) return;
      b.disabled = true;
      const r = await api('/api/agenda-pessoal', { acao });
      b.disabled = false;
      if (!r.ok) { avisar(r.mensagem || 'Não deu certo agora.', true); if (acao === 'atualizar') desenhar({ ...r, ok: true, script: true }); return; }
      avisar(acao === 'desligar' ? 'Agenda pessoal desligada.' : `Agenda lida agora: ${r.total} ${r.total === 1 ? 'compromisso' : 'compromissos'}.`);
      limparCache();
      desenhar({ ...r, ok: true, script: true });
      if (aoMudar) aoMudar();
    }));
  };
  desenhar(st);
}

// ---------- administração: a equipe toda ----------
export async function cartaoAgendasEquipe(ctx, el, mentores, { aoMudar = null } = {}) {
  el.innerHTML = '<div class="cartao"><h3>Agendas pessoais da equipe</h3><p class="peq apagado mt">Carregando…</p></div>';
  const st = await api('/api/agenda-pessoal', { acao: 'status', todos: true });
  const pessoas = (st.ok && st.pessoas) || {};
  const linhaPessoa = (m) => {
    const s = pessoas[m.id] || { ligada: false };
    const info = !s.ligada ? '<span class="apagado">Não ligada</span>'
      : s.erro ? `<span style="color:var(--erro)">Não está sendo lida: ${esc(s.erro)}</span>`
      : `${esc(s.nomeOrigem || 'Agenda')}${s.conta ? ` (${esc(s.conta)})` : ''} · ${s.lido_em ? `lida ${esc(quandoTexto(s.lido_em))} · ${s.total} ${s.total === 1 ? 'compromisso' : 'compromissos'}` : 'ainda não lida'}`;
    return `<div class="item" style="grid-template-columns:auto 1fr auto">${avatar(m)}
      <div style="min-width:0"><div class="nome">${esc(m.nome)}${m.id === ctx.perfil.id ? ' <span class="peq apagado">(você)</span>' : ''}
        ${s.ligada ? (s.erro ? ' <span class="selo erro">com problema</span>' : ' <span class="selo ok">ligada</span>') : ''}</div><div class="info">${info}</div></div>
      <div class="linha" style="gap:6px"><button class="btn peq${s.ligada ? '' : ' pri'}" type="button" data-ligar-de="${m.id}">${s.ligada ? 'Trocar link' : 'Ligar'}</button>
        ${s.ligada ? `<button class="btn peq" type="button" data-atualizar-de="${m.id}">Atualizar</button><button class="btn peq perigo" type="button" data-desligar-de="${m.id}">Desligar</button>` : ''}</div></div>`;
  };
  const desenhar = () => {
    const ligadas = mentores.filter((m) => (pessoas[m.id] || {}).ligada).length;
    el.innerHTML = `<div class="cartao"><h3>Agendas pessoais da equipe</h3>
      <p class="peq mt">Quando um cliente marca uma reunião direto no e-mail de alguém da equipe, ela aparece aqui na Agenda da equipe, com o nome, e ocupa o horário.
        Para isso, cada pessoa liga uma vez a própria agenda (Gmail ou Hotmail) em <b>Minha agenda</b>. Se preferir, a pessoa manda o link para você e você cola aqui, em <b>Ligar</b>.</p>
      <p class="peq apagado mt">A plataforma só lê essas agendas (a cada 15 minutos) e nunca muda nada nelas. Convites que a própria plataforma mandou não entram de novo.
        Compromissos marcados como "Particular" aparecem só como "Particular".</p>
      ${!st.ok ? `<p class="peq mt">${esc(st.mensagem || 'Não consegui conferir agora.')}</p>` : st.script === false ? FALTA_SCRIPT : `
        <p class="peq mt"><b>${ligadas} de ${mentores.length}</b> ${mentores.length === 1 ? 'pessoa ligou' : 'pessoas ligaram'} a agenda.</p>
        <div class="lista mt">${mentores.map(linhaPessoa).join('') || '<p class="apagado">Ninguém na equipe.</p>'}</div>
        ${ligadas ? '<div class="linha mt"><button class="btn" type="button" id="ap-todas">Ler todas agora</button></div>' : ''}`}</div>`;
    el.querySelector('#ap-todas')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true; b.textContent = 'Lendo as agendas…';
      const r = await api('/api/agenda-pessoal', { acao: 'atualizar', todos: true });
      avisar(r.ok ? `${r.lidas} ${r.lidas === 1 ? 'agenda lida' : 'agendas lidas'}${r.erros ? `, ${r.erros} com problema` : ''}.` : (r.mensagem || 'Não deu certo agora.'), !r.ok);
      limparCache();
      await recarregar();
    });
    el.querySelector('.lista')?.addEventListener('click', async (ev) => {
      const lig = ev.target.closest('[data-ligar-de]'), atu = ev.target.closest('[data-atualizar-de]'), des = ev.target.closest('[data-desligar-de]');
      if (lig) { abrirLigarPor(ctx, mentores.find((m) => m.id === lig.dataset.ligarDe), async () => { await recarregar(); if (aoMudar) aoMudar(); }); return; }
      const b = atu || des;
      if (!b) return;
      const id = b.dataset.atualizarDe || b.dataset.desligarDe;
      const m = mentores.find((x) => x.id === id);
      if (des && !window.confirm(`Desligar a agenda pessoal de ${m.nome}? Os compromissos dela saem da plataforma (na agenda dela nada muda).`)) return;
      b.disabled = true;
      const r = await api('/api/agenda-pessoal', { acao: des ? 'desligar' : 'atualizar', perfil_id: id });
      if (!r.ok) avisar(r.mensagem || 'Não deu certo agora.', true);
      else avisar(des ? 'Agenda desligada.' : `Agenda de ${primeiroNome(m.nome)} lida agora: ${r.total} ${r.total === 1 ? 'compromisso' : 'compromissos'}.`);
      limparCache();
      await recarregar();
      if (aoMudar && des) aoMudar();
    });
  };
  const recarregar = async () => {
    const n = await api('/api/agenda-pessoal', { acao: 'status', todos: true });
    if (n.ok) { Object.keys(pessoas).forEach((k) => delete pessoas[k]); Object.assign(pessoas, n.pessoas || {}); }
    desenhar();
  };
  desenhar();
}

// A administração cola o link que a pessoa mandou.
function abrirLigarPor(ctx, m, aoLigar) {
  const souEu = m.id === ctx.perfil.id;
  const j = janela(`Agenda pessoal · ${m.nome}`, `
    <p class="peq">${souEu ? 'Cole o link da sua agenda.' : `Cole o link da agenda que ${esc(primeiroNome(m.nome))} mandou. Se ainda não mandou, envie o passo a passo abaixo ou peça para a pessoa ligar a agenda em <b>Minha agenda</b>.`}</p>
    ${htmlForm('ap-url-por', 'Link da agenda', souEu ? 'Ligar minha agenda' : `Ligar a agenda de ${esc(primeiroNome(m.nome))}`)}
    <div id="ap-res"></div>${AJUDA}`, { largura: 640 });
  const campo = j.corpo.querySelector('#ap-url-por');
  campo.focus();
  campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); j.corpo.querySelector('[data-ligar]').click(); } });
  j.corpo.querySelector('[data-ligar]').addEventListener('click', async (ev) => {
    const r = await ligar(campo, ev.currentTarget, m.id);
    if (!r) return;
    j.corpo.querySelector('#ap-res').innerHTML = `${htmlResultado(r)}<div class="linha mt"><button class="btn pri" type="button" data-fechar>Ok</button></div>`;
    campo.value = '';
    aoLigar();
  });
}

