// Arsenal de ferramentas: busca por tema e linguagem do dia a dia, ficha da mentora, PDF e envio ao mentorado.
import { sb, esc, avisar, explicarErro } from '../base.js';
import { ONLINE, linkOnline } from '../ferramentas-online.js';

// ---------- busca ----------
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();
// as tags vêm sem acento no pacote; aqui elas ganham acento para aparecer certas na tela
const ACENTOS = { analise: 'análise', autogestao: 'autogestão', decisao: 'decisão', avaliacao: 'avaliação', cenario: 'cenário',
  competencias: 'competências', comunicacao: 'comunicação', lideranca: 'liderança', confianca: 'confiança',
  dificeis: 'difíceis', crencas: 'crenças', delegacao: 'delegação', diagnostico: 'diagnóstico', execucao: 'execução',
  controlavel: 'controlável', gestao: 'gestão', influencia: 'influência', inteligencia: 'inteligência', papeis: 'papéis',
  lider: 'líder', priorizacao: 'priorização', presenca: 'presença', areas: 'áreas', seguranca: 'segurança', sucessao: 'sucessão',
  transicao: 'transição', visao: 'visão', negocio: 'negócio', sistemica: 'sistêmica', microgestao: 'microgestão' };
export const tagRotulo = (t) => { const s = t.split('-').map((w) => ACENTOS[w] || w).join(' '); return s.charAt(0).toUpperCase() + s.slice(1); };
// "Transversal (abertura da mentoria)" vira "Abertura da mentoria"
export const nivelRotulo = (n) => n.replace(/^Transversal \((.+)\)$/, (_, x) => x.charAt(0).toUpperCase() + x.slice(1));
const CAMPOS = [['nome', 'no nome', 6], ['tambem_conhecida_como', 'em outro nome da ferramenta', 6], ['tags', 'na tag', 5],
  ['palavras_chave', 'nas palavras-chave', 4], ['linguagem_dia_a_dia', 'na linguagem do dia a dia', 4], ['sinais', 'nos sinais do mentorado', 3],
  ['tagdesc', 'no uso indicado da tag', 3], ['resumo', 'no resumo', 1], ['momento_trilha', 'no momento da trilha', 1]];

function destacar(texto, palavras) {
  const bruto = String(texto); const n = norm(bruto);
  if (n.length !== bruto.length) return esc(bruto);
  for (const w of [palavras.join(' '), ...palavras.slice().sort((a, b) => b.length - a.length)]) {
    if (w.length < 2) continue; const i = n.indexOf(w);
    if (i >= 0) return `${esc(bruto.slice(0, i))}<mark>${esc(bruto.slice(i, i + w.length))}</mark>${esc(bruto.slice(i + w.length))}`;
  }
  return esc(bruto);
}

export async function render(ctx, el) {
  const [{ data: lista, error }, { data: tags }] = await Promise.all([
    sb.from('ferramentas').select('id, nome, lote, arquivo, dados').order('id'),
    sb.from('arsenal_tags').select('*').order('tag'),
  ]);
  if (error) throw error;
  const F = (lista || []).map((r) => ({ ...r.dados, id: r.id, arquivo_storage: r.arquivo }));
  const descTag = Object.fromEntries((tags || []).map((t) => [t.tag, t.quando_aplicar]));
  if (!F.length) {
    el.innerHTML = `<div class="cab"><div><h1>Arsenal</h1></div>${ctx.ehAdmin ? '<div class="acoes"><a class="btn escuro" href="#/carregar-arsenal">Carregar arsenal</a></div>' : ''}</div>
      <div class="vazio">O arsenal ainda não foi carregado.${ctx.ehAdmin ? ' Clique em "Carregar arsenal" e escolha a pasta do pacote.' : ''}</div>`;
    return;
  }
  const valores = (f, campo) => {
    if (campo === 'tags') return (f.tags || []).map(tagRotulo);
    if (campo === 'tagdesc') return (f.tags || []).map((t) => descTag[t]).filter(Boolean);
    const v = f[campo]; return Array.isArray(v) ? v : [v || ''];
  };
  function pontuar(f, palavras, frase) {
    if (!frase) return { s: 1 };
    let s = 0, porFrase = null, porPalavra = null, tudo = '';
    const maior = palavras.slice().sort((a, b) => b.length - a.length)[0] || frase;
    for (const [campo, onde, peso] of CAMPOS) for (const v of valores(f, campo)) {
      const n = norm(v); tudo += ` ${n}`;
      if (n.includes(frase)) { s += peso * 3; if (!porFrase) porFrase = [onde, v]; }
      for (const w of palavras) if (n.includes(w)) s += peso;
      if (!porPalavra && n.includes(maior)) porPalavra = [onde, v];
    }
    if (!palavras.every((w) => tudo.includes(w))) return { s: 0 };
    return { s, motivo: porFrase || porPalavra };
  }

  const niveis = ['Todos', ...new Set(F.map((f) => f.nivel).filter(Boolean))];
  let nivel = 'Todos', tag = '';

  el.innerHTML = `
    <div class="cab"><div><h1>Arsenal</h1><p class="sub">${F.length} ferramentas. Busque pelo tema ou pelo jeito que a pessoa descreve o problema, como "pavio curto" ou "vive apagando incêndio".</p></div>
      ${ctx.ehAdmin ? '<div class="acoes"><a class="btn" href="#/carregar-arsenal">Carregar arsenal</a></div>' : ''}</div>
    <div class="ars-filtros">
      <input type="search" id="busca" placeholder="Busque um tema ou como a pessoa descreve o problema…" autocomplete="off">
      <select id="f-tag" aria-label="Tema"></select>
    </div>
    <div id="f-nivel" class="chips mt"></div>
    <div class="linha mt" style="gap:10px"><p class="peq apagado" id="contagem"></p><button type="button" class="btn peq" id="limpar" hidden>Limpar filtros</button></div>
    <div class="grade g3 mt" id="lista"></div>
    <div id="ficha" class="mt2" hidden></div>`;

  // o número ao lado de cada nível e tema diz quantas ferramentas existem combinando com o outro filtro já escolhido
  const temTag = (f, t) => !t || (f.tags || []).includes(t);
  const temNivel = (f, n) => n === 'Todos' || f.nivel === n;
  const desenharFiltros = () => {
    el.querySelector('#f-nivel').innerHTML = niveis.map((n) => {
      const q = F.filter((f) => temNivel(f, n) && temTag(f, tag)).length;
      return `<button type="button" class="btn peq${n === nivel ? ' escuro' : ''}" data-v="${esc(n)}"${q || n === nivel ? '' : ' disabled'}>${esc(n === 'Todos' ? 'Todos os níveis' : nivelRotulo(n))}<span class="n">${q}</span></button>`;
    }).join('');
    const temas = Object.keys(descTag).sort((a, b) => tagRotulo(a).localeCompare(tagRotulo(b), 'pt-BR'));
    el.querySelector('#f-tag').innerHTML = `<option value="">Todos os temas</option>${temas.map((t) => {
      const q = F.filter((f) => temNivel(f, nivel) && temTag(f, t)).length;
      return q || t === tag ? `<option value="${esc(t)}"${t === tag ? ' selected' : ''}>${esc(tagRotulo(t))} (${q})</option>` : '';
    }).join('')}`;
  };

  const desenhar = () => {
    const bruto = el.querySelector('#busca').value.trim();
    const frase = norm(bruto);
    const palavras = frase.split(' ').filter((w) => w.length > 1).map((w) => (w.length >= 7 ? w.slice(0, -2) : w));
    let r = F.map((f) => ({ f, ...pontuar(f, palavras, frase) }))
      .filter((x) => x.s > 0 && temNivel(x.f, nivel) && temTag(x.f, tag));
    if (frase) r.sort((a, b) => b.s - a.s);
    el.querySelector('#contagem').textContent = `${r.length} ${r.length === 1 ? 'ferramenta' : 'ferramentas'}${bruto ? ` para "${bruto}"` : ''}${tag && descTag[tag] ? ` · ${tagRotulo(tag)}: ${descTag[tag]}` : ''}`;
    el.querySelector('#limpar').hidden = nivel === 'Todos' && !tag && !bruto;
    el.querySelector('#lista').innerHTML = r.length ? r.map(({ f, motivo }, i) => `
      <div class="cartao" style="display:grid;gap:8px;${i === 0 && frase ? 'border-color:var(--verde);box-shadow:0 0 0 1px var(--verde)' : ''}">
        <span class="peq apagado" style="text-transform:uppercase;letter-spacing:.05em;font-weight:600">${esc(nivelRotulo(f.nivel || ''))}${f.tempo ? ` · ${esc(f.tempo)}` : ''}</span>
        <h3>${destacar(f.nome, palavras)}</h3>
        <p class="peq apagado">${esc(f.resumo || '')}</p>
        ${motivo ? `<p class="peq" style="background:var(--verde-claro);border-radius:8px;padding:6px 8px">Encontrada ${esc(motivo[0])}: “${destacar(motivo[1], palavras)}”</p>` : ''}
        <div class="linha" style="gap:6px;margin-top:auto">
          <button class="btn peq" data-ficha="${esc(f.id)}">Ver ficha</button>
          ${f.arquivo_storage ? `<button class="btn peq" data-pdf="${esc(f.id)}">PDF</button>` : ''}
          ${ONLINE[f.id] ? linkOnline(f.id, 'Online') : ''}
          ${f.arquivo_storage || (ONLINE[f.id] && ONLINE[f.id].interna) ? `<button class="btn peq pri" data-enviar="${esc(f.id)}">Enviar</button>`
            : ONLINE[f.id] ? '' : '<span class="selo neutro">Ferramenta online · em breve</span>'}
        </div></div>`).join('') : `<div class="vazio" style="grid-column:1/-1">Nenhuma ferramenta encontrada.${nivel !== 'Todos' || tag ? ' Clique em "Limpar filtros" para ver todas.' : ' Tente outra palavra, como "conflito" ou "prioridade".'}</div>`;
  };

  const porId = Object.fromEntries(F.map((f) => [f.id, f]));
  const linkNome = (n) => {
    const t = F.find((f) => [f.nome, ...(f.tambem_conhecida_como || [])].some((x) => norm(x) === norm(n)));
    return t ? `<button class="btn peq" data-ficha="${esc(t.id)}">${esc(t.nome)}</button>` : `<span class="apagado">${esc(n)}</span>`;
  };
  const li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join('');
  function abrirFicha(id) {
    const f = porId[id]; if (!f) return;
    const c = f.combina_com || {};
    const seq = (rot, arr) => (arr && arr.length ? `<div><b class="peq">${rot}</b><div class="linha mt" style="gap:6px">${arr.map(linkNome).join('')}</div></div>` : '');
    const box = el.querySelector('#ficha');
    box.hidden = false;
    box.innerHTML = `<div class="cartao" style="border:2px solid var(--petroleo)">
      <div class="linha"><div style="flex:1"><span class="peq apagado">${esc(nivelRotulo(f.nivel || ''))}${f.categoria ? ` · ${esc(f.categoria)}` : ''}</span><h2>${esc(f.nome)}</h2></div>
        <button class="btn peq" data-fechar>Fechar</button></div>
      <div class="grade g4 mt">${[['Nível', nivelRotulo(f.nivel || '')], ['Tempo', f.tempo], ['Momento da trilha', f.momento_trilha], ['Formato', f.formato]]
        .map(([k, v]) => `<div style="background:var(--bg);border-radius:10px;padding:8px 10px"><span class="peq apagado">${k}</span><p class="peq">${esc(v || '—')}</p></div>`).join('')}</div>
      ${(f.tags || []).length ? `<div class="chips mt">${f.tags.map((t) => `<button type="button" class="btn peq" data-tema="${esc(t)}">${esc(tagRotulo(t))}</button>`).join('')}</div>` : ''}
      ${(f.tambem_conhecida_como || []).length ? `<p class="peq mt"><b>Também conhecida como:</b> ${f.tambem_conhecida_como.map(esc).join(' · ')}</p>` : ''}
      <p class="mt">${esc(f.resumo || '')}</p>
      ${f.observacao ? `<p class="peq apagado mt">${esc(f.observacao)}</p>` : ''}
      <div class="grade g2 mt"><div><h4>Sinais no mentorado</h4><ul class="peq">${li(f.sinais)}</ul></div>
        <div><h4>Como gestor e RH falam</h4><div class="chips mt">${(f.linguagem_dia_a_dia || []).map((x) => `<span class="selo neutro">“${esc(x)}”</span>`).join('')}</div></div></div>
      <div class="aviso erro mt"><b>Não usar quando:</b> ${esc(f.nao_usar_quando || '')}</div>
      <h4 class="mt2">Como aplicar</h4><ol class="peq">${li(f.como_aplicar)}</ol>
      <div class="grade g2 mt"><div><h4>Perguntas poderosas</h4><ul class="peq">${li(f.perguntas_poderosas)}</ul></div>
        <div><h4>Entregável</h4><p class="peq">${esc(f.entregavel || '')}</p><h4 class="mt">Dica da mentora</h4><p class="peq">${esc(f.dica_mentora || '')}</p></div></div>
      <div class="mt"><h4>Combina com</h4>${seq('Antes', c.antes)}${seq('Na mesma sessão', c.mesma_sessao)}${seq('Depois', c.depois)}</div>
      ${f.arquivo_storage || ONLINE[f.id] ? `<div class="linha mt2">
        ${f.arquivo_storage || (ONLINE[f.id] && ONLINE[f.id].interna) ? `<button class="btn pri" data-enviar="${esc(f.id)}">Enviar a um mentorado</button>` : ''}
        ${f.arquivo_storage ? `<button class="btn" data-pdf="${esc(f.id)}">Baixar PDF</button>` : ''}
        ${ONLINE[f.id] ? linkOnline(f.id, 'Abrir a versão online', 'btn') : ''}</div>` : ''}
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function baixar(id) {
    const f = porId[id];
    const aba = window.open('', '_blank'); // abre já no clique, para o navegador não bloquear
    const { data, error: e } = await sb.storage.from('arsenal').createSignedUrl(f.arquivo_storage, 120, { download: f.arquivo_storage });
    if (e) { if (aba) aba.close(); avisar(explicarErro(e), true); return; }
    if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
  }

  async function enviar(id) {
    const f = porId[id];
    const { enviarFerramenta } = await import('./enviar-ferramenta.js');
    enviarFerramenta(ctx, f);
  }

  desenharFiltros(); desenhar();
  el.querySelector('#busca').addEventListener('input', desenhar);
  el.querySelector('#f-tag').addEventListener('change', (ev) => { tag = ev.target.value; desenharFiltros(); desenhar(); });
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.closest('#f-nivel')) { nivel = b.dataset.v; desenharFiltros(); desenhar(); return; }
    if (b.id === 'limpar') { nivel = 'Todos'; tag = ''; el.querySelector('#busca').value = ''; desenharFiltros(); desenhar(); return; }
    if (b.dataset.tema) { tag = b.dataset.tema; nivel = 'Todos'; el.querySelector('#ficha').hidden = true; desenharFiltros(); desenhar(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (b.dataset.ficha) abrirFicha(b.dataset.ficha);
    else if (b.dataset.pdf) baixar(b.dataset.pdf);
    else if (b.dataset.enviar) enviar(b.dataset.enviar);
    else if ('fechar' in b.dataset) el.querySelector('#ficha').hidden = true;
  });
}
