// Campo de escolha com pesquisa (pedido da Juliana, 2026-11-11): toda caixa de seleção de empresa/cliente, e toda caixa comprida
// (12 opções ou mais), vira um botão que abre uma lista com campo "Digite para procurar" e a opção escolhida marcada (✓).
// O <select> de verdade continua na página (invisível): as telas seguem lendo `.value` e ouvindo `change` como sempre, então
// nenhuma tela precisou mudar. Para deixar uma caixa de fora: <select data-busca="nao">. Para forçar: data-busca="sim".
const MINIMO = 12;
const EH_EMPRESA = /(^|-)(emp|empresa|empresas|cliente)$/i;
const ROTULO_EMPRESA = /empresa|cliente/i;
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let aberto = null;   // { sel, botao, caixa, fechar }

function serve(sel) {
  if (sel.multiple || sel.size > 1) return false;
  if (sel.dataset.busca === 'nao') return false;
  if (sel.dataset.busca === 'sim') return true;
  if (sel.closest('[data-busca="nao"]')) return false;
  if (EH_EMPRESA.test(sel.id || '') || ROTULO_EMPRESA.test(sel.getAttribute('aria-label') || '')) return true;
  if (sel.options.length < MINIMO) return false;
  // listas de hora, UF, números: opções curtinhas não precisam de pesquisa
  let maior = 0; for (const o of sel.options) maior = Math.max(maior, o.text.trim().length);
  return maior > 6;
}

function textoAtual(sel) { const o = sel.options[sel.selectedIndex]; return o ? o.text.trim() : ''; }

function atualizar(sel) {
  const b = sel._busca; if (!b) return;
  const o = sel.options[sel.selectedIndex];
  b.querySelector('.bs-texto').textContent = textoAtual(sel) || 'Escolha…';
  b.classList.toggle('bs-vazio', !o || o.value === '');
  b.disabled = sel.disabled;
  b.hidden = sel.hidden || sel.style.display === 'none';
}

function vestir(sel) {
  if (sel._busca) { if (sel.isConnected && !sel._busca.isConnected) { sel.after(sel._busca); atualizar(sel); } return; }
  if (!sel.isConnected || !serve(sel)) return;
  const estreito = sel.style.width === 'auto' || (sel.offsetWidth > 0 && sel.parentElement && sel.offsetWidth < sel.parentElement.clientWidth - 24);
  const b = document.createElement('button');
  b.type = 'button'; b.className = `bs-botao${estreito ? ' bs-estreito' : ''}`;
  b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false');
  const rotulo = sel.getAttribute('aria-label'); if (rotulo) b.setAttribute('aria-label', rotulo);
  b.innerHTML = '<span class="bs-texto"></span><span class="bs-seta" aria-hidden="true">▾</span>';
  sel._busca = b; b._sel = sel;
  sel.classList.add('bs-escondido'); sel.tabIndex = -1;
  sel.after(b);
  b.addEventListener('click', () => (aberto && aberto.sel === sel ? aberto.fechar() : abrir(sel)));
  b.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir(sel); } });
  sel.addEventListener('focus', () => b.focus());           // clique no rótulo (label for=…) ou aviso de campo obrigatório
  sel.addEventListener('change', () => atualizar(sel));
  // quando a tela troca o valor por código (sel.value = …), o texto do botão acompanha
  for (const prop of ['value', 'selectedIndex']) {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    Object.defineProperty(sel, prop, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); atualizar(this); } });
  }
  new MutationObserver(() => { atualizar(sel); if (aberto && aberto.sel === sel) aberto.redesenhar(); })
    .observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style', 'selected', 'label'] });
  atualizar(sel);
}

function abrir(sel) {
  if (aberto) aberto.fechar();
  if (sel.disabled) return;
  const botao = sel._busca;
  const caixa = document.createElement('div');
  caixa.className = 'bs-caixa';
  caixa.innerHTML = `<div class="bs-topo"><input type="search" class="bs-campo" placeholder="Digite para procurar" autocomplete="off" aria-label="Procurar na lista"></div>
    <div class="bs-lista" role="listbox" tabindex="-1"></div><p class="bs-nada" hidden>Nada encontrado com esse nome.</p>`;
  document.body.appendChild(caixa);
  const campo = caixa.querySelector('.bs-campo'), lista = caixa.querySelector('.bs-lista'), nada = caixa.querySelector('.bs-nada');
  let itens = [], foco = -1;

  function desenhar() {
    const palavras = semAcento(campo.value).split(/\s+/).filter(Boolean);
    const html = []; itens = []; let grupo = null;
    for (const o of sel.options) {
      if (o.disabled && o.value === '') continue;
      const txt = o.text.trim();
      const g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : '';
      const alvo = semAcento(`${txt} ${g}`);
      if (!palavras.every((p) => alvo.includes(p))) continue;
      if (g !== grupo) { grupo = g; if (g) html.push(`<div class="bs-grupo">${esc(g)}</div>`); }
      const marcado = o.index === sel.selectedIndex;
      html.push(`<div class="bs-item${marcado ? ' bs-marcado' : ''}${o.disabled ? ' bs-off' : ''}" role="option" aria-selected="${marcado}" data-i="${o.index}">
        <span class="bs-check" aria-hidden="true">${marcado ? '✓' : ''}</span><span class="bs-nome">${esc(txt || '—')}</span></div>`);
      itens.push(o.index);
    }
    lista.innerHTML = html.join('');
    nada.hidden = itens.length > 0;
    foco = itens.indexOf(sel.selectedIndex); if (palavras.length) foco = itens.length ? 0 : -1;
    pintarFoco(true);
  }
  function pintarFoco(rolar) {
    lista.querySelectorAll('.bs-item').forEach((el, i) => { el.classList.toggle('bs-foco', i === foco); if (i === foco && rolar) el.scrollIntoView({ block: 'nearest' }); });
  }
  function escolher(i) {
    const o = sel.options[i]; if (!o || o.disabled) return;
    const mudou = sel.selectedIndex !== i;
    sel.selectedIndex = i;
    fechar(true);
    if (mudou) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function colocar() {
    const r = botao.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    const larg = Math.min(Math.max(r.width, 300), vw - 16);
    const embaixo = vh - r.bottom - 12, emcima = r.top - 12;
    const paraCima = embaixo < 260 && emcima > embaixo;
    caixa.style.width = `${larg}px`;
    caixa.style.left = `${Math.max(8, Math.min(r.left, vw - larg - 8))}px`;
    caixa.style.maxHeight = `${Math.max(180, Math.min(420, paraCima ? emcima : embaixo))}px`;
    if (paraCima) { caixa.style.top = ''; caixa.style.bottom = `${vh - r.top + 4}px`; } else { caixa.style.bottom = ''; caixa.style.top = `${r.bottom + 4}px`; }
  }
  function fechar(devolverFoco) {
    if (!aberto || aberto.caixa !== caixa) return;
    aberto = null; caixa.remove(); botao.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', fora, true); window.removeEventListener('resize', colocar); window.removeEventListener('scroll', aoRolar, true);
    if (devolverFoco && botao.isConnected) botao.focus();
  }
  const fora = (e) => { if (!caixa.contains(e.target) && !botao.contains(e.target)) fechar(false); };
  const aoRolar = (e) => { if (caixa.contains(e.target)) return; if (!botao.isConnected) return fechar(false); colocar(); };

  campo.addEventListener('input', desenhar);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (itens.length) { foco = Math.min(itens.length - 1, foco + 1); pintarFoco(true); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (itens.length) { foco = Math.max(0, foco - 1); pintarFoco(true); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (foco >= 0) escolher(itens[foco]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(true); }
    else if (e.key === 'Tab') fechar(false);
  });
  lista.addEventListener('click', (e) => { const el = e.target.closest('.bs-item'); if (el) escolher(Number(el.dataset.i)); });
  lista.addEventListener('mousemove', (e) => { const el = e.target.closest('.bs-item'); if (!el) return; const i = itens.indexOf(Number(el.dataset.i)); if (i !== foco) { foco = i; pintarFoco(false); } });

  aberto = { sel, botao, caixa, fechar, redesenhar: desenhar };
  botao.setAttribute('aria-expanded', 'true');
  desenhar(); colocar();
  document.addEventListener('mousedown', fora, true); window.addEventListener('resize', colocar); window.addEventListener('scroll', aoRolar, true);
  campo.focus({ preventScroll: true });
  const m = lista.querySelector('.bs-marcado'); if (m) m.scrollIntoView({ block: 'center' });
}

function varrer(raiz) {
  if (raiz.nodeType !== 1) return;
  if (raiz.tagName === 'SELECT') vestir(raiz);
  else if (raiz.tagName === 'OPTION' || raiz.tagName === 'OPTGROUP') { const s = raiz.closest('select'); if (s) vestir(s); }
  else raiz.querySelectorAll('select').forEach(vestir);
}

export function ligarBuscaNosSelects() {
  if (document.documentElement.dataset.buscaSelect) return;
  document.documentElement.dataset.buscaSelect = '1';
  varrer(document.body);
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      // lista que cresceu depois de desenhada (as telas costumam preencher as opções em seguida)
      if (m.target.nodeType === 1 && (m.target.tagName === 'SELECT' || m.target.tagName === 'OPTGROUP')) varrer(m.target.closest('select'));
      m.addedNodes.forEach(varrer);
      m.removedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        // a tela tirou só o <select>: o botão dele vai junto
        if (n.tagName === 'SELECT' && n._busca && !n.isConnected) { n._busca.remove(); }
      });
    }
    if (aberto && !aberto.botao.isConnected) aberto.fechar(false);
  }).observe(document.body, { childList: true, subtree: true });
}
