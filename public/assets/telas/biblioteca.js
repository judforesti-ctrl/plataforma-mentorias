// Ferramentas do mentorado: todos os PDFs do arsenal para buscar e baixar.
// As fichas técnicas (material do mentor) não chegam aqui: o banco só entrega nome, resumo, nível e temas.
import { sb, esc, avisar, explicarErro } from '../base.js';
import { norm, tagRotulo, nivelRotulo } from './arsenal.js';

export async function render(ctx, el) {
  const { data, error } = await sb.rpc('catalogo_ferramentas');
  if (error) {
    if (/catalogo_ferramentas/i.test(error.message || '')) { el.innerHTML = '<div class="vazio">A biblioteca de ferramentas ainda não foi ativada.</div>'; return; }
    throw error;
  }
  const lista = (data || []).filter((f) => f.arquivo).map((f) => ({ ...f, tags: Array.isArray(f.tags) ? f.tags : [] }));
  const temas = [...new Set(lista.flatMap((f) => f.tags))].sort((a, b) => tagRotulo(a).localeCompare(tagRotulo(b), 'pt-BR'));

  el.innerHTML = `
    <div class="cab"><div><h1>Ferramentas</h1><p class="sub">${lista.length} ferramentas da Mentorei para você baixar e usar no seu dia a dia. As que o seu mentor indicar aparecem também em "Minha mentoria".</p></div></div>
    <div class="ars-filtros">
      <input type="search" id="busca" placeholder="Busque um tema, como feedback, delegação ou prioridades…" autocomplete="off">
      <select id="tema" aria-label="Tema"><option value="">Todos os temas</option>${temas.map((t) => `<option value="${esc(t)}">${esc(tagRotulo(t))}</option>`).join('')}</select>
    </div>
    <p class="peq apagado mt" id="contagem"></p>
    <div class="grade g3 mt" id="lista"></div>`;

  const desenhar = () => {
    const q = norm(el.querySelector('#busca').value);
    const tema = el.querySelector('#tema').value;
    const r = lista.filter((f) => (!tema || f.tags.includes(tema))
      && (!q || q.split(' ').every((w) => norm(`${f.nome} ${f.resumo || ''} ${f.tags.map(tagRotulo).join(' ')}`).includes(w))));
    el.querySelector('#contagem').textContent = `${r.length} ${r.length === 1 ? 'ferramenta' : 'ferramentas'}`;
    el.querySelector('#lista').innerHTML = r.length ? r.map((f) => `<div class="cartao" style="display:grid;gap:8px">
        <span class="peq apagado" style="text-transform:uppercase;letter-spacing:.05em;font-weight:600">${esc(nivelRotulo(f.nivel || ''))}</span>
        <h3>${esc(f.nome)}</h3>
        <p class="peq apagado">${esc(f.resumo || '')}</p>
        <div class="linha" style="margin-top:auto"><button class="btn peq pri" data-baixar="${esc(f.arquivo)}">Baixar PDF</button></div>
      </div>`).join('') : '<div class="vazio" style="grid-column:1/-1">Nenhuma ferramenta para essa busca. Tente outra palavra.</div>';
  };
  desenhar();
  el.querySelector('#busca').addEventListener('input', desenhar);
  el.querySelector('#tema').addEventListener('change', desenhar);
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-baixar]'); if (!b) return;
    const aba = window.open('', '_blank'); // abre já no clique, para o navegador não bloquear
    const { data: d, error: e } = await sb.storage.from('arsenal').createSignedUrl(b.dataset.baixar, 120, { download: b.dataset.baixar });
    if (e) { if (aba) aba.close(); avisar(explicarErro(e), true); return; }
    if (aba) aba.location = d.signedUrl; else location.href = d.signedUrl;
  });
}
