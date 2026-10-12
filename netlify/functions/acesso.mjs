// Entrada pelo link que não expira (ver netlify/lib/acesso.mjs). Aberto ao público (quem chama ainda não tem senha).
//  acao 'abrir'         { c }      → confere o link e devolve um código do Supabase para a página entrar na hora
//  acao 'pedir'         { email }  → "Esqueci minha senha" / link vencido: manda um link novo por e-mail (resposta sempre igual)
//  acao 'senha_criada'  (com login) → marca a hora em que a pessoa criou a senha: os links anteriores param de funcionar
import { lerCodigo, linkDeAcesso, enviarLinkPorEmail, senhaCriadaDepois } from '../lib/acesso.mjs';

export const config = { path: '/api/acesso', method: 'POST' };

const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const resposta = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function chamar(caminho, { metodo = 'GET', chave, token, corpo } = {}) {
  const headers = { apikey: chave, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let dados = null; try { dados = texto ? JSON.parse(texto) : null; } catch (_) { dados = texto; }
  return { ok: r.ok, status: r.status, dados };
}

export default async (req) => {
  const secreta = env('SUPABASE_SECRET_KEY').trim();
  if (!secreta) return resposta({ mensagem: 'A plataforma está sem a chave do banco. Avise a Mentorei.' }, 500);
  let b; try { b = await req.json(); } catch (_) { return resposta({ mensagem: 'Pedido inválido.' }, 400); }

  // ---------- abrir o link do convite ----------
  if (b.acao === 'abrir') {
    const cod = lerCodigo(b.c);
    if (!cod) return resposta({ estado: 'invalido' });
    if (cod.vencido) return resposta({ estado: 'vencido' });
    const u = await chamar(`/auth/v1/admin/users/${cod.uid}`, { chave: secreta });
    if (u.status === 404 || (u.ok && !(u.dados && u.dados.email))) return resposta({ estado: 'cancelado' });
    if (!u.ok) return resposta({ mensagem: 'Não consegui conferir o link agora. Tente de novo em alguns minutos.' }, 502);
    const usuario = u.dados;
    const p = await chamar(`/rest/v1/perfis?id=eq.${cod.uid}&select=ativo`, { chave: secreta });
    if (p.ok && p.dados && p.dados[0] && p.dados[0].ativo === false) return resposta({ estado: 'desativado' });
    if (senhaCriadaDepois(usuario, cod.emitido)) return resposta({ estado: 'ja_usado', email: usuario.email });
    const gl = await chamar('/auth/v1/admin/generate_link', { metodo: 'POST', chave: secreta, corpo: { type: 'recovery', email: usuario.email } });
    const hash = gl.dados && (gl.dados.hashed_token || (gl.dados.properties && gl.dados.properties.hashed_token));
    if (!gl.ok || !hash) {
      if (gl.status === 429) return resposta({ mensagem: 'Espere um minutinho e abra o link de novo.' }, 429);
      return resposta({ mensagem: 'Não consegui abrir o seu acesso agora. Tente de novo em alguns minutos.' }, 502);
    }
    return resposta({ estado: 'ok', token_hash: hash, email: usuario.email });
  }

  // ---------- pedir um link novo por e-mail ----------
  if (b.acao === 'pedir') {
    const email = String(b.email || '').trim().toLowerCase();
    const pronto = { mensagem: 'Se este e-mail tiver acesso à plataforma, um link para criar a senha chega em alguns minutos. Confira também o spam.' };
    if (!EMAIL.test(email)) return resposta({ mensagem: 'Confira o e-mail.' }, 400);
    const p = await chamar(`/rest/v1/perfis?email=eq.${encodeURIComponent(email)}&select=id,nome,ativo`, { chave: secreta });
    const pessoa = p.ok && p.dados && p.dados[0];
    if (!pessoa || pessoa.ativo === false) return resposta(pronto);
    const u = await chamar(`/auth/v1/admin/users/${pessoa.id}`, { chave: secreta });
    if (!u.ok || !u.dados) return resposta(pronto);
    // no máximo um e-mail a cada 2 minutos para a mesma pessoa
    const ultimo = Date.parse((u.dados.app_metadata && u.dados.app_metadata.link_pedido_em) || 0) || 0;
    if (Date.now() - ultimo < 2 * 60 * 1000) return resposta(pronto);
    await chamar(`/auth/v1/admin/users/${pessoa.id}`, { metodo: 'PUT', chave: secreta, corpo: { app_metadata: { link_pedido_em: new Date().toISOString() } } });
    const site = env('URL') || new URL(req.url).origin;
    // quem nunca criou a senha recebe de novo o convite (não expira); quem já tinha, o link de nova senha (7 dias)
    const jaTinha = !!((u.dados.app_metadata && u.dados.app_metadata.senha_criada_em) || (u.dados.user_metadata && u.dados.user_metadata.senha_criada_em) || u.dados.last_sign_in_at);
    const tipo = jaTinha ? 's' : 'c';
    const envio = await enviarLinkPorEmail({ email, nome: pessoa.nome, link: linkDeAcesso(site, pessoa.id, tipo), tipo });
    if (!envio.enviado) {
      // sem o Brevo: o e-mail do próprio Supabase (esse link vence em algumas horas)
      await chamar(`/auth/v1/recover?redirect_to=${encodeURIComponent(`${site.replace(/\/$/, '')}/definir-senha.html`)}`, { metodo: 'POST', chave: secreta, corpo: { email } });
    }
    return resposta(pronto);
  }

  // ---------- a pessoa acabou de criar a senha ----------
  if (b.acao === 'senha_criada') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return resposta({ mensagem: 'Faça login de novo.' }, 401);
    const eu = await chamar('/auth/v1/user', { chave: secreta, token });
    if (!eu.ok || !eu.dados || !eu.dados.id) return resposta({ mensagem: 'Faça login de novo.' }, 401);
    await chamar(`/auth/v1/admin/users/${eu.dados.id}`, { metodo: 'PUT', chave: secreta, corpo: { app_metadata: { senha_criada_em: new Date().toISOString() } } });
    return resposta({ ok: true });
  }

  return resposta({ mensagem: 'Pedido inválido.' }, 400);
};
