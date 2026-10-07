// Começa a ligação com a Google Agenda: a administração recebe o endereço de login do Google.
import { env, json, quemPede, criarState, REDIRECT_URI, contaGoogle } from '../lib/google.mjs';

export const config = { path: '/api/google-conectar', method: 'POST' };

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu || eu.papel !== 'admin') return json({ mensagem: 'Só a administração conecta a Google Agenda.' }, 403);
  let b = {}; try { b = await req.json(); } catch (_) { /* sem corpo */ }

  if (b.acao === 'status') {
    const conta = await contaGoogle();
    return json({ conectado: !!(conta && conta.refresh_token), email: conta ? conta.email : null, configurado: !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET')) });
  }
  if (!env('GOOGLE_CLIENT_ID') || !env('GOOGLE_CLIENT_SECRET')) {
    return json({ mensagem: 'Faltam as chaves do Google (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET) na Netlify.' }, 500);
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: criarState(eu.id),
  }).toString();
  return json({ url: url.toString() });
};
