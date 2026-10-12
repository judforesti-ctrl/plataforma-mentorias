// Tarefas do mentorado: várias por sessão (tabela "tarefas", script 33), cada uma com o seu prazo.
// Antes do script 33 cada sessão tinha uma tarefa só (colunas sessoes.tarefa...): sem a tabela, é dela que lemos.
import { sb, esc, diaMes, hojeISO } from './base.js';

export const CAMPOS_TAREFA = 'id, sessao_id, mentorado_id, texto, prazo, ordem, feita_em, comentario';
const faltaTabela = (e) => !!e && /tarefas|does not exist|Could not find|schema cache|42P01|PGRST20[45]/i.test(`${e.code || ''} ${e.message || ''}`);

// A tarefa única antiga, no mesmo formato das novas.
const daSessao = (s) => (s && String(s.tarefa || '').trim() ? [{ id: null, legado: true, sessao_id: s.id, mentorado_id: s.mentorado_id,
  texto: s.tarefa, prazo: s.tarefa_prazo || null, ordem: 0, feita_em: s.tarefa_feita_em || null, comentario: s.tarefa_comentario || null }] : []);

// Coloca em cada sessão a lista s.tarefas. "filtro" limita a busca (ex.: (q) => q.eq('mentorado_id', id)).
// Devolve true quando a tabela nova existe (dá para ter várias tarefas).
export async function juntarTarefas(sessoes, filtro = (q) => q) {
  const lista = (sessoes || []).filter(Boolean);
  const { data, error } = await filtro(sb.from('tarefas').select(CAMPOS_TAREFA)).order('ordem').order('criado_em');
  if (error) {
    if (!faltaTabela(error)) console.warn('Tarefas:', error);
    lista.forEach((s) => { s.tarefas = daSessao(s); });
    return false;
  }
  const por = new Map();
  (data || []).forEach((t) => { if (!por.has(t.sessao_id)) por.set(t.sessao_id, []); por.get(t.sessao_id).push(t); });
  lista.forEach((s) => { s.tarefas = por.get(s.id) || []; });
  return true;
}

export const prazoBR = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '');
export const atrasada = (t) => !t.feita_em && !!t.prazo && t.prazo < hojeISO();

export const seloTarefa = (t) => (t.feita_em ? `<span class="selo">Feita em ${diaMes(t.feita_em)}</span>`
  : atrasada(t) ? '<span class="selo alerta">Atrasada</span>' : '<span class="selo neutro">Pendente</span>');

// Resumo curto para tabelas: "2 tarefas · 1 atrasada".
export function seloResumo(tarefas) {
  if (!tarefas || !tarefas.length) return '';
  const feitas = tarefas.filter((t) => t.feita_em).length;
  const atras = tarefas.filter(atrasada).length;
  if (tarefas.length === 1) return seloTarefa(tarefas[0]).replace(/Feita em [^<]+/, 'Entregue');
  return `<span class="selo ${atras ? 'alerta' : feitas === tarefas.length ? '' : 'neutro'}">${feitas} de ${tarefas.length} feitas${atras ? ` · ${atras} atrasada${atras > 1 ? 's' : ''}` : ''}</span>`;
}

// Lista para ler (tela da sessão, sessões anteriores).
export const htmlTarefas = (tarefas) => `<ul class="tarefas-lista">${tarefas.map((t) => `<li><span style="white-space:pre-wrap">${esc(t.texto)}</span>
  <span class="peq">${seloTarefa(t)}${t.prazo ? ` <span class="apagado">prazo ${prazoBR(t.prazo)}</span>` : ''}</span>
  ${t.comentario ? `<span class="peq apagado">Comentário do mentorado: “${esc(t.comentario)}”</span>` : ''}</li>`).join('')}</ul>`;

// Texto para WhatsApp e resumo.
export const textoTarefas = (tarefas) => (tarefas.length === 1
  ? `Sua tarefa: ${tarefas[0].texto}${tarefas[0].prazo ? ` (até ${prazoBR(tarefas[0].prazo)})` : ''}`
  : `Suas tarefas:\n${tarefas.map((t) => `• ${t.texto}${t.prazo ? ` (até ${prazoBR(t.prazo)})` : ''}`).join('\n')}`);
