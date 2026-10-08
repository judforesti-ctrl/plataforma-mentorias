// Regras da agenda, sem tela e sem banco: dias, períodos, feriados, deslocamento, quem está livre e choques de horário.
// Usado pelas telas (navegador) e pelas funções do servidor (resumo por e-mail, agenda no celular).
// Horário de Brasília fixo (UTC−3, sem horário de verão), como no resto da plataforma.

export const PERIODOS = ['manha', 'tarde', 'noite'];
export const NOME_PERIODO = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
export const LETRA_PERIODO = { manha: 'M', tarde: 'T', noite: 'N' };
const LIMITES = { manha: [0, 12], tarde: [12, 18], noite: [18, 24] };
const FUSO_MS = 3 * 3600 * 1000;

// Tipos do que aparece na agenda: nome e "peso" (o mais forte pinta o período quando há mais de um).
export const TIPOS = {
  individual: { nome: 'Mentoria individual', peso: 5, firme: true },
  turma: { nome: 'Turma online', peso: 5, firme: true },
  presencial: { nome: 'Turma presencial', peso: 5, firme: true },
  reservado: { nome: 'Reservado (cliente confirmou)', peso: 5, firme: true },
  reuniao: { nome: 'Reunião', peso: 5, firme: true },
  contato: { nome: 'Contato de venda', peso: 1, firme: false },
  pre: { nome: 'Pré-bloqueio', peso: 4, firme: false },
  deslocamento: { nome: 'Deslocamento', peso: 3, firme: false },
  bloqueio: { nome: 'Bloqueio do mentor', peso: 6, firme: true },
  ferias: { nome: 'Férias', peso: 6, firme: true },
  recesso: { nome: 'Recesso da Mentorei', peso: 6, firme: true },
  feriado: { nome: 'Feriado', peso: 2, firme: false },
};
export const ESTADOS = {
  livre: 'Livre', fora: 'Não atende', ...Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, v.nome])),
};

// ---------- dias ----------
export const diaDe = (iso) => new Date(new Date(iso).getTime() - FUSO_MS).toISOString().slice(0, 10);
export const horaDe = (iso) => { const d = new Date(new Date(iso).getTime() - FUSO_MS); return d.getUTCHours() + d.getUTCMinutes() / 60; };
export const hoje = () => diaDe(new Date().toISOString());
export const somarDias = (dia, n) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export const isoDe = (dia, hora = '00:00') => new Date(`${dia}T${String(hora).slice(0, 5)}:00-03:00`).toISOString();
export const segundaDaSemana = (dia) => somarDias(dia, -((diaDaSemana(dia) + 6) % 7));
export function listaDias(de, ate) {
  const out = [];
  for (let d = de; d <= ate && out.length < 1200; d = somarDias(d, 1)) out.push(d);
  return out;
}
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeSemana = (dia, longo = false) => (longo ? SEMANA_LONGA : SEMANA)[diaDaSemana(dia)];
export const nomeMes = (mes) => MESES[mes - 1];
export const ddmm = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
export const diaCurto = (dia) => `${nomeSemana(dia)}, ${ddmm(dia)}`;
export const horaTexto = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

// ---------- períodos ----------
export const periodoDaHora = (h) => (h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite');
export function periodosDoIntervalo(hIni, hFim) {
  if (!(hFim > hIni)) return [periodoDaHora(hIni)];
  return PERIODOS.filter((p) => hIni < LIMITES[p][1] && hFim > LIMITES[p][0]);
}
export const horaDoTexto = (t) => {
  if (t == null || String(t).trim() === '') return null;
  const [h, m] = String(t).split(':').map(Number);
  return Number.isFinite(h) ? h + (m || 0) / 60 : null;
};
// horário de início sugerido quando só o período foi escolhido
export const HORA_PADRAO = { manha: '09:00', tarde: '14:00', noite: '19:00' };

// ---------- feriados nacionais ----------
function pascoa(ano) { // cálculo de Meeus/Butcher
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
export function feriados(ano) {
  const p = pascoa(ano);
  return {
    [`${ano}-01-01`]: 'Confraternização Universal', [somarDias(p, -48)]: 'Carnaval', [somarDias(p, -47)]: 'Carnaval',
    [somarDias(p, -2)]: 'Sexta-feira Santa', [`${ano}-04-21`]: 'Tiradentes', [`${ano}-05-01`]: 'Dia do Trabalho',
    [somarDias(p, 60)]: 'Corpus Christi', [`${ano}-09-07`]: 'Independência do Brasil', [`${ano}-10-12`]: 'Nossa Senhora Aparecida',
    [`${ano}-11-02`]: 'Finados', [`${ano}-11-15`]: 'Proclamação da República', [`${ano}-11-20`]: 'Dia da Consciência Negra',
    [`${ano}-12-25`]: 'Natal',
  };
}
const cacheFeriados = {};
export const feriadoDe = (dia) => { const a = Number(dia.slice(0, 4)); if (!cacheFeriados[a]) cacheFeriados[a] = feriados(a); return cacheFeriados[a][dia] || null; };

// ---------- dias de atendimento ----------
export const DISP_PADRAO = { 1: [...PERIODOS], 2: [...PERIODOS], 3: [...PERIODOS], 4: [...PERIODOS], 5: [...PERIODOS] };
export const dispDe = (perfil) => (perfil && perfil.disponibilidade && Object.keys(perfil.disponibilidade).length ? perfil.disponibilidade : DISP_PADRAO);
export const atendeEm = (disp, dia, periodo) => (disp[diaDaSemana(dia)] || disp[String(diaDaSemana(dia))] || []).includes(periodo);

// ---------- montar os itens da agenda ----------
// Cada item: { id, tipo, origem, mentores[], todos, dia, periodos[], ini, fim (ms, quando tem horário), titulo, sub,
//              empresa, empresaId, formato, local, link, horas, dados }
const nomeEmpresa = (e) => (e && e.nome) || '';
const DUR_MODULO = { online: 120, presencial: 240 };

// Tipo do bloqueio pedido pelo mentor (o que aparece na agenda e no aviso para a coordenação).
export const CATEGORIAS = { pessoal: 'Pessoal', criacao: 'Tempo de criação', operacional: 'Tempo operacional', reuniao: 'Reunião entre mentores', outro: 'Outro' };
export function rotuloBloqueio(b) {
  if (b.tipo === 'recesso') return `Recesso${b.motivo ? ` · ${b.motivo}` : ''}`;
  if (b.tipo === 'ferias') return 'Férias / folga';
  if (b.categoria === 'outro') return b.categoria_texto || 'Outro';
  return CATEGORIAS[b.categoria] || 'Bloqueio';
}
// Módulo com local "a definir" segue o formato da turma (quando a turma é toda presencial).
export const moduloPresencial = (md) => md.formato === 'presencial' || (md.formato === 'indefinido' && !!md.turma && md.turma.formato === 'presencial');

// Quem participa de uma reunião, em texto curto: "Cintia, Juliana + 2 convidados de fora".
export function quemDaReuniao(r) {
  const nomes = (r.participantes_nomes || []).map((n) => String(n || '').split(' ')[0]).filter(Boolean);
  const n = (r.convidados || []).length;
  return [nomes.join(', '), n ? `${n} convidado${n > 1 ? 's' : ''} de fora` : ''].filter(Boolean).join(' + ');
}

export function montarEventos({ sessoes = [], modulos = [], bloqueios = [], reservas = [], reunioes = [], contatos = [] } = {}, { de, ate } = {}) {
  de = de || somarDias(hoje(), -400);
  ate = ate || somarDias(hoje(), 400);
  const out = [];
  const comHorario = (iso, min) => { const ini = new Date(iso).getTime(); return { ini, fim: ini + min * 60000, dia: diaDe(iso), periodos: periodosDoIntervalo(horaDe(iso), Math.min(24, horaDe(iso) + min / 60)) }; };

  // sessões individuais (quem conduz)
  for (const s of sessoes) {
    if (!s.data_hora || !s.mentor_id || s.situacao === 'cancelada') continue;
    const m = s.mentorado || {}, prog = m.programa || {};
    const min = s.duracao_min || prog.duracao_min || 50;
    const h = comHorario(s.data_hora, min);
    out.push({ id: `sessao-${s.id}`, tipo: 'individual', origem: s, mentores: [s.mentor_id], todos: false, ...h,
      titulo: `Mentoria · ${m.nome || 'mentorado'}`, sub: `Sessão ${s.numero}${nomeEmpresa(prog.empresa) ? ` · ${nomeEmpresa(prog.empresa)}` : ''}`,
      empresa: nomeEmpresa(prog.empresa), empresaId: prog.empresa && prog.empresa.id, formato: 'online', link: `#/sessao/${s.id}`, horas: min / 60 });
  }

  // módulos das turmas (presencial ocupa o dia todo e gera o deslocamento da véspera e do dia seguinte)
  for (const md of modulos) {
    if (!md.data_hora) continue;
    const t = md.turma || {};
    const presencial = moduloPresencial(md);
    const min = md.duracao_min || DUR_MODULO[presencial ? 'presencial' : 'online'];
    const h = comHorario(md.data_hora, min);
    const vinc = md.mentores || [];
    const local = md.local || (presencial && t.local) || '';
    const base = { empresa: nomeEmpresa(t.empresa), empresaId: t.empresa && t.empresa.id, link: `#/modulo/${md.id}`, local };
    out.push({ id: `modulo-${md.id}`, tipo: presencial ? 'presencial' : 'turma', origem: md, mentores: vinc.map((v) => v.mentor_id), todos: false, ...h,
      ...(presencial ? { periodos: [...PERIODOS], diaInteiro: true } : {}),
      titulo: `${t.nome || 'Turma'} · módulo ${md.numero}`, sub: `${md.titulo || ''}${base.empresa ? ` · ${base.empresa}` : ''}${presencial && local ? ` · ${local}` : ''}`,
      formato: presencial ? 'presencial' : 'online', horas: min / 60, ...base });
    if (presencial) {
      for (const v of vinc) {
        if (v.com_deslocamento === false) continue;
        for (const [k, quando] of [[-1, 'véspera'], [1, 'volta']]) {
          out.push({ id: `desloc-${md.id}-${v.mentor_id}-${k}`, tipo: 'deslocamento', origem: md, mentores: [v.mentor_id], todos: false,
            dia: somarDias(h.dia, k), periodos: [...PERIODOS], ini: null, fim: null, diaInteiro: true,
            titulo: `Deslocamento (${quando})`, sub: `${t.nome || 'Turma'} · módulo ${md.numero}${local ? ` · ${local}` : ''}`,
            formato: 'presencial', horas: 0, ...base });
        }
      }
    }
  }

  // bloqueios, férias e recessos (com repetição semanal)
  for (const b of bloqueios) {
    const ini = b.inicio > de ? b.inicio : de, fim = b.fim < ate ? b.fim : ate;
    const dias = (b.dias_semana && b.dias_semana.length) ? b.dias_semana.map(Number) : null;
    const hi = horaDoTexto(b.hora_inicio), hf = horaDoTexto(b.hora_fim);
    const periodos = hi != null ? periodosDoIntervalo(hi, hf != null ? hf : hi + 1) : (b.periodos && b.periodos.length ? b.periodos : [...PERIODOS]);
    for (const dia of listaDias(ini, fim)) {
      if (dias && !dias.includes(diaDaSemana(dia))) continue;
      const temHora = hi != null;
      out.push({ id: `bloqueio-${b.id}-${dia}`, tipo: b.tipo || 'bloqueio', origem: b, mentores: b.mentor_id ? [b.mentor_id] : [], todos: !b.mentor_id,
        dia, periodos, ini: temHora ? Date.parse(isoDe(dia, b.hora_inicio)) : null, fim: temHora ? Date.parse(isoDe(dia, b.hora_fim || horaTexto(hi + 1))) : null,
        diaInteiro: !temHora && periodos.length === 3,
        titulo: b.tipo === 'recesso' ? rotuloBloqueio(b) : b.tipo === 'ferias' ? 'Férias' : rotuloBloqueio(b) === 'Bloqueio' ? 'Bloqueio' : `Bloqueio · ${rotuloBloqueio(b)}`,
        sub: temHora ? `${String(b.hora_inicio).slice(0, 5)}–${String(b.hora_fim || '').slice(0, 5)}` : periodos.length === 3 ? 'Dia inteiro' : periodos.map((p) => NOME_PERIODO[p]).join(' e '),
        formato: '', horas: 0, link: '' });
    }
  }

  // pré-bloqueios e reservas confirmadas (quem não recusou)
  for (const r of reservas) {
    if (r.situacao === 'liberada' || r.situacao === 'convertida') continue;
    const quem = (r.mentores || []).filter((x) => x.resposta !== 'recusado');
    const presencial = r.formato === 'presencial';
    const tipo = r.situacao === 'confirmada' ? 'reservado' : 'pre';
    const cliente = nomeEmpresa(r.empresa) || r.cliente || '';
    for (const d of r.datas || []) {
      let h = { ini: null, fim: null, periodos: d.periodos && d.periodos.length ? d.periodos : [...PERIODOS] };
      if (d.hora_inicio && !presencial) {
        const iso = isoDe(d.dia, d.hora_inicio);
        h = comHorario(iso, d.duracao_min || 120);
      }
      if (presencial) h = { ini: null, fim: null, periodos: [...PERIODOS] };
      const respostas = Object.fromEntries((r.mentores || []).map((x) => [x.mentor_id, x.resposta]));
      out.push({ id: `reserva-${r.id}-${d.dia}`, tipo, origem: r, mentores: quem.map((x) => x.mentor_id), todos: false, dia: d.dia,
        periodos: h.periodos, ini: h.ini, fim: h.fim, diaInteiro: presencial || h.periodos.length === 3, respostas,
        titulo: `${tipo === 'pre' ? 'Pré-bloqueio' : 'Reservado'} · ${r.titulo}`, sub: `${cliente}${presencial ? ` · presencial${r.local ? ` em ${r.local}` : ''}` : ' · online'}`,
        empresa: cliente, empresaId: r.empresa && r.empresa.id, formato: presencial ? 'presencial' : 'online', local: r.local || '', link: '#/agenda/pre',
        horas: (d.duracao_min || (presencial ? 240 : 120)) / 60 });
      if (presencial && r.com_deslocamento !== false) {
        for (const x of quem) {
          for (const [k, quando] of [[-1, 'véspera'], [1, 'volta']]) {
            out.push({ id: `desloc-res-${r.id}-${d.dia}-${x.mentor_id}-${k}`, tipo: 'deslocamento', provisorio: true, origem: r, mentores: [x.mentor_id], todos: false,
              dia: somarDias(d.dia, k), periodos: [...PERIODOS], ini: null, fim: null, diaInteiro: true,
              titulo: `Deslocamento (${quando}, ${tipo === 'pre' ? 'pré-bloqueio' : 'reservado'})`, sub: `${r.titulo}${r.local ? ` · ${r.local}` : ''}`,
              empresa: cliente, empresaId: r.empresa && r.empresa.id, formato: 'presencial', local: r.local || '', link: '#/agenda/pre', horas: 0 });
          }
        }
      }
    }
  }

  // reuniões marcadas pela plataforma (com clientes, fornecedores ou entre a equipe)
  for (const r of reunioes) {
    if (!r.dia || r.situacao === 'cancelada') continue;
    const hi = horaDoTexto(r.hora_inicio), hf = horaDoTexto(r.hora_fim);
    if (hi == null) continue;
    const ini = Date.parse(isoDe(r.dia, r.hora_inicio)), fim = Date.parse(isoDe(r.dia, r.hora_fim || horaTexto(hi + 1)));
    out.push({ id: `reuniao-${r.id}`, tipo: 'reuniao', origem: r, mentores: r.participantes || [], todos: false, dia: r.dia,
      periodos: periodosDoIntervalo(hi, hf != null ? hf : hi + 1), ini, fim, diaInteiro: false,
      titulo: `Reunião · ${r.titulo}`, sub: quemDaReuniao(r), formato: 'online', link: '', horas: Math.max(0, (fim - ini) / 3600000), meet: r.meet_link || '' });
  }

  // próximos contatos de venda (pipeline): lembrete de 30 minutos na agenda de quem vai fazer o contato
  for (const o of contatos) {
    if (!o.proximo_contato_em || !o.proximo_contato_por || o.etapa === 'fechado' || o.etapa === 'perdido') continue;
    const ini = Date.parse(o.proximo_contato_em), fim = ini + 30 * 60000;
    const h = horaDe(o.proximo_contato_em);
    out.push({ id: `contato-${o.id}`, tipo: 'contato', origem: o, mentores: [o.proximo_contato_por], todos: false, dia: diaDe(o.proximo_contato_em),
      periodos: [periodoDaHora(h)], ini, fim, diaInteiro: false, titulo: `Contato · ${(o.empresa && o.empresa.nome) || o.empresa_nome || 'cliente'}`,
      sub: `${o.titulo || ''}${o.proximo_contato_obs ? ` · ${o.proximo_contato_obs}` : ''}`, formato: '', link: `#/vendas/oportunidade/${o.id}`, horas: 0 });
  }

  // feriados nacionais (valem para todos)
  for (const dia of listaDias(de, ate)) {
    const f = feriadoDe(dia);
    if (f) out.push({ id: `feriado-${dia}`, tipo: 'feriado', mentores: [], todos: true, dia, periodos: [...PERIODOS], ini: null, fim: null, diaInteiro: true,
      titulo: `Feriado · ${f}`, sub: 'Feriado nacional', formato: '', horas: 0, link: '' });
  }
  return out;
}

// Índice por mentor e dia, para consultar rápido.
export function indexar(eventos) {
  const porChave = new Map(), todos = new Map();
  for (const e of eventos) {
    if (e.todos) { if (!todos.has(e.dia)) todos.set(e.dia, []); todos.get(e.dia).push(e); continue; }
    for (const m of e.mentores) {
      const k = `${m}|${e.dia}`;
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k).push(e);
    }
  }
  return { porChave, todos, doDia: (mentorId, dia) => [...(porChave.get(`${mentorId}|${dia}`) || []), ...(todos.get(dia) || [])] };
}

export const ordenar = (evs) => evs.slice().sort((a, b) => (a.ini || 0) - (b.ini || 0) || TIPOS[b.tipo].peso - TIPOS[a.tipo].peso);

// Estado de um período de um mentor num dia: o tipo mais forte do que houver, ou livre / não atende.
export function estadoPeriodo(eventosDoDia, periodo, disp, dia) {
  const evs = eventosDoDia.filter((e) => e.periodos.includes(periodo));
  if (evs.length) {
    const top = evs.reduce((a, b) => (TIPOS[b.tipo].peso > TIPOS[a.tipo].peso ? b : a));
    return { tipo: top.tipo, eventos: ordenar(evs) };
  }
  if (disp && !atendeEm(disp, dia, periodo)) return { tipo: 'fora', eventos: [] };
  return { tipo: 'livre', eventos: [] };
}

// Quem está livre para um novo compromisso num dia e nos períodos pedidos.
// formato "online": dia de deslocamento ainda serve (com aviso). "presencial": precisa do dia livre
// e avisa se a véspera ou o dia seguinte têm compromisso (são os dias de viagem).
export function situacaoParaEncaixe(idx, mentor, dia, periodos, formato) {
  const disp = dispDe(mentor);
  const evs = idx.doDia(mentor.id, dia).filter((e) => e.tipo !== 'feriado');
  const pers = formato === 'presencial' ? PERIODOS : periodos;
  const avisos = [];
  let livre = true, fora = false, foraTodos = 0;
  const ocupando = [];
  for (const p of pers) {
    const st = estadoPeriodo(evs, p, disp, dia);
    if (st.tipo === 'livre') continue;
    if (st.tipo === 'fora') { foraTodos += 1; if (formato !== 'presencial') { fora = true; livre = false; } continue; }
    if (st.tipo === 'deslocamento' && formato === 'online') {
      const t = `em deslocamento (${st.eventos[0].sub})`;
      if (!avisos.includes(t)) avisos.push(t);
      continue;
    }
    livre = false;
    st.eventos.forEach((e) => { if (!ocupando.includes(e)) ocupando.push(e); });
  }
  if (formato === 'presencial') {
    if (foraTodos === PERIODOS.length) { fora = true; livre = false; } // não atende nesse dia da semana
    for (const [k, nome] of [[-1, 'na véspera'], [1, 'no dia seguinte']]) {
      const firmes = idx.doDia(mentor.id, somarDias(dia, k)).filter((e) => TIPOS[e.tipo].firme && e.tipo !== 'recesso');
      if (firmes.length) avisos.push(`tem compromisso ${nome} (dia de viagem): ${firmes[0].titulo}`);
    }
  }
  return { livre, fora, avisos, ocupando };
}

// Choques de um novo compromisso (ou de um compromisso mudado) com o que já existe.
// novo: { dia, ini?, fim? (ms), periodos[], formato, ignorar? (id da sessão, módulo, bloqueio ou pré-bloqueio que está sendo mudado) }
export function choques(idx, mentor, novo) {
  const out = [];
  const nome = (mentor.nome || '').split(' ')[0];
  const ign = (e) => novo.ignorar && e.origem && e.origem.id === novo.ignorar;
  const evs = idx.doDia(mentor.id, novo.dia).filter((e) => !ign(e));
  const presencial = novo.formato === 'presencial';
  const sobrepoe = (e) => {
    if (presencial || e.diaInteiro) return e.periodos.some((p) => (presencial ? PERIODOS : novo.periodos).includes(p));
    if (novo.ini != null && e.ini != null) return novo.ini < e.fim && novo.fim > e.ini;
    return e.periodos.some((p) => novo.periodos.includes(p));
  };
  for (const e of ordenar(evs)) {
    if (!sobrepoe(e)) continue;
    const hora = e.ini ? `${horaTexto(horaDe(new Date(e.ini).toISOString()))} ` : '';
    if (e.tipo === 'feriado') out.push(`${diaCurto(novo.dia)} é feriado (${e.titulo.replace('Feriado · ', '')}).`);
    else if (e.tipo === 'deslocamento') out.push(`${nome} está em deslocamento em ${diaCurto(novo.dia)} (${e.sub}).`);
    else out.push(`${nome} já tem em ${diaCurto(novo.dia)}: ${hora}${e.titulo}${e.tipo === 'bloqueio' || e.tipo === 'ferias' ? ` (${e.sub})` : ''}.`);
  }
  if (presencial) {
    for (const [k, quando] of [[-1, 'Na véspera'], [1, 'No dia seguinte']]) {
      const dia = somarDias(novo.dia, k);
      const firmes = idx.doDia(mentor.id, dia).filter((e) => !ign(e) && TIPOS[e.tipo].firme);
      firmes.forEach((e) => out.push(`${quando} (${diaCurto(dia)}, dia de deslocamento) ${nome} tem: ${e.titulo}.`));
    }
  }
  const disp = dispDe(mentor);
  const pers = presencial ? PERIODOS : novo.periodos;
  if (!presencial && pers.some((p) => !atendeEm(disp, novo.dia, p))) out.push(`${diaCurto(novo.dia)} está fora dos dias e horários de atendimento de ${nome}.`);
  return [...new Set(out)];
}

// ---------- bloqueios ----------
const SEMANA_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
export function descreverBloqueio(b) {
  const quando = b.inicio === b.fim ? diaCurto(b.inicio) : `${ddmm(b.inicio)} a ${ddmm(b.fim)}`;
  const rep = b.dias_semana && b.dias_semana.length
    ? ` · às ${b.dias_semana.map(Number).sort((x, y) => ORDEM_SEMANA.indexOf(x) - ORDEM_SEMANA.indexOf(y)).map((n) => SEMANA_PLURAL[n]).join(', ')}` : '';
  const hora = b.hora_inicio ? ` · ${String(b.hora_inicio).slice(0, 5)} às ${String(b.hora_fim || '').slice(0, 5)}`
    : b.periodos && b.periodos.length && b.periodos.length < 3 ? ` · ${b.periodos.map((p) => NOME_PERIODO[p].toLowerCase()).join(' e ')}` : ' · dia inteiro';
  return `${quando}${rep}${hora}`;
}
export function diasDoBloqueio(b) {
  const dias = b.dias_semana && b.dias_semana.length ? b.dias_semana.map(Number) : null;
  return listaDias(b.inicio, b.fim).slice(0, 400).filter((dia) => !dias || dias.includes(diaDaSemana(dia)));
}
// Compromissos que já existem dentro de um bloqueio (de hoje em diante), em frases prontas.
export function choquesDoBloqueio(idx, mentores, b) {
  const out = [];
  const h = hoje();
  const pers = b.hora_inicio ? periodosDoIntervalo(horaDoTexto(b.hora_inicio), horaDoTexto(b.hora_fim)) : (b.periodos && b.periodos.length ? b.periodos : PERIODOS);
  for (const dia of diasDoBloqueio(b)) {
    if (dia < h) continue;
    for (const m of mentores) {
      const evs = idx.doDia(m.id, dia).filter((e) => !['feriado', 'recesso', 'bloqueio', 'ferias'].includes(e.tipo) && !(e.origem && b.id && e.origem.id === b.id));
      for (const e of ordenar(evs)) {
        const sobre = b.hora_inicio && e.ini ? Date.parse(isoDe(dia, b.hora_inicio)) < e.fim && Date.parse(isoDe(dia, b.hora_fim)) > e.ini : e.periodos.some((p) => pers.includes(p));
        if (sobre) out.push(`${diaCurto(dia)}${mentores.length > 1 ? ` · ${String(m.nome || '').split(' ')[0]}` : ''}: ${e.ini ? `${horaTexto(horaDe(new Date(e.ini).toISOString()))} ` : ''}${e.titulo}`);
      }
    }
  }
  return out;
}
