// Agenda pessoal (Gmail, Hotmail/Outlook...) dentro da agenda da plataforma:
//  status     situação da ligação (a administração vê a equipe toda; o mentor, só a dele). Nunca devolve o link secreto.
//  ligar      confere o link colado, lê a agenda e guarda (a administração pode ligar para outra pessoa: perfil_id)
//  atualizar  lê de novo agora (a administração, sem perfil_id, lê todas)
//  desligar   esquece o link e tira os compromissos da plataforma
import { json, supa, quemPede } from '../lib/google.mjs';
import { limparUrl, baixar, atualizarPessoa, atualizarTodas, origemDe, NOME_ORIGEM } from '../lib/agenda-pessoal.mjs';

export const config = { path: '/api/agenda-pessoal', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA_SCRIPT = 'Falta rodar o script 24-agenda-pessoal.sql no Supabase. Peça à administração.';

const situacao = (l) => (l ? { ligada: true, origem: l.origem || origemDe(l.url), nomeOrigem: NOME_ORIGEM[l.origem || origemDe(l.url)], conta: l.conta || null,
  ligado_em: l.ligado_em, lido_em: l.lido_em, total: l.total || 0, erro: l.erro || null, erro_em: l.erro_em || null } : { ligada: false });

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ ok: false, mensagem: 'Entre de novo na plataforma.' }, 401);
  const p = await supa(`/rest/v1/perfis?id=eq.${eu.id}&select=id,email,papel,tambem_mentor`);
  const perfil = (p.ok && p.dados && p.dados[0]) || {};
  const admin = perfil.papel === 'admin';
  if (!admin && perfil.papel !== 'mentor' && !perfil.tambem_mentor) return json({ ok: false, mensagem: 'Só para a equipe.' }, 403);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }

  // de quem é a agenda: a própria pessoa ou, para a administração, quem ela escolher
  const alvoId = admin && UUID.test(String(b.perfil_id || '')) ? b.perfil_id : eu.id;
  const lerLink = async (id) => {
    const r = await supa(`/rest/v1/agenda_pessoal_links?perfil_id=eq.${id}&select=*`);
    if (!r.ok) return { falta: r.status === 404 };
    return { link: (Array.isArray(r.dados) && r.dados[0]) || null };
  };

  if (b.acao === 'status') {
    if (admin && b.todos) {
      const r = await supa('/rest/v1/agenda_pessoal_links?select=*');
      if (!r.ok) return json({ ok: true, script: r.status !== 404, pessoas: {} });
      return json({ ok: true, script: true, pessoas: Object.fromEntries(r.dados.map((l) => [l.perfil_id, situacao(l)])) });
    }
    const { link, falta } = await lerLink(alvoId);
    return json({ ok: true, script: !falta, ...situacao(link) });
  }

  if (b.acao === 'ligar') {
    const limpo = limparUrl(b.url);
    if (limpo.erro) return json({ ok: false, mensagem: limpo.erro });
    const alvo = await supa(`/rest/v1/perfis?id=eq.${alvoId}&select=id,email,ativo`);
    const pessoa = alvo.ok && alvo.dados && alvo.dados[0];
    if (!pessoa) return json({ ok: false, mensagem: 'Pessoa não encontrada.' });
    const baixado = await baixar(limpo.url);
    if (baixado.erro) return json({ ok: false, mensagem: baixado.erro });
    const linha = { perfil_id: alvoId, url: limpo.url, origem: origemDe(limpo.url), ligado_por: eu.id, ligado_em: new Date().toISOString(), erro: null, erro_em: null };
    const g = await supa('/rest/v1/agenda_pessoal_links', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', corpo: linha });
    if (!g.ok) return json({ ok: false, mensagem: g.status === 404 ? FALTA_SCRIPT : `Não consegui guardar o link (${g.status}).` });
    const r = await atualizarPessoa(linha, pessoa.email || '', null, { texto: baixado.texto });
    if (!r.ok) return json({ ok: false, mensagem: r.erro });
    const agora = Date.now();
    const proximos = r.eventos.filter((e) => Date.parse(e.fim) > agora).slice(0, 5).map((e) => ({ titulo: e.titulo, inicio: e.inicio, dia_inteiro: e.dia_inteiro }));
    const { link } = await lerLink(alvoId);
    return json({ ok: true, total: r.total, proximos, ...situacao(link) });
  }

  if (b.acao === 'atualizar') {
    if (admin && b.todos) { const r = await atualizarTodas(); return json({ ok: r.ok, ...r, mensagem: r.ok ? '' : FALTA_SCRIPT }); }
    const { link, falta } = await lerLink(alvoId);
    if (falta) return json({ ok: false, mensagem: FALTA_SCRIPT });
    if (!link) return json({ ok: false, mensagem: 'Nenhuma agenda ligada.' });
    const alvo = await supa(`/rest/v1/perfis?id=eq.${alvoId}&select=email`);
    const r = await atualizarPessoa(link, (alvo.ok && alvo.dados && alvo.dados[0] && alvo.dados[0].email) || '', null);
    const depois = await lerLink(alvoId);
    return json({ ok: r.ok, mensagem: r.erro || '', total: r.total || 0, ...situacao(depois.link) });
  }

  if (b.acao === 'desligar') {
    const r = await supa('/rest/v1/rpc/trocar_agenda_pessoal', { metodo: 'POST', corpo: { p_perfil: alvoId, p_eventos: [] } });
    if (!r.ok) return json({ ok: false, mensagem: r.status === 404 ? FALTA_SCRIPT : `Não consegui desligar agora (${r.status}).` });
    await supa(`/rest/v1/agenda_pessoal_links?perfil_id=eq.${alvoId}`, { metodo: 'DELETE', prefer: 'return=minimal' });
    return json({ ok: true, ligada: false });
  }

  return json({ ok: false, mensagem: 'Pedido desconhecido.' }, 400);
};
