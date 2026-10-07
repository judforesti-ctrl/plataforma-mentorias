// Núcleo compartilhado: conexão com o Supabase, sessão de login, registro de acessos e utilidades de tela.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------- texto e datas ----------
export const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const TZ = 'America/Sao_Paulo';
export const dataBR = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const diaMes = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short' }).replace('.', '') : '—';
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
