// Checklist (pedidos da tela depois de salvar):
//  salvo    (ou avisar) 1) convite na Google Agenda: atividade "convite com sala" cria ou muda o convite com sala do Meet para os
//           responsáveis e convidados de fora; se deixou de ser convite, o convite é cancelado; 2) e-mail para quem passou a ser
//           responsável (uma vez por pessoa; quem recebe o convite do Google não recebe outro e-mail). Só recebe e-mail quem já usa a
//           plataforma (aceitou o termo) e tem e-mail de verdade; quem criou para si mesmo não recebe.
//  apagar   cancela o convite (se houver) e apaga a atividade (quem criou ou a administração)
// O convite fica em atividades.google_evento_id, fora de google_eventos: a sincronização automática nunca mexe nele.
import { json, supa, quemPede, acessoGoogle, agenda, FUSO, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';

export const config = { path: '/api/atividade', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const prazoTexto = (a) => {
  if (!a.prazo) return 'sem data definida';
  const d = new Date(`${a.prazo}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' });
  return `${d}${a.prazo_hora ? ` às ${String(a.prazo_hora).slice(0, 5)}` : ''}${a.hora_fim && a.na_agenda !== 'prazo' ? ` até ${String(a.hora_fim).slice(0, 5)}` : ''}`;
};
const gravar = (id, corpo) => supa(`/rest/v1/atividades?id=eq.${id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo });

async function cancelarConvite(a) {
  if (!a.google_evento_id) return 'sem_convite';
  const acesso = await acessoGoogle();
  if (!acesso || acesso.erro) return 'desconectada';
  const del = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(a.google_evento_id)}?sendUpdates=all`, { metodo: 'DELETE' });
  return del.ok || del.status === 404 || del.status === 410 ? 'cancelada' : 'erro';
}

// Cria, muda ou cancela o convite da Google Agenda conforme a atividade. Devolve { google, mensagem?, meet_link?, convidados[] }.
async function sincronizarConvite(a) {
  const quer = a.na_agenda === 'convite' && a.situacao !== 'feita' && a.prazo && a.prazo_hora;
  if (!quer) {
    if (a.google_evento_id && a.situacao !== 'feita') {
      const g = await cancelarConvite(a);
      if (g === 'cancelada') await gravar(a.id, { google_evento_id: null, meet_link: null, convite_enviado_em: null });
      return { google: g === 'cancelada' ? 'cancelada' : g };
    }
    return { google: null };
  }
  const acesso = await acessoGoogle();
  if (!acesso) return { google: 'desconectada' };
  if (acesso.erro) return { google: 'erro', mensagem: acesso.erro };
  const conta = String(acesso.email || '').toLowerCase();
  const ids = (a.responsaveis || []).filter((x) => UUID.test(x));
  const p = ids.length ? await supa(`/rest/v1/perfis?id=in.(${ids.join(',')})&select=id,nome,email`) : { ok: true, dados: [] };
  const pessoas = (p.ok && Array.isArray(p.dados)) ? p.dados : [];
  const emails = pessoas.filter((x) => emailReal(x.email)).map((x) => x.email.toLowerCase());
  const fora = (a.convidados || []).map((x) => String(x).toLowerCase()).filter((x) => EMAIL.test(x));
  const attendees = [...new Set([...emails, ...fora])].filter((e) => e !== conta).map((email) => ({ email }));
  const hi = String(a.prazo_hora).slice(0, 5);
  const hf = a.hora_fim && String(a.hora_fim).slice(0, 5) > hi ? String(a.hora_fim).slice(0, 5) : null;
  const ini = new Date(`${a.prazo}T${hi}:00-03:00`);
  const fim = hf ? new Date(`${a.prazo}T${hf}:00-03:00`) : new Date(ini.getTime() + 3600000);
  const corpo = {
    summary: `${a.titulo} · Mentorei`,
    description: [a.descricao || '', `Atividade do checklist da Mentorei: ${SITE}/app.html#/checklist/${a.id}`].filter(Boolean).join('\n\n'),
    start: { dateTime: ini.toISOString(), timeZone: FUSO }, end: { dateTime: fim.toISOString(), timeZone: FUSO },
    attendees, guestsCanInviteOthers: true, guestsCanModify: false, reminders: { useDefault: true }, status: 'confirmed',
  };
  let res = null, criado = false;
  if (a.google_evento_id) {
    res = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(a.google_evento_id)}?conferenceDataVersion=1&sendUpdates=all`, { metodo: 'PATCH', corpo });
    if (res.status === 404 || res.status === 410) res = null;     // o convite foi apagado à mão: cria outro
  }
  if (!res) {
    criado = true;
    res = await agenda(acesso.token, '/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', { metodo: 'POST',
      corpo: { ...corpo, conferenceData: { createRequest: { requestId: `mnt-atividade-${a.id}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } });
  }
  if (!res.ok) return { google: 'erro', mensagem: `A Google Agenda recusou o convite (erro ${res.status}).` };
  const ev = res.dados || {};
  const video = ((ev.conferenceData && ev.conferenceData.entryPoints) || []).find((e) => e.entryPointType === 'video');
  const meet = ev.hangoutLink || (video && video.uri) || a.meet_link || null;
  await gravar(a.id, { google_evento_id: ev.id || a.google_evento_id, meet_link: meet, convite_enviado_em: new Date().toISOString() });
  return { google: criado ? 'criada' : 'atualizada', meet_link: meet, convidados: emails };
}

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ ok: false, mensagem: 'Entre de novo na plataforma.' }, 401);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }
  if (!['avisar', 'salvo', 'apagar'].includes(b.acao) || !UUID.test(String(b.id || ''))) return json({ ok: false, mensagem: 'Pedido desconhecido.' }, 400);

  const r = await supa(`/rest/v1/atividades?id=eq.${b.id}&select=*`);
  const a = r.ok && Array.isArray(r.dados) && r.dados[0];
  if (!a) return json({ ok: false, mensagem: 'Atividade não encontrada.' });
  const resp = a.responsaveis || [];
  if (eu.papel !== 'admin' && a.criado_por !== eu.id && !resp.includes(eu.id)) return json({ ok: false, mensagem: 'Sem acesso a esta atividade.' }, 403);

  if (b.acao === 'apagar') {
    if (eu.papel !== 'admin' && a.criado_por !== eu.id) return json({ ok: false, mensagem: 'Só quem criou a atividade (ou a administração) pode apagar.' }, 403);
    const google = await cancelarConvite(a);
    const d = await supa(`/rest/v1/atividades?id=eq.${a.id}`, { metodo: 'DELETE', prefer: 'return=minimal' });
    if (!d.ok) return json({ ok: false, mensagem: `Não consegui apagar agora (${d.status}).` });
    return json({ ok: true, google });
  }

  // 1. convite da Google Agenda (atividade "convite com sala")
  const convite = await sincronizarConvite(a);
  const recebeuConvite = new Set(convite.google === 'criada' || convite.google === 'atualizada' ? convite.convidados || [] : []);

  // 2. e-mail para quem passou a ser responsável
  const novos = resp.filter((id) => !(a.avisados || []).includes(id) && id !== eu.id);
  const enviados = [];
  if (novos.length && a.situacao !== 'feita') {
    const p = await supa(`/rest/v1/perfis?id=in.(${novos.join(',')})&ativo=eq.true&select=id,nome,email,termo_aceito_em`);
    for (const pessoa of (p.ok && Array.isArray(p.dados) ? p.dados : [])) {
      if (!pessoa.termo_aceito_em || !emailReal(pessoa.email) || recebeuConvite.has(pessoa.email.toLowerCase())) continue;
      const e = modeloEmail({
        assunto: `Nova atividade para você: ${a.titulo}`,
        titulo: 'Uma atividade do checklist é sua',
        blocos: [
          { p: `Olá, ${String(pessoa.nome || '').split(' ')[0]}! ${eu.nome} colocou uma atividade do checklist da Mentorei sob a sua responsabilidade.` },
          { lista: [`Atividade: ${a.titulo}`, `${a.na_agenda === 'prazo' || !a.na_agenda ? 'Entrega' : 'Quando'}: ${prazoTexto(a)}`, a.grupo ? `Lista: ${a.grupo}` : '',
            a.vinculo_nome ? `Ligada a: ${a.vinculo_nome}` : '', a.meet_link ? `Sala: ${a.meet_link}` : '',
            (a.responsaveis_nomes || []).length > 1 ? `Junto com: ${a.responsaveis_nomes.filter((n) => n !== pessoa.nome).join(', ')}` : ''].filter(Boolean) },
          ...(a.descricao ? [{ p: a.descricao }] : []),
          { botao: { texto: 'Abrir a atividade', link: `${SITE}/app.html#/checklist/${a.id}` } },
          { nota: a.prazo ? 'A atividade já aparece na sua agenda da plataforma. Quando terminar, marque como feita no checklist.' : 'Quando terminar, marque como feita no checklist.' },
        ],
      });
      const env = await enviarEmail({ para: [{ email: pessoa.email, name: pessoa.nome }], assunto: e.assunto, html: e.html, texto: e.texto });
      if (env.enviado) enviados.push(pessoa.nome);
    }
  }
  // todos os responsáveis de agora ficam marcados (quem ainda não usa a plataforma não recebe e-mail atrasado depois)
  const avisados = [...new Set([...(a.avisados || []), ...resp])];
  if (avisados.length !== (a.avisados || []).length) await gravar(a.id, { avisados });
  return json({ ok: true, enviados, google: convite.google, mensagem: convite.mensagem || '', meet_link: convite.meet_link || a.meet_link || null });
};
