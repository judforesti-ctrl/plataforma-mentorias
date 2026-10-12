// Gestão › Avaliações ("#/avaliacoes/<aba>", só administração): como as turmas avaliaram os encontros (script 31).
// Abas: visão geral, por módulo, por mentor, comentários e temas pedidos. Filtros por período, empresa, turma e mentor;
// baixar em Excel. Tudo anônimo: nenhuma resposta tem nome. As respostas antigas do Google Forms entram com origem
// "google_forms" (sem módulo; o nome da formação que o aluno escreveu fica em "formacao").
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';
import { resumir, nps, num1, APRENDEU, TEMPO, MELHORAR } from '../avaliacao-regras.js';

const ABAS = [['geral', 'Visão geral'], ['modulos', 'Por módulo'], ['mentores', 'Por mentor'], ['comentarios', 'Comentários'], ['temas', 'Temas pedidos']];
const PERIODOS = [['30', 'Últimos 30 dias'], ['90', 'Últimos 3 meses'], ['365', 'Últimos 12 meses'], ['tudo', 'Desde o começo']];
const CHAVE = 'mentorei.avaliacoesFiltros';
const est = (() => { try { return { periodo: '90', empresa: '', turma: '', mentor: '', notas: 'todas', ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch (_) { return { periodo: '90', empresa: '', turma: '', mentor: '', notas: 'todas' }; } })();
const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(est)); } catch (_) { /* sem armazenamento */ } };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ESTILO = `<style id="av-estilo">
  .av-filtros { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-bottom: 16px; }
  .av-filtros .campo { min-width: 160px; } .av-filtros select { width: auto; max-width: 100%; }
  .av-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 12px; }
  .av-kpi { background: var(--papel); border: 1px solid var(--linha); border-top: 4px solid var(--bege-escuro); border-radius: 14px; padding: 12px 14px; display: grid; gap: 2px; min-width: 0; }
  .av-kpi b { font-family: var(--f-titulo); font-size: 30px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .av-kpi b small { font-size: 14px; color: var(--apagado); }
  .av-kpi .l { font-size: 13px; font-weight: 600; } .av-kpi .s { font-size: 12px; color: var(--apagado); }
  .av-kpi.escuro { background: var(--petroleo); color: #fff; border-color: var(--petroleo); border-top-color: var(--bege); }
  .av-kpi.escuro b small, .av-kpi.escuro .s { color: #9FB0B6; }
  .av-nps { display: flex; height: 24px; border-radius: 8px; overflow: hidden; font-size: 12px; font-weight: 700; color: #fff; }
  .av-nps div { display: grid; place-items: center; min-width: 0; overflow: hidden; }
  .av-pro { background: #237A49; } .av-neu { background: #A9A08E; } .av-det { background: #B2322A; }
  .av-leg { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--apagado); }
  .av-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
  .av-barras { display: grid; gap: 8px; }
  .av-barra { display: grid; grid-template-columns: minmax(0, 170px) minmax(0, 1fr) 44px; gap: 10px; align-items: center; font-size: 13px; }
  .av-barra .t { height: 10px; background: var(--faixa); border: 1px solid var(--linha); border-radius: 99px; overflow: hidden; }
  .av-barra .t i { display: block; height: 100%; background: var(--bege-escuro); border-radius: 99px; }
  .av-barra .t i.melhorar { background: #A9791B; }
  .av-barra b { text-align: right; font-variant-numeric: tabular-nums; }
  .av-pill { display: inline-block; min-width: 40px; text-align: center; border-radius: 8px; padding: 2px 6px; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
  .av-bom { background: var(--ok-claro); color: var(--ok); } .av-meio { background: #F5E8C8; color: #7A5410; } .av-ruim { background: var(--erro-claro); color: var(--erro); } .av-nada { color: var(--apagado); }
  .av-com { border-left: 3px solid var(--linha); padding: 4px 0 4px 12px; display: grid; gap: 4px; }
  .av-com.baixo { border-left-color: var(--erro); } .av-com.alto { border-left-color: var(--ok); }
  .av-com p { white-space: pre-wrap; } .av-com .meta { font-size: 12px; color: var(--apagado); }
  .av-grafico text { fill: var(--apagado); font-size: 11px; font-family: var(--f-texto); }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .av-topo { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 2fr); gap: 14px; }
  @media (max-width: 860px) { .av-topo { grid-template-columns: minmax(0, 1fr); } }
  .av-destaque { background: var(--petroleo); color: #fff; border-radius: 16px; padding: 18px 20px; display: grid; gap: 10px; align-content: start; }
  .av-destaque .rot { font-size: 13px; color: #C6CFD3; font-weight: 600; }
  .av-destaque .grande { font-family: var(--f-titulo); font-size: 56px; font-weight: 800; line-height: 1; color: var(--bege); font-variant-numeric: tabular-nums; }
  .av-destaque .grande small { font-size: 20px; color: #9FB0B6; }
  .av-destaque .linha-nps { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; font-size: 14px; color: #C6CFD3; }
  .av-destaque .linha-nps b { font-family: var(--f-titulo); font-size: 26px; color: #fff; }
  .av-destaque .av-leg { color: #C6CFD3; }
  .av-notas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 12px; }
  .av-nota { background: var(--papel); border: 1px solid var(--linha); border-top: 4px solid var(--bege-escuro); border-radius: 14px; padding: 12px 14px; display: grid; gap: 4px; min-width: 0; align-content: start; }
  .av-nota .rot { font-size: 13.5px; font-weight: 700; }
  .av-nota b { font-family: var(--f-titulo); font-size: 32px; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
  .av-nota b small { font-size: 14px; color: var(--apagado); font-weight: 700; }
  .av-nota .base { font-size: 12px; color: var(--apagado); }
  .av-nota.vazia b { color: var(--apagado); font-size: 20px; }
  .av-aviso-novo { font-size: 12.5px; color: var(--apagado); background: var(--faixa); border-radius: 10px; padding: 8px 10px; }
</style>`;

// cor da nota: escala 0–10, 1–5 ou NPS
function pill(v, escala) {
  if (v == null) return '<span class="av-pill av-nada">—</span>';
  const c = escala === 10 ? (v >= 9 ? 'bom' : v >= 7 ? 'meio' : 'ruim') : escala === 5 ? (v >= 4.5 ? 'bom' : v >= 3.8 ? 'meio' : 'ruim') : (v >= 50 ? 'bom' : v >= 0 ? 'meio' : 'ruim');
  return `<span class="av-pill av-${c}">${escala === 'nps' ? v : num1(v)}</span>`;
}
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function carregar() {
  const todas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('avaliacoes').select(`id, origem, formacao, extras, geral, aula, conteudo, ferramentas, aprendeu, tempo, nps, marcas, comentario, temas, criado_em,
      notas:avaliacao_mentores(mentor_id, nota), modulo:modulos(id, numero, titulo, data_hora, participantes_presentes, mentores:modulo_mentores(mentor_id)),
      turma:turmas(id, nome), empresa:empresas(id, nome)`).order('criado_em', { ascending: false }).range(de, de + 999);
    if (error) return { erro: error };
    todas.push(...data);
    if (data.length < 1000) break;
  }
  const { data: pessoas } = await sb.from('perfis').select('id, nome, foto_url');
  return { todas, nomes: new Map((pessoas || []).map((p) => [p.id, p.nome])) };
}

const quando = (a) => (a.modulo && a.modulo.data_hora) || a.criado_em;
// notas de mentor da resposta; no histórico do Google Forms sem módulo, a nota de didática (1 a 10) vira 1 a 5
const notasDe = (a) => ((a.notas || []).length ? a.notas.map((n) => n.nota)
  : a.extras && a.extras.escala_antiga && a.extras.escala_antiga.didatica ? [Math.ceil(a.extras.escala_antiga.didatica / 2)] : []);
const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mentoresDe = (a) => (a.modulo && a.modulo.mentores ? a.modulo.mentores.map((x) => x.mentor_id) : []);

function filtrar(todas) {
  const limite = est.periodo === 'tudo' ? 0 : Date.now() - Number(est.periodo) * 86400000;
  return todas.filter((a) => Date.parse(quando(a)) >= limite
    && (!est.empresa || (a.empresa && a.empresa.id === est.empresa))
    && (!est.turma || (a.turma && a.turma.id === est.turma))
    && (!est.mentor || mentoresDe(a).includes(est.mentor)));
}

export async function render(ctx, el, [aba0]) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração vê as avaliações de todas as turmas.</div>'; return; }
  const aba = ABAS.some(([k]) => k === aba0) ? aba0 : 'geral';
  if (!document.getElementById('av-estilo')) document.head.insertAdjacentHTML('beforeend', ESTILO);   // no <head>: trocar filtro não apaga
  el.innerHTML = `
    <div class="cab"><div><h1>Avaliações</h1><p class="sub">Como as turmas avaliaram cada encontro: aula, mentor, conteúdo, ferramentas, nota geral e recomendação. Tudo anônimo.</p></div>
      <div class="acoes"><button class="btn" type="button" id="av-excel">Baixar em Excel</button></div></div>
    <p class="carregando">Carregando as avaliações…</p>`;
  const d = await carregar();
  if (d.erro) {
    el.querySelector('.carregando').outerHTML = /avaliacoes|42P01|PGRST20|schema cache/i.test(`${d.erro.code} ${d.erro.message}`)
      ? '<div class="aviso erro">Falta um passo: rodar o script <b>31-avaliacoes.sql</b> no Supabase. Depois disso, as respostas das turmas aparecem aqui.</div>'
      : `<div class="aviso erro">${esc(explicarErro(d.erro))}</div>`;
    return;
  }
  const empresas = new Map(), turmas = new Map(), mentores = new Set();
  d.todas.forEach((a) => {
    if (a.empresa) empresas.set(a.empresa.id, a.empresa.nome);
    if (a.turma && (!est.empresa || (a.empresa && a.empresa.id === est.empresa))) turmas.set(a.turma.id, a.turma.nome);
    mentoresDe(a).forEach((id) => mentores.add(id));
  });
  const opcoes = (mapa, atual, todos) => `<option value="">${todos}</option>${[...mapa.entries()].sort((x, y) => String(x[1]).localeCompare(String(y[1]), 'pt-BR'))
    .map(([k, v]) => `<option value="${k}"${k === atual ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;
  const nomesMentores = new Map([...mentores].map((id) => [id, d.nomes.get(id) || 'Mentor']));
  const lista = filtrar(d.todas);

  el.querySelector('.carregando').outerHTML = `
    <nav class="abas" aria-label="Partes das avaliações">${ABAS.map(([k, t]) => `<button type="button" data-aba="${k}" class="${k === aba ? 'atual' : ''}">${t}</button>`).join('')}</nav>
    <div class="av-filtros">
      <div class="campo"><label for="av-periodo">Período</label><select id="av-periodo">${PERIODOS.map(([k, t]) => `<option value="${k}"${k === est.periodo ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="campo"><label for="av-empresa">Empresa</label><select id="av-empresa">${opcoes(empresas, est.empresa, 'Todas')}</select></div>
      <div class="campo"><label for="av-turma">Turma</label><select id="av-turma">${opcoes(turmas, est.turma, 'Todas')}</select></div>
      <div class="campo"><label for="av-mentor">Mentor</label><select id="av-mentor">${opcoes(nomesMentores, est.mentor, 'Todos')}</select></div>
      ${est.empresa || est.turma || est.mentor || est.periodo !== '90' ? '<button class="btn peq" type="button" id="av-limpar">Limpar filtros</button>' : ''}
    </div>
    <div id="av-conteudo"></div>`;

  const recarregar = () => render(ctx, el, [aba]);
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) location.hash = `#/avaliacoes/${b.dataset.aba}`; });
  [['av-periodo', 'periodo'], ['av-empresa', 'empresa'], ['av-turma', 'turma'], ['av-mentor', 'mentor']].forEach(([id, k]) => el.querySelector(`#${id}`).addEventListener('change', (ev) => {
    est[k] = ev.target.value;
    if (k === 'empresa') est.turma = '';
    guardar(); recarregar();
  }));
  el.querySelector('#av-limpar')?.addEventListener('click', () => { Object.assign(est, { periodo: '90', empresa: '', turma: '', mentor: '' }); guardar(); recarregar(); });
  el.querySelector('#av-excel').addEventListener('click', () => baixarExcel(lista, d.nomes));

  const alvo = el.querySelector('#av-conteudo');
  if (!lista.length) {
    alvo.innerHTML = `<div class="vazio">${d.todas.length ? 'Nenhuma avaliação com estes filtros.' : 'Nenhuma avaliação ainda. Elas chegam pelo QR code de cada módulo (último slide) ou pelo link que o mentor manda no chat.'}</div>`;
    return;
  }
  if (aba === 'modulos') return abaModulos(alvo, lista, d.nomes);
  if (aba === 'mentores') return abaMentores(alvo, lista, d.nomes);
  if (aba === 'comentarios') return abaComentarios(alvo, lista, d.nomes, recarregar);
  if (aba === 'temas') return abaTemas(alvo, lista);
  return abaGeral(alvo, lista);
}

// ---------- visão geral ----------
function abaGeral(alvo, lista) {
  const r = resumir(lista);
  const notasMentor = lista.flatMap(notasDe);
  const satMentor = notasMentor.length ? Math.round((notasMentor.filter((x) => x >= 4).length / notasMentor.length) * 100) : null;
  const quantas = (k) => lista.filter((a) => a[k] != null).length;
  const novas = lista.filter((a) => a.origem !== 'google_forms').length;   // as perguntas novas só existem no formulário da plataforma
  // taxa de resposta: só módulos com presença anotada pelo mentor
  const porModulo = new Map();
  lista.forEach((a) => { if (a.modulo && a.modulo.participantes_presentes) porModulo.set(a.modulo.id, { pres: a.modulo.participantes_presentes, n: (porModulo.get(a.modulo.id)?.n || 0) + 1 }); });
  const somaPres = [...porModulo.values()].reduce((s, x) => s + x.pres, 0), somaResp = [...porModulo.values()].reduce((s, x) => s + x.n, 0);
  const taxa = somaPres ? Math.min(100, Math.round((somaResp / somaPres) * 100)) : null;
  const n = r.nps;
  const fmt = (q) => `${q.toLocaleString('pt-BR')} ${q === 1 ? 'resposta' : 'respostas'}`;
  const pct = (q, total) => (total ? Math.round((q / total) * 100) : 0);
  const nota = (rot, v, escala, base, extra = '') => `<div class="av-nota${v == null ? ' vazia' : ''}"><span class="rot">${rot}</span>
    <b>${v == null ? 'sem respostas' : `${num1(v)} <small>/ ${escala}</small>`}</b><span class="base">${v == null ? '' : `${extra}${extra ? ' · ' : ''}${fmt(base)}`}</span></div>`;
  const barras = (pares, total, cls = () => '') => `<div class="av-barras">${pares.slice(0, 8).map(([k, q]) => `<div class="av-barra"><span>${esc(k)}</span>
    <span class="t"><i class="${cls(k)}" style="width:${pct(q, total)}%"></i></span><b>${pct(q, total)}%</b></div>`).join('')}</div>`;
  const respAprendeu = quantas('aprendeu'), respTempo = quantas('tempo'), respMarcas = lista.filter((a) => (a.marcas || []).length).length;
  alvo.innerHTML = `
    <div class="av-topo">
      <div class="av-destaque">
        <span class="rot">Nota de recomendação (o número que o aluno vê no fim)</span>
        ${n ? `<span class="grande">${num1(n.media)}<small> / 10</small></span>
          <span class="linha-nps">NPS <b>${n.valor}</b> (vai de −100 a +100) · ${fmt(n.total)}</span>
          <div class="av-nps">${[['av-pro', n.promotores], ['av-neu', n.neutros], ['av-det', n.detratores]].filter(([, q]) => q).map(([c, q]) => `<div class="${c}" style="width:${(q / n.total) * 100}%">${pct(q, n.total) >= 6 ? `${pct(q, n.total)}%` : ''}</div>`).join('')}</div>
          <div class="av-leg"><span><i class="av-pro"></i>Indicariam (9 e 10): ${pct(n.promotores, n.total)}%</span><span><i class="av-neu"></i>Neutros (7 e 8): ${pct(n.neutros, n.total)}%</span><span><i class="av-det"></i>Não indicariam (0 a 6): ${pct(n.detratores, n.total)}%</span></div>`
          : '<span class="grande">—</span><span class="linha-nps">Sem notas de recomendação no período.</span>'}
      </div>
      <div class="av-notas">
        ${nota('Mentor', notasMentor.length ? media(notasMentor) : null, 5, notasMentor.length, satMentor == null ? '' : `${satMentor}% satisfeitos`)}
        ${nota('Conteúdo', r.conteudo, 5, quantas('conteudo'), r.satisfeitos.conteudo == null ? '' : `${r.satisfeitos.conteudo}% satisfeitos`)}
        ${nota('Ferramentas e materiais', r.ferramentas, 5, quantas('ferramentas'), r.satisfeitos.ferramentas == null ? '' : `${r.satisfeitos.ferramentas}% satisfeitos`)}
        ${nota('Aula (ritmo e dinâmica)', r.aula, 5, quantas('aula'))}
        ${nota('Nota geral do encontro', r.geral, 10, quantas('geral'))}
        <div class="av-nota${taxa == null ? ' vazia' : ''}"><span class="rot">Taxa de resposta</span><b>${taxa == null ? 'sem dados' : `${taxa}%`}</b>
          <span class="base">${taxa == null ? 'o mentor anota os presentes no módulo' : 'respostas ÷ presentes'}</span></div>
      </div>
    </div>
    <p class="peq apagado mt">${fmt(r.total)} no período. Aula e nota geral do encontro são perguntas novas: só aparecem nas avaliações feitas pelo QR code da plataforma.</p>
    <div class="grade g2 mt2" style="align-items:start">
      <div class="cartao"><h3>Recomendação mês a mês (NPS)</h3>
        ${n ? graficoMeses(lista) || '<p class="apagado mt">Precisa de pelo menos dois meses com respostas.</p>' : '<p class="apagado mt">Sem notas de recomendação no período.</p>'}
      </div>
      <div class="cartao"><h3>O que a turma disse</h3>
        <p class="av-aviso-novo mt">Perguntas novas: ${novas ? `${fmt(novas)} pelo QR code da plataforma` : 'ainda sem respostas pelo QR code da plataforma'}.</p>
        ${respMarcas ? `<p class="rotulo mt2">O que mais marcaram</p>${barras(r.marcas, respMarcas, (k) => (MELHORAR.includes(k) ? 'melhorar' : ''))}` : ''}
        ${respAprendeu ? `<p class="rotulo mt2">Quanto aprenderam</p>${barras(r.aprendeu.map(([k, q]) => [APRENDEU[k], q]), respAprendeu)}` : ''}
        ${respTempo ? `<p class="rotulo mt2">Tempo do encontro</p>${barras(r.tempo.map(([k, q]) => [TEMPO[k], q]), respTempo)}` : ''}
      </div>
    </div>`;
}

// NPS de cada mês (só meses com pelo menos uma nota), no máximo os últimos 12
function graficoMeses(lista) {
  const meses = new Map();
  lista.forEach((a) => {
    if (a.nps == null) return;
    const k = new Date(quando(a)).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    if (!meses.has(k)) meses.set(k, []);
    meses.get(k).push(a.nps);
  });
  const pts = [...meses.entries()].sort().slice(-12).map(([k, v]) => ({ k, v: nps(v).valor, n: v.length }));
  if (pts.length < 2) return '';
  const W = 460, H = 150, L = 34, R = 14, T = 18, B = 26;
  const min = Math.min(0, ...pts.map((p) => p.v)), max = 100;
  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1), y = (v) => T + ((max - v) * (H - T - B)) / (max - min);
  const marcas = [max, Math.round((max + min) / 2), min];
  return `<svg class="av-grafico mt" viewBox="0 0 ${W} ${H}" role="img" aria-label="NPS por mês: ${pts.map((p) => `${p.k} ${p.v}`).join(', ')}" style="width:100%;height:auto">
    ${marcas.map((v) => `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="var(--linha)"/><text x="2" y="${y(v) + 4}">${v}</text>`).join('')}
    <polyline points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}" fill="none" stroke="var(--bege-escuro)" stroke-width="2.5"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 5 : 3.5}" fill="var(--bege-escuro)"><title>${p.k}: NPS ${p.v} (${p.n} respostas)</title></circle>
      <text x="${x(i)}" y="${H - 6}" text-anchor="middle">${MESES[Number(p.k.slice(5)) - 1]}</text>`).join('')}
    <text x="${x(pts.length - 1)}" y="${y(pts[pts.length - 1].v) - 9}" text-anchor="middle" style="font-weight:700;fill:var(--texto)">${pts[pts.length - 1].v}</text>
  </svg>`;
}

// ---------- por módulo ----------
function grupos(lista) {
  const g = new Map();
  lista.forEach((a) => {
    // sem módulo (histórico do Google Forms): uma linha por mês
    const mes = new Date(quando(a)).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    const k = a.modulo ? a.modulo.id : `forms:${mes}`;
    if (!g.has(k)) g.set(k, { modulo: a.modulo, mes, empresa: a.modulo ? a.empresa : null, turma: a.modulo ? a.turma : null, quando: quando(a), lista: [] });
    g.get(k).lista.push(a);
  });
  return [...g.values()].sort((x, y) => Date.parse(y.quando) - Date.parse(x.quando));
}

function abaModulos(alvo, lista, nomes) {
  const linhas = grupos(lista);
  alvo.innerHTML = `<div class="cartao"><div class="tabela"><table>
    <thead><tr><th>Encontro</th><th>Data</th><th>Mentor(es)</th><th>Respostas</th><th>Geral</th><th>Aula</th><th>Mentor</th><th>Conteúdo</th><th>Ferram.</th><th>NPS</th></tr></thead>
    <tbody>${linhas.map((g) => {
      const r = resumir(g.lista);
      const ids = g.modulo ? (g.modulo.mentores || []).map((x) => x.mentor_id) : [];
      const notasM = g.lista.flatMap(notasDe);
      const titulo = g.modulo ? `${esc([g.empresa && g.empresa.nome, g.turma && g.turma.nome].filter(Boolean).join(' · '))}<br><b>Módulo ${g.modulo.numero} · ${esc(g.modulo.titulo)}</b>`
        : `<span class="selo neutro">Google Forms</span> <b>Histórico de ${NOME_MES[Number(g.mes.slice(5)) - 1]} de ${g.mes.slice(0, 4)}</b><br><span class="peq apagado">respostas sem módulo cadastrado na plataforma</span>`;
      return `<tr${g.modulo ? ` class="clicavel" data-modulo="${g.modulo.id}"` : ''}><td>${titulo}</td><td class="num">${g.modulo ? dataBR(g.quando) : `${g.mes.slice(5)}/${g.mes.slice(0, 4)}`}</td>
        <td>${esc(ids.map((id) => String(nomes.get(id) || '').split(' ')[0]).filter(Boolean).join(', ') || '—')}</td>
        <td class="num">${r.total}${g.modulo && g.modulo.participantes_presentes ? ` de ${g.modulo.participantes_presentes}` : ''}</td>
        <td>${pill(r.geral, 10)}</td><td>${pill(r.aula, 5)}</td><td>${pill(media(notasM), 5)}</td><td>${pill(r.conteudo, 5)}</td><td>${pill(r.ferramentas, 5)}</td><td>${pill(r.nps ? r.nps.valor : null, 'nps')}</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="peq apagado mt">Verde: muito bom. Amarelo: atenção. Vermelho: pede conversa. Clique no encontro para abrir o módulo com os comentários.</p></div>`;
  alvo.querySelector('tbody').addEventListener('click', (ev) => { const tr = ev.target.closest('[data-modulo]'); if (tr) location.hash = `#/modulo/${tr.dataset.modulo}`; });
}

// ---------- por mentor ----------
function abaMentores(alvo, lista, nomes) {
  const por = new Map();
  lista.forEach((a) => mentoresDe(a).forEach((id) => {
    if (!por.has(id)) por.set(id, { respostas: [], modulos: new Set(), notas: [] });
    const x = por.get(id);
    x.respostas.push(a); x.modulos.add(a.modulo.id);
    (a.notas || []).filter((n) => n.mentor_id === id).forEach((n) => x.notas.push(n.nota));
  }));
  const linhas = [...por.entries()].map(([id, x]) => ({ id, nome: nomes.get(id) || 'Mentor', ...x, r: resumir(x.respostas), media: media(x.notas) }))
    .sort((a, b) => (b.media || 0) - (a.media || 0));
  alvo.innerHTML = linhas.length ? `<div class="cartao"><div class="tabela"><table>
    <thead><tr><th>Mentor</th><th>Encontros</th><th>Respostas</th><th>Nota como mentor</th><th>Satisfeitos</th><th>Geral dos encontros</th><th>Conteúdo</th><th>NPS</th></tr></thead>
    <tbody>${linhas.map((l) => `<tr><td><b>${esc(l.nome)}</b></td><td class="num">${l.modulos.size}</td><td class="num">${l.respostas.length}</td>
      <td>${pill(l.media, 5)}</td><td class="num">${l.notas.length ? `${Math.round((l.notas.filter((v) => v >= 4).length / l.notas.length) * 100)}%` : '—'}</td>
      <td>${pill(l.r.geral, 10)}</td><td>${pill(l.r.conteudo, 5)}</td><td>${pill(l.r.nps ? l.r.nps.valor : null, 'nps')}</td></tr>`).join('')}</tbody></table></div>
    <p class="peq apagado mt">Só a administração vê esta comparação. Cada mentor vê apenas a própria nota, no módulo e no e-mail.</p></div>`
    : '<div class="vazio">Nenhuma avaliação ligada a um mentor neste período (as respostas antigas do Google Forms não têm mentor).</div>';
}

// ---------- comentários ----------
function abaComentarios(alvo, lista, nomes, recarregar, mostrar = 200) {
  const FILTROS = [['todas', 'Todos'], ['baixas', 'Notas de 0 a 6'], ['medias', 'Notas 7 e 8'], ['altas', 'Notas 9 e 10']];
  const com = lista.filter((a) => String(a.comentario || '').trim()).filter((a) => {
    const g = a.geral != null ? a.geral : a.nps;
    return est.notas === 'todas' || (g != null && (est.notas === 'baixas' ? g <= 6 : est.notas === 'medias' ? g >= 7 && g <= 8 : g >= 9));
  });
  alvo.innerHTML = `<div class="chips" style="margin-bottom:14px">${FILTROS.map(([k, t]) => `<button class="btn peq${est.notas === k ? ' pri' : ''}" type="button" data-notas="${k}">${t}</button>`).join('')}</div>
    <div class="cartao">${com.length ? `<p class="peq apagado" style="margin-bottom:12px">${com.length} ${com.length === 1 ? 'comentário' : 'comentários'}${com.length > mostrar ? `, mostrando os ${mostrar} mais recentes` : ''}.</p><div style="display:grid;gap:14px">${com.slice(0, mostrar).map((a) => {
      const g = a.geral != null ? a.geral : a.nps;
      const onde = a.modulo ? `${[a.turma && a.turma.nome].filter(Boolean).join('')} · Módulo ${a.modulo.numero} · ${a.modulo.titulo}` : (a.formacao || 'Google Forms');
      return `<div class="av-com${g != null && g <= 6 ? ' baixo' : g >= 9 ? ' alto' : ''}"><p>${esc(a.comentario)}</p>
        <span class="meta">${g != null ? `Nota ${g} · ` : ''}${esc(a.empresa ? `${a.empresa.nome} · ` : '')}${esc(onde)} · ${dataBR(quando(a))}${(a.marcas || []).length ? ` · marcou: ${esc(a.marcas.join(', '))}` : ''}</span></div>`;
    }).join('')}</div>${com.length > mostrar ? '<button class="btn mt" type="button" id="av-mais">Mostrar mais 200</button>' : ''}` : '<p class="apagado">Nenhum comentário com este filtro.</p>'}</div>`;
  alvo.querySelector('#av-mais')?.addEventListener('click', () => abaComentarios(alvo, lista, nomes, recarregar, mostrar + 200));
  alvo.querySelector('.chips').addEventListener('click', (ev) => { const b = ev.target.closest('[data-notas]'); if (!b) return; est.notas = b.dataset.notas; guardar(); recarregar(); });
}

// ---------- temas pedidos ----------
function abaTemas(alvo, lista) {
  const r = resumir(lista);
  const porEmpresa = new Map();
  lista.forEach((a) => { if (!a.empresa || !(a.temas || []).length) return; if (!porEmpresa.has(a.empresa.nome)) porEmpresa.set(a.empresa.nome, []); porEmpresa.get(a.empresa.nome).push(a); });
  const barras = (pares) => { const max = pares.length ? pares[0][1] : 1; return `<div class="av-barras">${pares.map(([k, q]) => `<div class="av-barra"><span>${esc(k.replace(/^Outro: /, ''))}</span><span class="t"><i style="width:${Math.round((q / max) * 100)}%"></i></span><b>${q}</b></div>`).join('')}</div>`; };
  alvo.innerHTML = r.temas.length ? `<div class="grade g2" style="align-items:start">
    <div class="cartao"><h3>Mais pedidos</h3><p class="peq apagado">O que as turmas querem aprender depois.</p><div class="mt">${barras(r.temas.slice(0, 15))}</div></div>
    <div class="cartao"><h3>Por empresa</h3><p class="peq apagado">Ideia de próxima trilha para levar em Vendas.</p>
      ${[...porEmpresa.entries()].sort((a, b) => b[1].length - a[1].length).map(([nome, l]) => `<p class="mt"><b>${esc(nome)}</b></p>${barras(resumir(l).temas.slice(0, 5))}`).join('')}</div>
  </div>` : '<div class="vazio">Nenhum tema pedido neste período.</div>';
}

// ---------- Excel ----------
async function baixarExcel(lista, nomes) {
  if (!lista.length) { avisar('Nada para baixar com estes filtros.', true); return; }
  let XLSX;
  try { XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'); } catch (e) { avisar(explicarErro(e), true); return; }
  const respostas = [['Data', 'Empresa', 'Turma', 'Encontro', 'Mentor(es)', 'Nota geral (0-10)', 'Aula (1-5)', 'Nota do mentor (1-5)', 'Conteúdo (1-5)',
    'Ferramentas e materiais (1-5)', 'Aprendeu', 'Tempo', 'Recomendação (0-10)', 'Marcou', 'Comentário', 'Temas pedidos', 'Origem']];
  lista.forEach((a) => respostas.push([dataBR(quando(a)), a.empresa ? a.empresa.nome : '', a.turma ? a.turma.nome : '',
    a.modulo ? `Módulo ${a.modulo.numero} · ${a.modulo.titulo}` : (a.formacao || ''), mentoresDe(a).map((id) => nomes.get(id) || '').join(', '),
    a.geral, a.aula, (a.notas || []).length ? a.notas.map((n) => `${String(nomes.get(n.mentor_id) || '').split(' ')[0]}: ${n.nota}`).join(', ') : notasDe(a).join(''), a.conteudo, a.ferramentas,
    APRENDEU[a.aprendeu] || '', TEMPO[a.tempo] || '', a.nps, (a.marcas || []).join(', '), a.comentario || '', (a.temas || []).join(', '),
    a.origem === 'google_forms' ? 'Google Forms' : 'Plataforma']));
  const porModulo = [['Encontro', 'Data', 'Respostas', 'Presentes', 'Nota geral', 'Aula', 'Mentor', 'Conteúdo', 'Ferramentas', 'NPS']];
  grupos(lista).forEach((g) => {
    const r = resumir(g.lista), notasM = g.lista.flatMap(notasDe);
    const arred = (v) => (v == null ? '' : Math.round(v * 10) / 10);
    porModulo.push([g.modulo ? `${[g.empresa && g.empresa.nome, g.turma && g.turma.nome].filter(Boolean).join(' · ')} · Módulo ${g.modulo.numero} · ${g.modulo.titulo}` : `Histórico do Google Forms · ${g.mes.slice(5)}/${g.mes.slice(0, 4)}`,
      dataBR(g.quando), r.total, g.modulo ? g.modulo.participantes_presentes || '' : '', arred(r.geral), arred(r.aula), arred(media(notasM)), arred(r.conteudo), arred(r.ferramentas), r.nps ? r.nps.valor : '']);
  });
  const wb = XLSX.utils.book_new();
  [[respostas, 'Respostas'], [porModulo, 'Por encontro']].forEach(([dados, nome]) => {
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dados.length - 1, c: dados[0].length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, nome);
  });
  XLSX.writeFile(wb, `Mentorei - Avaliações das turmas - ${new Date().toLocaleDateString('sv-SE')}.xlsx`);
}
