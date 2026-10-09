// Agenda: leitura do banco (cada um só recebe o que as regras de acesso permitem), janelas e peças comuns das telas.
import { sb, esc, avatar } from '../base.js';
import { montarEventos, indexar, choques, diaDe, horaDe, periodosDoIntervalo, PERIODOS, NOME_PERIODO, ESTADOS, TIPOS, estadoPeriodo, dispDe, ordenar,
  feriadoDe, situacaoParaEncaixe, diaCurto, horaTexto, moduloPresencial, isoDe, somarDias, hoje } from '../agenda-regras.js';

// Tabela ou coluna que ainda não existe (o script 14 ainda não foi rodado no Supabase).
export const faltaScript = (e) => !!e && /does not exist|Could not find|schema cache|42P01|42703|PGRST20[45]/i.test(`${e.code || ''} ${e.message || ''}`);

const SEL_MENTOR = 'id, nome, foto_url, email, whatsapp, papel, tambem_mentor, atende_individual, atende_grupo, termo_aceito_em';

export async function carregarAgenda(ctx) {
  const eu = ctx.perfil.id;
  let falta = false;
  const tentar = async (consulta, padrao = []) => {
    const r = await consulta;
    if (r.error) { if (faltaScript(r.error)) { falta = true; return padrao; } throw r.error; }
    return r.data || padrao;
  };

  let mentores;
  if (ctx.ehAdmin) {
    const base = () => sb.from('perfis').select(`${SEL_MENTOR}, disponibilidade`).or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome');
    let r = await base();
    if (r.error && faltaScript(r.error)) {
      falta = true;
      r = await sb.from('perfis').select(SEL_MENTOR).or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome');
    }
    if (r.error) throw r.error;
    mentores = r.data || [];
  } else {
    mentores = [ctx.perfil];
  }

  let qs = sb.from('sessoes').select('id, numero, data_hora, duracao_min, situacao, mentor_id, mentorado:mentorados(id, nome, status, programa:programas(id, nome, duracao_min, empresa:empresas(id, nome)))')
    .not('data_hora', 'is', null);
  if (!ctx.ehAdmin) qs = qs.eq('mentor_id', eu);
  // reuniões (script 18): sem a tabela, a agenda segue sem elas
  const lerReunioes = async () => { const r = await sb.from('agenda_reunioes').select('*'); return r.error ? null : (r.data || []); };
  // próximos contatos de venda (script 19; só a administração enxerga)
  const lerContatos = async () => { if (!ctx.ehAdmin) return []; const r = await sb.from('oportunidades').select('id, titulo, etapa, proximo_contato_em, proximo_contato_por, proximo_contato_obs, empresa:empresas(nome)').not('proximo_contato_em', 'is', null); return r.error ? [] : (r.data || []); };
  // agenda pessoal de cada um (script 24; o mentor recebe só a dele): sem a tabela, segue sem ela
  const lerPessoais = async () => {
    const out = [];
    for (let de = 0; de < 30000; de += 1000) {   // o Supabase entrega no máximo 1000 linhas por pedido
      const r = await sb.from('agenda_pessoal').select('id, perfil_id, titulo, inicio, fim, dia_inteiro, local, link, organizador, organizador_email, resposta, ocupa, particular, interno')
        .gte('fim', isoDe(somarDias(hoje(), -60))).order('inicio').order('id').range(de, de + 999);
      if (r.error) return out;
      out.push(...(r.data || []));
      if (!r.data || r.data.length < 1000) break;
    }
    return out;
  };
  // entregas do checklist (script 25; o mentor recebe só as dele ou as que criou): sem a tabela, segue sem elas
  const lerAtividades = async () => {
    const r = await sb.from('atividades').select('id, titulo, grupo, vinculo_nome, responsaveis, responsaveis_nomes, prazo, prazo_hora, situacao')
      .eq('situacao', 'aberta').not('prazo', 'is', null);
    return r.error ? [] : (r.data || []).filter((a) => ctx.ehAdmin || (a.responsaveis || []).includes(eu));
  };
  const [sessoes, modulosBase, extras, bloqueios, reservas, reunioes, contatos, pessoais, atividades] = await Promise.all([
    tentar(qs),
    tentar(sb.from('modulos').select('id, numero, titulo, data_hora, duracao_min, formato, local, link, turma:turmas(id, nome, status, empresa:empresas(id, nome)), mentores:modulo_mentores(mentor_id)')),
    tentar(sb.from('modulo_mentores').select('modulo_id, mentor_id, com_deslocamento, viagem'), null),
    tentar(sb.from('agenda_bloqueios').select('*')),
    tentar(sb.from('agenda_reservas').select('*, empresa:empresas(id, nome), datas:agenda_reserva_datas(*), mentores:agenda_reserva_mentores(*)')),
    lerReunioes(),
    lerContatos(),
    lerPessoais(),
    lerAtividades(),
  ]);
  const extra = new Map((extras || []).map((x) => [`${x.modulo_id}|${x.mentor_id}`, x]));
  // formato e cidade da turma (script 15); sem o script, segue sem essa informação
  // quem paga e quem compra as viagens, padrão da turma (script 25); sem ele, cada viagem fica só com o que tiver
  const [tf, tv] = await Promise.all([sb.from('turmas').select('id, formato, local'), sb.from('turmas').select('id, viagem_padrao')]);
  const formatos = new Map(((!tf.error && tf.data) || []).map((t) => [t.id, t]));
  const padroes = new Map(((!tv.error && tv.data) || []).map((t) => [t.id, t.viagem_padrao || {}]));
  const modulos = modulosBase.map((m) => ({ ...m,
    turma: m.turma ? { ...m.turma, formato: (formatos.get(m.turma.id) || {}).formato || null, local: (formatos.get(m.turma.id) || {}).local || null, viagem_padrao: padroes.get(m.turma.id) || {} } : m.turma,
    mentores: (m.mentores || []).map((v) => ({ com_deslocamento: true, viagem: {}, ...v, ...(extra.get(`${m.id}|${v.mentor_id}`) || {}) })) }));
  // sessão futura de quem foi desligado do programa não ocupa a agenda
  const sess = sessoes.filter((s) => !(s.mentorado && s.mentorado.status === 'desligado' && s.situacao === 'agendada'));
  const eventos = montarEventos({ sessoes: sess, modulos, bloqueios, reservas, reunioes: reunioes || [], contatos, pessoais, atividades });
  return { mentores, sessoes: sess, modulos, bloqueios, reservas, reunioes: reunioes || [], temReunioes: reunioes !== null, pessoais, atividades,
    eventos, idx: indexar(eventos), faltaScript: falta, temExtras: extras !== null };
}

// Mesma leitura, guardada por um minuto (para conferir choques ao remarcar ou marcar módulos).
let cache = null, cacheEm = 0, cacheDe = null;
export async function agendaEmCache(ctx) {
  if (cache && cacheDe === ctx.perfil.id && Date.now() - cacheEm < 60000) return cache;
  cache = await carregarAgenda(ctx); cacheEm = Date.now(); cacheDe = ctx.perfil.id;
  return cache;
}
export const limparCache = () => { cache = null; };

// Choques de um compromisso novo (ou remarcado) com a agenda de cada mentor. Devolve frases prontas.
export async function verificarChoques(ctx, { mentorIds = [], inicio, duracaoMin = 60, formato = 'online', ignorar = null }) {
  if (!inicio || !mentorIds.length) return [];
  let d;
  try { d = await agendaEmCache(ctx); } catch (_) { return []; }
  const h = horaDe(inicio), ini = new Date(inicio).getTime();
  const novo = { dia: diaDe(inicio), ini, fim: ini + duracaoMin * 60000, periodos: periodosDoIntervalo(h, Math.min(24, h + duracaoMin / 60)), formato, ignorar };
  return mentorIds.flatMap((id) => {
    const m = d.mentores.find((x) => x.id === id);
    return m ? choques(d.idx, m, novo) : [];
  });
}

// Confere módulos (recém-criados ou mudados) contra a agenda: feriados, recessos, choques de cada mentor e,
// quando o módulo ainda não tem mentor, se há alguém da equipe de turmas livre. Devolve só os que têm conflito.
// modulos: [{ id?, numero?, titulo?, data_hora, duracao_min?, formato, mentorIds[] }]
export async function conferirModulos(ctx, modulos) {
  limparCache();
  let d;
  try { d = await agendaEmCache(ctx); } catch (_) { return []; }
  const out = [];
  for (const m of modulos) {
    if (!m.data_hora) continue;
    const presencial = moduloPresencial(m);
    const dur = Number(m.duracao_min) || (presencial ? 240 : 120);
    const h = horaDe(m.data_hora), ini = new Date(m.data_hora).getTime();
    const dia = diaDe(m.data_hora);
    const novo = { dia, ini, fim: ini + dur * 60000, periodos: periodosDoIntervalo(h, Math.min(24, h + dur / 60)), formato: presencial ? 'presencial' : 'online', ignorar: m.id || null };
    const avisos = [];
    const f = feriadoDe(dia);
    if (f) avisos.push(`${diaCurto(dia)} é feriado (${f}).`);
    (d.idx.todos.get(dia) || []).filter((e) => e.tipo === 'recesso').forEach((e) => avisos.push(`${diaCurto(dia)} está no recesso da Mentorei (${e.titulo}).`));
    const ids = m.mentorIds || [];
    if (ids.length) {
      for (const id of ids) {
        const mentor = d.mentores.find((x) => x.id === id);
        if (mentor) choques(d.idx, mentor, novo).filter((x) => !/ é feriado /.test(x)).forEach((x) => avisos.push(x));
      }
    } else {
      const equipe = d.mentores.filter((x) => x.atende_grupo);
      const livres = equipe.filter((x) => situacaoParaEncaixe(d.idx, x, dia, novo.periodos, novo.formato).livre);
      if (equipe.length && !livres.length) avisos.push(`Ninguém da equipe de turmas está livre em ${diaCurto(dia)} nesse horário.`);
    }
    if (avisos.length) {
      out.push({ titulo: `${m.numero ? `Módulo ${m.numero}` : 'Módulo'}${m.titulo ? ` · ${m.titulo}` : ''}`, quando: `${diaCurto(dia)} às ${horaTexto(h)}`, avisos: [...new Set(avisos)] });
    }
  }
  return out;
}

// Mensagem de conflito: a coordenação clica em "Ok" e sabe que precisa olhar a agenda nessas datas.
export function mostrarConflitos(lista, { titulo = 'Atenção: conflito na agenda', intro = '', aoFechar = null } = {}) {
  const j = janela(titulo, `${intro ? `<p>${esc(intro)}</p>` : ''}
    <div class="lista mt">${lista.map((x) => `<div class="ag-bloco"><b>${esc(x.quando)}</b> · ${esc(x.titulo)}
      <ul class="peq" style="margin:6px 0 0 18px">${x.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`).join('')}</div>
    <p class="peq apagado mt">Nada foi mudado na agenda: confira essas datas e ajuste o que for preciso.</p>
    <div class="linha mt2"><button class="btn pri" type="button" data-fechar>Ok, vou olhar na agenda</button><a class="btn" href="#/agenda" data-ir-agenda>Abrir a agenda</a></div>`,
  { largura: 640, aoFechar });
  j.corpo.querySelector('[data-ir-agenda]').addEventListener('click', () => j.fechar());
  return j;
}

// ---------- servidor da plataforma ----------
export async function api(caminho, corpo) {
  const { data: { session } } = await sb.auth.getSession();
  try {
    const r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session ? session.access_token : ''}` }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, ...j };
  } catch (_) { return { ok: false, mensagem: 'Sem conexão com o servidor da plataforma.' }; }
}

// Depois de mudar algo na agenda, pede ao servidor para acertar os convites da Google Agenda (se estiverem ligados).
let timerGoogle = null;
export function avisarGoogle() {
  clearTimeout(timerGoogle);
  timerGoogle = setTimeout(() => { api('/api/google-sync', {}).catch(() => {}); }, 1500);
}

// ---------- janela por cima da tela ----------
export function janela(titulo, html, { largura = 600, aoFechar = null } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'janela-fundo';
  fundo.innerHTML = `<div class="cartao janela" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:${largura}px">
    <div class="linha"><h3 style="flex:1">${esc(titulo)}</h3><button class="btn peq" data-fechar type="button">Fechar</button></div>
    <div class="janela-corpo mt">${html}</div></div>`;
  document.body.appendChild(fundo);
  const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
  function fechar() { if (!fundo.isConnected) return; fundo.remove(); document.removeEventListener('keydown', tecla); if (aoFechar) aoFechar(); }
  document.addEventListener('keydown', tecla);
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });
  return { fundo, corpo: fundo.querySelector('.janela-corpo'), fechar };
}

// ---------- peças de desenho ----------
export const primeiroNome = (n) => String(n || '').split(' ')[0];
export const amostra = (tipo) => `<i class="ag-amostra ag-${tipo}" aria-hidden="true"></i>`;

export function legenda(tipos = ['livre', 'individual', 'turma', 'presencial', 'reuniao', 'pessoal', 'atividade', 'deslocamento', 'pre', 'reservado', 'bloqueio', 'feriado', 'fora']) {
  return `<div class="ag-legenda">${tipos.map((t) => `<span>${amostra(t)}${esc(ESTADOS[t])}</span>`).join('')}</div>`;
}

// Os três períodos (manhã, tarde, noite) de um mentor num dia.
export function estadosDoDia(idx, mentor, dia) {
  const evs = idx.doDia(mentor.id, dia);
  const disp = dispDe(mentor);
  return PERIODOS.map((p) => ({ periodo: p, ...estadoPeriodo(evs, p, disp, dia) }));
}

export const dicaEstados = (estados) => estados.map((s) => `${NOME_PERIODO[s.periodo]}: ${s.eventos.length ? s.eventos.map((e) => e.titulo).join('; ') : ESTADOS[s.tipo]}`).join('\n');

export function linhaEvento(e, { horaFn } = {}) {
  const hora = e.ini && horaFn ? `<b>${horaFn(new Date(e.ini).toISOString())}</b> ` : '';
  return `<div class="ag-evento">${amostra(e.tipo)}<div style="min-width:0"><div>${hora}${esc(e.titulo)}</div><div class="peq apagado">${esc(e.sub || TIPOS[e.tipo].nome)}</div></div>
    ${e.link && e.link !== '#/agenda/pre' ? `<a class="btn peq" href="${esc(e.link)}">Abrir</a>` : ''}</div>`;
}

export const pessoa = (m) => `<span class="linha" style="gap:8px;flex-wrap:nowrap">${avatar(m)}<span>${esc(m.nome)}</span></span>`;

export { ordenar };
