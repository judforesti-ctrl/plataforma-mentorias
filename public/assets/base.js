// Núcleo compartilhado: conexão com o Supabase, sessão de login, registro de acessos e utilidades de tela.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// "Ver como o mentor vê" (31/10/2026, pedido da Juliana para a Cintia): a administração abre a plataforma com o login do mentor
// (/api/ver-como), só nesta aba (sessionStorage, guardado à parte do login dela) e só para olhar: gravações, envios de arquivo e
// funções do servidor são barrados aqui embaixo (prepararVerComo). Voltar = sairDoVerComo (encerra só esta sessão do mentor).
const VER_COMO = 'mentorei.verComo';
export const verComo = (() => { try { return JSON.parse(sessionStorage.getItem(VER_COMO) || 'null'); } catch (_) { return null; } })();

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: verComo ? { storageKey: 'mentorei-ver-como', storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    : { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------- texto e datas ----------
export const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const TZ = 'America/Sao_Paulo';
// data sem hora ("2026-11-08") vale o dia inteiro: lida ao meio-dia para não voltar um dia no fuso de Brasília
const quando = (iso) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? `${iso}T12:00:00Z` : iso);
export const dataBR = (iso) => iso ? quando(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const diaMes = (iso) => iso ? quando(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short' }).replace('.', '') : '—';
export const horaBR = (iso) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
export const dataHoraBR = (iso) => iso ? `${dataBR(iso)} · ${horaBR(iso)}` : '—';
export const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ }); // AAAA-MM-DD
export const mesmoDia = (iso, diaISO) => iso && new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ }) === diaISO;

// Converte "2026-10-07T09:00" (horário de Brasília digitado num campo) para ISO com fuso.
export const localParaISO = (valor) => valor ? new Date(`${valor}:00-03:00`).toISOString() : null;
export const isoParaLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};

// apelido entre parênteses não vira inicial: "Luciane (Lu)" → "L"
export const iniciais = (nome) => (String(nome || '?').trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p)).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();
export const avatar = (pessoa, grande = false) => `<span class="avatar${grande ? ' g' : ''}">${pessoa && pessoa.foto_url
  ? `<img src="${esc(pessoa.foto_url)}" alt="">` : esc(iniciais(pessoa && pessoa.nome))}</span>`;

// ---------- mensagens ----------
let toastTimer;
export function avisar(msg, erro = false) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.className = `toast${erro ? ' erro' : ''}`; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, erro ? 7000 : 3500);
}

// Traduz os erros mais comuns do banco para português simples.
export function explicarErro(e) {
  const m = String((e && (e.message || e.error_description || e.msg)) || e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha não conferem.';
  if (/Email not confirmed/i.test(m)) return 'Este e-mail ainda não confirmou o convite. Abra o e-mail de convite da Mentorei.';
  if (/Sessão concluída/i.test(m)) return 'Esta sessão já foi concluída. Só a administração pode alterar.';
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
  if (/duplicate key/i.test(m)) return 'Esse registro já existe.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com a internet. Tente de novo em instantes.';
  return m || 'Algo deu errado. Tente de novo.';
}

// ---------- sessão de login ----------
export async function sessaoAtual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function meuPerfil() {
  const s = await sessaoAtual();
  if (!s) return null;
  const { data, error } = await sb.from('perfis').select('*').eq('id', s.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function sair() {
  if (verComo) return sairDoVerComo();
  await encerrarAcesso();
  await sb.auth.signOut();
  location.href = '/';
}

// ---------- registro de acessos (entrada e "ainda aqui" a cada 2 minutos) ----------
let acessoId = null, sinal = null;
export async function registrarAcesso(perfilId) {
  try {
    const guardado = sessionStorage.getItem('acesso_id');
    if (guardado) acessoId = Number(guardado);
  } catch (_) { /* navegador sem armazenamento */ }
  if (!acessoId) {
    const aparelho = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'Celular' : 'Computador';
    const { data } = await sb.from('acessos').insert({ perfil_id: perfilId, aparelho }).select('id').single();
    if (data) { acessoId = data.id; try { sessionStorage.setItem('acesso_id', String(acessoId)); } catch (_) {} }
  }
  const pulso = () => acessoId && sb.from('acessos').update({ ultimo_sinal_em: new Date().toISOString() }).eq('id', acessoId);
  pulso();
  clearInterval(sinal); sinal = setInterval(pulso, 120000);
}
async function encerrarAcesso() {
  if (acessoId) await sb.from('acessos').update({ ultimo_sinal_em: new Date().toISOString() }).eq('id', acessoId);
  try { sessionStorage.removeItem('acesso_id'); } catch (_) {}
}

// ---------- salvamento automático ----------
// Junta as mudanças de um formulário e salva 1,5 s depois da última digitação,
// e de novo a cada minuto se algo ficou pendente. Mostra "Salvo às hh:mm".
export function autoSalvar({ salvar, indicador }) {
  let pendente = false, timer = null, emAndamento = false;
  const marcar = (estado, txt) => { if (indicador) { indicador.className = `salvo ${estado}`; indicador.textContent = txt; } };
  async function executar() {
    if (!pendente || emAndamento) return;
    pendente = false; emAndamento = true; marcar('salvando', 'Salvando…');
    try {
      await salvar();
      marcar('', `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      pendente = true; marcar('erro', explicarErro(e));
    } finally { emAndamento = false; }
  }
  const minuto = setInterval(executar, 60000);
  window.addEventListener('beforeunload', (ev) => { if (pendente) { executar(); ev.preventDefault(); ev.returnValue = ''; } });
  return {
    mudou() { pendente = true; marcar('salvando', 'Alterações não salvas'); clearTimeout(timer); timer = setTimeout(executar, 1500); },
    agora: executar,
    parar() { clearInterval(minuto); clearTimeout(timer); },
  };
}

// Lê os campos com atributo data-campo de um contêiner, como objeto.
export function lerCampos(raiz) {
  const obj = {};
  raiz.querySelectorAll('[data-campo]').forEach((el) => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
    else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
    obj[el.dataset.campo] = v;
  });
  return obj;
}

// ---------- "Ver como o mentor vê" ----------
// Começa (tela Mentores): guarda o nome e o login do mentor que /api/ver-como devolveu e abre a plataforma de novo, já como ele.
export function comecarVerComo({ perfil_id, nome, admin, access_token, refresh_token }) {
  sessionStorage.setItem(VER_COMO, JSON.stringify({ perfil_id, nome, admin, tokens: { access_token, refresh_token } }));
  location.replace(location.pathname);
}
// Volta para a visão da administração: encerra só esta sessão do mentor (as dele, nos aparelhos dele, continuam) e recarrega.
export async function sairDoVerComo() {
  try { await sb.auth.signOut({ scope: 'local' }); } catch (_) { /* a sessão já tinha acabado */ }
  try { sessionStorage.removeItem(VER_COMO); sessionStorage.removeItem('mentorei-ver-como'); } catch (_) {}
  location.hash = '#/mentores';
  location.reload();
}

export const NADA_GRAVADO = 'Você está vendo como o mentor vê: nada é gravado neste modo.';
// só leitura: estas funções do banco não mudam nada
const RPC_LEITURA = new Set(['catalogo_ferramentas', 'contato_coordenacao', 'ferramentas_da_trilha', 'meu_extrato_mentor', 'minha_jornada', 'minhas_trilhas', 'numeros_trilhas', 'painel_rh', 'avaliacao_contador', 'planejamento_nivel', 'planejamento_pessoas']);
// resposta de "barrado": serve para qualquer encadeamento (.select().single(), .eq()...) e, aguardada, devolve o erro
function barrado() {
  avisar(NADA_GRAVADO, true);
  const r = { data: null, error: { message: NADA_GRAVADO } };
  const p = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? (ok, falha) => Promise.resolve(r).then(ok, falha) : () => p), apply: () => p });
  return p;
}
async function prepararVerComo() {
  if (verComo.tokens) {
    await sb.auth.setSession(verComo.tokens).catch(() => null);
    delete verComo.tokens;
    try { sessionStorage.setItem(VER_COMO, JSON.stringify(verComo)); } catch (_) {}
  }
  // sem a sessão do mentor (venceu ou não abriu): volta para a visão normal
  if (!(await sb.auth.getSession()).data.session) {
    try { sessionStorage.removeItem(VER_COMO); sessionStorage.removeItem('mentorei-ver-como'); } catch (_) {}
    location.reload();
    await new Promise(() => {});
  }
  const deTabela = sb.from.bind(sb);
  sb.from = (t) => { const q = deTabela(t); for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = barrado; return q; };
  const deRpc = sb.rpc.bind(sb);
  sb.rpc = (fn, ...resto) => (RPC_LEITURA.has(fn) ? deRpc(fn, ...resto) : barrado());
  // sb.storage cria um objeto novo a cada uso: fica um só, já com a trava
  const pasta = sb.storage, dePasta = pasta.from.bind(pasta);
  pasta.from = (b) => { const q = dePasta(b); for (const m of ['upload', 'update', 'remove', 'move', 'copy', 'uploadToSignedUrl']) q[m] = barrado; return q; };
  Object.defineProperty(sb, 'storage', { get: () => pasta });
  sb.auth.updateUser = barrado;
  // funções do servidor da plataforma: só as consultas ("status") passam
  const deFetch = window.fetch.bind(window);
  window.fetch = (url, op = {}) => {
    const u = String((url && url.url) || url);
    if (u.startsWith('/api/') || u.startsWith(`${location.origin}/api/`)) {
      let acao = null; try { acao = JSON.parse(op.body || '{}').acao; } catch (_) {}
      if ((op.method || 'GET').toUpperCase() !== 'GET' && acao !== 'status') {
        avisar(NADA_GRAVADO, true);
        return Promise.resolve(new Response(JSON.stringify({ ok: false, mensagem: NADA_GRAVADO }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
      }
    }
    return deFetch(url, op);
  };
}
if (verComo) await prepararVerComo();
