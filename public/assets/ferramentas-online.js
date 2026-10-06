// Ferramentas online do arsenal. "interna": roda dentro da plataforma e guarda o resultado na ficha do mentorado.
// "externa": abre o site da ferramenta numa aba nova (o resultado não volta para a plataforma).
import { esc } from './base.js';

export const ONLINE = {
  'MNT-COM-06': { interna: true, url: '/ferramentas/roda-do-comunicador/' },
  'MNT-JOR-06': { interna: false, url: 'https://radardalideranca.netlify.app' },
};

export const linkOnline = (id, rotulo = 'Abrir ferramenta', classe = 'btn peq') => {
  const o = ONLINE[id];
  if (!o) return '';
  return o.interna ? `<a class="${classe}" href="#/ferramenta/${esc(id)}">${esc(rotulo)}</a>`
    : `<a class="${classe}" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(rotulo)}</a>`;
};

// Mostra o resultado guardado de uma ferramenta online (média, faixa, notas e plano).
export function htmlResultado(t) {
  const r = t.resultado || {};
  const p = r.pacote || {};
  return `<div class="cartao" style="background:var(--bg);border:0">
    <div class="linha"><b style="flex:1">${esc(t.nome)}</b><span class="peq apagado">${t.feito_em ? new Date(`${t.feito_em}T12:00:00`).toLocaleDateString('pt-BR') : ''}</span></div>
    ${p.media ? `<p class="mt"><span class="selo escuro">Média ${esc(p.media)}</span> <span class="selo">${esc(p.faixa || '')}</span></p>` : ''}
    ${(r.notas || []).length ? `<div class="chips mt">${r.notas.map((n) => `<span class="selo neutro">${esc(n.habilidade)}: ${esc(n.nota)}</span>`).join('')}</div>` : ''}
    ${p.plano ? `<p class="peq mt"><b>Plano de ação</b></p><p class="peq" style="white-space:pre-wrap">${esc(p.plano)}</p>` : ''}
  </div>`;
}
