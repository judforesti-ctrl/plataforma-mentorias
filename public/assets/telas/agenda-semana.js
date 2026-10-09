// Agenda por semana (um dia por linha, data à direita, dias livres em verde) e reuniões marcadas pela plataforma:
// a janela "Agendar reunião" aceita gente da equipe e e-mails de fora (clientes, fornecedores); o servidor cria o convite
// na Google Agenda conectada, com link do Meet, e o Google avisa e põe a reunião na agenda de todos os envolvidos.
import { esc, avatar, horaBR, avisar } from '../base.js';
import { PERIODOS, hoje, somarDias, listaDias, segundaDaSemana, nomeSemana, nomeMes, diaCurto, feriadoDe, ordenar,
  estadoPeriodo, dispDe, horaDoTexto, periodosDoIntervalo, choques, quemDaReuniao, isoDe } from '../agenda-regras.js';
import { janela, api, amostra, primeiroNome, limparCache } from './agenda-dados.js';
import { abrirPessoal } from './agenda-pessoal.js';

// posição da semana (continua igual ao voltar para a agenda)
export const sem = { inicio: null };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const rotuloSemana = (dias) => {
  const a = dias[0], b = dias[dias.length - 1];
  const ma = Number(a.slice(5, 7)), mb = Number(b.slice(5, 7));
  return ma === mb ? `${Number(a.slice(8))} a ${Number(b.slice(8))} de ${nomeMes(ma)}` : `${Number(a.slice(8))} de ${nomeMes(ma).slice(0, 3)} a ${Number(b.slice(8))} de ${nomeMes(mb).slice(0, 3)}`;
};
const horaEv = (e) => {
  if (!e.ini) return '';
  const ini = horaBR(new Date(e.ini).toISOString());
  if (e.tipo === 'individual' || !e.fim) return ini;
  return `${ini} às ${horaBR(new Date(e.fim).toISOString())}`;
};

// ---------- a semana ----------
// eventos: lista já filtrada; mentor: null = toda a equipe. aoClicarDia(evento, dia) abre os detalhes quando o item não tem link.
export function vistaSemana(ctx, alvo, d, eventos, { mentor = null, recarregar, aoClicarDia = null, agendar = true } = {}) {
  if (!sem.inicio) sem.inicio = segundaDaSemana(hoje());
  const h = hoje();
  const nomeDe = (id) => primeiroNome((d.mentores.find((m) => m.id === id) || {}).nome || '');
  const doDia = (dia) => eventos.filter((e) => e.dia === dia && (!mentor || e.todos || e.mentores.includes(mentor.id)));
  const semana = listaDias(sem.inicio, somarDias(sem.inicio, 6));
  const dom = semana[6];
  const dias = doDia(dom).some((e) => e.tipo !== 'feriado') ? semana : semana.slice(0, 6);
  const disp = mentor ? dispDe(mentor) : null;

  const linha = (dia) => {
    const todos = doDia(dia);
    const evs = ordenar(todos.filter((e) => e.tipo !== 'feriado'));
    const f = feriadoDe(dia);
    const ocupam = evs.filter((e) => !e.naoOcupa);   // compromisso pessoal marcado como "disponível" aparece, mas não ocupa
    const foraTodos = !!(mentor && !ocupam.length && PERIODOS.every((p) => estadoPeriodo(todos, p, disp, dia).tipo === 'fora'));
    const livre = !ocupam.length && !f && !foraTodos && !evs.some((e) => e.naoOcupa && e.diaInteiro);   // viagem "disponível" no Google: não pinta de verde
    const classe = `ag-sem-dia${livre ? ' livre' : ''}${foraTodos ? ' fora' : ''}${dia === h ? ' hoje' : ''}${dia < h ? ' passado' : ''}`;
    const cartoes = evs.map((e) => {
      const quem = e.tipo === 'reuniao' ? e.sub : [...new Set(e.mentores.map(nomeDe).filter(Boolean))].join(', ');
      const hora = horaEv(e);
      const detalhe = hora && /^\d\d:\d\d[–-]/.test(e.sub || '') ? '' : e.sub;   // bloqueio com hora: o horário já está no título
      const sub = e.tipo === 'reuniao' ? quem : [mentor ? '' : quem, detalhe].filter(Boolean).join(' · ');
      const dica = `${e.titulo}${sub ? ` · ${sub}` : ''}`;
      return `<button type="button" class="ag-ev t-${e.tipo}${e.naoOcupa ? ' nao-ocupa' : ''}" data-ev="${esc(e.id)}" data-dia="${dia}" title="${esc(dica)}"><b>${hora ? `${esc(hora)} · ` : ''}${esc(e.titulo)}</b>${esc(sub)}</button>`;
    });
    if (f) cartoes.unshift(`<span class="ag-ev t-feriado" style="cursor:default"><b>Feriado</b>${esc(f)}</span>`);
    if (livre) cartoes.push(`<span class="ag-sem-livre">✓ ${mentor ? `Dia livre para ${esc(primeiroNome(mentor.nome))}` : 'Dia livre para toda a equipe'}</span>`);
    if (foraTodos) cartoes.push(`<span class="ag-ev t-fora" style="cursor:default"><b>Não atende</b>${esc(primeiroNome(mentor.nome))} não atende neste dia da semana</span>`);
    return `<div class="${classe}"><div class="ag-sem-dt"><b>${dia.slice(8)}</b><span>${nomeSemana(dia)} · ${nomeMes(Number(dia.slice(5, 7))).slice(0, 3)}</span>${f ? '<i>feriado</i>' : ''}</div>
      <div class="ag-sem-evs">${cartoes.join('')}</div></div>`;
  };

  alvo.innerHTML = `
    <div class="ag-sem-topo">
      <button class="btn peq" type="button" data-nav="-7" aria-label="Semana anterior">‹</button>
      <b>${esc(rotuloSemana(dias))}</b>
      <button class="btn peq" type="button" data-nav="7" aria-label="Próxima semana">›</button>
      <button class="btn peq" type="button" data-nav="0">Hoje</button>
      <span class="peq apagado">${mentor ? `Agenda de ${esc(mentor.nome)}` : 'Toda a equipe'} · clique num compromisso para ver os detalhes.</span>
      ${agendar ? `<div class="ag-sem-dir"><button class="btn reuniao" type="button" id="sem-reuniao">+ Agendar reunião</button></div>` : ''}
    </div>
    <div class="ag-sem">${dias.map(linha).join('')}</div>`;
  alvo.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const k = Number(b.dataset.nav);
    sem.inicio = k ? somarDias(sem.inicio, k) : segundaDaSemana(hoje());
    vistaSemana(ctx, alvo, d, eventos, { mentor, recarregar, aoClicarDia, agendar });
  }));
  alvo.querySelector('#sem-reuniao')?.addEventListener('click', () => abrirFormReuniao(ctx, d, { dia: sem.inicio >= h ? sem.inicio : h }, recarregar));
  // onclick (e não addEventListener): ao trocar de semana a vista é redesenhada no mesmo lugar e o clique não pode se acumular
  alvo.onclick = (ev) => {
    const c = ev.target.closest('[data-ev]'); if (!c) return;
    const e = eventos.find((x) => x.id === c.dataset.ev); if (!e) return;
    if (e.tipo === 'reuniao') { abrirReuniao(ctx, d, e.origem, recarregar); return; }
    if (e.tipo === 'pessoal') { abrirPessoal(e, (d.mentores.find((m) => m.id === e.mentores[0]) || {}).nome || ''); return; }
    if (e.link && e.link !== '#/agenda/pre') { location.hash = e.link; return; }
    if (aoClicarDia) aoClicarDia(e, c.dataset.dia);
  };
}

// ---------- reuniões ----------
const descQuando = (r) => `${diaCurto(r.dia)} · ${String(r.hora_inicio).slice(0, 5)} às ${String(r.hora_fim).slice(0, 5)}`;
const podeMexer = (ctx, r) => ctx.ehAdmin || r.criado_por === ctx.perfil.id;

// Lista das próximas reuniões (usada na aba Bloqueios).
export function htmlReunioes(ctx, d) {
  const h = hoje();
  const prox = (d.reunioes || []).filter((r) => r.situacao !== 'cancelada' && r.dia >= h).sort((a, b) => a.dia.localeCompare(b.dia) || String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
  return `<div class="cartao"><div class="linha"><h3 style="flex:1">Reuniões marcadas</h3><button class="btn reuniao peq" type="button" id="reuniao-nova">+ Agendar reunião</button></div>
    <p class="peq apagado">Com clientes, fornecedores ou entre a equipe. O convite sai pela Google Agenda, com o link do Meet, para todos os envolvidos (mesmo quem não tem cadastro aqui).</p>
    ${!d.temReunioes ? '<div class="aviso mt">Para guardar reuniões, falta rodar o script <b>18-reunioes.sql</b> no Supabase.</div>' : ''}
    ${prox.length ? `<div class="lista mt">${prox.map((r) => `<button type="button" class="item" data-reuniao="${r.id}" style="grid-template-columns:auto 1fr auto;text-align:left;font:inherit;cursor:pointer">
      ${amostra('reuniao')}<span><span class="nome">${esc(r.titulo)}</span><br><span class="info">${esc(descQuando(r))} · ${esc(quemDaReuniao(r) || 'sem participantes')}</span></span>
      <span class="peq ${r.google_evento_id ? 'apagado' : ''}" style="${r.google_evento_id ? '' : 'color:var(--erro)'}">${r.google_evento_id ? 'Convites enviados' : 'Convites não enviados'}</span></button>`).join('')}</div>`
      : '<p class="apagado mt">Nenhuma reunião marcada.</p>'}</div>`;
}
export function ligarReunioes(ctx, d, raiz, recarregar) {
  raiz.addEventListener('click', (ev) => {
    if (ev.target.id === 'reuniao-nova') { abrirFormReuniao(ctx, d, {}, recarregar); return; }
    const b = ev.target.closest('[data-reuniao]');
    if (b) { const r = (d.reunioes || []).find((x) => x.id === b.dataset.reuniao); if (r) abrirReuniao(ctx, d, r, recarregar); }
  });
}

// Detalhes de uma reunião: link do Meet, convidados, mudar, enviar convites e cancelar.
export function abrirReuniao(ctx, d, r, recarregar) {
  const mexe = podeMexer(ctx, r);
  const nomes = r.participantes_nomes || [];
  const html = `
    <p><b>${esc(descQuando(r))}</b></p>
    ${r.meet_link ? `<div class="linha mt"><a class="btn pri" href="${esc(r.meet_link)}" target="_blank" rel="noopener">Entrar no Meet</a><button class="btn" type="button" id="r-copiar">Copiar link do Meet</button></div>`
      : `<p class="peq mt" style="color:var(--erro)">Ainda sem link do Meet: os convites não foram enviados.${mexe ? ' Clique em <b>Enviar convites</b> (precisa da Google Agenda conectada no Painel).' : ''}</p>`}
    <h4 class="mt2">Quem participa</h4>
    <div class="chips mt">${nomes.map((n) => `<span class="chip" style="background:var(--verde-claro);color:var(--verde-esc)">${esc(n)}</span>`).join('')}
      ${(r.convidados || []).map((e) => `<span class="chip" style="background:var(--bg);color:var(--texto)">${esc(e)}</span>`).join('')}
      ${!nomes.length && !(r.convidados || []).length ? '<span class="apagado">Ninguém marcado.</span>' : ''}</div>
    ${r.pauta ? `<h4 class="mt2">Pauta</h4><p class="peq mt" style="white-space:pre-wrap">${esc(r.pauta)}</p>` : ''}
    <p class="peq apagado mt2">${r.google_evento_id ? `Convite enviado pela Google Agenda${r.convites_enviados_em ? ` em ${new Date(r.convites_enviados_em).toLocaleDateString('pt-BR')}` : ''}. Cada pessoa recebe por e-mail e a reunião entra na agenda dela.`
      : 'Convite ainda não enviado.'}</p>
    ${mexe ? `<div class="linha mt2"><button class="btn" type="button" data-acao="mudar">Mudar</button>
      ${!r.google_evento_id ? '<button class="btn pri" type="button" data-acao="enviar">Enviar convites</button>' : ''}
      <button class="btn perigo" type="button" data-acao="cancelar" style="margin-left:auto">Cancelar reunião</button></div>` : ''}`;
  const j = janela(`Reunião · ${r.titulo}`, html, { largura: 600 });
  j.corpo.querySelector('#r-copiar')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(r.meet_link); avisar('Link do Meet copiado.'); } catch (_) { window.prompt('Copie o link:', r.meet_link); }
  });
  j.corpo.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-acao]'); if (!b) return;
    if (b.dataset.acao === 'mudar') { j.fechar(); abrirFormReuniao(ctx, d, { reuniao: r }, recarregar); return; }
    b.disabled = true;
    if (b.dataset.acao === 'enviar') {
      const res = await api('/api/reuniao', { acao: 'enviar', id: r.id });
      j.fechar(); mostrarResultado(res, recarregar); return;
    }
    if (b.dataset.acao === 'cancelar') {
      if (!window.confirm(`Cancelar a reunião "${r.titulo}"? ${r.google_evento_id ? 'Os convidados recebem o aviso de cancelamento pelo Google.' : ''}`)) { b.disabled = false; return; }
      const res = await api('/api/reuniao', { acao: 'cancelar', id: r.id });
      if (!res.ok) { avisar(res.mensagem || 'Não consegui cancelar agora.', true); b.disabled = false; return; }
      avisar(res.google === 'cancelada' ? 'Reunião cancelada. O Google avisou os convidados.' : 'Reunião cancelada.');
      j.fechar(); limparCache(); recarregar();
    }
  });
}

// Janela para marcar (ou mudar) uma reunião.
// titulo e convidados iniciais servem para marcar a partir de uma oportunidade de venda (e-mail do contato já preenchido).
export async function abrirFormReuniao(ctx, d, { reuniao = null, dia = null, titulo: tituloIni = '', convidados: convIni = [] } = {}, aoSalvar) {
  const r = reuniao || {};
  const h = hoje();
  const diaIni = r.dia || dia || h;
  const hi = r.hora_inicio ? String(r.hora_inicio).slice(0, 5) : '10:00';
  const hf = r.hora_fim ? String(r.hora_fim).slice(0, 5) : '11:00';
  const marcados = new Set(r.participantes || [ctx.perfil.id]);
  const convidados = [...(r.convidados || convIni || [])];
  if (!r.titulo && tituloIni) r.titulo = tituloIni;
  const html = `<form id="f-reuniao" class="grade" style="gap:14px" novalidate>
    ${!d.temReunioes ? '<div class="aviso erro">Falta rodar o script <b>18-reunioes.sql</b> no Supabase. Sem ele, a reunião não é guardada.</div>' : ''}
    <div class="campo"><label for="r-titulo">Assunto *</label><input type="text" id="r-titulo" maxlength="200" placeholder="Ex.: Alinhamento com a gráfica" value="${esc(r.titulo || '')}" required></div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="r-dia">Dia *</label><input type="date" id="r-dia" value="${diaIni}" min="${h}" required></div>
      <div class="campo"><label for="r-ini">Início *</label><input type="time" id="r-ini" value="${hi}" step="300" required></div>
      <div class="campo"><label for="r-fim">Fim *</label><input type="time" id="r-fim" value="${hf}" step="300" required></div></div>
    <div class="campo"><span class="rotulo">Quem da equipe participa</span><div class="ag-pessoas" id="r-equipe"><span class="peq apagado">Carregando a equipe…</span></div></div>
    <div class="campo"><label for="r-email">E-mails de convidados de fora (clientes, fornecedores)</label>
      <div class="ag-emails" id="r-emails"><input type="email" id="r-email" placeholder="Digite o e-mail e aperte Enter" autocomplete="off"></div>
      <small>Não precisam ter cadastro na plataforma. O convite chega pelo Google, com o link do Meet.</small></div>
    <div class="campo"><label for="r-pauta">Pauta (vai junto no convite)</label><textarea id="r-pauta" maxlength="4000" placeholder="O que será tratado na reunião">${esc(r.pauta || '')}</textarea></div>
    <div id="r-choques"></div>
    <div class="linha"><button class="btn pri" type="submit" id="r-salvar">${reuniao ? 'Salvar e avisar os convidados' : 'Agendar e enviar convites'}</button><button class="btn" type="button" data-fechar>Desistir</button></div>
  </form>`;
  const j = janela(reuniao ? 'Mudar reunião' : 'Agendar reunião', html, { largura: 640 });
  const f = j.corpo.querySelector('#f-reuniao');

  // e-mails de fora, em fichinhas
  const caixa = f.querySelector('#r-emails'), campoEmail = f.querySelector('#r-email');
  const desenharEmails = () => {
    caixa.querySelectorAll('.chip').forEach((c) => c.remove());
    convidados.forEach((e, i) => { const c = document.createElement('span'); c.className = 'chip'; c.innerHTML = `${esc(e)} <button type="button" aria-label="Tirar ${esc(e)}" data-tirar="${i}">×</button>`; caixa.insertBefore(c, campoEmail); });
  };
  const addEmail = () => {
    const partes = campoEmail.value.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    let ruim = null;
    for (const e of partes) { if (!EMAIL.test(e)) { ruim = e; continue; } if (!convidados.includes(e)) convidados.push(e); }
    campoEmail.value = ruim || '';
    if (ruim) avisar(`"${ruim}" não parece um e-mail.`, true);
    desenharEmails();
    return !ruim;
  };
  campoEmail.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ',' || ev.key === ';') { ev.preventDefault(); addEmail(); } });
  campoEmail.addEventListener('blur', addEmail);
  caixa.addEventListener('click', (ev) => { const b = ev.target.closest('[data-tirar]'); if (b) { convidados.splice(Number(b.dataset.tirar), 1); desenharEmails(); } });
  desenharEmails();

  // fim sugerido: 1 hora depois do início
  f.querySelector('#r-ini').addEventListener('change', () => {
    const a = horaDoTexto(f.querySelector('#r-ini').value), b = horaDoTexto(f.querySelector('#r-fim').value);
    if (a != null && (b == null || b <= a)) { const t = Math.min(23.75, a + 1); f.querySelector('#r-fim').value = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`; }
  });

  // equipe (nomes vêm do servidor: o mentor não enxerga todos os perfis)
  const eq = await api('/api/reuniao', { acao: 'equipe' });
  const equipe = (eq.ok && eq.equipe) || [...d.mentores, ...(d.mentores.some((m) => m.id === ctx.perfil.id) ? [] : [ctx.perfil])].map((m) => ({ id: m.id, nome: m.nome, foto_url: m.foto_url, temEmail: true }));
  if (!f.isConnected) return;
  f.querySelector('#r-equipe').innerHTML = equipe.map((p) => `<label class="check"><input type="checkbox" value="${p.id}"${marcados.has(p.id) ? ' checked' : ''}>${avatar(p)}<span>${esc(p.nome)}${p.temEmail === false ? ' <span class="peq apagado">(sem e-mail)</span>' : ''}</span></label>`).join('')
    || '<span class="apagado">Ninguém encontrado.</span>';

  let confirmado = false;
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!addEmail()) { campoEmail.focus(); return; }
    const titulo = f.querySelector('#r-titulo').value.trim();
    const diaR = f.querySelector('#r-dia').value, ini = f.querySelector('#r-ini').value, fim = f.querySelector('#r-fim').value;
    const participantes = [...f.querySelectorAll('#r-equipe input:checked')].map((c) => c.value);
    if (!titulo) { avisar('Escreva o assunto da reunião.', true); return; }
    if (!diaR || !ini || !fim) { avisar('Preencha dia, início e fim.', true); return; }
    if (horaDoTexto(fim) <= horaDoTexto(ini)) { avisar('O fim precisa ser depois do início.', true); return; }
    if (!participantes.length && !convidados.length) { avisar('Marque pelo menos uma pessoa da equipe ou um e-mail de fora.', true); return; }
    // choques com a agenda de quem foi marcado (avisa, mas deixa marcar)
    if (!confirmado) {
      const a = horaDoTexto(ini), b = horaDoTexto(fim);
      const novo = { dia: diaR, ini: Date.parse(isoDe(diaR, ini)), fim: Date.parse(isoDe(diaR, fim)), periodos: periodosDoIntervalo(a, b), formato: 'online', ignorar: r.id || null };
      const lista = participantes.flatMap((id) => { const m = d.mentores.find((x) => x.id === id); return m ? choques(d.idx, m, novo) : []; }).filter((t) => !/fora dos dias e horários/.test(t));
      if (lista.length) {
        confirmado = true;
        f.querySelector('#r-choques').innerHTML = `<div class="aviso"><b>Atenção:</b> nesse horário já tem compromisso.<ul class="peq" style="margin:6px 0 0 18px">${[...new Set(lista)].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          <p class="peq mt">Se quiser marcar mesmo assim, clique de novo em <b>${reuniao ? 'Salvar' : 'Agendar'}</b>.</p></div>`;
        f.querySelector('#r-salvar').textContent = reuniao ? 'Salvar mesmo assim' : 'Agendar mesmo assim';
        return;
      }
    }
    const btn = f.querySelector('#r-salvar');
    btn.disabled = true; btn.textContent = 'Marcando e enviando os convites…';
    const res = await api('/api/reuniao', { acao: reuniao ? 'mudar' : 'criar', id: r.id, titulo, dia: diaR, hora_inicio: ini, hora_fim: fim, participantes, convidados, pauta: f.querySelector('#r-pauta').value.trim() });
    if (!res.ok) { avisar(res.mensagem || 'Não consegui marcar a reunião agora.', true); btn.disabled = false; btn.textContent = reuniao ? 'Salvar e avisar os convidados' : 'Agendar e enviar convites'; return; }
    j.fechar();
    mostrarResultado(res, () => { if (aoSalvar) aoSalvar(res.reuniao || null); });
  });
}

// Depois de marcar, mudar ou enviar: diz o que aconteceu com os convites e mostra o link do Meet.
function mostrarResultado(res, aoSalvar) {
  limparCache();
  if (!res.ok) { avisar(res.mensagem || 'Não deu certo agora.', true); if (aoSalvar) aoSalvar(); return; }
  const r = res.reuniao || {};
  const g = res.google;
  const ok = g === 'criada' || g === 'atualizada';
  const html = `
    ${ok ? `<div class="aviso ok"><b>${g === 'criada' ? 'Reunião marcada e convites enviados.' : 'Reunião atualizada e convidados avisados.'}</b> O Google mandou o convite para cada pessoa e a reunião já aparece na agenda de todos${res.semEmail && res.semEmail.length ? `, menos de ${esc(res.semEmail.join(', '))} (sem e-mail cadastrado)` : ''}.</div>`
      : g === 'desconectada' ? '<div class="aviso erro"><b>A reunião ficou na agenda da plataforma, mas os convites não saíram:</b> a Google Agenda não está conectada. Peça à administração para conectar no <b>Painel → Google Agenda</b> e depois abra a reunião e clique em <b>Enviar convites</b>.</div>'
      : `<div class="aviso erro"><b>A reunião ficou na agenda da plataforma, mas os convites não saíram.</b> ${esc(res.mensagem || 'A Google Agenda não respondeu.')} Abra a reunião e clique em <b>Enviar convites</b> para tentar de novo.</div>`}
    ${r.meet_link ? `<div class="campo mt"><label for="res-meet">Link do Meet</label><div class="linha"><input type="text" readonly id="res-meet" value="${esc(r.meet_link)}" style="flex:1;min-width:200px"><button class="btn" type="button" id="res-copiar">Copiar</button></div></div>` : ''}
    <div class="linha mt2"><button class="btn pri" type="button" data-fechar>Ok</button></div>`;
  const j = janela(r.titulo || 'Reunião', html, { largura: 560, aoFechar: () => { if (aoSalvar) aoSalvar(); } });
  j.corpo.querySelector('#res-copiar')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(r.meet_link); avisar('Link do Meet copiado.'); } catch (_) { j.corpo.querySelector('#res-meet').select(); avisar('Selecionei o link: aperte Ctrl + C.'); }
  });
}
