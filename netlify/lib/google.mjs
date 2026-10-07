// Peças comuns da ligação com a Google Agenda: Supabase com a chave secreta, conta conectada e chave de acesso do Google.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
export const SITE = 'https://plataforma.mentorei.com.br';
export const REDIRECT_URI = `${SITE}/api/google-retorno`;
export const FUSO = 'America/Sao_Paulo';
export const env = (k) => ((globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '').trim();

export const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// Supabase pelo servidor (ignora as regras de acesso: use só depois de conferir quem está pedindo).
export async function supa(caminho, { metodo = 'GET', corpo, prefer } = {}) {
  const chave = env('SUPABASE_SECRET_KEY');
  const headers = { apikey: chave, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text();
  let dados = null; try { dados = t ? JSON.parse(t) : null; } catch (_) { dados = t; }
  return { ok: r.ok, status: r.status, dados };
}

// Quem está pedindo (pelo login da plataforma).
export async function quemPede(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SECRET_KEY'), Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const p = await supa(`/rest/v1/perfis?id=eq.${u.id}&select=id,nome,papel,ativo`);
  const perfil = p.ok && p.dados && p.dados[0];
  return perfil && perfil.ativo ? perfil : null;
}

// "state" assinado do login do Google, para saber que o retorno veio de um pedido da administração.
const assinar = (texto) => createHmac('sha256', env('SUPABASE_SECRET_KEY')).update(texto).digest('base64url');
export const criarState = (uid) => { const base = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 15 * 60 * 1000 })).toString('base64url'); return `${base}.${assinar(base)}`; };
export function lerState(state) {
  const [base, sig] = String(state || '').split('.');
  if (!base || !sig) return null;
  const a = Buffer.from(assinar(base)), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const d = JSON.parse(Buffer.from(base, 'base64url').toString());
  return d.exp > Date.now() ? d : null;
}

// Conta Google conectada (chave guardada na tabela integracoes).
export async function contaGoogle() {
  const r = await supa('/rest/v1/integracoes?chave=eq.google&select=dados');
  return (r.ok && r.dados && r.dados[0] && r.dados[0].dados) || null;
}

// Chave de acesso do Google, renovada a partir da conta conectada.
export async function acessoGoogle() {
  const conta = await contaGoogle();
  if (!conta || !conta.refresh_token) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: conta.refresh_token, grant_type: 'refresh_token' }),
  });
  if (!r.ok) return { erro: 'A ligação com a Google Agenda expirou. Conecte de novo no Painel.' };
  const t = await r.json();
  return { token: t.access_token, email: conta.email };
}

export async function agenda(token, caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${caminho}`, {
    method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const t = await r.text();
  let dados = null; try { dados = t ? JSON.parse(t) : null; } catch (_) { dados = t; }
  return { ok: r.ok, status: r.status, dados };
}
