// Agenda da equipe em PLANILHA, com a cara do Excel online (pedido da Juliana para a Viviane, 2026-10-10):
// uma linha por compromisso de cada pessoa, letras das colunas e números das linhas, e em cada coluna a setinha do
// filtro do Excel: classificar de A a Z / Z a A, pesquisar e marcar quantos valores quiser ("(Selecionar tudo)",
// "(Vazias)"). A lista de cada coluna mostra só o que sobra depois dos outros filtros, como no Excel.
// No alto: pesquisa em tudo, período, "Limpar filtros" e "Baixar em Excel" (o que está filtrado, já com filtro no arquivo).
// Filtros, ordem e período ficam lembrados neste navegador.
import { sb, esc, avisar, explicarErro } from '../base.js';
import { PERIODOS, NOME_PERIODO, TIPOS, hoje, somarDias, diaDaSemana, segundaDaSemana, nomeSemana, nomeMes } from '../agenda-regras.js';
import { amostra } from './agenda-dados.js';
import { abrirReuniao } from './agenda-semana.js';
import { abrirPessoal } from './agenda-pessoal.js';

const CHAVE = 'mentorei.agendaPlanilha';
const VAZIAS = '(Vazias)';
const POR_VEZ = 500;   // linhas desenhadas de cada vez (o resto aparece em "Mostrar mais")

const COLUNAS = [
  { k: 'data', nome: 'Data', larg: 100 },
  { k: 'semana', nome: 'Dia', larg: 62 },
  { k: 'horario', nome: 'Horário', larg: 116 },
  { k: 'periodo', nome: 'Período', larg: 118 },
  { k: 'pessoa', nome: 'Pessoa', larg: 140 },
  { k: 'empresa', nome: 'Empresa', larg: 180 },
  { k: 'turma', nome: 'Turma ou programa', larg: 180 },
  { k: 'compromisso', nome: 'Compromisso', larg: 250 },
  { k: 'tipo', nome: 'Tipo', larg: 170 },
  { k: 'formato', nome: 'Formato', larg: 96 },
  { k: 'local', nome: 'Local', larg: 150 },
  { k: 'detalhes', nome: 'Detalhes', larg: 240 },
];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PERIODOS_VER = [['futuro', 'De hoje em diante'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['proximo', 'Próximo mês'], ['passado', 'Só o que já passou'], ['tudo', 'Tudo']];
const ORDEM_PERIODO = ['Manhã', 'Manhã e tarde', 'Manhã, tarde e noite', 'Tarde', 'Tarde e noite', 'Noite', 'Manhã e noite', 'Dia inteiro'];
const ORDEM_DIA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const hora = (ms) => fmtHora.format(new Date(ms));
const dataTexto = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cmpTexto = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
const numBR = (n) => n.toLocaleString('pt-BR');
const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] || '');

// estado lembrado: período, filtros por coluna (lista de valores marcados; sem a coluna = tudo) e ordem
const est = (() => {
  const base = { periodo: 'futuro', filtros: {}, ordem: { col: 'data', dir: 1 } };
  try { const x = JSON.parse(localStorage.getItem(CHAVE) || '{}'); return { ...base, ...x, filtros: x.filtros || {}, ordem: x.ordem || base.ordem }; } catch (_) { return base; }
})();
const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(est)); } catch (_) { /* sem armazenamento */ } };

// ---------- as linhas: uma por compromisso de cada pessoa ----------
function montarLinhas(d, nomes) {
  const linhas = [];
  for (const e of d.eventos) {
    const o = e.origem || {};
    const turma = e.tipo === 'individual' ? ((o.mentorado && o.mentorado.programa && o.mentorado.programa.nome) || '')
      : o.turma ? (o.turma.nome || '') : (e.tipo === 'pre' || e.tipo === 'reservado') ? (o.titulo || '') : '';
    const ps = e.periodos || [];
    const inteiro = e.diaInteiro || ps.length === 3;
    const base = {
      e, data: e.dia, semana: nomeSemana(e.dia),
      horario: e.ini ? `${hora(e.ini)}${e.fim && e.tipo !== 'individual' ? ` às ${hora(e.fim)}` : ''}` : inteiro ? 'Dia inteiro' : '',
      periodo: inteiro ? 'Dia inteiro' : juntar(PERIODOS.filter((p) => ps.includes(p)).map((p, i) => (i ? NOME_PERIODO[p].toLowerCase() : NOME_PERIODO[p]))),
      empresa: e.empresa || '', turma, compromisso: e.titulo || '', tipo: (TIPOS[e.tipo] || {}).nome || e.tipo,
      formato: e.formato === 'online' ? 'Online' : e.formato === 'presencial' ? 'Presencial' : '', local: e.local || '', detalhes: e.sub || '',
    };
    const quem = e.todos ? [null] : (e.mentores && e.mentores.length ? e.mentores : [undefined]);
    for (const p of quem) {
      linhas.push({ ...base, id: `${e.id}|${p || '-'}`, pessoaId: p || null,
        pessoa: p === null ? 'Toda a equipe' : p ? (nomes.get(p) || '') : '' });
    }
  }
  return linhas;
}

// período escolhido no alto (antes dos filtros das colunas)
function dentroDoPeriodo(r, periodo) {
  const h = hoje();
  if (periodo === 'tudo') return true;
  if (periodo === 'futuro') return r.data >= h;
  if (periodo === 'passado') return r.data < h;
  if (periodo === 'semana') { const s = segundaDaSemana(h); return r.data >= s && r.data <= somarDias(s, 6); }
  const mes = periodo === 'mes' ? h.slice(0, 7) : (() => { const [a, m] = h.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; })();
  return r.data.slice(0, 7) === mes;
}

const valorDe = (r, col) => r[col] || VAZIAS;
// ordem "natural" dos valores de cada coluna (lista do filtro e classificação)
function comparar(col) {
  if (col === 'data') return (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  if (col === 'semana') return (a, b) => ORDEM_DIA.indexOf(a.semana) - ORDEM_DIA.indexOf(b.semana);
  if (col === 'horario') return (a, b) => (a.e.ini ?? -1) - (b.e.ini ?? -1);
  if (col === 'periodo') return (a, b) => ORDEM_PERIODO.indexOf(a.periodo || 'x') - ORDEM_PERIODO.indexOf(b.periodo || 'x');
  return (a, b) => {
    const x = a[col] || '', y = b[col] || '';
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);   // vazias por último
    return cmpTexto(x, y);
  };
}

const ICONE = {
  seta: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  funil: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2 3h12l-4.6 5.4V13l-2.8 1.2V8.4z" fill="currentColor"/></svg>',
  sobe: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  desce: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lupa: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  limpar: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3h12l-4.6 5.4V13l-2.8 1.2V8.4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5l4 4m0-4l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  excel: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 5.5l3 5m0-5l-3 5M10 5.5h2.5M10 8h2.5M10 10.5h2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};

// ---------- a vista ----------
// aoClicarDia(evento, pessoaId): abre o dia da pessoa (compromissos sem tela própria, como bloqueio e deslocamento)
export async function vistaPlanilha(ctx, alvo, d, { aoClicarDia, recarregar }) {
  const nomes = new Map(d.mentores.map((m) => [m.id, m.nome]));
  const faltam = [...new Set(d.eventos.flatMap((e) => e.mentores || []))].filter((id) => !nomes.has(id));
  if (faltam.length) {   // gente da equipe que não é mentor (ex.: a coordenação) também aparece com o nome
    const { data } = await sb.from('perfis').select('id, nome').in('id', faltam);
    (data || []).forEach((p) => nomes.set(p.id, p.nome));
  }
  const todas = montarLinhas(d, nomes);
  for (const k of Object.keys(est.filtros)) if (!COLUNAS.some((c) => c.k === k)) delete est.filtros[k];
  let busca = '';
  let mostrar = POR_VEZ;
  let selecionada = null;

  alvo.innerHTML = `
    <div class="xl">
      <div class="xl-faixa">
        <label class="xl-busca">${ICONE.lupa}<input type="search" id="xl-busca" placeholder="Pesquisar em tudo" aria-label="Pesquisar em todas as colunas"></label>
        <label class="xl-periodo"><span>Período</span><select id="xl-periodo">${PERIODOS_VER.map(([k, t]) => `<option value="${k}"${k === est.periodo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <button type="button" class="xl-botao" id="xl-limpar">${ICONE.limpar}<span>Limpar filtros</span></button>
        <button type="button" class="xl-botao" id="xl-baixar">${ICONE.excel}<span>Baixar em Excel</span></button>
      </div>
      <p class="peq apagado xl-dica">Clique na setinha <span class="xl-dica-seta">${ICONE.seta}</span> no alto de cada coluna para filtrar: marque quantas pessoas, empresas ou tipos quiser. Clique no compromisso para abrir.</p>
      <div class="xl-grade" id="xl-grade"></div>
      <div class="xl-status" id="xl-status" role="status"></div>
    </div>`;
  const grade = alvo.querySelector('#xl-grade');
  const status = alvo.querySelector('#xl-status');

  const passaBusca = (r) => !busca || semAcento(COLUNAS.map((c) => (c.k === 'data' ? dataTexto(r.data) : r[c.k])).join(' ')).includes(busca);
  const passaFiltros = (r, exceto = null) => COLUNAS.every((c) => c.k === exceto || !est.filtros[c.k] || est.filtros[c.k].includes(valorDe(r, c.k)));
  const base = () => todas.filter((r) => dentroDoPeriodo(r, est.periodo) && passaBusca(r));
  const ordenar = (lista) => {
    const f = comparar(est.ordem.col), dir = est.ordem.dir;
    const desempate = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) || (a.e.ini ?? -1) - (b.e.ini ?? -1) || cmpTexto(a.pessoa || '~', b.pessoa || '~');
    return lista.sort((a, b) => f(a, b) * dir || desempate(a, b));
  };

  let visiveis = [];
  const desenhar = () => {
    const noPeriodo = base();
    visiveis = ordenar(noPeriodo.filter((r) => passaFiltros(r)));
    const ativos = COLUNAS.filter((c) => est.filtros[c.k]);
    const h = hoje();
    const linhas = visiveis.slice(0, mostrar);
    grade.innerHTML = `<table class="xl-tabela">
      <colgroup><col style="width:46px">${COLUNAS.map((c) => `<col style="width:${c.larg}px">`).join('')}</colgroup>
      <thead>
        <tr class="xl-letras"><th class="xl-canto" aria-hidden="true"></th>${COLUNAS.map((c, i) => `<th aria-hidden="true">${LETRAS[i]}</th>`).join('')}</tr>
        <tr class="xl-cab"><th class="xl-num" aria-hidden="true">1</th>${COLUNAS.map((c) => {
          const filtrado = !!est.filtros[c.k], ordem = est.ordem.col === c.k ? est.ordem.dir : 0;
          const icone = filtrado ? ICONE.funil : ordem === 1 && c.k !== 'data' ? ICONE.sobe : ordem === -1 ? ICONE.desce : ICONE.seta;
          return `<th scope="col"${ordem ? ` aria-sort="${ordem === 1 ? 'ascending' : 'descending'}"` : ''}><div class="xl-th"><span>${esc(c.nome)}</span>
            <button type="button" class="xl-filtro${filtrado ? ' ativo' : ''}" data-col="${c.k}" aria-haspopup="dialog" aria-label="Filtrar ou classificar a coluna ${esc(c.nome)}${filtrado ? ' (com filtro)' : ''}">${icone}</button></div></th>`;
        }).join('')}</tr>
      </thead>
      <tbody>${linhas.map((r, i) => `<tr data-linha="${esc(r.id)}"${r.id === selecionada ? ' class="sel"' : ''}>
        <td class="xl-num">${i + 2}</td>
        <td class="${r.data === h ? 'xl-hoje' : ''}">${dataTexto(r.data)}</td>
        <td>${esc(r.semana)}</td><td>${esc(r.horario)}</td><td>${esc(r.periodo)}</td>
        <td>${esc(r.pessoa)}</td><td>${esc(r.empresa)}</td><td>${esc(r.turma)}</td>
        <td><button type="button" class="xl-abrir" data-abrir="${esc(r.id)}" title="Abrir">${esc(r.compromisso)}</button></td>
        <td>${amostra(r.e.tipo)}${esc(r.tipo)}</td><td>${esc(r.formato)}</td><td>${esc(r.local)}</td><td>${esc(r.detalhes)}</td></tr>`).join('')}
      ${!linhas.length ? `<tr><td class="xl-num">2</td><td colspan="${COLUNAS.length}" class="xl-nada">Nada encontrado com esses filtros.${ativos.length || busca ? ' Use "Limpar filtros" no alto.' : ''}</td></tr>` : ''}
      </tbody></table>`;
    const horas = visiveis.reduce((s, r) => s + (Number(r.e.horas) || 0), 0);
    status.innerHTML = `<span><b>${numBR(visiveis.length)}</b> ${visiveis.length === noPeriodo.length ? (visiveis.length === 1 ? 'registro' : 'registros') : `de ${numBR(noPeriodo.length)} registros encontrados`}</span>
      ${horas ? `<span>Horas de mentoria e aula: <b>${numBR(Math.round(horas * 10) / 10)} h</b></span>` : ''}
      ${ativos.length ? `<span>Filtrando: ${ativos.map((c) => esc(c.nome)).join(', ')}</span>` : ''}
      ${visiveis.length > mostrar ? `<button type="button" class="xl-botao" id="xl-mais">Mostrar mais ${numBR(Math.min(POR_VEZ, visiveis.length - mostrar))}</button>` : ''}`;
    alvo.querySelector('#xl-limpar').disabled = !ativos.length && !busca;
  };

  // ---------- caixa do filtro de uma coluna (como a do Excel) ----------
  let caixa = null;
  const fecharCaixa = () => { if (caixa) { caixa.remove(); caixa = null; document.removeEventListener('pointerdown', foraDaCaixa, true); } };
  const foraDaCaixa = (ev) => { if (caixa && !caixa.contains(ev.target) && !ev.target.closest('.xl-filtro')) fecharCaixa(); };
  const abrirCaixa = (botao) => {
    const col = botao.dataset.col;
    const coluna = COLUNAS.find((c) => c.k === col);
    if (caixa && caixa.dataset.col === col) { fecharCaixa(); return; }
    fecharCaixa();
    // valores possíveis = o que sobra com os OUTROS filtros (e o período e a pesquisa)
    const resto = base().filter((r) => passaFiltros(r, col));
    const contagem = new Map();
    for (const r of resto) { const v = valorDe(r, col); contagem.set(v, (contagem.get(v) || 0) + 1); }
    const exemplo = new Map(resto.map((r) => [valorDe(r, col), r]));
    const valores = [...contagem.keys()].sort((a, b) => {
      if (a === VAZIAS || b === VAZIAS) return (a === VAZIAS) - (b === VAZIAS);
      return comparar(col)(exemplo.get(a), exemplo.get(b));
    });
    const filtro = est.filtros[col];
    const marcados = new Set(valores.filter((v) => !filtro || filtro.includes(v)));
    const ehData = col === 'data';
    const rotulo = (v) => (v === VAZIAS ? v : ehData ? dataTexto(v) : v);
    const meses = ehData ? [...new Set(valores.map((v) => v.slice(0, 7)))] : [];
    const abertos = new Set(meses.length === 1 ? meses : []);

    caixa = document.createElement('div');
    caixa.className = 'xl-caixa';
    caixa.dataset.col = col;
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-label', `Filtro da coluna ${coluna.nome}`);
    caixa.innerHTML = `
      <button type="button" class="xl-acao" data-ordem="1">${ICONE.sobe}<span>${ehData ? 'Classificar do mais antigo para o mais novo' : 'Classificar de A a Z'}</span></button>
      <button type="button" class="xl-acao" data-ordem="-1">${ICONE.desce}<span>${ehData ? 'Classificar do mais novo para o mais antigo' : 'Classificar de Z a A'}</span></button>
      <hr>
      <button type="button" class="xl-acao" data-limpar${filtro ? '' : ' disabled'}>${ICONE.limpar}<span>Limpar filtro de "${esc(coluna.nome)}"</span></button>
      <label class="xl-caixa-busca">${ICONE.lupa}<input type="search" placeholder="Pesquisar" aria-label="Pesquisar na lista de ${esc(coluna.nome)}"></label>
      <div class="xl-lista" role="group" aria-label="Valores de ${esc(coluna.nome)}"></div>
      <div class="xl-caixa-rodape"><button type="button" class="btn peq pri" data-ok>OK</button><button type="button" class="btn peq" data-cancelar>Cancelar</button></div>`;
    document.body.appendChild(caixa);
    const lista = caixa.querySelector('.xl-lista');
    const campo = caixa.querySelector('input[type=search]');
    let termo = '';
    const listados = () => valores.filter((v) => !termo || semAcento(rotulo(v)).includes(termo) || (ehData && semAcento(`${nomeMes(Number(v.slice(5, 7)))} ${v.slice(0, 4)}`).includes(termo)));
    const caixinha = (attrs, marcado, texto, n = null, parcial = false) => `<label class="xl-item"><input type="checkbox" ${attrs}${marcado ? ' checked' : ''}${parcial ? ' data-parcial="1"' : ''}><span>${texto}</span>${n != null ? `<i>${numBR(n)}</i>` : ''}</label>`;
    const desenharLista = () => {
      const vs = listados();
      const todosMarc = vs.length && vs.every((v) => marcados.has(v)), algum = vs.some((v) => marcados.has(v));
      let html = caixinha('data-tudo', todosMarc, termo ? '(Selecionar todos os resultados)' : '(Selecionar tudo)', null, !todosMarc && algum);
      if (ehData && !termo) {
        for (const mes of meses) {
          const dias = vs.filter((v) => v.slice(0, 7) === mes);
          const tm = dias.every((v) => marcados.has(v)), am = dias.some((v) => marcados.has(v));
          html += `<div class="xl-mes"><button type="button" class="xl-expandir" data-expandir="${mes}" aria-expanded="${abertos.has(mes)}" aria-label="${abertos.has(mes) ? 'Recolher' : 'Mostrar os dias de'} ${nomeMes(Number(mes.slice(5)))}">${abertos.has(mes) ? '▾' : '▸'}</button>
            ${caixinha(`data-mes="${mes}"`, tm, `${nomeMes(Number(mes.slice(5)))} de ${mes.slice(0, 4)}`, dias.reduce((s, v) => s + contagem.get(v), 0), !tm && am)}</div>
            ${abertos.has(mes) ? `<div class="xl-dias">${dias.map((v) => caixinha(`data-valor="${esc(v)}"`, marcados.has(v), `${v.slice(8)} · ${nomeSemana(v)}`, contagem.get(v))).join('')}</div>` : ''}`;
        }
      } else {
        html += vs.map((v) => caixinha(`data-valor="${esc(v)}"`, marcados.has(v), esc(rotulo(v)), contagem.get(v))).join('');
      }
      if (!vs.length) html += '<p class="peq apagado" style="padding:6px 8px">Nada com esse nome.</p>';
      lista.innerHTML = html;
      lista.querySelectorAll('[data-parcial]').forEach((c) => { c.indeterminate = true; });
      caixa.querySelector('[data-ok]').disabled = !vs.some((v) => marcados.has(v));
    };
    desenharLista();
    // posição: logo abaixo da setinha, sem sair da tela, presa à página (rola junto); no celular vira uma gaveta embaixo (CSS)
    const r = botao.getBoundingClientRect(), th = (botao.closest('th') || botao).getBoundingClientRect();
    const larg = caixa.offsetWidth, alt = caixa.offsetHeight;
    caixa.style.left = `${window.scrollX + Math.max(8, Math.min(th.left, document.documentElement.clientWidth - larg - 8))}px`;   // como no Excel: alinhada à coluna
    caixa.style.top = `${window.scrollY + (r.bottom + 4 + alt > window.innerHeight - 8 && r.top - alt - 4 > 8 ? r.top - alt - 4 : r.bottom + 4)}px`;
    campo.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', foraDaCaixa, true), 0);

    const aplicar = () => {
      const vs = listados();
      const escolhidos = vs.filter((v) => marcados.has(v));
      if (!escolhidos.length) return;
      // tudo marcado e sem pesquisa = sem filtro nesta coluna (como no Excel)
      if (!termo && escolhidos.length === valores.length) delete est.filtros[col]; else est.filtros[col] = escolhidos;
      mostrar = POR_VEZ; guardar(); fecharCaixa(); desenhar();
    };
    campo.addEventListener('input', () => {
      termo = semAcento(campo.value.trim());
      if (termo) { marcados.clear(); listados().forEach((v) => marcados.add(v)); }   // como no Excel: o que aparece na pesquisa vem marcado
      else { marcados.clear(); valores.filter((v) => !filtro || filtro.includes(v)).forEach((v) => marcados.add(v)); }
      desenharLista();
    });
    campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); aplicar(); } });
    caixa.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { fecharCaixa(); botao.focus(); } });
    caixa.addEventListener('change', (ev) => {
      const c = ev.target;
      const vs = listados();
      if (c.matches('[data-tudo]')) vs.forEach((v) => (c.checked ? marcados.add(v) : marcados.delete(v)));
      else if (c.dataset.mes) vs.filter((v) => v.slice(0, 7) === c.dataset.mes).forEach((v) => (c.checked ? marcados.add(v) : marcados.delete(v)));
      else if (c.dataset.valor != null) { if (c.checked) marcados.add(c.dataset.valor); else marcados.delete(c.dataset.valor); }
      desenharLista();
    });
    caixa.addEventListener('click', (ev) => {
      const ex = ev.target.closest('[data-expandir]');
      if (ex) { const m = ex.dataset.expandir; if (abertos.has(m)) abertos.delete(m); else abertos.add(m); desenharLista(); return; }
      const o = ev.target.closest('[data-ordem]');
      if (o) { est.ordem = { col, dir: Number(o.dataset.ordem) }; guardar(); fecharCaixa(); desenhar(); return; }
      if (ev.target.closest('[data-limpar]')) { delete est.filtros[col]; mostrar = POR_VEZ; guardar(); fecharCaixa(); desenhar(); return; }
      if (ev.target.closest('[data-ok]')) { aplicar(); return; }
      if (ev.target.closest('[data-cancelar]')) fecharCaixa();
    });
  };

  // ---------- abrir o compromisso (mesmo comportamento da vista da semana) ----------
  const abrir = (linhaId) => {
    const r = visiveis.find((x) => x.id === linhaId); if (!r) return;
    const e = r.e;
    if (e.tipo === 'reuniao') { abrirReuniao(ctx, d, e.origem, recarregar); return; }
    if (e.tipo === 'pessoal') { abrirPessoal(e, nomes.get(e.mentores[0]) || ''); return; }
    if (e.link && e.link !== '#/agenda/pre') { location.hash = e.link; return; }
    if (aoClicarDia) aoClicarDia(e, r.pessoaId);
  };

  alvo.onclick = (ev) => {
    const f = ev.target.closest('.xl-filtro'); if (f) { abrirCaixa(f); return; }
    const a = ev.target.closest('[data-abrir]'); if (a) { abrir(a.dataset.abrir); return; }
    if (ev.target.id === 'xl-mais') { mostrar += POR_VEZ; desenhar(); return; }
    const tr = ev.target.closest('tr[data-linha]');
    if (tr) { selecionada = tr.dataset.linha; grade.querySelectorAll('tr.sel').forEach((x) => x.classList.remove('sel')); tr.classList.add('sel'); }
  };
  alvo.ondblclick = (ev) => { const tr = ev.target.closest('tr[data-linha]'); if (tr && !ev.target.closest('.xl-filtro')) abrir(tr.dataset.linha); };
  let espera = null;
  alvo.querySelector('#xl-busca').addEventListener('input', (ev) => {
    clearTimeout(espera);
    espera = setTimeout(() => { busca = semAcento(ev.target.value.trim()); mostrar = POR_VEZ; desenhar(); }, 200);
  });
  alvo.querySelector('#xl-periodo').addEventListener('change', (ev) => { est.periodo = ev.target.value; mostrar = POR_VEZ; guardar(); desenhar(); });
  alvo.querySelector('#xl-limpar').addEventListener('click', () => {
    est.filtros = {}; busca = ''; alvo.querySelector('#xl-busca').value = ''; mostrar = POR_VEZ; guardar(); desenhar();
  });
  alvo.querySelector('#xl-baixar').addEventListener('click', () => baixarExcel(visiveis, est.periodo));
  // a caixa do filtro não fica solta quando a planilha rola por dentro, nem depois de sair da agenda
  grade.addEventListener('scroll', fecharCaixa, { passive: true });
  window.addEventListener('hashchange', fecharCaixa, { once: true });
  desenhar();
}

// O que está na tela (filtrado e na ordem) vira um arquivo Excel, com o filtro do Excel já ligado no cabeçalho.
async function baixarExcel(linhas, periodo) {
  if (!linhas.length) { avisar('Não há nada para baixar com esses filtros.', true); return; }
  let XLSX;
  try { XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'); } catch (e) { avisar(explicarErro(e), true); return; }
  const dados = [COLUNAS.map((c) => c.nome), ...linhas.map((r) => COLUNAS.map((c) => (c.k === 'data' ? dataTexto(r.data) : r[c.k] || '')))];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!cols'] = COLUNAS.map((c) => ({ wch: Math.round(c.larg / 7) }));
  ws['!autofilter'] = { ref: `A1:${LETRAS[COLUNAS.length - 1]}${dados.length}` };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Agenda');
  const nomePeriodo = (PERIODOS_VER.find(([k]) => k === periodo) || [, ''])[1];
  XLSX.writeFile(wb, `Mentorei - Agenda (${nomePeriodo}) - ${hoje()}.xlsx`);
  avisar('Planilha baixada.');
}

