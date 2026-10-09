// Agenda pessoal de cada um dentro da plataforma: lê o "endereço secreto" (iCal) que a pessoa ligou, de 30 dias atrás a
// 6 meses à frente, e troca a lista de compromissos dela no banco (tabela agenda_pessoal, script 24). Só leitura: nunca muda
// nada na agenda de origem. O que a própria plataforma criou na Google Agenda (convites automáticos, reuniões) fica de fora,
// senão apareceria duas vezes.
import { createHmac } from 'node:crypto';
import { env, supa, contaGoogle } from './google.mjs';
import { lerAgenda } from './ics.mjs';

const DIA_MS = 86400000;
export const JANELA = { antes: 30, depois: 180 };
const MAX_EVENTOS = 4000;
export const chaveFundoPessoal = () => createHmac('sha256', env('SUPABASE_SECRET_KEY')).update('agenda-pessoal-fundo').digest('hex');

// ---------- o link ----------
export function origemDe(url) {
  const h = (() => { try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; } })();
  if (h.endsWith('google.com')) return 'google';
  if (/(^|\.)outlook\.(live|office|office365)\.com$/.test(h) || h.endsWith('hotmail.com') || h.endsWith('office365.com')) return 'outlook';
  if (h.endsWith('icloud.com')) return 'icloud';
  return 'outro';
}
export const NOME_ORIGEM = { google: 'Google Agenda', outlook: 'Outlook / Hotmail', icloud: 'iCloud', outro: 'Agenda' };

// Confere o link colado e devolve { url } ou { erro } com o que fazer.
export function limparUrl(texto) {
  let s = String(texto || '').trim().replace(/^<|>$/g, '');
  if (!s) return { erro: 'Cole o link da sua agenda.' };
  s = s.replace(/^webcals?:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch (_) { return { erro: 'Isso não parece um link. Copie o endereço inteiro (começa com https://) e cole de novo.' }; }
  u.protocol = 'https:';
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[') || /\.(local|internal|localhost)$/.test(h)) {
    return { erro: 'Esse endereço não é aceito. Use o link da agenda do Google, do Outlook/Hotmail ou de outro serviço de agenda.' };
  }
  if (h === 'calendar.google.com' && !u.pathname.includes('/ical/')) {
    return { erro: 'Esse é o link para abrir a agenda no navegador, não o endereço secreto. No Google Agenda, vá em Configurações → clique no seu nome → desça até "Integrar agenda" e copie o "Endereço secreto no formato iCal".' };
  }
  if (h === 'calendar.google.com' && /\/public\/basic\.ics$/.test(u.pathname)) {
    return { erro: 'Esse é o "endereço público", que só funciona com a agenda aberta para todo mundo. Copie o "Endereço secreto no formato iCal", que fica logo abaixo dele.' };
  }
  if (/^outlook\./.test(h) && /\.html?$/.test(u.pathname)) {
    return { erro: 'Esse é o link HTML (para ver no navegador). O Outlook mostra dois links ao publicar: copie o link ICS, que termina em ".ics".' };
  }
  return { url: u.toString() };
}

// E-mails do dono da agenda: o do login e, no Google, o que aparece no próprio link.
function donosDe(url, emailPerfil) {
  const out = [emailPerfil];
  try {
    const partes = new URL(url).pathname.split('/');
    const i = partes.indexOf('ical');
    if (i >= 0 && partes[i + 1]) out.push(decodeURIComponent(partes[i + 1]));
  } catch (_) { /* link sem e-mail */ }
  return out.filter(Boolean).map((e) => String(e).toLowerCase());
}

// Baixa a agenda. { texto } ou { erro, temporario }.
export async function baixar(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Plataforma Mentorei (leitura de agenda)', Accept: 'text/calendar, text/plain, */*' } });
    if ([401, 403, 404, 410].includes(r.status)) {
      return { erro: 'O link não abriu: a agenda trocou o endereço secreto ou deixou de ser publicada. Copie o link de novo e cole aqui.' };
    }
    if (!r.ok) return { erro: `A agenda não respondeu agora (erro ${r.status}). A plataforma tenta de novo sozinha daqui a pouco.`, temporario: true };
    if (Number(r.headers.get('content-length') || 0) > 30e6) return { erro: 'Essa agenda é grande demais para ser lida.' };
    const texto = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(texto.slice(0, 3000))) {
      return { erro: 'O link abriu, mas não é de uma agenda. Confira se copiou o endereço certo (no Google: "Endereço secreto no formato iCal"; no Outlook: o link ICS).' };
    }
    return { texto };
  } catch (_) {
    return { erro: 'Não consegui abrir o link agora. Confira se copiou o endereço inteiro. Se estiver certo, a plataforma tenta de novo sozinha.', temporario: true };
  } finally { clearTimeout(t); }
}

// ---------- o que já é da plataforma (não pode entrar de novo) ----------
// Lê todas as linhas (o Supabase entrega no máximo 1000 por pedido). Tabela que ainda não existe = lista vazia.
async function todas(caminho) {
  const out = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const r = await supa(`${caminho}&limit=1000&offset=${offset}`);
    if (!r.ok || !Array.isArray(r.dados)) break;
    out.push(...r.dados);
    if (r.dados.length < 1000) break;
  }
  return out;
}
export async function contextoLeitura() {
  const [re, ge, eq, conta] = await Promise.all([
    todas('/rest/v1/agenda_reunioes?google_evento_id=not.is.null&select=google_evento_id&order=id'),
    todas('/rest/v1/google_eventos?select=evento_id&order=chave'),
    supa('/rest/v1/perfis?ativo=eq.true&or=(papel.eq.admin,papel.eq.mentor,tambem_mentor.eq.true)&select=email'),
    contaGoogle().catch(() => null),
  ]);
  const ids = new Set();
  for (const x of re) ids.add(String(x.google_evento_id).split('_')[0]);
  for (const x of ge) ids.add(String(x.evento_id).split('_')[0]);
  const equipe = new Set((eq.ok && Array.isArray(eq.dados) ? eq.dados : []).map((p) => String(p.email || '').toLowerCase()).filter(Boolean));
  if (conta && conta.email) equipe.add(String(conta.email).toLowerCase());
  return { ids, equipe };
}
const daPlataforma = (serie, ids) => {
  const base = String(serie || '').split('@')[0].split('_')[0];
  return /^mnt[0-9a-f]{40}$/i.test(base) || ids.has(base) || /@plataforma\.mentorei\.com\.br$/i.test(String(serie || ''));
};

// ---------- ler e guardar a agenda de uma pessoa ----------
// link: linha de agenda_pessoal_links; email: e-mail do login da pessoa. Devolve { ok, total, eventos } ou { ok:false, erro }.
export async function atualizarPessoa(link, email, contexto, { texto = null } = {}) {
  const agora = Date.now();
  let conteudo = texto;
  if (conteudo == null) {
    const b = await baixar(link.url);
    if (b.erro) {
      await supa(`/rest/v1/agenda_pessoal_links?perfil_id=eq.${link.perfil_id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { erro: b.erro, erro_em: new Date().toISOString() } });
      return { ok: false, erro: b.erro, temporario: !!b.temporario };
    }
    conteudo = b.texto;
  }
  const lido = lerAgenda(conteudo, { de: agora - JANELA.antes * DIA_MS, ate: agora + JANELA.depois * DIA_MS, donos: donosDe(link.url, email) });
  const ctx = contexto || await contextoLeitura();
  const eventos = lido.eventos.filter((e) => !daPlataforma(e.serie, ctx.ids)).slice(0, MAX_EVENTOS).map((e) => {
    const org = e.organizador_email || '';
    return {
      uid: e.uid, titulo: e.titulo, inicio: e.inicio, fim: e.fim, dia_inteiro: e.dia_inteiro, local: e.local, link: e.link,
      organizador: e.organizador_eu ? null : e.organizador, organizador_email: e.organizador_eu ? null : (org || null),
      resposta: e.resposta, ocupa: e.ocupa, particular: e.particular,
      interno: e.organizador_eu || ctx.equipe.has(org) || /@mentorei\.com\.br$/.test(org),
    };
  });
  const r = await supa('/rest/v1/rpc/trocar_agenda_pessoal', { metodo: 'POST', corpo: { p_perfil: link.perfil_id, p_eventos: eventos } });
  if (!r.ok) {
    const erro = r.status === 404 ? 'Falta rodar o script 24-agenda-pessoal.sql no Supabase.' : `Não consegui guardar os compromissos (${r.status}).`;
    return { ok: false, erro };
  }
  await supa(`/rest/v1/agenda_pessoal_links?perfil_id=eq.${link.perfil_id}`, { metodo: 'PATCH', prefer: 'return=minimal',
    corpo: { lido_em: new Date().toISOString(), total: eventos.length, erro: null, erro_em: null, conta: (lido.nome || '').slice(0, 200) || null, origem: origemDe(link.url) } });
  return { ok: true, total: eventos.length, eventos };
}

// Todas as agendas ligadas (a cada 15 minutos). Uma que falhe não atrapalha as outras.
export async function atualizarTodas() {
  const [l, p] = await Promise.all([
    supa('/rest/v1/agenda_pessoal_links?select=perfil_id,url'),
    supa('/rest/v1/perfis?select=id,email,ativo'),
  ]);
  if (!l.ok || !Array.isArray(l.dados)) return { ok: false, erro: l.status === 404 ? 'script 24 não rodado' : `falha ${l.status}` };
  const perfis = new Map((p.ok && Array.isArray(p.dados) ? p.dados : []).map((x) => [x.id, x]));
  const ctx = await contextoLeitura();
  const res = { ok: true, lidas: 0, erros: 0 };
  const fila = l.dados.filter((x) => (perfis.get(x.perfil_id) || {}).ativo !== false);
  await Promise.all([0, 1, 2].map(async () => {
    while (fila.length) {
      const link = fila.shift();
      const r = await atualizarPessoa(link, (perfis.get(link.perfil_id) || {}).email || '', ctx).catch(() => ({ ok: false }));
      if (r.ok) res.lidas += 1; else res.erros += 1;
    }
  }));
  return res;
}
