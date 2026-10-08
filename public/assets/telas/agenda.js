// Agenda. "#/agenda/<parte>": a administração vê a equipe toda (quadro, encaixar, pré-bloqueios, bloqueios, viagens,
// números e celular/e-mail); o mentor vê só a própria agenda, responde pré-bloqueios, pede bloqueios e diz os dias em que atende.
import { sb, esc, avatar, horaBR, avisar, explicarErro, diaMes } from '../base.js';
import { PERIODOS, NOME_PERIODO, LETRA_PERIODO, ESTADOS, hoje, somarDias, diaDaSemana, listaDias, segundaDaSemana, nomeSemana, nomeMes, ddmm, diaCurto,
  feriadoDe, dispDe, situacaoParaEncaixe, periodosDoIntervalo, horaDoTexto, diasEntre, diaDe, ordenar, indexar,
  descreverBloqueio, choquesDoBloqueio as choquesBloq, rotuloBloqueio, CATEGORIAS, moduloPresencial } from '../agenda-regras.js';
import { carregarAgenda, limparCache, janela, api, legenda, amostra, estadosDoDia, dicaEstados, linhaEvento, primeiroNome, faltaScript, avisarGoogle } from './agenda-dados.js';

const SEMANA_LONGA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const ABAS = [['quadro', 'Agenda da equipe'], ['encaixar', 'Encaixar'], ['pre', 'Pré-bloqueios'], ['bloqueios', 'Bloqueios'], ['viagens', 'Viagens'], ['numeros', 'Números'], ['celular', 'Google, celular e e-mail']];
const AVISO_SCRIPT = `<div class="aviso erro" style="margin-bottom:14px">Falta um passo para a agenda funcionar por completo: rodar o script <b>14-agenda-equipe.sql</b> no Supabase.
  Enquanto isso, a agenda mostra as sessões e as turmas, mas ainda não guarda bloqueios, pré-bloqueios, dias de atendimento nem viagens.</div>`;

// filtros e posição do quadro (continuam iguais ao voltar para a agenda)
const est = { inicio: null, mes: null, mentor: '', empresa: '', tipo: '', formato: '' };
const enc = { de: null, ate: null, periodos: ['manha', 'tarde'], formato: 'online', quantos: 1, soGrupo: true, dias: [1, 2, 3, 4, 5], soComGente: true };

export async function render(ctx, el, params) {
  limparCache();
  const d = await carregarAgenda(ctx);
  if (!ctx.ehAdmin) return telaMentor(ctx, el, d);
  const aba = ABAS.some(([k]) => k === params[0]) ? params[0] : 'quadro';
  if (params[0] === 'mentor' && params[1]) est.mentor = params[1];
  const av = avisos(d);
  el.innerHTML = `
    <div class="cab"><div><h1>Agenda</h1><p class="sub">Compromissos, dias livres, deslocamentos, pré-bloqueios e bloqueios de toda a equipe.</p></div>
      <div class="acoes"><button class="btn" id="novo-bloqueio" type="button">+ Bloqueio</button><button class="btn pri" id="novo-pre" type="button">+ Pré-bloqueio</button></div></div>
    ${d.faltaScript ? AVISO_SCRIPT : ''}
    <div id="avisos">${htmlAvisos(av, d)}</div>
    <nav class="abas" aria-label="Partes da agenda">${ABAS.map(([k, t]) => `<button type="button" data-aba="${k}" class="${k === aba ? 'atual' : ''}">${t}${contagem(k, av)}</button>`).join('')}</nav>
    <div id="conteudo"></div>`;
  const recarregar = () => ctx.irPara(`#/agenda/${aba}`);
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-aba]'); if (b) location.hash = `#/agenda/${b.dataset.aba}`; });
  el.querySelector('#novo-pre').addEventListener('click', async () => { const { abrirReserva } = await import('./agenda-reservas.js'); abrirReserva(ctx, d, {}, recarregar); });
  el.querySelector('#novo-bloqueio').addEventListener('click', () => abrirBloqueio(ctx, d, {}, recarregar));
  el.querySelector('#avisos').addEventListener('click', (ev) => { const b = ev.target.closest('[data-ir]'); if (b) location.hash = b.dataset.ir; });
  const alvo = el.querySelector('#conteudo');
  if (aba === 'encaixar') return abaEncaixar(ctx, alvo, d, recarregar);
  if (aba === 'pre') { const { abaReservas } = await import('./agenda-reservas.js'); return abaReservas(ctx, alvo, d, recarregar); }
  if (aba === 'bloqueios') return abaBloqueios(ctx, alvo, d, recarregar);
  if (aba === 'viagens') return abaViagens(ctx, alvo, d, recarregar);
  if (aba === 'numeros') { const { abaNumeros } = await import('./agenda-numeros.js'); return abaNumeros(ctx, alvo, d); }
  if (aba === 'celular') return abaCelular(ctx, alvo, d);
  return abaQuadro(ctx, alvo, d, recarregar);
}

// ---------- avisos que pedem atenção ----------
function viagensPendentes(d) {
  if (!d.temExtras) return [];
  const h = hoje(), lim = somarDias(h, 15), out = [];
  for (const m of d.modulos) {
    if (m.formato !== 'presencial' || !m.data_hora) continue;
    const dia = diaDe(m.data_hora);
    if (dia < h || dia > lim) continue;
    for (const v of m.mentores) if (v.com_deslocamento !== false && !(v.viagem && v.viagem.passagem && v.viagem.hotel)) out.push({ m, v, dia });
  }
  return out;
}
function avisos(d) {
  const h = hoje();
  const ativas = d.reservas.filter((r) => r.situacao === 'pre' || r.situacao === 'confirmada');
  return {
    vencidos: d.reservas.filter((r) => r.situacao === 'pre' && r.lembrar_em <= h),
    respostas: ativas.flatMap((r) => (r.mentores || []).filter((x) => x.respondido_em && !x.visto_em).map((x) => ({ r, x }))),
    bloqueios: d.bloqueios.filter((b) => b.mentor_id && !b.visto_em && b.fim >= h),
    viagens: viagensPendentes(d),
    semFormato: d.modulos.filter((m) => m.data_hora && diaDe(m.data_hora) >= h && m.formato === 'indefinido' && !moduloPresencial(m)),
  };
}
const contagem = (aba, av) => {
  const n = aba === 'pre' ? av.vencidos.length + av.respostas.length : aba === 'bloqueios' ? av.bloqueios.length : aba === 'viagens' ? av.viagens.length : 0;
  return n ? ` <span class="selo erro">${n}</span>` : '';
};
function htmlAvisos(av, d) {
  const nome = (id) => primeiroNome((d.mentores.find((m) => m.id === id) || {}).nome || 'mentor');
  const linhas = [];
  if (av.vencidos.length) linhas.push(`<b>${av.vencidos.length} pré-bloqueio${av.vencidos.length > 1 ? 's' : ''} com mais de 5 dias</b> (${esc(av.vencidos.slice(0, 2).map((r) => r.titulo).join('; '))}${av.vencidos.length > 2 ? '…' : ''}). Confirme com o cliente ou libere a agenda.|#/agenda/pre`);
  if (av.respostas.length) linhas.push(`<b>${av.respostas.length} resposta${av.respostas.length > 1 ? 's' : ''} nova${av.respostas.length > 1 ? 's' : ''}</b> de mentores aos pré-bloqueios (${esc(av.respostas.slice(0, 2).map(({ r, x }) => `${nome(x.mentor_id)} ${x.resposta === 'aceito' ? 'aceitou' : 'não pode'}: ${r.titulo}`).join('; '))}).|#/agenda/pre`);
  if (av.bloqueios.length) linhas.push(`<b>${av.bloqueios.length} bloqueio${av.bloqueios.length > 1 ? 's' : ''} novo${av.bloqueios.length > 1 ? 's' : ''}</b> pedido${av.bloqueios.length > 1 ? 's' : ''} pelos mentores (${esc(av.bloqueios.slice(0, 3).map((b) => `${nome(b.mentor_id)} · ${b.inicio === b.fim ? ddmm(b.inicio) : `${ddmm(b.inicio)} a ${ddmm(b.fim)}`}`).join('; '))}).|#/agenda/bloqueios`);
  if (av.semFormato.length) linhas.push(`<b>${av.semFormato.length === 1 ? '1 módulo sem dizer' : `${av.semFormato.length} módulos sem dizer`} se ${av.semFormato.length === 1 ? 'é' : 'são'} online ou presencial</b> (${esc(av.semFormato.slice(0, 2).map((m) => `${(m.turma && m.turma.nome) || 'Turma'} · módulo ${m.numero}`).join('; '))}). A agenda precisa dessa informação.|${av.semFormato.length === 1 ? `#/modulo/${av.semFormato[0].id}` : '#/turmas'}`);
  if (av.viagens.length) linhas.push(`<b>${av.viagens.length} viage${av.viagens.length > 1 ? 'ns' : 'm'} nos próximos 15 dias</b> com passagem ou hotel pendente.|#/agenda/viagens`);
  return linhas.map((l) => { const [t, h] = l.split('|'); return `<div class="aviso ag-aviso"><span>${t}</span><button class="btn peq" type="button" data-ir="${h}">Ver</button></div>`; }).join('');
}

// Avisos da agenda no Painel da administração.
export async function avisosAgenda(ctx, el) {
  try {
    const d = await carregarAgenda(ctx);
    if (d.faltaScript) { el.innerHTML = '<div class="aviso">Agenda: falta rodar o script <b>14-agenda-equipe.sql</b> no Supabase para guardar bloqueios e pré-bloqueios. <a href="#/agenda">Abrir a agenda</a></div>'; return; }
    const html = htmlAvisos(avisos(d), d);
    el.innerHTML = html ? `<h2 class="mt2">Agenda pede atenção</h2><div class="mt">${html}</div>` : '';
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ir]'); if (b) location.hash = b.dataset.ir; });
  } catch (_) { el.innerHTML = ''; }
}

// ---------- quadro da equipe e mês de um mentor ----------
function filtrar(d) {
  const fixos = ['bloqueio', 'ferias', 'recesso', 'feriado'];
  const passa = (e) => {
    if (fixos.includes(e.tipo)) return true;
    if (est.empresa && e.empresaId !== est.empresa) return false;
    if (est.tipo === 'individual' && e.tipo !== 'individual') return false;
    if (est.tipo === 'turmas' && e.tipo === 'individual') return false;
    if (est.formato && e.formato !== est.formato) return false;
    return true;
  };
  return indexar(d.eventos.filter(passa));
}

async function abaQuadro(ctx, el, d, recarregar) {
  if (!est.inicio) est.inicio = segundaDaSemana(hoje());
  if (est.mentor && !d.mentores.some((m) => m.id === est.mentor)) est.mentor = '';
  const empresas = [...new Map(d.eventos.filter((e) => e.empresaId).map((e) => [e.empresaId, e.empresa])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  el.innerHTML = `
    <div class="linha ag-filtros">
      <select id="f-mentor" aria-label="Mentor"><option value="">Toda a equipe</option>${d.mentores.map((m) => `<option value="${m.id}"${m.id === est.mentor ? ' selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>
      <select id="f-empresa" aria-label="Empresa"><option value="">Todas as empresas</option>${empresas.map(([id, n]) => `<option value="${id}"${id === est.empresa ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select id="f-tipo" aria-label="Tipo"><option value="">Individual e turmas</option><option value="individual"${est.tipo === 'individual' ? ' selected' : ''}>Só mentoria individual</option><option value="turmas"${est.tipo === 'turmas' ? ' selected' : ''}>Só turmas e pré-bloqueios</option></select>
      <select id="f-formato" aria-label="Formato"><option value="">Online e presencial</option><option value="online"${est.formato === 'online' ? ' selected' : ''}>Só online</option><option value="presencial"${est.formato === 'presencial' ? ' selected' : ''}>Só presencial</option></select>
    </div>
    <div id="vista"></div>
    ${legenda()}`;
  const vista = el.querySelector('#vista');
  const desenhar = () => {
    const idx = filtrar(d);
    const m = d.mentores.find((x) => x.id === est.mentor);
    if (m) vistaMes(ctx, vista, d, idx, m, { voltar: () => { est.mentor = ''; el.querySelector('#f-mentor').value = ''; desenhar(); }, recarregar });
    else vistaEquipe(ctx, vista, d, idx, (id) => { est.mentor = id; el.querySelector('#f-mentor').value = id; est.mes = null; desenhar(); }, recarregar);
  };
  el.querySelectorAll('.ag-filtros select').forEach((s) => s.addEventListener('input', () => {
    est.mentor = el.querySelector('#f-mentor').value; est.empresa = el.querySelector('#f-empresa').value;
    est.tipo = el.querySelector('#f-tipo').value; est.formato = el.querySelector('#f-formato').value;
    desenhar();
  }));
  desenhar();
}

function vistaEquipe(ctx, alvo, d, idx, verMentor, recarregar) {
  const h = hoje();
  const n = window.matchMedia('(max-width: 700px)').matches ? 7 : 14;
  const dias = listaDias(est.inicio, somarDias(est.inicio, n - 1));
  alvo.innerHTML = `
    <div class="linha ag-nav"><button class="btn peq" type="button" data-nav="-7">‹ Semana anterior</button><button class="btn peq" type="button" data-nav="0">Hoje</button>
      <button class="btn peq" type="button" data-nav="7">Próxima semana ›</button><b>${ddmm(dias[0])} a ${ddmm(dias[dias.length - 1])}</b>
      <span class="peq apagado">Cada dia tem 3 faixas: manhã, tarde e noite. Clique num dia para ver os detalhes, ou no nome para ver o mês do mentor.</span></div>
    ${d.mentores.length ? `<div class="ag-quadro-caixa"><table class="ag-quadro">
      <thead><tr><th class="ag-q-nome">Mentor</th>${dias.map((dia) => {
        const f = feriadoDe(dia); const fds = [0, 6].includes(diaDaSemana(dia));
        return `<th class="${dia === h ? 'hoje' : ''}${fds ? ' fds' : ''}${f ? ' feriado' : ''}"${f ? ` title="${esc(f)}"` : ''}>${nomeSemana(dia)}<br><span>${ddmm(dia)}</span>${f ? '<i>feriado</i>' : ''}</th>`;
      }).join('')}</tr></thead>
      <tbody>${d.mentores.map((m) => `<tr><th class="ag-q-nome"><button type="button" class="ag-q-pessoa" data-ver="${m.id}">${avatar(m)}<span>${esc(m.nome)}</span></button></th>
        ${dias.map((dia) => {
          const st = estadosDoDia(idx, m, dia);
          const dica = `${m.nome} · ${diaCurto(dia)}\n${dicaEstados(st)}`;
          return `<td class="${dia === h ? 'hoje' : ''}${[0, 6].includes(diaDaSemana(dia)) ? ' fds' : ''}"><button type="button" class="ag-cel" data-m="${m.id}" data-dia="${dia}" title="${esc(dica)}" aria-label="${esc(dica)}">${st.map((s) => `<span class="ag-p ag-${s.tipo}"></span>`).join('')}</button></td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum mentor ativo.</div>'}`;
  alvo.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const k = Number(b.dataset.nav);
    est.inicio = k ? somarDias(est.inicio, k) : segundaDaSemana(hoje());
    vistaEquipe(ctx, alvo, d, idx, verMentor, recarregar);
  }));
  alvo.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-ver]'); if (p) { verMentor(p.dataset.ver); return; }
    const c = ev.target.closest('.ag-cel'); if (!c) return;
    abrirDia(ctx, d, d.mentores.find((m) => m.id === c.dataset.m), c.dataset.dia, recarregar);
  });
}

function fimDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return somarDias(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
}

function vistaMes(ctx, alvo, d, idx, mentor, { voltar = null, recarregar }) {
  const h = hoje();
  if (!est.mes) est.mes = h.slice(0, 7);
  const [ano, mes] = est.mes.split('-').map(Number);
  const primeiro = `${est.mes}-01`, ultimo = fimDoMes(est.mes);
  const dias = listaDias(segundaDaSemana(primeiro), somarDias(segundaDaSemana(ultimo), 6));
  const livres = listaDias(primeiro > h ? primeiro : h, ultimo).filter((dia) => {
    if (feriadoDe(dia) || dia < h) return false;
    const st = estadosDoDia(idx, mentor, dia);
    return st.some((s) => s.tipo === 'livre') && st.every((s) => s.tipo === 'livre' || s.tipo === 'fora');
  });
  const atende = [mentor.atende_individual !== false && 'mentoria individual', mentor.atende_grupo && 'turmas'].filter(Boolean).join(' e ');
  alvo.innerHTML = `
    ${voltar ? `<div class="linha" style="margin-bottom:12px"><button class="btn peq" type="button" id="voltar">← Toda a equipe</button>
      <span class="linha" style="gap:10px">${avatar(mentor)}<span><b>${esc(mentor.nome)}</b><br><span class="peq apagado">Atende ${esc(atende || '—')}</span></span></span></div>` : ''}
    <div class="linha ag-nav"><button class="btn peq" type="button" data-mes="-1">‹ Mês anterior</button><button class="btn peq" type="button" data-mes="0">Este mês</button>
      <button class="btn peq" type="button" data-mes="1">Próximo mês ›</button><h3>${nomeMes(mes)[0].toUpperCase()}${nomeMes(mes).slice(1)} de ${ano}</h3></div>
    <div class="aviso ok ag-livres"><b>Dias totalmente livres${primeiro < h && ultimo >= h ? ' (de hoje em diante)' : ''}:</b>
      ${ultimo < h ? 'este mês já passou.' : livres.length ? livres.map((dia) => `<button type="button" class="chip ag-chip-livre" data-m="${mentor.id}" data-dia="${dia}">${diaCurto(dia)}</button>`).join(' ') : 'nenhum.'}</div>
    <div class="ag-mes mt">${ORDEM_SEMANA.map((n) => `<div class="ag-mes-sem">${SEMANA_LONGA[n].slice(0, 3)}</div>`).join('')}
      ${dias.map((dia) => {
        const st = estadosDoDia(idx, mentor, dia);
        const evs = ordenar(idx.doDia(mentor.id, dia).filter((e) => e.tipo !== 'feriado'));
        const f = feriadoDe(dia);
        const dica = `${diaCurto(dia)}${f ? ` · feriado: ${f}` : ''}\n${dicaEstados(st)}`;
        return `<button type="button" class="ag-dia${dia.slice(0, 7) !== est.mes ? ' outro' : ''}${dia === h ? ' hoje' : ''}${dia < h ? ' passado' : ''}" data-m="${mentor.id}" data-dia="${dia}" title="${esc(dica)}" aria-label="${esc(dica)}">
          <span class="ag-dia-topo"><b>${Number(dia.slice(8))}</b>${f ? `<span class="ag-fer">${esc(f)}</span>` : ''}</span>
          <span class="ag-dia-p">${st.map((s) => `<span class="ag-p ag-${s.tipo}">${LETRA_PERIODO[s.periodo]}</span>`).join('')}</span>
          <span class="ag-dia-itens">${evs.slice(0, 3).map((e) => `<span>${amostra(e.tipo)}${e.ini ? `${horaBR(new Date(e.ini).toISOString())} ` : ''}${esc(e.titulo)}</span>`).join('')}${evs.length > 3 ? `<span class="apagado">e mais ${evs.length - 3}</span>` : ''}</span>
        </button>`;
      }).join('')}</div>
    <div class="grade g2 mt2" id="extras" style="align-items:start"></div>`;
  alvo.querySelector('#voltar')?.addEventListener('click', voltar);
  alvo.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => {
    const k = Number(b.dataset.mes);
    if (!k) est.mes = hoje().slice(0, 7);
    else { const nm = mes + k; const a2 = nm < 1 ? ano - 1 : nm > 12 ? ano + 1 : ano; est.mes = `${a2}-${String(((nm + 11) % 12) + 1).padStart(2, '0')}`; }
    vistaMes(ctx, alvo, d, idx, mentor, { voltar, recarregar });
  }));
  alvo.addEventListener('click', (ev) => {
    const c = ev.target.closest('.ag-dia, .ag-chip-livre'); if (!c) return;
    abrirDia(ctx, d, mentor, c.dataset.dia, recarregar);
  });
  const extras = alvo.querySelector('#extras');
  extras.innerHTML = `${htmlBloqueiosDoMentor(ctx, d, mentor)}${htmlDisponibilidade(ctx, mentor)}`;
  ligarBloqueiosDoMentor(ctx, d, extras, mentor, recarregar);
  ligarDisponibilidade(extras, mentor, recarregar);
}

// ---------- detalhes de um dia ----------
function abrirDia(ctx, d, mentor, dia, recarregar) {
  if (!mentor) return;
  const st = estadosDoDia(d.idx, mentor, dia);
  const evs = ordenar(d.idx.doDia(mentor.id, dia).filter((e) => e.tipo !== 'feriado'));
  const f = feriadoDe(dia);
  const souEu = mentor.id === ctx.perfil.id;
  let mudou = false;
  const html = `
    ${f ? `<div class="aviso">Feriado nacional: <b>${esc(f)}</b>.</div>` : ''}
    <div class="ag-periodos mt">${st.map((s) => `<div class="ag-periodo">${amostra(s.tipo)}<div><b>${NOME_PERIODO[s.periodo]}</b><br><span class="peq apagado">${esc(ESTADOS[s.tipo])}</span></div></div>`).join('')}</div>
    <h4 class="mt2">O que tem neste dia</h4>
    <div class="lista mt">${evs.length ? evs.map((e) => blocoEvento(ctx, d, e, mentor)).join('') : '<p class="apagado">Nada marcado.</p>'}</div>
    <div class="linha mt2">${ctx.ehAdmin ? '<button class="btn pri" type="button" data-acao="pre">Pré-bloquear este dia</button>' : ''}
      <button class="btn" type="button" data-acao="bloquear">${ctx.ehAdmin && !souEu ? `Bloquear para ${esc(primeiroNome(mentor.nome))}` : 'Bloquear este dia'}</button></div>`;
  const j = janela(`${mentor.nome} · ${nomeSemana(dia, true)}, ${ddmm(dia)}`, html, { largura: 640, aoFechar: () => { if (mudou) recarregar(); } });
  ligarViagens(j.corpo, d, () => { mudou = true; });
  j.corpo.addEventListener('click', async (ev) => {
    const a = ev.target.closest('[data-acao]');
    if (a && a.dataset.acao === 'pre') { j.fechar(); const { abrirReserva } = await import('./agenda-reservas.js'); abrirReserva(ctx, d, { dias: [{ dia, periodos: [...PERIODOS] }], mentores: [mentor.id] }, recarregar); return; }
    if (a && a.dataset.acao === 'bloquear') { j.fechar(); abrirBloqueio(ctx, d, { mentorId: mentor.id, dia }, recarregar); return; }
    const eb = ev.target.closest('[data-editar-bloqueio]');
    if (eb) { j.fechar(); abrirBloqueio(ctx, d, { bloqueio: d.bloqueios.find((b) => b.id === eb.dataset.editarBloqueio) }, recarregar); return; }
    const ir = ev.target.closest('[data-ir]');
    if (ir) { j.fechar(); location.hash = ir.dataset.ir; }
  });
}

function blocoEvento(ctx, d, e, mentor) {
  let extra = '';
  const podeVer = ctx.ehAdmin || mentor.id === ctx.perfil.id;
  if (e.tipo === 'presencial' && e.origem) {
    const v = (e.origem.mentores || []).find((x) => x.mentor_id === mentor.id);
    if (v && d.temExtras) extra = formViagem(e.origem, v, ctx.ehAdmin);
  }
  if ((e.tipo === 'bloqueio' || e.tipo === 'ferias' || e.tipo === 'recesso') && e.origem) {
    const b = e.origem;
    extra = `${b.motivo && podeVer && b.tipo !== 'recesso' ? `<p class="peq mt"><b>Detalhes:</b> ${esc(b.motivo)}</p>` : ''}
      <p class="peq apagado mt">${esc(descreverBloqueio(b))}</p>
      ${(ctx.ehAdmin || (b.mentor_id === ctx.perfil.id && b.tipo !== 'recesso')) ? `<button class="btn peq mt" type="button" data-editar-bloqueio="${b.id}">Mudar ou apagar</button>` : ''}`;
  }
  if ((e.tipo === 'pre' || e.tipo === 'reservado') && e.origem) {
    const r = e.origem;
    const resp = (r.mentores || []).find((x) => x.mentor_id === mentor.id);
    const RESP = { aguardando: 'esperando resposta', aceito: 'aceitou', recusado: 'não pode' };
    extra = `<p class="peq mt">${resp ? `Resposta de ${esc(primeiroNome(mentor.nome))}: <b>${RESP[resp.resposta]}</b>` : ''}${r.observacoes ? ` · ${esc(r.observacoes)}` : ''}</p>
      ${ctx.ehAdmin ? '<button class="btn peq mt" type="button" data-ir="#/agenda/pre">Ver pré-bloqueios</button>' : resp && resp.resposta === 'aguardando' ? '<button class="btn peq mt pri" type="button" data-ir="#/agenda">Responder</button>' : ''}`;
  }
  return `<div class="ag-bloco">${linhaEvento(e, { horaFn: horaBR })}${extra}</div>`;
}

// ---------- viagem dos presenciais ----------
function formViagem(md, v, editavel) {
  const vg = v.viagem || {};
  if (!editavel) {
    return `<p class="peq mt">${v.com_deslocamento === false ? 'Sem deslocamento (mesma cidade).'
      : `Viagem: passagem ${vg.passagem ? 'comprada ✓' : 'pendente'} · hotel ${vg.hotel ? 'reservado ✓' : 'pendente'} · transporte ${vg.transporte ? 'combinado ✓' : 'pendente'}`}${vg.obs ? `<br>${esc(vg.obs)}` : ''}</p>`;
  }
  return `<div class="ag-viagem mt" data-modulo="${md.id}" data-mentor="${v.mentor_id}">
    <label class="check"><input type="checkbox" data-v="com_deslocamento"${v.com_deslocamento !== false ? ' checked' : ''}><span>Precisa de deslocamento (pré-bloqueia a véspera e o dia seguinte)</span></label>
    <div class="linha ag-viagem-itens"${v.com_deslocamento === false ? ' hidden' : ''}>
      <label class="check"><input type="checkbox" data-v="passagem"${vg.passagem ? ' checked' : ''}><span>Passagem comprada</span></label>
      <label class="check"><input type="checkbox" data-v="hotel"${vg.hotel ? ' checked' : ''}><span>Hotel reservado</span></label>
      <label class="check"><input type="checkbox" data-v="transporte"${vg.transporte ? ' checked' : ''}><span>Transporte no local</span></label>
    </div>
    <input type="text" data-v="obs" aria-label="Observações da viagem" placeholder="Observações da viagem (voo, hotel, horários)" value="${esc(vg.obs || '')}">
  </div>`;
}
function ligarViagens(raiz, d, aoMudar) {
  raiz.addEventListener('change', async (ev) => {
    const box = ev.target.closest('.ag-viagem');
    if (!box || !ev.target.dataset.v) return;
    const md = d.modulos.find((m) => m.id === box.dataset.modulo);
    const v = md && md.mentores.find((x) => x.mentor_id === box.dataset.mentor);
    if (!v) return;
    const viagem = { ...(v.viagem || {}) };
    let com = v.com_deslocamento !== false;
    box.querySelectorAll('[data-v]').forEach((c) => {
      if (c.dataset.v === 'com_deslocamento') com = c.checked;
      else if (c.type === 'checkbox') viagem[c.dataset.v] = c.checked;
      else viagem[c.dataset.v] = c.value.trim() || null;
    });
    box.querySelector('.ag-viagem-itens').hidden = !com;
    const { error } = await sb.from('modulo_mentores').update({ com_deslocamento: com, viagem }).eq('modulo_id', md.id).eq('mentor_id', v.mentor_id);
    if (error) { avisar(faltaScript(error) ? 'Falta rodar o script 14 no Supabase.' : explicarErro(error), true); return; }
    v.viagem = viagem; v.com_deslocamento = com; limparCache(); avisarGoogle();
    avisar(ev.target.dataset.v === 'com_deslocamento' ? (com ? 'Deslocamento marcado: véspera e dia seguinte ficam reservados.' : 'Sem deslocamento: véspera e dia seguinte liberados.') : 'Viagem atualizada.');
    if (aoMudar) aoMudar();
  });
}

// ---------- bloqueios ----------

export function abrirBloqueio(ctx, d, { mentorId = null, dia = null, bloqueio = null, recesso = false }, aoSalvar) {
  const adm = ctx.ehAdmin;
  const b = bloqueio || {};
  const ehRecesso = recesso || b.tipo === 'recesso';
  const quemInicial = ehRecesso ? 'recesso' : (b.mentor_id || mentorId || (adm ? '' : ctx.perfil.id));
  const de = b.inicio || dia || hoje(), ate = b.fim || dia || de;
  const modo = b.hora_inicio ? 'hora' : b.periodos && b.periodos.length && b.periodos.length < 3 ? 'periodos' : 'dia';
  const repete = !!(b.dias_semana && b.dias_semana.length);
  const html = `<form id="f-bloq" class="grade" style="gap:14px" novalidate>
    ${adm ? `<div class="campo"><label for="b-quem">De quem é a agenda</label><select id="b-quem"><option value="">Escolha…</option>
      ${d.mentores.map((m) => `<option value="${m.id}"${m.id === quemInicial ? ' selected' : ''}>${esc(m.nome)}</option>`).join('')}
      <option value="recesso"${quemInicial === 'recesso' ? ' selected' : ''}>Toda a equipe (recesso da Mentorei)</option></select></div>` : ''}
    <div class="campo" id="b-tipo-caixa"><span class="rotulo">O que é *</span><div class="linha">
      ${[...Object.entries(CATEGORIAS).filter(([k]) => k !== 'outro'), ['ferias', 'Férias / folga'], ['outro', 'Outro']].map(([k, r]) => `<label class="check"><input type="radio" name="b-cat" value="${k}"${(b.tipo === 'ferias' ? 'ferias' : b.categoria) === k ? ' checked' : ''}><span>${r}</span></label>`).join('')}</div>
      <input type="text" id="b-cat-outro" class="mt" aria-label="Escreva o que é" placeholder="Escreva o que é (ex.: gravação de conteúdo)" value="${esc(b.categoria_texto || '')}"${b.categoria === 'outro' ? '' : ' hidden'}></div>
    <div class="grade g2" style="gap:10px"><div class="campo"><label for="b-de">De</label><input type="date" id="b-de" value="${de}"></div>
      <div class="campo"><label for="b-ate" id="b-ate-rot">Até</label><input type="date" id="b-ate" value="${ate}"></div></div>
    <div class="campo"><span class="rotulo">Horário</span><div class="linha">
      <label class="check"><input type="radio" name="b-modo" value="dia"${modo === 'dia' ? ' checked' : ''}><span>Dia inteiro</span></label>
      <label class="check"><input type="radio" name="b-modo" value="periodos"${modo === 'periodos' ? ' checked' : ''}><span>Manhã, tarde ou noite</span></label>
      <label class="check"><input type="radio" name="b-modo" value="hora"${modo === 'hora' ? ' checked' : ''}><span>Horário exato</span></label></div>
      <div class="linha mt" id="b-periodos"${modo === 'periodos' ? '' : ' hidden'}>${PERIODOS.map((p) => `<label class="check"><input type="checkbox" value="${p}"${(b.periodos || []).length < 3 && (b.periodos || []).includes(p) ? ' checked' : ''}><span>${NOME_PERIODO[p]}</span></label>`).join('')}</div>
      <div class="linha mt" id="b-horas"${modo === 'hora' ? '' : ' hidden'}><input type="time" id="b-hi" aria-label="Das" value="${b.hora_inicio ? String(b.hora_inicio).slice(0, 5) : '14:00'}" style="width:auto"><span>até</span>
        <input type="time" id="b-hf" aria-label="Até" value="${b.hora_fim ? String(b.hora_fim).slice(0, 5) : '16:00'}" style="width:auto"></div></div>
    <div class="campo"><label class="check"><input type="checkbox" id="b-repete"${repete ? ' checked' : ''}><span>Repetir toda semana (ex.: toda terça à tarde, até a data do campo "Até")</span></label>
      <div class="linha mt" id="b-dias"${repete ? '' : ' hidden'}>${ORDEM_SEMANA.map((n) => `<label class="check"><input type="checkbox" value="${n}"${(b.dias_semana || []).map(Number).includes(n) ? ' checked' : ''}><span>${SEMANA_LONGA[n].slice(0, 3)}</span></label>`).join('')}</div></div>
    <div class="campo"><label for="b-motivo" id="b-motivo-rot"></label><input type="text" id="b-motivo" value="${esc(b.motivo || '')}"></div>
    <div id="b-choques"></div>
    <div class="linha"><button class="btn pri" type="submit" id="b-salvar"></button>${b.id ? '<button class="btn perigo" type="button" id="b-apagar">Apagar</button>' : ''}</div>
  </form>`;
  const titulo = b.id ? 'Mudar bloqueio' : ehRecesso ? 'Novo recesso da Mentorei' : adm ? 'Bloquear agenda' : 'Pedir bloqueio de agenda';
  const j = janela(titulo, html, { largura: 620 });
  const f = j.corpo.querySelector('#f-bloq');
  const $ = (s) => f.querySelector(s);
  const quem = () => (adm ? $('#b-quem').value : ctx.perfil.id);

  const ler = () => {
    const q = quem();
    const rec = q === 'recesso';
    const modoAt = (f.querySelector('input[name=b-modo]:checked') || {}).value || 'dia';
    const cat = (f.querySelector('input[name=b-cat]:checked') || {}).value || '';
    const periodos = modoAt === 'periodos' ? [...$('#b-periodos').querySelectorAll('input:checked')].map((c) => c.value)
      : modoAt === 'hora' ? periodosDoIntervalo(horaDoTexto($('#b-hi').value), horaDoTexto($('#b-hf').value)) : [...PERIODOS];
    return {
      mentor_id: rec ? null : q || null, tipo: rec ? 'recesso' : cat === 'ferias' ? 'ferias' : 'bloqueio',
      categoria: rec || cat === 'ferias' ? null : cat || null, categoria_texto: !rec && cat === 'outro' ? ($('#b-cat-outro').value.trim() || null) : null,
      inicio: $('#b-de').value, fim: $('#b-ate').value || $('#b-de').value,
      dias_semana: $('#b-repete').checked ? [...$('#b-dias').querySelectorAll('input:checked')].map((c) => Number(c.value)) : null,
      periodos, hora_inicio: modoAt === 'hora' ? $('#b-hi').value : null, hora_fim: modoAt === 'hora' ? $('#b-hf').value : null,
      motivo: $('#b-motivo').value.trim() || null, _modo: modoAt, id: b.id,
    };
  };
  const atualizar = () => {
    const l = ler();
    const rec = l.tipo === 'recesso';
    $('#b-tipo-caixa').hidden = rec;
    $('#b-cat-outro').hidden = l.categoria !== 'outro';
    $('#b-periodos').hidden = l._modo !== 'periodos';
    $('#b-horas').hidden = l._modo !== 'hora';
    $('#b-dias').hidden = !$('#b-repete').checked;
    $('#b-ate-rot').textContent = $('#b-repete').checked ? 'Repetir até' : 'Até';
    $('#b-motivo-rot').textContent = rec ? 'Nome do recesso (ex.: Fim de ano)' : `Detalhes (opcional · só ${adm && l.mentor_id !== ctx.perfil.id ? 'o mentor e a coordenação veem' : 'você e a coordenação veem'})`;
    $('#b-motivo').placeholder = rec ? 'Fim de ano' : 'Ex.: consulta médica, preparar o material da turma A';
    $('#b-salvar').textContent = b.id ? 'Salvar' : rec ? 'Criar recesso' : adm ? 'Bloquear' : 'Bloquear e avisar a coordenação';
    const mentores = rec ? d.mentores : d.mentores.filter((m) => m.id === l.mentor_id);
    const lista = l.inicio && l.fim >= l.inicio && mentores.length ? choquesBloq(d.idx, mentores, l) : [];
    $('#b-choques').innerHTML = lista.length ? `<div class="aviso"><b>Atenção: ${lista.length === 1 ? 'já existe 1 compromisso' : `já existem ${lista.length} compromissos`} nesse período.</b>
      ${lista.length === 1 ? 'Ele continua marcado' : 'Eles continuam marcados'}: ${adm ? 'remarque o que for preciso.' : 'a coordenação vai ver e combinar com você o que remarcar.'}
      <ul class="peq">${lista.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}${lista.length > 8 ? `<li>e mais ${lista.length - 8}</li>` : ''}</ul></div>` : '';
  };
  f.addEventListener('input', atualizar);
  f.addEventListener('change', atualizar);
  $('#b-repete').addEventListener('change', () => {
    if ($('#b-repete').checked && !$('#b-dias').querySelector('input:checked') && $('#b-de').value) {
      const n = diaDaSemana($('#b-de').value); const c = $('#b-dias').querySelector(`input[value="${n}"]`); if (c) c.checked = true;
      if ($('#b-ate').value === $('#b-de').value) $('#b-ate').value = somarDias($('#b-de').value, 90);
    }
    atualizar();
  });
  atualizar();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const l = ler();
    if (l.tipo !== 'recesso' && !l.mentor_id) { avisar('Escolha de quem é a agenda.', true); return; }
    if (l.tipo === 'bloqueio' && !l.categoria) { avisar('Marque o que é: pessoal, tempo de criação, tempo operacional, reunião entre mentores, férias ou outro.', true); return; }
    if (l.categoria === 'outro' && !l.categoria_texto) { avisar('Escreva o que é, no campo ao lado de "Outro".', true); return; }
    if (!l.inicio) { avisar('Escolha o dia.', true); return; }
    if (l.fim < l.inicio) { avisar('A data final vem antes da inicial.', true); return; }
    if (l._modo === 'periodos' && !l.periodos.length) { avisar('Marque manhã, tarde ou noite.', true); return; }
    if (l._modo === 'hora' && !(horaDoTexto(l.hora_fim) > horaDoTexto(l.hora_inicio))) { avisar('O horário final precisa ser depois do inicial.', true); return; }
    if (l.dias_semana && !l.dias_semana.length) { avisar('Marque em que dias da semana o bloqueio se repete.', true); return; }
    if (diasEntre(l.inicio, l.fim) > 400) { avisar('Use um período de no máximo um ano.', true); return; }
    const linha = { mentor_id: l.mentor_id, tipo: l.tipo, inicio: l.inicio, fim: l.fim, dias_semana: l.dias_semana, periodos: l.periodos,
      hora_inicio: l.hora_inicio, hora_fim: l.hora_fim, motivo: l.motivo, categoria: l.categoria, categoria_texto: l.categoria_texto };
    if (adm) linha.visto_em = new Date().toISOString();
    const btn = $('#b-salvar'); btn.disabled = true;
    const gravar = (x) => (b.id ? sb.from('agenda_bloqueios').update(x).eq('id', b.id).select('id').single() : sb.from('agenda_bloqueios').insert(x).select('id').single());
    let r = await gravar(linha);
    if (r.error && /categoria/.test(r.error.message || '')) { // sem o script 15: o tipo vai junto com os detalhes
      const { categoria, categoria_texto, ...resto } = linha;
      if (l.tipo === 'bloqueio') resto.motivo = [rotuloBloqueio(l), l.motivo].filter(Boolean).join(' · ');
      r = await gravar(resto);
    }
    if (r.error) { btn.disabled = false; avisar(faltaScript(r.error) ? 'A coordenação ainda precisa terminar de preparar a agenda (script 14 no Supabase).' : explicarErro(r.error), true); return; }
    limparCache(); avisarGoogle();
    if (!adm) {
      btn.textContent = 'Avisando a coordenação…';
      const res = await api('/api/agenda-email', { acao: 'aviso-bloqueio', bloqueio_id: r.data.id });
      avisar(res.enviado ? 'Bloqueio salvo. A coordenação recebeu um e-mail e também vê o aviso na agenda.' : 'Bloqueio salvo. A coordenação vê o aviso na agenda da plataforma.');
    } else avisar(l.tipo === 'recesso' ? 'Recesso criado para toda a equipe.' : 'Agenda bloqueada.');
    j.fechar(); aoSalvar();
  });
  $('#b-apagar')?.addEventListener('click', async () => {
    if (!window.confirm('Apagar este bloqueio? O horário volta a ficar livre.')) return;
    const { error } = await sb.from('agenda_bloqueios').delete().eq('id', b.id);
    if (error) { avisar(explicarErro(error), true); return; }
    limparCache(); avisarGoogle(); avisar('Bloqueio apagado.'); j.fechar(); aoSalvar();
  });
}

function htmlBloqueiosDoMentor(ctx, d, mentor) {
  const h = hoje();
  const lista = d.bloqueios.filter((b) => b.mentor_id === mentor.id && b.fim >= h).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const meu = mentor.id === ctx.perfil.id;
  return `<div class="cartao" style="margin-top:0"><div class="linha"><h3 style="flex:1">${meu ? 'Meus bloqueios' : 'Bloqueios'}</h3>
    <button class="btn peq" type="button" data-novo-bloqueio="${mentor.id}">+ ${meu && !ctx.ehAdmin ? 'Pedir bloqueio' : 'Bloquear'}</button></div>
    ${lista.length ? `<div class="lista mt">${lista.map((b) => `<button type="button" class="item ag-item-bloq" data-editar-bloqueio="${b.id}" style="grid-template-columns:auto 1fr auto;text-align:left;font:inherit;cursor:pointer">
      ${amostra(b.tipo)}<span style="min-width:0"><span class="nome">${esc(rotuloBloqueio(b))}${b.motivo ? ` · ${esc(b.motivo)}` : ''}</span><br><span class="info">${esc(descreverBloqueio(b))}</span></span><span class="peq apagado">Mudar</span></button>`).join('')}</div>`
      : `<p class="apagado mt">Nenhum bloqueio${d.faltaScript ? ' (a agenda ainda está sendo preparada)' : ''}.</p>`}</div>`;
}
function ligarBloqueiosDoMentor(ctx, d, raiz, mentor, recarregar) {
  raiz.addEventListener('click', (ev) => {
    const n = ev.target.closest('[data-novo-bloqueio]');
    if (n) { abrirBloqueio(ctx, d, { mentorId: mentor.id }, recarregar); return; }
    const e = ev.target.closest('[data-editar-bloqueio]');
    if (e) abrirBloqueio(ctx, d, { bloqueio: d.bloqueios.find((b) => b.id === e.dataset.editarBloqueio) }, recarregar);
  });
}

// ---------- dias de atendimento ----------
function htmlDisponibilidade(ctx, mentor) {
  const disp = dispDe(mentor);
  const padrao = !(mentor.disponibilidade && Object.keys(mentor.disponibilidade).length);
  const meu = mentor.id === ctx.perfil.id;
  const editavel = ctx.ehAdmin || meu;
  return `<div class="cartao" style="margin-top:0"><h3>${meu ? 'Meus dias de atendimento' : 'Dias de atendimento'}</h3>
    <p class="peq apagado">${meu ? 'Marque quando você pode atender.' : `Quando ${esc(primeiroNome(mentor.nome))} pode atender.`} Fora disso a agenda mostra "não atende" e a busca de horário não oferece.
      ${padrao ? '<br><b>Ainda não informado:</b> por enquanto vale segunda a sexta, manhã, tarde e noite.' : ''}</p>
    <div class="tabela"><table class="ag-disp mt" data-disp="${mentor.id}"><tr><th></th>${PERIODOS.map((p) => `<th>${NOME_PERIODO[p]}</th>`).join('')}</tr>
      ${ORDEM_SEMANA.map((n) => `<tr><th>${SEMANA_LONGA[n]}</th>${PERIODOS.map((p) => `<td><input type="checkbox" data-dia="${n}" data-p="${p}" aria-label="${SEMANA_LONGA[n]}, ${NOME_PERIODO[p].toLowerCase()}"${(disp[n] || disp[String(n)] || []).includes(p) ? ' checked' : ''}${editavel ? '' : ' disabled'}></td>`).join('')}</tr>`).join('')}</table></div></div>`;
}
function ligarDisponibilidade(raiz, mentor, recarregar) {
  const tabela = raiz.querySelector(`[data-disp="${mentor.id}"]`);
  if (!tabela) return;
  let timer;
  tabela.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const disp = {};
      tabela.querySelectorAll('input[data-dia]').forEach((c) => { if (c.checked) (disp[c.dataset.dia] = disp[c.dataset.dia] || []).push(c.dataset.p); });
      const { error } = await sb.from('perfis').update({ disponibilidade: disp }).eq('id', mentor.id);
      if (error) { avisar(faltaScript(error) ? 'A agenda ainda está sendo preparada: falta rodar o script 14 no Supabase.' : explicarErro(error), true); return; }
      mentor.disponibilidade = disp; limparCache();
      avisar('Dias de atendimento salvos.');
      recarregar();
    }, 900);
  });
}

// ---------- encaixar ----------
function abaEncaixar(ctx, el, d, recarregar) {
  if (!enc.de || enc.de < hoje()) { enc.de = somarDias(hoje(), 1); enc.ate = somarDias(hoje(), 30); }
  el.innerHTML = `
    <div class="cartao"><h3>Onde cabe mais um compromisso?</h3>
      <p class="peq apagado">Escolha os dias e o período. A plataforma confere a agenda de cada mentor, os dias de atendimento, os bloqueios, os pré-bloqueios e os dias de deslocamento.</p>
      <form id="f-enc" class="grade g3 mt" style="gap:12px;align-items:end">
        <div class="campo"><label for="e-de">De</label><input type="date" id="e-de" value="${enc.de}"></div>
        <div class="campo"><label for="e-ate">Até</label><input type="date" id="e-ate" value="${enc.ate}"></div>
        <div class="campo"><label for="e-quantos">Quantos mentores</label><input type="number" id="e-quantos" min="1" max="6" value="${enc.quantos}"></div>
        <div class="campo"><span class="rotulo">Formato</span><div class="linha">
          <label class="check"><input type="radio" name="e-formato" value="online"${enc.formato === 'online' ? ' checked' : ''}><span>Online</span></label>
          <label class="check"><input type="radio" name="e-formato" value="presencial"${enc.formato === 'presencial' ? ' checked' : ''}><span>Presencial (dia inteiro)</span></label></div></div>
        <div class="campo" id="e-per-caixa"><span class="rotulo">Período</span><div class="linha">${PERIODOS.map((p) => `<label class="check"><input type="checkbox" name="e-per" value="${p}"${enc.periodos.includes(p) ? ' checked' : ''}><span>${NOME_PERIODO[p]}</span></label>`).join('')}</div></div>
        <div class="campo"><span class="rotulo">Dias da semana</span><div class="linha">${ORDEM_SEMANA.map((n) => `<label class="check"><input type="checkbox" name="e-dia" value="${n}"${enc.dias.includes(n) ? ' checked' : ''}><span>${SEMANA_LONGA[n].slice(0, 3)}</span></label>`).join('')}</div></div>
        <label class="check"><input type="checkbox" id="e-grupo"${enc.soGrupo ? ' checked' : ''}><span>Só quem atende turmas</span></label>
        <label class="check"><input type="checkbox" id="e-gente"${enc.soComGente ? ' checked' : ''}><span>Mostrar só os dias em que dá</span></label>
      </form></div>
    <div id="e-res" class="mt"></div>`;
  const f = el.querySelector('#f-enc');
  const res = el.querySelector('#e-res');
  const ler = () => {
    enc.de = f.querySelector('#e-de').value; enc.ate = f.querySelector('#e-ate').value;
    enc.quantos = Math.max(1, Number(f.querySelector('#e-quantos').value) || 1);
    enc.formato = (f.querySelector('input[name=e-formato]:checked') || {}).value || 'online';
    enc.periodos = [...f.querySelectorAll('input[name=e-per]:checked')].map((c) => c.value);
    enc.dias = [...f.querySelectorAll('input[name=e-dia]:checked')].map((c) => Number(c.value));
    enc.soGrupo = f.querySelector('#e-grupo').checked; enc.soComGente = f.querySelector('#e-gente').checked;
    f.querySelector('#e-per-caixa').hidden = enc.formato === 'presencial';
  };
  const calcular = () => {
    ler();
    if (!enc.de || !enc.ate || enc.ate < enc.de) { res.innerHTML = '<div class="vazio">Escolha o primeiro e o último dia.</div>'; return; }
    if (enc.formato === 'online' && !enc.periodos.length) { res.innerHTML = '<div class="vazio">Marque pelo menos um período (manhã, tarde ou noite).</div>'; return; }
    const pers = enc.formato === 'presencial' ? [...PERIODOS] : enc.periodos;
    const equipe = d.mentores.filter((m) => !enc.soGrupo || m.atende_grupo);
    const todos = listaDias(enc.de, enc.ate);
    const dias = todos.slice(0, 92).filter((dia) => enc.dias.includes(diaDaSemana(dia)));
    const cartoes = [];
    for (const dia of dias) {
      const linhas = equipe.map((m) => ({ m, ...situacaoParaEncaixe(d.idx, m, dia, pers, enc.formato) }));
      const livres = linhas.filter((x) => x.livre);
      if (enc.soComGente && livres.length < enc.quantos) continue;
      const ocupados = linhas.filter((x) => !x.livre);
      const f2 = feriadoDe(dia);
      cartoes.push(`<div class="cartao ag-enc${livres.length >= enc.quantos ? ' ok' : ''}" data-dia="${dia}">
        <div class="linha"><h4 style="flex:1">${SEMANA_LONGA[diaDaSemana(dia)]}, ${ddmm(dia)} ${f2 ? `<span class="selo alerta">Feriado: ${esc(f2)}</span>` : ''}</h4>
          <span class="selo ${livres.length >= enc.quantos ? '' : 'neutro'}">${livres.length} livre${livres.length === 1 ? '' : 's'}</span>
          ${livres.length ? `<button class="btn peq pri" type="button" data-pre="${dia}">Pré-bloquear</button>` : ''}</div>
        ${livres.length ? `<div class="chips mt">${livres.map((x) => `<label class="ag-chip-m${x.avisos.length ? ' aviso' : ''}"><input type="checkbox" value="${x.m.id}"><span>${esc(x.m.nome)}${x.avisos.length ? ' ⚠' : ''}</span></label>`).join('')}</div>
          ${livres.some((x) => x.avisos.length) ? `<ul class="peq mt ag-enc-avisos">${livres.filter((x) => x.avisos.length).map((x) => `<li><b>${esc(primeiroNome(x.m.nome))}:</b> ${esc(x.avisos.join('; '))}</li>`).join('')}</ul>` : ''}
          <p class="peq apagado mt">Marque quem vai e clique em Pré-bloquear (sem marcar ninguém, entram todos os livres).</p>` : '<p class="apagado mt">Ninguém livre.</p>'}
        ${ocupados.length ? `<details class="mt"><summary class="peq">Ocupados ou fora do horário (${ocupados.length})</summary><ul class="peq">${ocupados.map((x) => `<li><b>${esc(primeiroNome(x.m.nome))}:</b> ${x.fora && !x.ocupando.length ? 'não atende nesse dia ou período' : esc(x.ocupando.map((e) => `${e.ini ? `${horaBR(new Date(e.ini).toISOString())} ` : ''}${e.titulo}`).join('; '))}</li>`).join('')}</ul></details>` : ''}
      </div>`);
    }
    res.innerHTML = `${todos.length > 92 ? '<div class="aviso">Mostrando só os primeiros 3 meses do período.</div>' : ''}
      ${!equipe.length ? '<div class="vazio">Nenhum mentor atende turmas. Desmarque "Só quem atende turmas" ou ajuste o tipo de atendimento em Mentores.</div>'
        : cartoes.length ? `<div class="grade g2">${cartoes.join('')}</div>` : `<div class="vazio">Nenhum dia com ${enc.quantos} mentor${enc.quantos > 1 ? 'es' : ''} livre${enc.quantos > 1 ? 's' : ''} nesse período.</div>`}`;
  };
  f.addEventListener('input', calcular);
  f.addEventListener('change', calcular);
  res.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-pre]'); if (!b) return;
    const card = b.closest('.ag-enc');
    let ids = [...card.querySelectorAll('.ag-chip-m input:checked')].map((c) => c.value);
    if (!ids.length) ids = [...card.querySelectorAll('.ag-chip-m input')].map((c) => c.value);
    const { abrirReserva } = await import('./agenda-reservas.js');
    abrirReserva(ctx, d, { dias: [{ dia: b.dataset.pre, periodos: enc.formato === 'presencial' ? [...PERIODOS] : enc.periodos }], mentores: ids, formato: enc.formato }, recarregar);
  });
  calcular();
}

// ---------- bloqueios da equipe e recessos ----------
function abaBloqueios(ctx, el, d, recarregar) {
  const h = hoje();
  const nome = (id) => (d.mentores.find((m) => m.id === id) || {}).nome || 'Mentor';
  const novos = d.bloqueios.filter((b) => b.mentor_id && !b.visto_em && b.fim >= h).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const proximos = d.bloqueios.filter((b) => b.mentor_id && b.fim >= h).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const recessos = d.bloqueios.filter((b) => !b.mentor_id && b.fim >= h).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const fer = listaDias(h, somarDias(h, 365)).map((dia) => [dia, feriadoDe(dia)]).filter(([, f]) => f);
  const linhaBloq = (b) => `<tr class="clicavel" data-editar-bloqueio="${b.id}"><td>${amostra(b.tipo)} <b>${esc(nome(b.mentor_id))}</b></td><td>${esc(descreverBloqueio(b))}</td>
    <td>${esc(rotuloBloqueio(b))}</td><td class="peq">${esc(b.motivo || '—')}</td><td class="peq apagado">${diaMes(b.criado_em)}${b.criado_por === b.mentor_id ? ' · pelo mentor' : ''}</td></tr>`;
  el.innerHTML = `
    ${novos.length ? `<div class="cartao pend-bloco urgente"><div class="linha"><h3 style="flex:1">Bloqueios novos pedidos pelos mentores <span class="selo erro">${novos.length}</span></h3>
      <button class="btn peq" type="button" id="ciente-todos">Estou ciente de todos</button></div>
      <div class="lista mt">${novos.map((b) => {
        const lista = choquesBloq(d.idx, d.mentores.filter((m) => m.id === b.mentor_id), b);
        return `<div class="item" style="grid-template-columns:auto 1fr auto">${amostra(b.tipo)}<div style="min-width:0"><div class="nome">${esc(nome(b.mentor_id))} · ${esc(rotuloBloqueio(b))}</div>
          <div class="info">${esc(descreverBloqueio(b))}${b.motivo ? ` · ${esc(b.motivo)}` : ''}</div>
          ${lista.length ? `<div class="peq" style="color:var(--erro)">Choca com: ${esc(lista.slice(0, 3).join('; '))}${lista.length > 3 ? '…' : ''}</div>` : ''}</div>
          <button class="btn peq" type="button" data-ciente="${b.id}">Ciente</button></div>`;
      }).join('')}</div></div>` : ''}
    <div class="cartao"><div class="linha"><h3 style="flex:1">Próximos bloqueios da equipe</h3><button class="btn peq" type="button" id="bloq-novo">+ Bloquear agenda de um mentor</button></div>
      ${proximos.length ? `<div class="tabela mt"><table><tr><th>Mentor</th><th>Quando</th><th>O que é</th><th>Detalhes</th><th>Pedido em</th></tr>${proximos.map(linhaBloq).join('')}</table></div>
        <p class="peq apagado mt">Clique numa linha para mudar ou apagar.</p>` : '<p class="apagado mt">Nenhum bloqueio marcado.</p>'}</div>
    <div class="cartao"><div class="linha"><h3 style="flex:1">Recessos da Mentorei</h3><button class="btn peq" type="button" id="recesso-novo">+ Novo recesso</button></div>
      <p class="peq apagado">Valem para toda a equipe (ex.: fim de ano).</p>
      ${recessos.length ? `<div class="lista mt">${recessos.map((b) => `<button type="button" class="item" data-editar-bloqueio="${b.id}" style="grid-template-columns:auto 1fr auto;text-align:left;font:inherit;cursor:pointer">
        ${amostra('recesso')}<span><span class="nome">${esc(b.motivo || 'Recesso')}</span><br><span class="info">${esc(descreverBloqueio(b))}</span></span><span class="peq apagado">Mudar</span></button>`).join('')}</div>` : '<p class="apagado mt">Nenhum recesso marcado.</p>'}</div>
    <div class="cartao"><h3>Feriados nacionais nos próximos 12 meses</h3><p class="peq apagado">Já aparecem sozinhos na agenda. Feriados da cidade do cliente podem ser marcados como recesso.</p>
      <div class="chips mt">${fer.map(([dia, f]) => `<span class="chip" style="background:var(--bg);color:var(--texto)">${diaCurto(dia)} · ${esc(f)}</span>`).join('')}</div></div>`;
  const ciente = async (ids) => {
    const { error } = await sb.from('agenda_bloqueios').update({ visto_em: new Date().toISOString() }).in('id', ids);
    if (error) { avisar(explicarErro(error), true); return; }
    limparCache(); recarregar();
  };
  el.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-ciente]'); if (c) { ciente([c.dataset.ciente]); return; }
    if (ev.target.id === 'ciente-todos') { ciente(novos.map((b) => b.id)); return; }
    if (ev.target.id === 'bloq-novo') { abrirBloqueio(ctx, d, {}, recarregar); return; }
    if (ev.target.id === 'recesso-novo') { abrirBloqueio(ctx, d, { recesso: true }, recarregar); return; }
    const e = ev.target.closest('[data-editar-bloqueio]');
    if (e) abrirBloqueio(ctx, d, { bloqueio: d.bloqueios.find((b) => b.id === e.dataset.editarBloqueio) }, recarregar);
  });
}

// ---------- viagens ----------
function abaViagens(ctx, el, d, recarregar) {
  if (!d.temExtras) { el.innerHTML = '<div class="vazio">As viagens aparecem aqui depois que o script 14 for rodado no Supabase.</div>'; return; }
  const h = hoje(), lim15 = somarDias(h, 15);
  const nome = (id) => (d.mentores.find((m) => m.id === id) || {}).nome || 'Mentor';
  const mods = d.modulos.filter((m) => m.formato === 'presencial' && m.data_hora && diaDe(m.data_hora) >= h).sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  const possiveis = d.reservas.filter((r) => r.formato === 'presencial' && (r.situacao === 'pre' || r.situacao === 'confirmada') && (r.datas || []).some((x) => x.dia >= h));
  el.innerHTML = `
    <p class="peq apagado" style="margin-bottom:12px">Cada aula presencial reserva sozinha a véspera e o dia seguinte de quem viaja. Se o mentor for da mesma cidade, desmarque "Precisa de deslocamento".</p>
    ${mods.length ? mods.map((m) => {
      const dia = diaDe(m.data_hora);
      const t = m.turma || {};
      return `<div class="cartao"><div class="linha"><div style="flex:1;min-width:220px"><h3>${diaCurto(dia)} · ${esc(t.nome || 'Turma')} · módulo ${m.numero}</h3>
        <p class="peq apagado">${esc(m.titulo || '')}${t.empresa ? ` · ${esc(t.empresa.nome)}` : ''}${m.local ? ` · ${esc(m.local)}` : ' · local a definir'}</p></div><a class="btn peq" href="#/modulo/${m.id}">Abrir módulo</a></div>
        ${m.mentores.length ? m.mentores.map((v) => {
          const pend = v.com_deslocamento !== false && !(v.viagem && v.viagem.passagem && v.viagem.hotel);
          return `<div class="ag-viagem-linha mt"><div class="linha"><b>${esc(nome(v.mentor_id))}</b>${pend ? `<span class="selo ${dia <= lim15 ? 'erro' : 'alerta'}">${dia <= lim15 ? 'Pendente · faltam poucos dias' : 'Pendente'}</span>` : v.com_deslocamento === false ? '<span class="selo neutro">Sem deslocamento</span>' : '<span class="selo">Tudo certo</span>'}</div>${formViagem(m, v, true)}</div>`;
        }).join('') : '<p class="apagado mt">Nenhum mentor definido neste módulo.</p>'}</div>`;
    }).join('') : '<div class="vazio">Nenhuma aula presencial marcada daqui para frente.</div>'}
    ${possiveis.length ? `<h3 class="mt2">Possíveis viagens (pré-bloqueios presenciais)</h3><div class="lista mt">${possiveis.map((r) => `<a class="item" href="#/agenda/pre" style="grid-template-columns:auto 1fr">
      ${amostra(r.situacao === 'confirmada' ? 'reservado' : 'pre')}<span><span class="nome">${esc(r.titulo)}</span><br><span class="info">${esc((r.empresa && r.empresa.nome) || r.cliente || '')}${r.local ? ` · ${esc(r.local)}` : ''} · ${(r.datas || []).map((x) => ddmm(x.dia)).join(', ')} · ${esc((r.mentores || []).filter((x) => x.resposta !== 'recusado').map((x) => primeiroNome(nome(x.mentor_id))).join(', '))}</span></span></a>`).join('')}</div>` : ''}`;
  ligarViagens(el, d, () => {});
}

// ---------- celular e e-mail ----------
async function abaCelular(ctx, el, d) {
  el.innerHTML = `<div class="cartao"><h3>Convites na Google Agenda</h3><div id="google-convites" class="mt"><p class="peq apagado">Carregando…</p></div></div>
    <div class="cartao"><h3>Resumo da semana por e-mail</h3><div id="resumo" class="mt"><p class="peq apagado">Carregando…</p></div></div>
    ${ctx.atende ? '<div id="celular" class="mt"></div>' : ''}`;
  if (ctx.atende) cartaoCelular(ctx, el.querySelector('#celular'));
  cartaoConvites(ctx, el.querySelector('#google-convites'));
  const box = el.querySelector('#resumo');
  const [{ data: cfg, error }, st] = await Promise.all([
    sb.from('configuracoes').select('valor').eq('chave', 'resumo_semanal').maybeSingle(),
    api('/api/agenda-email', { acao: 'status' }),
  ]);
  if (error) { box.innerHTML = `<p class="peq">${faltaScript(error) ? 'Disponível depois que o script 14 for rodado no Supabase.' : esc(explicarErro(error))}</p>`; return; }
  const ligado = !!(cfg && cfg.valor && cfg.valor.ligado);
  const usando = d.mentores.filter((m) => m.termo_aceito_em).length;
  box.innerHTML = `<p class="peq">Toda sexta-feira, às 9h, cada mentor que já usa a plataforma recebe por e-mail a própria agenda da semana seguinte. A coordenação recebe um resumo da equipe:
      pré-bloqueios para resolver, respostas, bloqueios novos e viagens pendentes.</p>
    <p class="peq apagado mt">Hoje ${usando === 1 ? '1 mentor já usa' : `${usando} mentores já usam`} a plataforma. Quem ainda não entrou não recebe.</p>
    <label class="check mt"><input type="checkbox" id="resumo-ligado"${ligado ? ' checked' : ''}><span><b>Enviar o resumo toda sexta-feira</b></span></label>
    <p class="peq mt">${st.ok && st.email ? '<span class="selo">E-mail pronto para enviar</span>' : st.ok ? '<span class="selo alerta">Falta cadastrar a chave do Brevo na Netlify</span> Sem ela, os avisos continuam aparecendo na plataforma, mas nenhum e-mail sai.' : '<span class="selo neutro">Não consegui conferir o envio de e-mail agora</span>'}</p>
    <button class="btn mt" type="button" id="resumo-teste">Enviar um teste agora para mim</button>`;
  box.querySelector('#resumo-ligado').addEventListener('change', async (ev) => {
    const { error: e } = await sb.from('configuracoes').upsert({ chave: 'resumo_semanal', valor: { ligado: ev.target.checked }, atualizado_em: new Date().toISOString() });
    if (e) { avisar(explicarErro(e), true); ev.target.checked = !ev.target.checked; return; }
    avisar(ev.target.checked ? 'Resumo semanal ligado: sai toda sexta às 9h, com a semana seguinte.' : 'Resumo semanal desligado.');
  });
  box.querySelector('#resumo-teste').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    const r = await api('/api/agenda-email', { acao: 'teste-resumo' });
    avisar(r.ok ? `Enviado para ${ctx.perfil.email}. Confira a caixa de entrada (e o spam).` : (r.mensagem || 'Não foi possível enviar.'), !r.ok);
    btn.disabled = false;
  });
}

// Convites automáticos na Google Agenda (equipe e mentorados) e conferência de convites duplicados.
async function cartaoConvites(ctx, box) {
  const st = await api('/api/google-sync', { acao: 'status' });
  if (!st.ok) { box.innerHTML = `<p class="peq">${esc(st.mensagem || 'Não consegui conferir a ligação com a Google Agenda agora.')}</p>`; return; }
  if (!st.conectado) { box.innerHTML = '<p class="peq">Primeiro conecte a conta Google da coordenação no <a href="#/painel">Painel</a> (cartão "Google Agenda").</p>'; return; }
  const u = st.ultimo;
  const quando = u && u.em ? new Date(u.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  box.innerHTML = `
    <p class="peq">A conta <b>${esc(st.conta || '')}</b> cria um convite para cada compromisso da plataforma e chama os envolvidos. Assim tudo aparece na Google Agenda
      (e no celular) de cada um. Quando algo muda aqui, o mesmo convite muda junto, sem duplicar. Se algo sai da agenda, o convite é cancelado.</p>
    <ul class="peq" style="margin:8px 0 0 18px"><li><b>Equipe:</b> sessões que conduz, aulas das turmas, dias de deslocamento, bloqueios, férias, recessos e pré-bloqueios.</li>
      <li><b>Mentorados:</b> as próprias sessões (só quem tem e-mail na ficha e não recusou e-mails).</li></ul>
    ${st.script ? '' : '<div class="aviso erro mt">Falta rodar o script <b>17-google-convites.sql</b> no Supabase para ligar os convites.</div>'}
    <label class="check mt"><input type="checkbox" id="g-equipe"${st.equipe ? ' checked' : ''}${st.script ? '' : ' disabled'}><span><b>Mandar convites para a equipe</b></span></label>
    <label class="check mt"><input type="checkbox" id="g-mentorados"${st.mentorados ? ' checked' : ''}${st.script ? '' : ' disabled'}><span><b>Mandar convites para os mentorados</b></span></label>
    <p class="peq apagado mt">Ao ligar, cada pessoa recebe por e-mail um convite para cada compromisso daqui para frente (pode ser bastante coisa de uma vez).
      Convites que já existiam na agenda da coordenação são aproveitados, não duplicados.</p>
    ${quando ? `<p class="peq mt"><b>Última conferência:</b> ${quando} · ${u.criados || 0} criados, ${u.atualizados || 0} atualizados, ${u.adotados || 0} aproveitados, ${u.apagados || 0} cancelados${u.pendentes ? ` · ${u.pendentes} ainda na fila` : ''}.</p>
      ${(u.semPermissao || []).length ? `<div class="aviso mt">${u.semPermissao.length} convite(s) foram criados por outra conta Google e não podem ser mudados por aqui: ${esc([...new Set(u.semPermissao.map((x) => x.organizador))].join(', '))}.</div>` : ''}
      ${(u.semEmail || []).length ? `<p class="peq apagado mt">Mentorados sem e-mail na ficha (não recebem convite): ${esc(u.semEmail.join(', '))}.</p>` : ''}
      ${(u.erros || []).length ? `<p class="peq mt" style="color:var(--erro)">${u.erros.length} erro(s): ${esc(u.erros.slice(0, 3).join('; '))}</p>` : ''}` : ''}
    <div class="linha mt"><button class="btn" type="button" id="g-tudo"${(st.equipe || st.mentorados) ? '' : ' disabled'}>Sincronizar agora</button>
      <button class="btn" type="button" id="g-conferir">Procurar convites duplicados</button></div>
    <div id="g-lista" class="mt"></div>`;
  const salvarCfg = async () => {
    const equipe = box.querySelector('#g-equipe').checked, mentorados = box.querySelector('#g-mentorados').checked;
    const ligando = (equipe && !st.equipe) || (mentorados && !st.mentorados);
    if (ligando && !window.confirm('Ligar os convites? A Google Agenda vai mandar por e-mail um convite para cada compromisso daqui para frente.')) {
      box.querySelector('#g-equipe').checked = st.equipe; box.querySelector('#g-mentorados').checked = st.mentorados; return;
    }
    const { error } = await sb.from('configuracoes').upsert({ chave: 'google_convites', valor: { equipe, mentorados }, atualizado_em: new Date().toISOString() });
    if (error) { avisar(explicarErro(error), true); return; }
    st.equipe = equipe; st.mentorados = mentorados;
    box.querySelector('#g-tudo').disabled = !(equipe || mentorados);
    if (equipe || mentorados) { await api('/api/google-sync', { acao: 'tudo' }); avisar('Convites ligados. A primeira sincronização leva alguns minutos.'); }
    else avisar('Convites desligados. Os que já foram enviados continuam na agenda das pessoas.');
  };
  box.querySelector('#g-equipe').addEventListener('change', salvarCfg);
  box.querySelector('#g-mentorados').addEventListener('change', salvarCfg);
  box.querySelector('#g-tudo').addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    await api('/api/google-sync', { acao: 'tudo' });
    avisar('Sincronização pedida. Em alguns minutos a Google Agenda fica em dia.');
  });
  box.querySelector('#g-conferir').addEventListener('click', async (ev) => {
    const lista = box.querySelector('#g-lista');
    const btn = ev.currentTarget;
    btn.disabled = true;
    lista.innerHTML = '<p class="peq apagado">Conferindo a Google Agenda (de 30 dias atrás a 4 meses à frente)…</p>';
    const r = await api('/api/google-sync', { acao: 'conferir' });
    btn.disabled = false;
    if (r.erro || !r.ok) { lista.innerHTML = `<div class="aviso erro">${esc(r.erro || r.mensagem || 'Não consegui conferir agora.')}</div>`; return; }
    if (!r.achados.length) { lista.innerHTML = '<div class="aviso ok">Nenhum convite duplicado ou em horário antigo. Tudo certo.</div>'; return; }
    const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    lista.innerHTML = `<p class="peq"><b>${r.achados.length} convite(s) para conferir.</b> Marque os que devem ser apagados. Os convidados recebem o aviso de cancelamento.</p>
      <div class="lista mt">${r.achados.map((x) => `<label class="ag-res-mentor" style="grid-template-columns:auto 1fr">
        <input type="checkbox" value="${esc(x.id)}"${x.podeApagar ? (x.motivo.startsWith('Repetido') ? ' checked' : '') : ' disabled'}>
        <span><b>${esc(dataHora(x.inicio))}</b> · ${esc(x.titulo)}${x.recorrente ? ' <span class="selo neutro">recorrente · protegido</span>' : ''}<br>
          <span class="peq apagado">${esc(x.motivo)}${x.podeApagar || x.recorrente ? '' : ` · criado por ${esc(x.organizador)}: só essa conta apaga`}</span></span></label>`).join('')}</div>
      <p class="peq apagado mt">Convites recorrentes (as séries semanais dos mentorados) nunca são apagados por aqui.</p>
      <div class="linha mt"><button class="btn perigo" type="button" id="g-apagar">Apagar os marcados</button></div>`;
    lista.querySelector('#g-apagar').addEventListener('click', async (e2) => {
      const ids = [...lista.querySelectorAll('input:checked')].map((c) => c.value);
      if (!ids.length) { avisar('Marque pelo menos um convite.', true); return; }
      if (!window.confirm(`Apagar ${ids.length} convite(s) da Google Agenda? Os convidados recebem o cancelamento.`)) return;
      const btn2 = e2.currentTarget;
      btn2.disabled = true;
      const a = await api('/api/google-sync', { acao: 'apagar', ids });
      if (!a.ok || a.erro) { avisar(a.erro || a.mensagem || 'Não consegui apagar.', true); btn2.disabled = false; return; }
      avisar(`${a.apagados} convite(s) apagado(s).${a.protegidos && a.protegidos.length ? ` ${a.protegidos.length} recorrente(s) protegido(s), não apagados.` : ''}${a.erros && a.erros.length ? ` ${a.erros.length} não deram certo.` : ''}`);
      box.querySelector('#g-conferir').click();
    });
  });
}

export async function cartaoCelular(ctx, el) {
  el.innerHTML = '<div class="cartao"><h3>Agenda no celular</h3><p class="peq apagado mt">Carregando…</p></div>';
  const { data, error } = await sb.from('agenda_links').select('token').eq('perfil_id', ctx.perfil.id).maybeSingle();
  if (error) { el.innerHTML = faltaScript(error) ? '' : `<div class="cartao"><h3>Agenda no celular</h3><p class="peq mt">${esc(explicarErro(error))}</p></div>`; return; }
  const desenhar = (token) => {
    const url = token ? `${location.origin}/api/agenda-celular/${token}.ics` : '';
    el.innerHTML = `<div class="cartao"><h3>Agenda no celular</h3>
      <p class="peq mt">Ligue uma vez e seus compromissos da Mentorei aparecem sozinhos na agenda do celular (Google Agenda ou iPhone): sessões, aulas, deslocamentos, bloqueios e pré-bloqueios.
        A agenda do celular se atualiza algumas vezes por dia (não é na hora).</p>
      ${token ? `<div class="campo mt"><label for="cel-url">Seu link pessoal (não compartilhe)</label><div class="linha"><input type="text" readonly value="${esc(url)}" id="cel-url" style="flex:1;min-width:200px">
          <button class="btn pri" type="button" id="cel-copiar">Copiar link</button></div></div>
        <details class="mt"><summary><b>Como ligar no Google Agenda</b> (Android e computador)</summary><ol class="peq">
          <li>Clique em <b>Copiar link</b>, aqui em cima.</li>
          <li>No computador, abra <b>calendar.google.com</b> com a sua conta Google.</li>
          <li>Na coluna da esquerda, ao lado de <b>Outras agendas</b>, clique no <b>+</b> e depois em <b>Do URL</b>.</li>
          <li>Cole o link e clique em <b>Adicionar agenda</b>. Em alguns minutos ela aparece também no aplicativo do celular.</li></ol></details>
        <details class="mt"><summary><b>Como ligar no iPhone</b></summary><ol class="peq">
          <li>Abra esta página no próprio iPhone e toque em <b>Abrir no iPhone</b>. Confirme em <b>Assinar</b>.</li>
          <li>Se não abrir: Ajustes → Calendário → Contas → Adicionar Conta → Outra → <b>Adicionar Calendário Assinado</b> → cole o link.</li></ol>
          <a class="btn mt" href="${esc(url.replace(/^https?:/, 'webcal:'))}">Abrir no iPhone</a></details>
        <p class="peq apagado mt">Se o link cair em mãos erradas, <button type="button" class="btn peq" id="cel-trocar">troque o link</button>: o antigo para de funcionar.</p>`
        : '<button class="btn pri mt" type="button" id="cel-criar">Criar o meu link</button>'}</div>`;
    el.querySelector('#cel-copiar')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); avisar('Link copiado.'); } catch (_) { el.querySelector('#cel-url').select(); avisar('Selecionei o link: aperte Ctrl + C para copiar.'); }
    });
    const criar = async () => {
      await sb.from('agenda_links').delete().eq('perfil_id', ctx.perfil.id);
      const r = await sb.from('agenda_links').insert({ perfil_id: ctx.perfil.id }).select('token').single();
      if (r.error) { avisar(explicarErro(r.error), true); return; }
      desenhar(r.data.token);
    };
    el.querySelector('#cel-criar')?.addEventListener('click', criar);
    el.querySelector('#cel-trocar')?.addEventListener('click', () => { if (window.confirm('Trocar o link? O link antigo para de funcionar e você precisa ligar a agenda de novo no celular.')) criar(); });
  };
  desenhar(data && data.token);
}

// ---------- tela do mentor ----------
async function telaMentor(ctx, el, d) {
  const eu = d.mentores[0];
  const recarregar = () => ctx.irPara('#/agenda');
  const convites = d.reservas.filter((r) => r.situacao === 'pre' || r.situacao === 'confirmada')
    .map((r) => ({ r, x: (r.mentores || []).find((x) => x.mentor_id === eu.id) })).filter((c) => c.x && c.x.resposta === 'aguardando');
  const descDatas = (r) => (r.datas || []).slice().sort((a, b) => a.dia.localeCompare(b.dia)).map((x) => `${diaCurto(x.dia)} · ${x.hora_inicio && r.formato !== 'presencial' ? `${String(x.hora_inicio).slice(0, 5)}${x.duracao_min ? ` (${x.duracao_min} min)` : ''}` : (x.periodos || []).length === 3 || r.formato === 'presencial' ? 'dia inteiro' : (x.periodos || []).map((p) => NOME_PERIODO[p].toLowerCase()).join(' e ')}`);
  el.innerHTML = `
    <div class="cab"><div><h1>Minha agenda</h1><p class="sub">Seus compromissos, dias livres, deslocamentos e bloqueios. Só você e a coordenação veem.</p></div>
      <div class="acoes"><button class="btn pri" type="button" id="pedir">+ Pedir bloqueio</button></div></div>
    ${d.faltaScript ? '<div class="aviso" style="margin-bottom:14px">A agenda ainda está sendo preparada pela coordenação: por enquanto ela mostra só as suas sessões e aulas.</div>' : ''}
    ${convites.length ? `<div class="cartao pend-bloco urgente"><h3>Pré-bloqueios esperando a sua resposta <span class="selo erro">${convites.length}</span></h3>
      <p class="peq apagado">A coordenação reservou estas datas na sua agenda para um cliente. Você consegue?</p>
      <div class="lista mt">${convites.map(({ r, x }) => `<div class="item ag-convite" style="grid-template-columns:1fr" data-token="${x.token}">
        <div><div class="nome">${esc(r.titulo)}</div><div class="info">${esc((r.empresa && r.empresa.nome) || r.cliente || '')} · ${r.formato === 'presencial' ? `presencial${r.local ? ` em ${esc(r.local)}` : ''}${r.com_deslocamento !== false ? ' (com a véspera e o dia seguinte para o deslocamento)' : ''}` : 'online'}</div>
          <ul class="peq mt">${descDatas(r).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>${r.observacoes ? `<p class="peq mt">${esc(r.observacoes)}</p>` : ''}</div>
        <div class="linha"><button class="btn pri" type="button" data-resp="aceito">Aceito</button><button class="btn" type="button" data-resp="recusado">Não posso</button>
          <input type="text" data-coment placeholder="Comentário (opcional)" aria-label="Comentário" style="flex:1;min-width:180px"></div></div>`).join('')}</div></div>` : ''}
    <div id="mes" class="mt"></div>
    ${legenda()}
    <div id="celular" class="mt2"></div>`;
  el.querySelector('#pedir').addEventListener('click', () => abrirBloqueio(ctx, d, { mentorId: eu.id }, recarregar));
  el.querySelectorAll('.ag-convite').forEach((c) => c.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-resp]'); if (!b) return;
    b.disabled = true;
    const r = await api('/api/reserva-resposta', { t: c.dataset.token, resposta: b.dataset.resp, comentario: c.querySelector('[data-coment]').value.trim() });
    if (!r.ok) { avisar(r.mensagem || 'Não foi possível responder agora.', true); b.disabled = false; return; }
    avisar(b.dataset.resp === 'aceito' ? 'Pronto! Aceito. A coordenação já foi avisada.' : 'Resposta enviada à coordenação.');
    recarregar();
  }));
  vistaMes(ctx, el.querySelector('#mes'), d, d.idx, eu, { recarregar });
  cartaoCelular(ctx, el.querySelector('#celular'));
}
