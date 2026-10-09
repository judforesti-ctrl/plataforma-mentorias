// Menu de navegação em dois formatos, escolhidos por cada pessoa: cabeçalho no topo com menus suspensos ou barra lateral.
// No celular (menos de 900 px) os dois viram uma barra simples com o botão de menu, que abre uma gaveta pela esquerda.
// Tudo sai de UMA lista de grupos (montada em app.js com as permissões de cada papel), então os formatos nunca ficam diferentes.
// A escolha fica no navegador (localStorage "mentorei.formatoMenu": "topo" ou "lateral"; padrão "topo"). O app.html aplica
// a escolha antes de desenhar a tela (html[data-menu]), para o menu não piscar. Ícones: Lucide (licença ISC), em SVG embutido.
import { esc } from './base.js';

const ICONES = {
  'compass': '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" /><circle cx="12" cy="12" r="10" />',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
  'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" />',
  'layers': '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
  'calendar': '<path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />',
  'wrench': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />',
  'sliders-horizontal': '<line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" />',
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />',
  'graduation-cap': '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />',
  'list-checks': '<path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />',
  'file-up': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 12v6" /><path d="m15 15-3-3-3 3" />',
  'circle-user': '<circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />',
  'briefcase': '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" />',
  'bar-chart-3': '<path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />',
  'users-round': '<path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />',
  'chevron-down': '<path d="m6 9 6 6 6-6" />',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />',
  'menu': '<line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />',
  'x': '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  'panel-top': '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" />',
  'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" />',
};
const svg = (nome, tam = 18) => `<svg class="mn-ic" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nome] || ''}</svg>`;

const CHAVE = 'mentorei.formatoMenu';
export function formatoSalvo() {
  try { return localStorage.getItem(CHAVE) === 'lateral' ? 'lateral' : 'topo'; } catch (_) { return 'topo'; }
}
function usarFormato(f) {
  document.documentElement.dataset.menu = f;
  try { localStorage.setItem(CHAVE, f); } catch (_) { /* navegador sem armazenamento: vale só nesta visita */ }
}

// Monta os dois formatos e a versão de celular dentro de "raiz".
// grupos: [{ id, nome, icone, itens: [{ nome, icone, rota, pode }] }]; usuario: { nome, papel (texto ou vazio) }.
// Devolve { atualizar({ rota, restrito, nome }) } — rota: a do item da página atual (ex.: "#/turmas"); restrito: esconde os grupos
// (primeiro acesso). atualizar devolve { grupo, item } da página atual, para o caminho "Grupo › Página".
export function montarMenu(raiz, { grupos, usuario, aoSair }) {
  const visiveis = grupos.map((g) => ({ ...g, itens: g.itens.filter((i) => i.pode) })).filter((g) => g.itens.length);
  if (!document.documentElement.dataset.menu) document.documentElement.dataset.menu = formatoSalvo();

  const inicial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
  const quem = () => `<span class="mn-avatar" aria-hidden="true">${esc(inicial(usuario.nome))}</span>
    <span class="mn-quem"><b data-nome>${esc(usuario.nome || '')}</b>${usuario.papel ? `<span>${esc(usuario.papel)}</span>` : ''}</span>`;
  const seletor = () => `<div class="mn-formato" role="group" aria-label="Formato do menu">
      <button type="button" data-formato="topo" aria-label="Menu no topo" title="Menu no topo">${svg('panel-top', 16)}</button>
      <button type="button" data-formato="lateral" aria-label="Menu na lateral" title="Menu na lateral">${svg('panel-left', 16)}</button></div>`;
  const itemLateral = (i) => `<a href="${i.rota}" data-rota="${i.rota}">${svg(i.icone, 18)}<span>${esc(i.nome)}</span></a>`;
  const grupoLateral = (g) => `<div class="mn-lat-grupo" data-grupo="${g.id}"><div class="mn-lat-rotulo">${svg(g.icone, 14)}<span>${esc(g.nome)}</span></div>${g.itens.map(itemLateral).join('')}</div>`;
  const rodapeLateral = () => `<div class="mn-lat-rodape">${seletor()}<div class="mn-lat-usuario">${quem()}
      <button type="button" class="mn-sair-ic" data-sair aria-label="Sair" title="Sair">${svg('log-out', 18)}</button></div></div>`;
  const logo = (alt = 'Mentorei · início') => `<a class="mn-logo" href="#/" aria-label="${alt}"><img src="/assets/logo-clara.png" alt="Mentorei"></a>`;

  raiz.innerHTML = `
    <header class="mn-topo">
      <div class="mn-topo-in">
        ${logo()}
        <nav class="mn-grupos" aria-label="Menu principal">${visiveis.map((g) => `<div class="mn-grupo" data-grupo="${g.id}">
          <button type="button" class="mn-grupo-btn" aria-expanded="false" aria-controls="mn-menu-${g.id}">${svg(g.icone, 18)}<span>${esc(g.nome)}</span>${svg('chevron-down', 16).replace('mn-ic', 'mn-ic mn-seta')}</button>
          <div class="mn-menu" id="mn-menu-${g.id}" hidden><div class="mn-menu-rotulo">${esc(g.nome)}</div>
            ${g.itens.map((i) => `<a href="${i.rota}" data-rota="${i.rota}"><span class="mn-ic-caixa">${svg(i.icone, 18)}</span><span>${esc(i.nome)}</span></a>`).join('')}</div></div>`).join('')}</nav>
        <div class="mn-usuario">${seletor()}${quem()}<button type="button" class="mn-sair-txt" data-sair>Sair</button></div>
      </div>
    </header>
    <aside class="mn-lateral" aria-label="Menu principal">
      ${logo()}
      <nav class="mn-lat-grupos" aria-label="Páginas">${visiveis.map(grupoLateral).join('')}</nav>
      ${rodapeLateral()}
    </aside>
    <div class="mn-celular">
      ${logo()}
      <button type="button" class="mn-abrir" aria-label="Abrir o menu" aria-expanded="false" aria-controls="mn-gaveta">${svg('menu', 22)}</button>
    </div>
    <div class="mn-gaveta-fundo" data-fechar-gaveta></div>
    <aside class="mn-gaveta" id="mn-gaveta" aria-label="Menu" inert>
      <div class="mn-gaveta-topo">${logo()}<button type="button" class="mn-fechar" data-fechar-gaveta aria-label="Fechar o menu">${svg('x', 22)}</button></div>
      <nav class="mn-lat-grupos" aria-label="Páginas">${visiveis.map(grupoLateral).join('')}</nav>
      ${rodapeLateral()}
    </aside>`;

  // ---------- menus suspensos (topo) ----------
  const fecharMenus = (exceto = null) => raiz.querySelectorAll('.mn-grupo-btn[aria-expanded="true"]').forEach((b) => {
    if (b === exceto) return;
    b.setAttribute('aria-expanded', 'false');
    b.nextElementSibling.hidden = true;
  });
  raiz.querySelectorAll('.mn-grupo-btn').forEach((b) => b.addEventListener('click', () => {
    const abrir = b.getAttribute('aria-expanded') !== 'true';
    fecharMenus(b);
    b.setAttribute('aria-expanded', String(abrir));
    b.nextElementSibling.hidden = !abrir;
  }));
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.mn-grupo')) fecharMenus(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const aberto = raiz.querySelector('.mn-grupo-btn[aria-expanded="true"]');
    if (aberto) { fecharMenus(); aberto.focus(); }
    if (gaveta.classList.contains('aberta')) fecharGaveta(true);
  });

  // ---------- gaveta (celular) ----------
  const gaveta = raiz.querySelector('.mn-gaveta'), fundo = raiz.querySelector('.mn-gaveta-fundo'), botaoGaveta = raiz.querySelector('.mn-abrir');
  const abrirGaveta = () => {
    gaveta.classList.add('aberta'); fundo.classList.add('aberto'); gaveta.inert = false;
    botaoGaveta.setAttribute('aria-expanded', 'true');
    (gaveta.querySelector('a.atual') || gaveta.querySelector('a')).focus();
  };
  function fecharGaveta(voltarFoco = false) {
    gaveta.classList.remove('aberta'); fundo.classList.remove('aberto'); gaveta.inert = true;
    botaoGaveta.setAttribute('aria-expanded', 'false');
    if (voltarFoco) botaoGaveta.focus();
  }
  botaoGaveta.addEventListener('click', abrirGaveta);
  raiz.querySelectorAll('[data-fechar-gaveta]').forEach((x) => x.addEventListener('click', () => fecharGaveta(true)));

  // escolher uma página fecha o menu aberto e a gaveta
  raiz.addEventListener('click', (ev) => {
    if (ev.target.closest('a[data-rota], a.mn-logo')) { fecharMenus(); fecharGaveta(); }
    if (ev.target.closest('[data-sair]')) aoSair();
    const f = ev.target.closest('[data-formato]');
    if (f) { fecharMenus(); usarFormato(f.dataset.formato); marcarFormato(); }
  });
  const marcarFormato = () => raiz.querySelectorAll('[data-formato]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.formato === document.documentElement.dataset.menu)));
  marcarFormato();

  return {
    atualizar({ rota, restrito = false, nome = null } = {}) {
      raiz.classList.toggle('mn-restrito', !!restrito);
      if (nome != null) raiz.querySelectorAll('[data-nome]').forEach((x) => { x.textContent = nome; });
      raiz.querySelectorAll('[data-rota]').forEach((a) => {
        const atual = !restrito && a.dataset.rota === rota;
        a.classList.toggle('atual', atual);
        if (atual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      let achado = null;
      for (const g of visiveis) { const i = g.itens.find((x) => x.rota === rota); if (i) { achado = { grupo: g, item: i }; break; } }
      raiz.querySelectorAll('[data-grupo]').forEach((el) => el.classList.toggle('atual', !restrito && !!achado && el.dataset.grupo === achado.grupo.id));
      return restrito ? null : achado;
    },
  };
}
