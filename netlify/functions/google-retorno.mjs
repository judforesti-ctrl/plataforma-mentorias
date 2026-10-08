// Volta do login do Google: guarda a chave da conta conectada (só o servidor lê) e leva de volta ao Painel.
import { env, supa, lerState, REDIRECT_URI, SITE } from '../lib/google.mjs';

export const config = { path: '/api/google-retorno', method: 'GET' };

const voltar = (resultado) => Response.redirect(`${SITE}/app.html#/painel/agenda/${resultado}`, 302);

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const st = lerState(q.get('state'));
  if (!st) return voltar('expirou');
  if (q.get('error') || !q.get('code')) return voltar('cancelado');
  const p = await supa(`/rest/v1/perfis?id=eq.${st.uid}&select=papel,ativo`);
  if (!(p.ok && p.dados && p.dados[0] && p.dados[0].papel === 'admin' && p.dados[0].ativo)) return voltar('negado');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: q.get('code'), client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  if (!r.ok) return voltar('erro');
  const t = await r.json();
  if (!t.refresh_token) return voltar('sem-permissao');
  let email = null;
  try { email = JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString()).email; } catch (_) { /* segue sem o e-mail */ }

  const g = await supa('/rest/v1/integracoes', {
    metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    corpo: { chave: 'google', dados: { refresh_token: t.refresh_token, email, scope: t.scope || '', conectado_por: st.uid, conectado_em: new Date().toISOString() }, atualizado_em: new Date().toISOString() },
  });
  return voltar(g.ok ? 'ok' : 'erro');
};
