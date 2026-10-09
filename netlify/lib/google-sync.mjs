// Convites na Google Agenda: a conta Google conectada no Painel (a da coordenação) cria, muda e cancela um evento para cada
// compromisso da plataforma, com os envolvidos como convidados. Assim tudo aparece na agenda (e no celular) de cada um:
// sessões individuais (mentor e, se ligado, mentorado), aulas das turmas, dias de deslocamento, bloqueios, recessos e pré-bloqueios.
// Cada evento tem uma "chave" (ex.: sessao:<id>) guardada em google_eventos, para mudar sempre o mesmo convite e nunca duplicar.
// Convites RECORRENTES (séries semanais feitas à mão para os mentorados) nunca são apagados pela plataforma: ao remarcar,
// muda só aquela ocorrência; na conferência de duplicados e na limpeza, eles ficam protegidos.
import { createHash, createHmac } from 'node:crypto';
import { env, supa, acessoGoogle, agenda, FUSO, SITE } from './google.mjs';
import { dadosAgenda } from './agenda.mjs';
import { emailReal } from './email.mjs';
import { PERIODOS, somarDias, hoje, diaDe, diaCurto, diaDaSemana, rotuloBloqueio, moduloPresencial } from '../../public/assets/agenda-regras.js';

const FAIXA = { manha: ['08:00', '12:00'], tarde: ['13:00', '18:00'], noite: ['18:00', '22:00'] };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const COR = { sessao: '9', modulo: '10', desloc: '6', bloqueio: '11', recesso: '8', reserva: '5' };
const recorrente = (ev) => !!(ev && (ev.recurringEventId || (ev.recurrence && ev.recurrence.length)));
export const hash = (x) => createHash('sha1').update(x).digest('hex');
const idDe = (chave) => `mnt${hash(chave)}`;                       // id fixo: o mesmo compromisso nunca vira dois eventos
const msDe = (dia, hora) => Date.parse(`${dia}T${hora}:00-03:00`);
const horario = (ini, fim) => ({ start: { dateTime: new Date(ini).toISOString(), timeZone: FUSO }, end: { dateTime: new Date(fim).toISOString(), timeZone: FUSO } });
const diaInteiro = (de, ate) => ({ start: { date: de }, end: { date: somarDias(ate, 1) } });
const faixa = (periodos) => { const ps = PERIODOS.filter((p) => (periodos || PERIODOS).includes(p)); return [FAIXA[(ps[0] || 'manha')][0], FAIXA[(ps[ps.length - 1] || 'noite')][1]]; };
export const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const chaveFundo = () => createHmac('sha256', env('SUPABASE_SECRET_KEY')).update('google-sync-fundo').digest('hex');

export async function lerConfig() {
  const r = await supa('/rest/v1/configuracoes?chave=eq.google_convites&select=valor');
  const v = (r.ok && Array.isArray(r.dados) && r.dados[0] && r.dados[0].valor) || {};
  return { equipe: !!v.equipe, mentorados: !!v.mentorados };
}
export async function salvarResultado(res) {
  await supa('/rest/v1/configuracoes', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    corpo: { chave: 'google_sync', valor: { ...res, em: new Date().toISOString() }, atualizado_em: new Date().toISOString() } });
}
export async function eventoGuardado(chave) {
  const r = await supa(`/rest/v1/google_eventos?chave=eq.${encodeURIComponent(chave)}&select=*`);
  return (r.ok && Array.isArray(r.dados) && r.dados[0]) || null;
}
export async function guardarEvento(chave, eventoId, { assinatura = null, inicio = null, adotado = false } = {}) {
  await supa('/rest/v1/google_eventos', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    corpo: { chave, evento_id: eventoId, assinatura, inicio, adotado, atualizado_em: new Date().toISOString() } });
}

// Procura, perto de um ou mais horários, um convite que já existe para a sessão (criado à mão ou por versão antiga da plataforma):
// pela sala do Meet, pelo e-mail do mentorado ou pelo nome dele no título. Devolve o melhor candidato ou nada.
export async function procurarConvite(token, { perto = [], nome = '', emails = [], sala = '', ignorar = new Set() }) {
  const codigo = (String(sala).match(/meet\.google\.com\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})/i) || [])[1];
  const nomeN = norm(nome);
  const partes = nomeN.split(' ').filter((p) => p.length > 2);
  const curto = partes.length >= 2 ? `${partes[0]} ${partes[partes.length - 1]}` : '';
  const em = emails.filter(Boolean).map((e) => e.toLowerCase());
  for (const iso of perto.filter(Boolean)) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    const q = new URLSearchParams({ timeMin: new Date(t - 3 * 3600e3).toISOString(), timeMax: new Date(t + 3 * 3600e3).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
    const lista = await agenda(token, `/calendars/primary/events?${q}`);
    const evs = ((lista.ok && lista.dados && lista.dados.items) || []).filter((ev) => ev.status !== 'cancelled' && !ignorar.has(ev.id));
    const pontos = (ev) => {
      const txt = norm(`${ev.summary || ''} ${ev.description || ''}`);
      let p = 0;
      if (codigo && JSON.stringify(ev).toLowerCase().includes(codigo.toLowerCase())) p += 3;
      if ((ev.attendees || []).some((a) => em.includes(String(a.email || '').toLowerCase()))) p += 3;
      if (nomeN && (txt.includes(nomeN) || (curto && txt.includes(curto)))) p += 2;
      else if (partes[0] && new RegExp(`\\b${partes[0]}\\b`).test(txt)) p += 1;
      if (ev.start && Date.parse(ev.start.dateTime || ev.start.date) === t) p += 1;
      return p;
    };
    const cand = evs.map((ev) => [pontos(ev), ev]).filter(([p]) => p >= 2).sort((a, b) => b[0] - a[0]);
    if (cand.length) return cand[0][1];
  }
  return null;
}

// ---------- o que deveria estar na Google Agenda ----------
function desejados(d, cfg) {
  const out = new Map();
  const semEmail = new Set();
  const agoraMs = Date.now();
  const h = hoje();
  const email = (id) => { const p = d.pessoas.find((x) => x.id === id); return p && emailReal(p.email) ? p.email.toLowerCase() : null; };
  const convidados = (lista) => [...new Set(lista.filter(Boolean))].map((e) => ({ email: e }));
  const add = (chave, tipo, iniMs, fimMs, corpo, busca = null) => {
    if (fimMs < agoraMs) return;                                    // o passado não muda
    out.set(chave, { tipo, inicio: new Date(iniMs).toISOString(), busca,
      corpo: { status: 'confirmed', ...corpo, colorId: COR[tipo], guestsCanInviteOthers: false, guestsCanModify: false, reminders: { useDefault: true } } });
  };

  // sessões individuais: quem conduz e o mentorado
  if (cfg.equipe || cfg.mentorados) {
    for (const s of d.sessoes) {
      if (!s.data_hora || s.situacao === 'cancelada') continue;
      const m = s.mentorado || {};
      if (m.status === 'desligado' || m.status === 'concluido') continue;
      const prog = m.programa || {};
      const dur = s.duracao_min || prog.duracao_min || 50;
      const ini = Date.parse(s.data_hora);
      const lista = [];
      if (cfg.equipe) lista.push(email(s.mentor_id));
      const emailM = ((m.perfil && m.perfil.email) || m.email || '').toLowerCase();
      if (cfg.mentorados) {
        const autorizou = !(m.perfil && m.perfil.autorizacoes && m.perfil.autorizacoes.email === false);
        if (autorizou && emailM) lista.push(emailM); else if (autorizou) semEmail.add(m.nome);
      }
      const sala = String(m.sala_meet || '').trim();
      add(`sessao:${s.id}`, 'sessao', ini, ini + dur * 60000, {
        summary: `Mentoria Mentorei · ${m.nome || 'Mentorado'} · Sessão ${s.numero}`,
        description: [s.tema ? `Tema: ${s.tema}` : '', `Sessão ${s.numero}${prog.nome ? ` do programa ${prog.nome}` : ''}${prog.empresa && prog.empresa.nome ? ` (${prog.empresa.nome})` : ''}.`,
          sala ? `Sala do Google Meet: ${sala}` : '', `Plataforma de mentorias: ${SITE}`].filter(Boolean).join('\n\n'),
        location: sala || undefined, ...horario(ini, ini + dur * 60000), attendees: convidados(lista),
      }, { nome: m.nome, emails: [emailM, m.email], sala });
    }
  }
  if (!cfg.equipe) return { out, semEmail };

  // aulas das turmas e dias de deslocamento
  for (const md of d.modulos) {
    if (!md.data_hora) continue;
    const t = md.turma || {};
    const pres = moduloPresencial(md);
    const dur = md.duracao_min || (pres ? 240 : 120);
    const ini = Date.parse(md.data_hora);
    const local = pres ? (md.local || t.local || '') : (md.link || '');
    const ments = md.mentores || [];
    add(`modulo:${md.id}`, 'modulo', ini, ini + dur * 60000, {
      summary: `${t.nome || 'Turma'} · Módulo ${md.numero}: ${md.titulo || ''}`.trim(),
      description: [t.empresa && t.empresa.nome ? `Cliente: ${t.empresa.nome}` : '', pres ? `Aula presencial${local ? ` em ${local}` : ''}.` : `Aula online${local ? `: ${local}` : ''}.`,
        `Tudo da aula (slides, recomendações, percepções): ${SITE}/app.html#/modulo/${md.id}`].filter(Boolean).join('\n\n'),
      location: local || undefined, ...horario(ini, ini + dur * 60000), attendees: convidados(ments.map((v) => email(v.mentor_id))),
    });
    if (pres) {
      for (const v of ments) {
        if (v.com_deslocamento === false) continue;
        for (const k of [-1, 1]) {
          const dia = somarDias(diaDe(md.data_hora), k);
          add(`desloc:${md.id}:${v.mentor_id}:${k}`, 'desloc', msDe(dia, '00:00'), msDe(dia, '23:59'), {
            summary: `Deslocamento (${k < 0 ? 'ida' : 'volta'}) · ${t.nome || 'Turma'}${local ? ` · ${local}` : ''}`,
            description: `Dia reservado para a viagem da aula presencial de ${diaCurto(diaDe(md.data_hora))}.`, ...diaInteiro(dia, dia), attendees: convidados([email(v.mentor_id)]),
          });
        }
      }
    }
  }

  // bloqueios dos mentores e recessos da Mentorei
  for (const b of d.bloqueios) {
    if (b.fim < h) continue;
    const rec = b.tipo === 'recesso';
    const lista = rec ? d.mentores.map((m) => emailReal(m.email) && m.email.toLowerCase()) : [email(b.mentor_id)];
    const titulo = rec ? `Recesso da Mentorei${b.motivo ? ` · ${b.motivo}` : ''}` : b.tipo === 'ferias' ? 'Férias / folga'
      : rotuloBloqueio(b) === 'Bloqueio' ? 'Bloqueio de agenda' : `Bloqueio · ${rotuloBloqueio(b)}`;
    const desc = rec ? 'Recesso da Mentorei: sem compromissos nesses dias.' : [b.motivo ? `Detalhes: ${b.motivo}` : '', 'Bloqueio registrado na agenda da plataforma da Mentorei.'].filter(Boolean).join('\n');
    const dias = !rec && b.dias_semana && b.dias_semana.length ? b.dias_semana.map(Number) : null;
    let primeiro = b.inicio;
    if (dias) { for (let i = 0; i < 7 && !dias.includes(diaDaSemana(primeiro)); i++) primeiro = somarDias(primeiro, 1); }
    const todos = !b.hora_inicio && (!b.periodos || b.periodos.length === 3);
    const fimMs = msDe(b.fim, '23:59');
    let corpo;
    if (todos && !dias) corpo = diaInteiro(b.inicio, b.fim);
    else if (todos) corpo = { ...diaInteiro(primeiro, primeiro), recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${dias.map((n) => BYDAY[n]).join(',')};UNTIL=${b.fim.replace(/-/g, '')}`] };
    else {
      const [hi, hf] = b.hora_inicio ? [String(b.hora_inicio).slice(0, 5), String(b.hora_fim || b.hora_inicio).slice(0, 5)] : faixa(b.periodos);
      corpo = horario(msDe(primeiro, hi), msDe(primeiro, hf));
      if (dias) corpo.recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${dias.map((n) => BYDAY[n]).join(',')};UNTIL=${b.fim.replace(/-/g, '')}T235959Z`];
      else if (b.fim > b.inicio) corpo.recurrence = [`RRULE:FREQ=DAILY;UNTIL=${b.fim.replace(/-/g, '')}T235959Z`];
    }
    add(`${rec ? 'recesso' : 'bloqueio'}:${b.id}`, rec ? 'recesso' : 'bloqueio', msDe(primeiro, '00:00'), fimMs, { summary: titulo, description: desc, ...corpo, attendees: convidados(lista) });
  }

  // pré-bloqueios e reservas (com o deslocamento, quando presencial)
  for (const r of d.reservas) {
    if (r.situacao !== 'pre' && r.situacao !== 'confirmada') continue;
    const quem = (r.mentores || []).filter((x) => x.resposta !== 'recusado');
    const pres = r.formato === 'presencial';
    const pre = r.situacao === 'pre';
    const cliente = (r.empresa && r.empresa.nome) || r.cliente || '';
    const base = {
      summary: `${pre ? 'Pré-bloqueio' : 'Reservado'} · ${r.titulo}`, status: pre ? 'tentative' : 'confirmed',
      description: [cliente ? `Cliente: ${cliente}` : '', pres ? `Presencial${r.local ? ` em ${r.local}` : ''}.` : 'Online.',
        pre ? 'Ainda não confirmado pelo cliente. Responda se consegue pelo link que a Mentorei mandou por e-mail ou WhatsApp.' : 'O cliente confirmou.', r.observacoes || ''].filter(Boolean).join('\n\n'),
      attendees: convidados(quem.map((x) => email(x.mentor_id))),
    };
    for (const dt of r.datas || []) {
      const chave = `reserva:${r.id}:${dt.dia}`;
      if (pres || (!dt.hora_inicio && (!dt.periodos || dt.periodos.length === 3))) {
        add(chave, 'reserva', msDe(dt.dia, '00:00'), msDe(dt.dia, '23:59'), { ...base, ...diaInteiro(dt.dia, dt.dia) });
      } else {
        const ini = dt.hora_inicio ? msDe(dt.dia, String(dt.hora_inicio).slice(0, 5)) : msDe(dt.dia, faixa(dt.periodos)[0]);
        const fim = dt.hora_inicio ? ini + (dt.duracao_min || 120) * 60000 : msDe(dt.dia, faixa(dt.periodos)[1]);
        add(chave, 'reserva', ini, fim, { ...base, ...horario(ini, fim) });
      }
      if (pres && r.com_deslocamento !== false) {
        for (const x of quem) {
          for (const k of [-1, 1]) {
            const dia = somarDias(dt.dia, k);
            add(`desloc-res:${r.id}:${dt.dia}:${x.mentor_id}:${k}`, 'desloc', msDe(dia, '00:00'), msDe(dia, '23:59'), {
              summary: `Deslocamento (${k < 0 ? 'ida' : 'volta'}, ${pre ? 'pré-bloqueio' : 'reservado'}) · ${r.titulo}`, status: pre ? 'tentative' : 'confirmed',
              description: `Dia reservado para a viagem de ${diaCurto(dt.dia)}${r.local ? ` (${r.local})` : ''}.`, ...diaInteiro(dia, dia), attendees: convidados([email(x.mentor_id)]),
            });
          }
        }
      }
    }
  }
  return { out, semEmail };
}

// Convite adotado (criado à mão antes): muda só horário e convidados, sem trocar o texto de quem criou.
async function mudarAdotado(token, eventoId, corpo) {
  const atual = await agenda(token, `/calendars/primary/events/${encodeURIComponent(eventoId)}`);
  if (!atual.ok) return atual;
  const ja = (atual.dados.attendees || []);
  const emails = new Set(ja.map((a) => String(a.email || '').toLowerCase()));
  const attendees = [...ja, ...(corpo.attendees || []).filter((a) => !emails.has(a.email))];
  return agenda(token, `/calendars/primary/events/${encodeURIComponent(eventoId)}?sendUpdates=all`, { metodo: 'PATCH',
    corpo: { start: corpo.start, end: corpo.end, attendees, ...(atual.dados.location ? {} : corpo.location ? { location: corpo.location } : {}) } });
}

// ---------- sincronizar: cria, muda e cancela o que for preciso ----------
// prefixos: só estas chaves (ex.: ["sessao:123"]); antes: { chave: horário antigo } para achar convites antigos ao remarcar.
export async function sincronizar({ limiteMs = 8000, prefixos = null, antes = {} } = {}) {
  const comeco = Date.now();
  const res = { criados: 0, atualizados: 0, adotados: 0, apagados: 0, pendentes: 0, erros: [], semEmail: [], semPermissao: [] };
  const cfg = await lerConfig();
  if (!cfg.equipe && !cfg.mentorados) return { ...res, desligado: true };
  const acesso = await acessoGoogle();
  if (!acesso) return { ...res, erro: 'A Google Agenda não está conectada (Painel → Google Agenda).' };
  if (acesso.erro) return { ...res, erro: acesso.erro };
  const g = await supa('/rest/v1/google_eventos?select=*');
  if (!g.ok) return { ...res, erro: 'Falta rodar o script 17 no Supabase.' };
  const d = await dadosAgenda();
  const { out, semEmail } = desejados(d, cfg);
  res.semEmail = [...semEmail];
  const mapa = new Map(g.dados.map((x) => [x.chave, x]));
  const usados = new Set(g.dados.map((x) => x.evento_id));
  const vale = (chave) => !prefixos || prefixos.some((p) => chave === p || chave.startsWith(`${p}:`));
  const temTempo = () => Date.now() - comeco < limiteMs;
  const conta = String(acesso.email || '').toLowerCase();
  const ev = (id, q = '') => `/calendars/primary/events/${encodeURIComponent(id)}${q}`;

  const lista = [...out.entries()].filter(([k]) => vale(k)).sort((a, b) => a[1].inicio.localeCompare(b[1].inicio));
  for (const [chave, alvo] of lista) {
    if (!temTempo()) { res.pendentes += 1; continue; }
    const corpo = { ...alvo.corpo, attendees: (alvo.corpo.attendees || []).filter((a) => a.email !== conta) };
    const assinatura = hash(JSON.stringify(corpo));
    const atual = mapa.get(chave);
    if (atual && atual.assinatura === assinatura) continue;
    let r = null, id = null, adotado = false, criado = false;
    if (atual) {
      id = atual.evento_id; adotado = atual.adotado;
      r = adotado ? await mudarAdotado(acesso.token, id, corpo) : await agenda(acesso.token, ev(id, '?sendUpdates=all'), { metodo: 'PATCH', corpo });
      if (r.status === 404 || r.status === 410) { r = null; id = null; adotado = false; }
    }
    if (!r && alvo.busca) {                                         // convite que já existia (feito à mão)
      const achado = await procurarConvite(acesso.token, { perto: [antes[chave], alvo.corpo.start.dateTime], ...alvo.busca, ignorar: usados });
      if (achado) {
        const dono = String((achado.organizer && achado.organizer.email) || '').toLowerCase();
        if (achado.organizer && !achado.organizer.self && dono && dono !== conta) { res.semPermissao.push({ chave, organizador: dono, titulo: achado.summary }); continue; }
        id = achado.id; adotado = true; usados.add(id);
        r = await mudarAdotado(acesso.token, id, corpo);
        if (r.ok) res.adotados += 1;
      }
    }
    if (!r) {
      id = idDe(chave);
      r = await agenda(acesso.token, '/calendars/primary/events?sendUpdates=all', { metodo: 'POST', corpo: { id, ...corpo } });
      if (r.status === 409) r = await agenda(acesso.token, ev(id, '?sendUpdates=all'), { metodo: 'PATCH', corpo });   // já existia (talvez cancelado): reativa
      criado = r.ok;
    }
    if (r && r.ok) {
      await guardarEvento(chave, id, { assinatura, inicio: alvo.inicio, adotado });
      if (criado) res.criados += 1; else if (!adotado || atual) res.atualizados += 1;
    } else res.erros.push(`${chave}: a Google Agenda respondeu ${r ? r.status : 'sem resposta'}`);
  }

  // cancela o que saiu da plataforma (só compromissos que ainda não aconteceram)
  for (const [chave, row] of mapa) {
    if (out.has(chave) || !vale(chave)) continue;
    if (!temTempo()) { res.pendentes += 1; continue; }
    if (row.inicio && Date.parse(row.inicio) < Date.now()) { await supa(`/rest/v1/google_eventos?chave=eq.${encodeURIComponent(chave)}`, { metodo: 'DELETE' }); continue; }
    if (row.adotado) {                                              // convite feito à mão: se for recorrente, não mexe
      const atual = await agenda(acesso.token, ev(row.evento_id));
      if (atual.ok && recorrente(atual.dados)) {
        await supa(`/rest/v1/google_eventos?chave=eq.${encodeURIComponent(chave)}`, { metodo: 'DELETE' });
        res.protegidos = (res.protegidos || 0) + 1;
        continue;
      }
    }
    const r = await agenda(acesso.token, ev(row.evento_id, '?sendUpdates=all'), { metodo: 'DELETE' });
    if (r.ok || r.status === 404 || r.status === 410) {
      await supa(`/rest/v1/google_eventos?chave=eq.${encodeURIComponent(chave)}`, { metodo: 'DELETE' });
      res.apagados += 1;
    } else res.erros.push(`${chave}: não consegui cancelar (${r.status})`);
  }
  return { ...res, conta: acesso.email };
}

// ---------- conferir convites duplicados ----------
// Olha a Google Agenda conectada (de 30 dias atrás a 120 dias à frente) e aponta convites de sessões que não batem com
// nenhuma sessão da plataforma (ficaram no horário antigo) ou que estão repetidos no mesmo horário.
export async function conferirConvites() {
  const acesso = await acessoGoogle();
  if (!acesso) return { erro: 'A Google Agenda não está conectada (Painel → Google Agenda).' };
  if (acesso.erro) return { erro: acesso.erro };
  const d = await dadosAgenda();
  const g = await supa('/rest/v1/google_eventos?select=chave,evento_id');
  const guardados = new Map(((g.ok && g.dados) || []).map((x) => [x.evento_id, x.chave]));
  const de = Date.now() - 30 * 86400e3, ate = Date.now() + 120 * 86400e3;
  const eventos = [];
  let pagina = '';
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ timeMin: new Date(de).toISOString(), timeMax: new Date(ate).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', ...(pagina ? { pageToken: pagina } : {}) });
    const r = await agenda(acesso.token, `/calendars/primary/events?${q}`);
    if (!r.ok) return { erro: `A Google Agenda respondeu ${r.status}.` };
    eventos.push(...(r.dados.items || []).filter((e) => e.status !== 'cancelled'));
    pagina = r.dados.nextPageToken;
    if (!pagina) break;
  }
  // mentorados ativos e os horários das sessões de cada um
  const porMentorado = new Map();
  for (const s of d.sessoes) {
    const m = s.mentorado; if (!m) continue;
    if (!porMentorado.has(m.id)) {
      const nomeN = norm(m.nome); const partes = nomeN.split(' ').filter((p) => p.length > 2);
      porMentorado.set(m.id, { nome: m.nome, nomeN, curto: partes.length >= 2 ? `${partes[0]} ${partes[partes.length - 1]}` : '',
        emails: [m.email, m.perfil && m.perfil.email].filter(Boolean).map((e) => e.toLowerCase()),
        codigo: (String(m.sala_meet || '').match(/meet\.google\.com\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})/i) || [])[1], horarios: new Set() });
    }
    if (s.data_hora && s.situacao !== 'cancelada') porMentorado.get(m.id).horarios.add(Date.parse(s.data_hora));
  }
  const conta = String(acesso.email || '').toLowerCase();
  const achados = [], porHorario = new Map();
  for (const e of eventos) {
    if (!e.start || !e.start.dateTime) continue;
    if (/Atividade do checklist da Mentorei/i.test(e.description || '')) continue;   // convite do checklist: não é sessão
    const txt = norm(`${e.summary || ''} ${e.description || ''}`);
    const json = JSON.stringify(e).toLowerCase();
    const m = [...porMentorado.values()].find((x) => (x.codigo && json.includes(x.codigo.toLowerCase()))
      || (e.attendees || []).some((a) => x.emails.includes(String(a.email || '').toLowerCase()))
      || (x.nomeN && txt.includes(x.nomeN)) || (x.curto && txt.includes(x.curto)));
    if (!m) continue;
    const t = Date.parse(e.start.dateTime);
    const dono = String((e.organizer && e.organizer.email) || '').toLowerCase();
    const rec = recorrente(e);
    const item = { id: e.id, titulo: e.summary || '(sem título)', inicio: e.start.dateTime, mentorado: m.nome, organizador: dono, recorrente: rec,
      podeApagar: !rec && !!(e.organizer && (e.organizer.self || dono === conta)), daPlataforma: guardados.has(e.id) || /plataforma de mentorias/i.test(e.description || ''), criadoEm: e.created };
    if (!m.horarios.has(t)) {
      if (!rec) achados.push({ ...item, motivo: 'Não bate com nenhuma sessão da plataforma (pode ter ficado no horário antigo)' });
      continue;                                                     // ocorrência de convite recorrente fora das sessões: deixa quieta
    }
    const k = `${m.nome}|${t}`;
    if (!porHorario.has(k)) porHorario.set(k, []);
    porHorario.get(k).push(item);
  }
  for (const grupo of porHorario.values()) {
    if (grupo.length < 2) continue;
    // fica o convite recorrente (o original da série); depois, o que a plataforma já usa; se nenhum, o mais antigo
    grupo.sort((a, b) => (b.recorrente ? 1 : 0) - (a.recorrente ? 1 : 0) || (guardados.has(b.id) ? 1 : 0) - (guardados.has(a.id) ? 1 : 0)
      || String(a.criadoEm).localeCompare(String(b.criadoEm)));
    grupo.slice(1).forEach((x) => achados.push({ ...x, motivo: x.recorrente ? `Repetido, mas faz parte de um convite recorrente: não apago por aqui`
      : `Repetido: já existe outro convite para ${x.mentorado} neste mesmo horário` }));
  }
  achados.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return { conta: acesso.email, achados };
}

export async function apagarConvites(ids) {
  const acesso = await acessoGoogle();
  if (!acesso || acesso.erro) return { erro: (acesso && acesso.erro) || 'A Google Agenda não está conectada.' };
  let apagados = 0; const erros = [], protegidos = [];
  for (const id of ids.slice(0, 200)) {
    const atual = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(id)}`);
    if (!atual.ok) { if (atual.status !== 404 && atual.status !== 410) erros.push(`${id}: ${atual.status}`); continue; }
    if (recorrente(atual.dados)) { protegidos.push(atual.dados.summary || id); continue; }   // série recorrente: nunca apaga
    const r = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, { metodo: 'DELETE' });
    if (r.ok || r.status === 404 || r.status === 410) {
      apagados += 1;
      await supa(`/rest/v1/google_eventos?evento_id=eq.${encodeURIComponent(id)}`, { metodo: 'DELETE' });
    } else erros.push(`${id}: ${r.status}`);
  }
  return { apagados, erros, protegidos };
}
