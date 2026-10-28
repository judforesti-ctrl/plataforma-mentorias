// Peças do visual da área do aluno e do mentorado (opção A aprovada pela Juliana em 28/10/2026: menu lateral, cartão escuro com o
// quanto já fez, números, próximo encontro e a jornada em bolinhas). Usadas por minha-trilha.js e minha-area.js.
// As cores vêm das variáveis do app.css (--petroleo, --bege...), que a marca do cliente troca (marca.js); aplicarMarca() faz isso
// na página toda e no menu, para quem é aluno ou mentorado.
import { esc } from '../base.js';
import { tema } from '../marca.js';

const TZ = 'America/Sao_Paulo';
export const diaISO = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });

// Ícones (Lucide, licença ISC), sempre decorativos: o texto ao lado diz o que é.
const ICONES = {
  check: '<path d="M20 6 9 17l-5-5" />',
  arquivo: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />',
  play: '<circle cx="12" cy="12" r="10" /><path d="m10 8 6 4-6 4Z" />',
  tarefa: '<path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />',
  ferramenta: '<rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />',
  resumo: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />',
  seta: '<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />',
};
export const icone = (nome, tam = 18) => `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nome] || ''}</svg>`;

// Cores do cliente na página toda e no menu (só para aluno e mentorado; sem marca = cores da Mentorei).
// O menu lateral usa --mn-*: fundo = cor principal, destaque = cor de destaque (no lugar do lima da equipe).
export function aplicarMarca(marca) {
  const t = tema(marca || {});
  const raiz = document.documentElement;
  t.estilo.split(';').forEach((par) => { const i = par.indexOf(':'); if (i > 0) raiz.style.setProperty(par.slice(0, i), par.slice(i + 1)); });
  raiz.style.setProperty('--mn-fundo', t.principal);
  raiz.style.setProperty('--mn-destaque', t.destaque);
  raiz.style.setProperty('--mn-sobre-destaque', t.textoBotao);
}

// "Bom dia, Mariana!" e a linha de baixo com a data de hoje
export function saudacao(nome, linha) {
  const h = Number(new Date().toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', hour12: false }));
  const oi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  return `<header class="aa-cab"><h1>${oi}, ${esc(String(nome || '').split(' ')[0])}!</h1>
    <p>${esc(hoje.charAt(0).toUpperCase() + hoje.slice(1))}${linha ? ` · ${linha}` : ''}</p></header>`;
}

// "Faltam 8 dias para…", "É hoje", "É amanhã"
export function faltam(iso, oque) {
  if (!iso) return '';
  const d = Math.round((Date.parse(diaISO(Date.parse(iso))) - Date.parse(diaISO(Date.now()))) / 86400000);
  if (d < 0) return '';
  if (d === 0) return `Seu ${oque} é hoje`;
  if (d === 1) return `Seu ${oque} é amanhã`;
  return `Faltam ${d} dias para o seu próximo ${oque}`;
}

// anel com a porcentagem feita
export function anel(pct, rotulo) {
  const r = 62, volta = 2 * Math.PI * r, feito = Math.max(0, Math.min(100, pct)) / 100 * volta;
  return `<div class="aa-anel" role="img" aria-label="${pct}% ${esc(rotulo)}">
    <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="${r}" class="aa-anel-fundo" />
      ${pct > 0 ? `<circle cx="75" cy="75" r="${r}" class="aa-anel-feito" stroke-dasharray="${feito.toFixed(1)} ${volta.toFixed(1)}" transform="rotate(-90 75 75)" />` : ''}</svg>
    <div aria-hidden="true"><b>${pct}%</b><span>${esc(rotulo)}</span></div></div>`;
}

// cartão de número: { ic, cor: 'ok'|'bege'|'azul', valor, texto }
export const numero = (n) => `<div class="aa-num"><span class="aa-num-ic ${n.cor || 'bege'}">${icone(n.ic, 19)}</span><b>${n.valor}</b><span>${esc(n.texto)}</span></div>`;

// bloco da data: QUI / 05 / NOV
export function blocoData(iso) {
  const d = new Date(iso);
  const parte = (o) => d.toLocaleDateString('pt-BR', { timeZone: TZ, ...o }).replace('.', '').toUpperCase();
  return `<div class="aa-data" aria-hidden="true"><span>${parte({ weekday: 'short' })}</span><b>${parte({ day: '2-digit' })}</b><span>${parte({ month: 'short' })}</span></div>`;
}

// jornada em bolinhas: itens [{ numero, titulo, sub, estado: 'feito'|'atual'|'futuro'|'cancelado' }]
export function jornada(itens, rotulo) {
  return `<ol class="aa-jornada" aria-label="${esc(rotulo)}">${itens.map((x) => `<li class="${x.estado}"${x.estado === 'atual' ? ' aria-current="step"' : ''}>
    <span class="aa-bola">${x.estado === 'feito' ? icone('check', 20) : x.numero}</span><span class="aa-trilho" aria-hidden="true"></span>
    <b>${esc(x.titulo)}</b>${x.sub ? `<span class="aa-jsub">${esc(x.sub)}</span>` : ''}
    <span class="sr-only">${x.estado === 'feito' ? '(feito)' : x.estado === 'atual' ? '(próximo)' : x.estado === 'cancelado' ? '(cancelado)' : ''}</span></li>`).join('')}</ol>`;
}
