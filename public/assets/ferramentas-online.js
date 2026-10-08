// Ferramentas online do arsenal. "interna": roda dentro da plataforma e guarda o resultado na ficha do mentorado.
// "externa": abre o site da ferramenta numa aba nova (o resultado não volta para a plataforma).
// Uma ferramenta pode ter PDF e versão online ao mesmo tempo.
import { esc } from './base.js';

export const ONLINE = {
  'MNT-AUT-01': { interna: true, url: '/ferramentas/gatilho-reacao-escolha/' },
  'MNT-LID-04': { interna: true, url: '/ferramentas/escada-da-delegacao/' },
  'MNT-COM-06': { interna: true, url: '/ferramentas/roda-do-comunicador/' },
  'MNT-PES-08': { interna: true, url: '/ferramentas/swot-do-time/' },
  'MNT-COM-07': { interna: true, url: '/ferramentas/voce-e-assertivo/' },
  'MNT-COM-08': { interna: true, url: '/ferramentas/roda-da-diplomacia/' },
  'MNT-JOR-06': { interna: false, url: 'https://radardalideranca.netlify.app' },
};

export const linkOnline = (id, rotulo = 'Abrir ferramenta', classe = 'btn peq') => {
  const o = ONLINE[id];
  if (!o) return '';
  return o.interna ? `<a class="${classe}" href="#/ferramenta/${esc(id)}">${esc(rotulo)}</a>`
    : `<a class="${classe}" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(rotulo)}</a>`;
};

// Campos do pacote que não precisam aparecer (cadastro e controle do formulário).
const OCULTOS = new Set(['form-name', 'bot-field', 'origem', 'nome', 'email', 'whatsapp', 'cargo', 'empresa', 'consentimento', 'data']);
const ROTULOS = { media: 'Média', faixa: 'Faixa', plano: 'Plano de ação', notas: 'Notas', situacoes: 'Situações', pausa: 'Pausa',
  urgencia: 'Urgência', compromissos: 'Compromissos', gatilho_mais_frequente: 'Gatilho mais frequente', total_tarefas: 'Tarefas mapeadas',
  mapa: 'Mapa da delegação', regra: 'Regra combinada', time: 'Time', colaboradores: 'Pessoas analisadas',
  forcas_frequentes: 'Forças mais frequentes', fraquezas_frequentes: 'Fraquezas mais frequentes', pontos_de_atencao: 'Pontos de atenção',
  duplas: 'Duplas de aprendizado', swot_individual: 'SWOT de cada pessoa', estilo_predominante: 'Estilo predominante',
  pontuacao: 'Pontuação por estilo', retorno: 'Quem vai dar retorno' };
const rotulo = (k) => ROTULOS[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');

// Mostra o resultado guardado de uma ferramenta online, qualquer que seja ela.
export function htmlResultado(t) {
  const r = t.resultado || {};
  const p = r.pacote || {};
  const campos = Object.entries(p).filter(([k, v]) => !OCULTOS.has(k) && String(v || '').trim());
  return `<div class="cartao" style="background:var(--bg);border:0">
    <div class="linha"><b style="flex:1">${esc(t.nome)}</b><span class="peq apagado">${t.feito_em ? new Date(`${t.feito_em}T12:00:00`).toLocaleDateString('pt-BR') : ''}</span></div>
    ${(r.notas || []).length ? `<div class="chips mt">${r.notas.map((n) => `<span class="selo neutro">${esc(n.habilidade)}: ${esc(n.nota)}</span>`).join('')}</div>` : ''}
    ${campos.filter(([k]) => k !== 'notas' || !(r.notas || []).length).map(([k, v]) => `<p class="peq mt"><b>${esc(rotulo(k))}</b></p><p class="peq" style="white-space:pre-wrap">${esc(v)}</p>`).join('')}
  </div>`;
}
