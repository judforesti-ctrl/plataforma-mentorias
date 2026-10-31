// "Ver como o mentor vê" (31/10/2026, pedido da Juliana: a Cintia não é mentora e precisa enxergar a parte dos mentores).
// Só a administração pede. Abre uma sessão do próprio mentor (link mágico gerado e conferido aqui, nenhum e-mail sai), para a
// tela ver exatamente o que o banco mostra a ele. A tela guarda essa sessão só naquela aba e barra toda gravação (base.js).
// Só para mentor parceiro (papel mentor) que já entrou na plataforma: abrir a sessão marca "último acesso" no login dele, e quem
// nunca entrou ainda depende disso para receber o convite certo. Cada uso fica no histórico (acao 'ver_como').
import { json, supa, quemPede, env, SUPABASE_URL } from '../lib/google.mjs';

export const config = { path: '/api/ver-como', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function auth(caminho, corpo) {
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/auth/v1${caminho}`, {
    method: 'POST', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  }).catch(() => null);
  const dados = r ? await r.json().catch(() => null) : null;
  return { ok: !!(r && r.ok), dados };
}

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel !== 'admin') return json({ mensagem: 'Só a administração.' }, 403);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }
  if (!UUID.test(String(b.perfil_id || ''))) return json({ mensagem: 'Mentor não encontrado.' }, 400);

  const p = await supa(`/rest/v1/perfis?id=eq.${b.perfil_id}&select=id,nome,email,papel,ativo,termo_aceito_em`);
  const alvo = p.ok && p.dados && p.dados[0];
  if (!alvo || alvo.papel !== 'mentor') return json({ mensagem: 'Dá para ver assim só a plataforma de um mentor parceiro.' }, 400);
  if (!alvo.ativo) return json({ mensagem: `${alvo.nome} está desativado(a) na plataforma.` }, 400);
  if (!alvo.termo_aceito_em) {
    return json({ mensagem: `${alvo.nome.split(' ')[0]} ainda não entrou na plataforma. Dá para ver como vê depois que criar a senha e entrar pela primeira vez.` }, 400);
  }

  const link = await auth('/admin/generate_link', { type: 'magiclink', email: alvo.email });
  const d = link.dados || {};
  const hash = d.hashed_token || (d.properties && d.properties.hashed_token);
  if (!link.ok || !hash) return json({ mensagem: 'Não consegui abrir a sessão do mentor agora. Tente de novo em instantes.' }, 502);
  let s = await auth('/verify', { type: d.verification_type || 'magiclink', token_hash: hash });
  if (!(s.ok && s.dados && s.dados.access_token) && d.verification_type !== 'email') s = await auth('/verify', { type: 'email', token_hash: hash });
  if (!(s.ok && s.dados && s.dados.access_token)) return json({ mensagem: 'Não consegui abrir a sessão do mentor agora. Tente de novo em instantes.' }, 502);
  if (s.dados.user && s.dados.user.id !== alvo.id) return json({ mensagem: 'O login deste mentor não confere com o cadastro. Fale com o suporte.' }, 409);

  await supa('/rest/v1/historico', { metodo: 'POST', corpo: { perfil_id: eu.id, acao: 'ver_como', tabela: 'perfis', registro_id: alvo.id, depois: { mentor: alvo.nome, por: eu.nome } } });
  return json({ nome: alvo.nome, access_token: s.dados.access_token, refresh_token: s.dados.refresh_token });
};
