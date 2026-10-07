// Depois de remarcar uma sessão na plataforma, acerta a Google Agenda da conta conectada:
// procura o convite antigo da sessão (pela sala do Meet ou pelo e-mail do mentorado) e muda o dia e o horário.
// O próprio Google manda o convite atualizado para os convidados. Se não achar, cria um convite novo com a mesma sala.
import { json, supa, quemPede, acessoGoogle, agenda, FUSO, SITE } from '../lib/google.mjs';

export const config = { path: '/api/agenda', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  if (!UUID.test(String(b.sessao_id || ''))) return json({ mensagem: 'Sessão inválida.' }, 400);

  const r = await supa(`/rest/v1/sessoes?id=eq.${b.sessao_id}&select=id,numero,data_hora,mentorado_id,concluida_em,`
    + 'mentor:perfis!sessoes_mentor_id_fkey(nome,email),'
    + 'mentorado:mentorados(nome,email,sala_meet,perfil:perfis!mentorados_perfil_id_fkey(email),programa:programas(nome,duracao_min,empresa:empresas(nome)))');
  const s = r.ok && r.dados && r.dados[0];
  if (!s) return json({ mensagem: 'Sessão não encontrada.' }, 404);
  if (eu.papel !== 'admin') {
    const v = await supa(`/rest/v1/mentor_mentorado?mentorado_id=eq.${s.mentorado_id}&mentor_id=eq.${eu.id}&select=mentor_id`);
    if (!(v.ok && v.dados && v.dados.length)) return json({ mensagem: 'Você não é mentor(a) deste mentorado.' }, 403);
  }
  if (!s.data_hora) return json({ mensagem: 'A sessão está sem data.' }, 400);

  const acesso = await acessoGoogle();
  if (!acesso) return json({ agenda: 'desconectada' });
  if (acesso.erro) return json({ agenda: 'erro', mensagem: acesso.erro });

  const m = s.mentorado || {};
  const prog = m.programa || {};
  const inicio = new Date(s.data_hora);
  const fim = new Date(inicio.getTime() + (prog.duracao_min || 50) * 60000);
  const horario = { start: { dateTime: inicio.toISOString(), timeZone: FUSO }, end: { dateTime: fim.toISOString(), timeZone: FUSO } };
  const meet = String(m.sala_meet || '').trim();
  const codigo = (meet.match(/meet\.google\.com\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})/i) || [])[1];
  const emailsMentorado = [m.email, m.perfil && m.perfil.email].filter(Boolean).map((x) => x.toLowerCase());

  // 1. Procura o convite antigo, perto do horário antigo
  let achado = null;
  if (b.antes && !Number.isNaN(new Date(b.antes).getTime())) {
    const antes = new Date(b.antes);
    const q = new URLSearchParams({ timeMin: new Date(antes.getTime() - 3 * 3600000).toISOString(), timeMax: new Date(antes.getTime() + 3 * 3600000).toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
    const lista = await agenda(acesso.token, `/calendars/primary/events?${q}`);
    const eventos = (lista.ok && lista.dados && lista.dados.items) || [];
    const combina = (ev) => {
      const texto = JSON.stringify(ev).toLowerCase();
      if (codigo && texto.includes(codigo.toLowerCase())) return true;
      return (ev.attendees || []).some((a) => emailsMentorado.includes(String(a.email || '').toLowerCase()));
    };
    const candidatos = eventos.filter(combina);
    achado = candidatos.find((ev) => ev.start && new Date(ev.start.dateTime || ev.start.date).getTime() === antes.getTime()) || candidatos[0] || null;
  }

  // 2. Achou: muda o dia e o horário (o Google avisa os convidados)
  if (achado) {
    const p = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(achado.id)}?sendUpdates=all`, { metodo: 'PATCH', corpo: horario });
    if (p.ok) return json({ agenda: 'atualizada', link: p.dados.htmlLink, conta: acesso.email });
    // sem permissão para mudar (o convite é de outra pessoa): segue para criar um novo
  }

  // 3. Não achou (ou não pode mudar): cria um convite novo com a mesma sala do Meet
  const convidados = [...new Set([...emailsMentorado, s.mentor && s.mentor.email && s.mentor.email.toLowerCase()].filter(Boolean))]
    .filter((e) => e !== String(acesso.email || '').toLowerCase()).map((email) => ({ email }));
  const novo = await agenda(acesso.token, '/calendars/primary/events?sendUpdates=all', {
    metodo: 'POST',
    corpo: {
      summary: `Mentoria Mentorei · ${m.nome || 'Mentorado'} · Sessão ${s.numero}`,
      description: [`Sessão ${s.numero}${prog.nome ? ` do programa ${prog.nome}` : ''}${prog.empresa && prog.empresa.nome ? ` (${prog.empresa.nome})` : ''}.`,
        meet ? `Sala do Google Meet: ${meet}` : '', `Plataforma de mentorias: ${SITE}`].filter(Boolean).join('\n\n'),
      location: meet || undefined, ...horario, attendees: convidados,
    },
  });
  if (!novo.ok) return json({ agenda: 'erro', mensagem: `A Google Agenda recusou o convite (erro ${novo.status}).` });
  return json({ agenda: 'criada', link: novo.dados.htmlLink, conta: acesso.email, antigo_nao_alterado: !!achado });
};
