// Ferramentas online do arsenal. "interna": roda dentro da plataforma e guarda o resultado na ficha do mentorado.
// "externa": abre o site da ferramenta numa aba nova (o resultado não volta para a plataforma).
// Uma ferramenta pode ter PDF e versão online ao mesmo tempo.
// "publica": também fica aberta a qualquer pessoa por QR code; os contatos vão para Vendas › Pessoa física (script 39).
import { esc } from './base.js';

export const ONLINE = {
  'MNT-AUT-01': { interna: true, url: '/ferramentas/gatilho-reacao-escolha/' },
  'MNT-LID-04': { interna: true, url: '/ferramentas/escada-da-delegacao/' },
  'MNT-COM-06': { interna: true, url: '/ferramentas/roda-do-comunicador/', publica: 'Roda do Comunicador Influente' },
  'MNT-PES-08': { interna: true, url: '/ferramentas/swot-do-time/' },
  'MNT-COM-07': { interna: true, url: '/ferramentas/voce-e-assertivo/', publica: 'Você é Assertivo?' },
  'MNT-COM-08': { interna: true, url: '/ferramentas/roda-da-diplomacia/' },
  'MNT-COM-12': { interna: true, url: '/ferramentas/qual-e-o-seu-canal/', publica: 'Qual é o seu canal?' },
  'MNT-AUT-10': { interna: true, url: '/ferramentas/roda-da-vida/' },
  'MNT-AUT-11': { interna: true, url: '/ferramentas/roda-profissional-futuro/', publica: 'Roda do Profissional do Futuro' },
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
  pontuacao: 'Pontuação por estilo', retorno: 'Quem vai dar retorno',
  area_que_sustenta: 'Área que sustenta hoje', area_para_acolher: 'Área para acolher melhor', cuidar_primeiro: 'Área que escolheu cuidar primeiro',
  proximo_passo: 'Pequeno próximo passo', quando_e_onde: 'Quando e onde vai começar', apoio: 'De quem vai pedir apoio',
  dificuldade: 'O que pode dificultar e como contornar', reflexoes: 'O que a roda está contando',
  respostas_por_area: 'Respostas de cada afirmativa (de 1 a 5)',
  media_geral: 'Média geral', medias_por_parte: 'Média de cada parte', maior_nota: 'Maior nota', menor_nota: 'Menor nota',
  primeiro_passo: 'Primeiro passo (compromisso)', prazo: 'Até quando', acoes_feitas: 'Ações do plano já feitas',
  canal_predominante: 'Canal preferencial', percentuais: 'Cada canal', leitura: 'Leitura do resultado', como_aprende: 'Como aprende melhor',
  como_falar_comigo: 'Como falar com a pessoa', atitudes: 'Atitudes para a semana',
  respostas_por_frase: 'Nota de cada frase (de 1 a 10)' };
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
