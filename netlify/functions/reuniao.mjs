// Reuniões marcadas pela plataforma (com clientes, fornecedores ou entre a equipe):
//  equipe    lista quem da equipe pode ser chamado (nome e se tem e-mail)
//  criar     guarda a reunião e cria o convite na Google Agenda conectada, com link do Meet; o Google avisa todos os envolvidos
//  mudar     muda a reunião e o mesmo convite (sem duplicar)
//  enviar    cria o convite de uma reunião que ficou sem ele (Google desconectado na hora)
//  cancelar  cancela a reunião e o convite (o Google avisa os convidados)
// O convite fica guardado na própria reunião (google_evento_id), fora da sincronização automática: ela nunca mexe nele.
import { json, supa, quemPede, acessoGoogle, agenda, FUSO, SITE } from '../lib/google.mjs';
import { emailReal } from '../lib/email.mjs';

export const config = { path: '/api/reuniao', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/, HORA = /^\d{2}:\d{2}$/;
const SEL = 'id,titulo,dia,hora_inicio,hora_fim,pauta,participantes,participantes_nomes,convidados,meet_link,google_evento_id,convites_enviados_em,situacao,criado_por';

const ehEquipe = (p) => p.papel === 'admin' || p.papel === 'mentor' || p.tambem_mentor;
const minutos = (h) => { const [a, b] = String(h).slice(0, 5).split(':').map(Number); return a * 60 + b; };

async function lerEquipe() {
  const r = await supa('/rest/v1/perfis?ativo=eq.true&or=(papel.eq.admin,papel.eq.mentor,tambem_mentor.eq.true)&select=id,nome,email,papel,foto_url&order=nome');
  return (r.ok && Array.isArray(r.dados)) ? r.dados : [];
}
async function lerReuniao(id) {
  const r = await supa(`/rest/v1/agenda_reunioes?id=eq.${id}&select=${SEL}`);
  return (r.ok && r.dados && r.dados[0]) || null;
}
async function gravar(id, corpo) {
  const r = await supa(`/rest/v1/agenda_reunioes?id=eq.${id}`, { metodo: 'PATCH', corpo, prefer: 'return=representation' });
  return r.ok && r.dados && r.dados[0];
}

// Confere o que veio da tela. Devolve { erro } ou os campos limpos.
function limpar(b, equipe) {
  const titulo = String(b.titulo || '').trim().slice(0, 200);
  if (titulo.length < 2) return { erro: 'Escreva o assunto da reunião.' };
  const dia = String(b.dia || ''), hi = String(b.hora_inicio || '').slice(0, 5), hf = String(b.hora_fim || '').slice(0, 5);
  if (!DIA.test(dia) || !HORA.test(hi) || !HORA.test(hf)) return { erro: 'Dia ou horário inválido.' };
  if (minutos(hf) <= minutos(hi)) return { erro: 'O fim precisa ser depois do início.' };
  const ids = [...new Set((Array.isArray(b.participantes) ? b.participantes : []).map(String).filter((x) => UUID.test(x)))];
  const pessoas = ids.map((id) => equipe.find((p) => p.id === id)).filter(Boolean);
  const convidados = [...new Set((Array.isArray(b.convidados) ? b.convidados : []).map((x) => String(x).trim().toLowerCase()).filter((x) => EMAIL.test(x)))].slice(0, 50);
  if (!pessoas.length && !convidados.length) return { erro: 'Marque pelo menos uma pessoa da equipe ou um e-mail de fora.' };
  const pauta = String(b.pauta || '').trim().slice(0, 4000) || null;
  return { titulo, dia, hora_inicio: hi, hora_fim: hf, participantes: pessoas.map((p) => p.id), participantes_nomes: pessoas.map((p) => p.nome), convidados, pauta };
}

// Cria ou muda o convite na Google Agenda (com o Meet). Devolve { google, mensagem?, reuniao, semEmail }.
async function convidar(r, equipe) {
  const acesso = await acessoGoogle();
  if (!acesso) return { google: 'desconectada', reuniao: r };
  if (acesso.erro) return { google: 'erro', mensagem: acesso.erro, reuniao: r };
  const conta = String(acesso.email || '').toLowerCase();
  const semEmail = [];
  const emails = [];
  for (const id of r.participantes || []) {
    const p = equipe.find((x) => x.id === id);
    if (!p) continue;
    if (emailReal(p.email)) emails.push(p.email.toLowerCase()); else semEmail.push(p.nome);
  }
  const attendees = [...new Set([...emails, ...(r.convidados || [])])].filter((e) => e !== conta).map((email) => ({ email }));
  const ini = new Date(`${r.dia}T${String(r.hora_inicio).slice(0, 5)}:00-03:00`), fim = new Date(`${r.dia}T${String(r.hora_fim).slice(0, 5)}:00-03:00`);
  const corpo = {
    summary: `${r.titulo} · Mentorei`,
    description: [r.pauta ? `Pauta:\n${r.pauta}` : '', `Reunião marcada pela plataforma de mentorias da Mentorei (${SITE}).`].filter(Boolean).join('\n\n'),
    start: { dateTime: ini.toISOString(), timeZone: FUSO }, end: { dateTime: fim.toISOString(), timeZone: FUSO },
    attendees, guestsCanInviteOthers: true, guestsCanModify: false, reminders: { useDefault: true }, status: 'confirmed',
  };
  let res = null, criado = false;
  if (r.google_evento_id) {
    res = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(r.google_evento_id)}?conferenceDataVersion=1&sendUpdates=all`, { metodo: 'PATCH', corpo });
    if (res.status === 404 || res.status === 410) res = null;              // o convite foi apagado à mão: cria outro
  }
  if (!res) {
    criado = true;
    res = await agenda(acesso.token, '/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', { metodo: 'POST',
      corpo: { ...corpo, conferenceData: { createRequest: { requestId: `mnt-reuniao-${r.id}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } });
  }
  if (!res.ok) return { google: 'erro', mensagem: `A Google Agenda recusou o convite (erro ${res.status}).`, reuniao: r, semEmail };
  const ev = res.dados || {};
  const video = ((ev.conferenceData && ev.conferenceData.entryPoints) || []).find((e) => e.entryPointType === 'video');
  const meet = ev.hangoutLink || (video && video.uri) || r.meet_link || null;
  const novo = await gravar(r.id, { google_evento_id: ev.id || r.google_evento_id, meet_link: meet, convites_enviados_em: new Date().toISOString() });
  return { google: criado ? 'criada' : 'atualizada', reuniao: novo || { ...r, google_evento_id: ev.id, meet_link: meet }, link: ev.htmlLink, semEmail };
}

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (!ehEquipe(eu)) return json({ mensagem: 'Só a equipe marca reuniões.' }, 403);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const equipe = await lerEquipe();

  if (b.acao === 'equipe') {
    return json({ ok: true, equipe: equipe.map((p) => ({ id: p.id, nome: p.nome, papel: p.papel, foto_url: p.foto_url, temEmail: emailReal(p.email) })) });
  }

  if (b.acao === 'criar') {
    const dados = limpar(b, equipe);
    if (dados.erro) return json({ mensagem: dados.erro }, 400);
    const ins = await supa('/rest/v1/agenda_reunioes', { metodo: 'POST', corpo: { ...dados, criado_por: eu.id }, prefer: 'return=representation' });
    if (!ins.ok) return json({ mensagem: ins.status === 404 ? 'Falta rodar o script 18-reunioes.sql no Supabase.' : `Não consegui guardar a reunião (${ins.status}).` }, 500);
    const r = ins.dados[0];
    const res = await convidar(r, equipe);
    return json({ ok: true, ...res });
  }

  if (!UUID.test(String(b.id || ''))) return json({ mensagem: 'Reunião inválida.' }, 400);
  const r = await lerReuniao(b.id);
  if (!r) return json({ mensagem: 'Reunião não encontrada.' }, 404);
  if (eu.papel !== 'admin' && r.criado_por !== eu.id) return json({ mensagem: 'Só quem marcou a reunião (ou a administração) pode mudar ou cancelar.' }, 403);

  if (b.acao === 'mudar') {
    if (r.situacao === 'cancelada') return json({ mensagem: 'Esta reunião foi cancelada.' }, 400);
    const dados = limpar(b, equipe);
    if (dados.erro) return json({ mensagem: dados.erro }, 400);
    const novo = await gravar(r.id, dados);
    if (!novo) return json({ mensagem: 'Não consegui guardar a mudança.' }, 500);
    const res = await convidar(novo, equipe);
    return json({ ok: true, ...res });
  }
  if (b.acao === 'enviar') {
    if (r.situacao === 'cancelada') return json({ mensagem: 'Esta reunião foi cancelada.' }, 400);
    const res = await convidar(r, equipe);
    return json({ ok: true, ...res });
  }
  if (b.acao === 'cancelar') {
    let google = 'sem_convite';
    if (r.google_evento_id) {
      const acesso = await acessoGoogle();
      if (acesso && !acesso.erro) {
        const del = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(r.google_evento_id)}?sendUpdates=all`, { metodo: 'DELETE' });
        google = del.ok || del.status === 404 || del.status === 410 ? 'cancelada' : 'erro';
      } else google = 'desconectada';
    }
    const novo = await gravar(r.id, { situacao: 'cancelada' });
    if (!novo) return json({ mensagem: 'Não consegui cancelar agora.' }, 500);
    return json({ ok: true, google, reuniao: novo });
  }
  return json({ mensagem: 'Ação desconhecida.' }, 400);
};
