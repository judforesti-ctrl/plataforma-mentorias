// Depois de remarcar uma sessão na plataforma, acerta o convite da Google Agenda da conta conectada, sem duplicar:
// 1. se a plataforma já sabe qual é o convite desta sessão (google_eventos), muda direto nele;
// 2. se não sabe, procura o convite antigo perto do horário antigo (sala do Meet, e-mail ou nome do mentorado) e muda;
// 3. se o convite é de outra conta Google, avisa (não cria outro);
// 4. se não acha, também não cria sozinho: a tela oferece "Criar convite novo" (corpo com criar: true).
// Com os convites automáticos ligados (Agenda → Celular e e-mail), quem cuida é a sincronização.
import { json, supa, quemPede, acessoGoogle, agenda, FUSO, SITE } from '../lib/google.mjs';
import { lerConfig, sincronizar, procurarConvite, eventoGuardado, guardarEvento } from '../lib/google-sync.mjs';

export const config = { path: '/api/agenda', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  if (!UUID.test(String(b.sessao_id || ''))) return json({ mensagem: 'Sessão inválida.' }, 400);

  const r = await supa(`/rest/v1/sessoes?id=eq.${b.sessao_id}&select=id,numero,data_hora,duracao_min,mentorado_id,concluida_em,`
    + 'mentor:perfis!sessoes_mentor_id_fkey(nome,email),'
    + 'mentorado:mentorados(nome,email,sala_meet,perfil:perfis!mentorados_perfil_id_fkey(email),programa:programas(nome,duracao_min,empresa:empresas(nome)))');
  const s = r.ok && r.dados && r.dados[0];
  if (!s) return json({ mensagem: 'Sessão não encontrada.' }, 404);
  if (eu.papel !== 'admin') {
    const v = await supa(`/rest/v1/mentor_mentorado?mentorado_id=eq.${s.mentorado_id}&mentor_id=eq.${eu.id}&select=mentor_id`);
    if (!(v.ok && v.dados && v.dados.length)) return json({ mensagem: 'Você não é mentor(a) deste mentorado.' }, 403);
  }
  if (!s.data_hora) return json({ mensagem: 'A sessão está sem data.' }, 400);
  const chave = `sessao:${s.id}`;

  // convites automáticos ligados: a sincronização muda (ou cria) o convite desta sessão
  const cfg = await lerConfig();
  if (cfg.equipe || cfg.mentorados) {
    const res = await sincronizar({ limiteMs: 8000, prefixos: [chave], antes: { [chave]: b.antes } });
    if (res.erro) return json({ agenda: 'erro', mensagem: res.erro });
    if (res.semPermissao.length) return json({ agenda: 'sem_permissao', organizador: res.semPermissao[0].organizador, conta: res.conta });
    if (res.erros.length) return json({ agenda: 'erro', mensagem: res.erros[0] });
    return json({ agenda: res.criados ? 'criada' : 'atualizada', conta: res.conta });
  }

  const acesso = await acessoGoogle();
  if (!acesso) return json({ agenda: 'desconectada' });
  if (acesso.erro) return json({ agenda: 'erro', mensagem: acesso.erro });

  const m = s.mentorado || {};
  const prog = m.programa || {};
  const inicio = new Date(s.data_hora);
  const fim = new Date(inicio.getTime() + (s.duracao_min || prog.duracao_min || 50) * 60000);
  const horario = { start: { dateTime: inicio.toISOString(), timeZone: FUSO }, end: { dateTime: fim.toISOString(), timeZone: FUSO } };
  const meet = String(m.sala_meet || '').trim();
  const emailsMentorado = [m.email, m.perfil && m.perfil.email].filter(Boolean).map((x) => x.toLowerCase());
  const conta = String(acesso.email || '').toLowerCase();

  // 1. o convite que a plataforma já conhece
  let ev = null;
  const guardado = await eventoGuardado(chave);
  if (guardado) {
    const g = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(guardado.evento_id)}`);
    if (g.ok && g.dados && g.dados.status !== 'cancelled') ev = g.dados;
  }
  // 2. o convite antigo, perto do horário antigo (e do novo, caso já tenha sido mudado à mão)
  if (!ev) ev = await procurarConvite(acesso.token, { perto: [b.antes, s.data_hora], nome: m.nome, emails: emailsMentorado, sala: meet });

  if (ev) {
    const dono = String((ev.organizer && ev.organizer.email) || '').toLowerCase();
    if (ev.organizer && !ev.organizer.self && dono && dono !== conta) return json({ agenda: 'sem_permissao', organizador: dono, conta: acesso.email });
    const p = await agenda(acesso.token, `/calendars/primary/events/${encodeURIComponent(ev.id)}?sendUpdates=all`, { metodo: 'PATCH', corpo: horario });
    if (p.ok) {
      await guardarEvento(chave, ev.id, { adotado: guardado && guardado.evento_id === ev.id ? guardado.adotado : true, inicio: inicio.toISOString() });
      return json({ agenda: 'atualizada', link: p.dados.htmlLink, conta: acesso.email });
    }
    if (p.status === 403) return json({ agenda: 'sem_permissao', organizador: dono || null, conta: acesso.email });
    return json({ agenda: 'erro', mensagem: `A Google Agenda recusou a mudança (erro ${p.status}). Nada foi duplicado.` });
  }

  // 3. não achou: só cria quando a pessoa pedir
  if (!b.criar) return json({ agenda: 'nao_achou', conta: acesso.email });
  const convidados = [...new Set([...emailsMentorado, s.mentor && s.mentor.email && s.mentor.email.toLowerCase()].filter(Boolean))]
    .filter((e) => e !== conta).map((email) => ({ email }));
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
  await guardarEvento(chave, novo.dados.id, { adotado: true, inicio: inicio.toISOString() });
  return json({ agenda: 'criada', link: novo.dados.htmlLink, conta: acesso.email });
};
