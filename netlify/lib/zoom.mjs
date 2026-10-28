// Gravações direto da nuvem do Zoom (script 46, pedido da Juliana em 27/10/2026: as aulas ficam gravadas no Zoom, com link e senha).
// Cada conta do Zoom da Mentorei (são duas, com planos pagos) ganha um app "Server-to-Server OAuth" criado pela administradora no
// Zoom Marketplace; a plataforma guarda Account ID, Client ID e Client Secret na tabela integracoes (só o servidor lê, nunca volta à tela).
// De hora em hora lê as gravações dos usuários de cada conta, acha a aula pela data e hora (mesma regra das gravações do Drive)
// e guarda o link de compartilhamento com a senha já dentro (?pwd=, como o Zoom documenta) e a senha para mostrar ao aluno.
// Gravação sem nenhuma aula de turma no horário (ex.: mentoria individual) NÃO é guardada.
import { randomUUID } from 'node:crypto';
import { supa } from './google.mjs';
import { escolherModulo, DESDE } from './gravacoes.mjs';

const API = 'https://api.zoom.us/v2';
const DIA = 86400000;

// ---------- contas ligadas ----------
export async function lerContasZoom() {
  const r = await supa('/rest/v1/integracoes?chave=eq.zoom&select=dados');
  return ((r.ok && r.dados && r.dados[0] && r.dados[0].dados) || {}).contas || [];
}
async function gravarContasZoom(contas) {
  return supa('/rest/v1/integracoes', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    corpo: { chave: 'zoom', dados: { contas }, atualizado_em: new Date().toISOString() } });
}
// o que a tela pode ver (sem as chaves)
export const contasParaTela = (contas) => contas.map((c) => ({ id: c.id, nome: c.nome, email: c.email || null, usuarios: c.usuarios || null,
  ligada_em: c.ligada_em, ultima_leitura: c.ultima_leitura || null, erro: c.erro || null, resultado: c.resultado || null }));

// ---------- chamadas ao Zoom ----------
async function tokenZoom(conta) {
  const basic = Buffer.from(`${conta.client_id}:${conta.client_secret}`).toString('base64');
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(conta.account_id)}`, {
    method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const m = String(j.reason || j.error || j.message || '');
    throw new Error(/invalid_client|Invalid client/i.test(m) ? 'O Zoom não aceitou o Client ID ou o Client Secret. Copie de novo os dois, na página "App Credentials" do app.'
      : /account/i.test(m) ? 'O Zoom não reconheceu o Account ID. Copie de novo, na página "App Credentials" do app.'
        : /activ/i.test(m) ? 'O app ainda não foi ativado no Zoom. Na página do app, abra "Activation" e clique em "Activate your app".'
          : `O Zoom recusou a ligação${m ? ` (${m})` : ''}.`);
  }
  return j.access_token;
}
async function zoom(token, caminho) {
  const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, dados: j };
}
const semEscopo = (r) => r.status === 401 || r.status === 403 || (r.dados && /scope|permission/i.test(String(r.dados.message || '')));

// Usuários da conta (cada licença grava na nuvem dele). Sem a permissão de listar usuários, usa só o dono do app ("me").
async function usuarios(token) {
  const lista = [];
  let pagina = '';
  do {
    const r = await zoom(token, `/users?status=active&page_size=300${pagina ? `&next_page_token=${pagina}` : ''}`);
    if (!r.ok) { if (semEscopo(r) || r.status === 400 || r.status === 404) return [{ id: 'me', email: null }]; throw new Error(`zoom-usuarios-${r.status}`); }
    lista.push(...(r.dados.users || []).map((u) => ({ id: u.id, email: u.email })));
    pagina = r.dados.next_page_token || '';
  } while (pagina);
  return lista.length ? lista : [{ id: 'me', email: null }];
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
// Gravações de um usuário entre duas datas (o Zoom aceita até 1 mês por pedido).
async function gravacoesDoUsuario(token, usuario, desde, ate) {
  const out = [];
  for (let ini = desde; ini <= ate; ini += 30 * DIA) {
    const fim = Math.min(ate, ini + 29 * DIA);
    let pagina = '';
    do {
      const r = await zoom(token, `/users/${encodeURIComponent(usuario)}/recordings?from=${iso(ini)}&to=${iso(fim)}&page_size=300${pagina ? `&next_page_token=${pagina}` : ''}`);
      if (!r.ok) {
        if (semEscopo(r)) throw new Error('O app do Zoom está sem a permissão de ler as gravações. Na página do app, em "Scopes", acrescente a de gravações na nuvem (cloud_recording:read:list_user_recordings:admin).');
        throw new Error(`O Zoom não entregou as gravações (erro ${r.status}).`);
      }
      out.push(...(r.dados.meetings || []));
      pagina = r.dados.next_page_token || '';
    } while (pagina);
  }
  return out;
}

// Link que já abre com a senha (o Zoom documenta: acrescentar ?pwd=<recording_play_passcode> ao share_url).
export function linkComSenha(m) {
  const base = String(m.share_url || '');
  if (!base || !m.recording_play_passcode || /[?&]pwd=/.test(base)) return base;
  return `${base}${base.includes('?') ? '&' : '?'}pwd=${encodeURIComponent(m.recording_play_passcode)}`;
}
const temVideo = (m) => !(m.recording_files && m.recording_files.length) || m.recording_files.some((f) => /^MP4$/i.test(f.file_type || ''));

// Testa as chaves e liga (ou atualiza) uma conta. Devolve { ok, mensagem }.
export async function ligarContaZoom({ nome, account_id, client_id, client_secret, por }) {
  const conta = { account_id: String(account_id || '').trim(), client_id: String(client_id || '').trim(), client_secret: String(client_secret || '').trim() };
  if (!conta.account_id || !conta.client_id || !conta.client_secret) return { ok: false, mensagem: 'Cole os três: Account ID, Client ID e Client Secret.' };
  let token, us;
  try { token = await tokenZoom(conta); us = await usuarios(token); } catch (e) { return { ok: false, mensagem: e.message }; }
  const contas = await lerContasZoom();
  const atual = contas.find((c) => c.account_id === conta.account_id);
  const nova = { ...(atual || { id: randomUUID() }), ...conta, nome: String(nome || '').trim().slice(0, 60) || (atual && atual.nome) || `Zoom ${contas.length + 1}`,
    email: (us.find((u) => u.email) || {}).email || null, usuarios: us.filter((u) => u.id !== 'me').length || null,
    ligada_em: new Date().toISOString(), ligada_por: por || null, erro: null };
  const r = await gravarContasZoom(atual ? contas.map((c) => (c.id === atual.id ? nova : c)) : [...contas, nova]);
  if (!r.ok) return { ok: false, mensagem: 'Não consegui guardar a ligação.' };
  return { ok: true, mensagem: `Conta "${nova.nome}" ligada${nova.usuarios ? ` (${nova.usuarios} usuário${nova.usuarios > 1 ? 's' : ''})` : ''}. A plataforma já está procurando as gravações.` };
}
export async function tirarContaZoom(id) {
  const contas = await lerContasZoom();
  await gravarContasZoom(contas.filter((c) => c.id !== id));
}

// ---------- presença: quem entrou na reunião do módulo (script 49) ----------
// O link do módulo traz o número da reunião (zoom.us/j/123...). Em cada conta ligada: acha a vez em que a reunião aconteceu mais
// perto da data do módulo (reunião recorrente usa o mesmo número toda semana) e lê o relatório de participantes.
// O app do Zoom precisa de mais duas permissões: ver as reuniões que já aconteceram e o relatório de participantes.
export const ESCOPOS_PRESENCA = 'meeting:read:list_past_instances:admin e report:read:list_meeting_participants:admin';
export const numeroDaReuniao = (link) => ((String(link || '').match(/zoom\.us\/(?:j|w|s|wc\/join|wc)\/(\d{9,12})/i) || [])[1]
  || (String(link || '').match(/[?&](?:confno|meetingId)=(\d{9,12})/i) || [])[1] || null);
// o Zoom pede o código da reunião "codificado duas vezes" quando ele começa com / ou tem //
const codigoReuniao = (uuid) => (/^\/|\/\//.test(uuid) ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid));

export async function participantesDaReuniao({ link, dataHora }) {
  const numero = numeroDaReuniao(link);
  if (!numero) return { ok: false, mensagem: 'O link da sala deste módulo não é de uma reunião do Zoom (zoom.us/j/…). Importe a lista de presença por arquivo.' };
  const contas = await lerContasZoom();
  if (!contas.length) return { ok: false, mensagem: 'Nenhuma conta do Zoom ligada à plataforma. Ligue em Turmas → Gravações das aulas, ou importe a lista de presença por arquivo.' };
  const alvo = Date.parse(dataHora || '') || null;
  let semPermissao = false, achou = false;
  for (const conta of contas) {
    let token;
    try { token = await tokenZoom(conta); } catch (_) { continue; }
    // as vezes em que a reunião aconteceu
    const inst = await zoom(token, `/past_meetings/${numero}/instances`);
    if (!inst.ok) { if (semEscopo(inst)) semPermissao = true; continue; }
    const vezes = (inst.dados.meetings || []).filter((v) => v.uuid && v.start_time);
    if (!vezes.length) continue;
    achou = true;
    const vez = alvo
      ? vezes.map((v) => ({ v, d: Math.abs(Date.parse(v.start_time) - alvo) })).sort((a, b) => a.d - b.d)[0]
      : { v: vezes.sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))[0], d: 0 };
    if (alvo && vez.d > 12 * 3600000) return { ok: false, mensagem: 'O Zoom não tem esta reunião no dia do módulo. Confira a data do módulo ou importe a lista por arquivo.' };
    // relatório de participantes (uma linha por entrada na sala; duração em segundos)
    const linhas = [];
    let pagina = '';
    do {
      const r = await zoom(token, `/report/meetings/${codigoReuniao(vez.v.uuid)}/participants?page_size=300${pagina ? `&next_page_token=${pagina}` : ''}`);
      if (!r.ok) {
        if (semEscopo(r)) return { ok: false, mensagem: `O app do Zoom "${conta.nome}" está sem a permissão do relatório de participantes. Na página do app, em "Scopes", acrescente: ${ESCOPOS_PRESENCA}.` };
        return { ok: false, mensagem: `O Zoom não entregou a lista de participantes (erro ${r.status}). Tente de novo daqui a pouco ou importe por arquivo.` };
      }
      for (const p of r.dados.participants || []) {
        const seg = Number(p.duration) || (p.join_time && p.leave_time ? (Date.parse(p.leave_time) - Date.parse(p.join_time)) / 1000 : 0);
        linhas.push({ nome: p.name || '', email: p.user_email || '', minutos: seg / 60 });
      }
      pagina = r.dados.next_page_token || '';
    } while (pagina);
    return { ok: true, conta: conta.nome, inicio: vez.v.start_time, linhas };
  }
  if (semPermissao) return { ok: false, mensagem: `O app do Zoom está sem a permissão de ver as reuniões que já aconteceram. Na página do app, em "Scopes", acrescente: ${ESCOPOS_PRESENCA}.` };
  return { ok: false, mensagem: achou ? 'Não achei a reunião deste módulo.' : 'Não achei esta reunião nas contas do Zoom ligadas. Ela pode ter sido feita em outra conta: importe a lista de presença por arquivo.' };
}

// ---------- leitura de todas as contas ----------
export async function lerZoom({ modulos, limiteMs = 20000 } = {}) {
  const contas = await lerContasZoom();
  if (!contas.length) return { desligado: true };
  const ja = await supa('/rest/v1/gravacoes?zoom_id=not.is.null&select=zoom_id');
  if (!ja.ok) return { erro: 'script', mensagem: 'Falta rodar o script 46-gravacoes-do-zoom.sql no Supabase.' };
  const conhecidas = new Set((ja.dados || []).map((x) => x.zoom_id));
  const inicio = Date.now();
  const total = { lidas: 0, novas: 0, ligadas: 0, sem_modulo: 0, contas: contas.length, erros: [] };
  for (const conta of contas) {
    // primeira leitura: desde agosto; depois, os últimos 45 dias (dá tempo de cadastrar o módulo depois da aula)
    const desde = conta.ultima_leitura ? Math.max(DESDE, Date.now() - 45 * DIA) : DESDE;
    const res = { lidas: 0, novas: 0, ligadas: 0, sem_modulo: 0 };
    try {
      const token = await tokenZoom(conta);
      for (const u of await usuarios(token)) {
        if (Date.now() - inicio > limiteMs) break;
        for (const m of await gravacoesDoUsuario(token, u.id, desde, Date.now())) {
          res.lidas += 1;
          if (!m.uuid || conhecidas.has(m.uuid) || !temVideo(m) || !m.share_url) continue;
          const esc = escolherModulo({ nomes: [m.topic || ''], inicio: m.start_time }, modulos);
          if (!esc.modulo_id && !esc.candidatos.length) continue;          // nenhuma aula de turma nesse horário: não guarda
          const linha = { zoom_id: m.uuid, origem: 'zoom', nome: m.topic || 'Gravação do Zoom', link: linkComSenha(m), senha: m.password || null,
            gravada_em: m.start_time || null, duracao_min: Number(m.duration) || null, modulo_id: esc.modulo_id || null, ligada: 'auto', compartilhada: true };
          const ins = await supa('/rest/v1/gravacoes?on_conflict=zoom_id', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', corpo: linha });
          if (!(ins.ok && ins.dados && ins.dados[0])) continue;
          conhecidas.add(m.uuid);
          res.novas += 1;
          if (linha.modulo_id) res.ligadas += 1; else res.sem_modulo += 1;
        }
      }
      Object.assign(conta, { ultima_leitura: new Date().toISOString(), erro: null, resultado: res });
    } catch (e) {
      Object.assign(conta, { erro: e.message, resultado: res });
      total.erros.push(`${conta.nome}: ${e.message}`);
    }
    for (const k of ['lidas', 'novas', 'ligadas', 'sem_modulo']) total[k] += res[k];
  }
  // grava o estado de cada conta sem perder uma conta ligada enquanto a leitura rodava
  const agora = await lerContasZoom();
  await gravarContasZoom(agora.map((c) => { const lida = contas.find((x) => x.id === c.id); return lida ? { ...c, ultima_leitura: lida.ultima_leitura, erro: lida.erro, resultado: lida.resultado } : c; }));
  return total;
}
