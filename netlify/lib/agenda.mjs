// Agenda no servidor: lê tudo do banco (com a chave secreta) e monta os mesmos itens que a tela usa,
// para o resumo semanal por e-mail, os avisos para a coordenação e a agenda no celular.
import { supa, SITE } from './google.mjs';
import { modeloEmail } from './email.mjs';
import {
  montarEventos, indexar, ordenar, hoje, somarDias, listaDias, segundaDaSemana, diaCurto, ddmm, diaDe, horaDe, horaTexto,
  NOME_PERIODO, PERIODOS, feriadoDe, dispDe, estadoPeriodo,
} from '../../public/assets/agenda-regras.js';

const SEL_SESSAO = 'id,numero,data_hora,duracao_min,situacao,mentor_id,mentorado:mentorados(id,nome,status,sala_meet,programa:programas(id,nome,duracao_min,empresa:empresas(id,nome)))';
const SEL_MODULO = 'id,numero,titulo,data_hora,duracao_min,formato,local,link,turma:turmas(id,nome,empresa:empresas(id,nome)),mentores:modulo_mentores(mentor_id,com_deslocamento,viagem)';
const SEL_RESERVA = '*,empresa:empresas(id,nome),datas:agenda_reserva_datas(*),mentores:agenda_reserva_mentores(*)';

export async function dadosAgenda() {
  const [s, m, b, r, p] = await Promise.all([
    supa(`/rest/v1/sessoes?data_hora=not.is.null&select=${SEL_SESSAO}`),
    supa(`/rest/v1/modulos?select=${SEL_MODULO}`),
    supa('/rest/v1/agenda_bloqueios?select=*'),
    supa(`/rest/v1/agenda_reservas?select=${SEL_RESERVA}`),
    supa('/rest/v1/perfis?ativo=eq.true&select=id,nome,email,whatsapp,papel,tambem_mentor,termo_aceito_em,disponibilidade'),
  ]);
  for (const x of [s, m, b, r, p]) if (!x.ok) throw new Error(`Falha ao ler a agenda (${x.status}).`);
  const sessoes = s.dados.filter((x) => !(x.mentorado && x.mentorado.status === 'desligado' && x.situacao === 'agendada'));
  const eventos = montarEventos({ sessoes, modulos: m.dados, bloqueios: b.dados, reservas: r.dados });
  const pessoas = p.dados;
  return {
    sessoes, modulos: m.dados, bloqueios: b.dados, reservas: r.dados, eventos, idx: indexar(eventos), pessoas,
    mentores: pessoas.filter((x) => x.papel === 'mentor' || x.tambem_mentor),
  };
}

export const primeiroNome = (n) => String(n || '').split(' ')[0];
export const horaDoISO = (iso) => horaTexto(horaDe(iso));
export const clienteDe = (r) => (r.empresa && r.empresa.nome) || r.cliente || '';
export const descreverDataReserva = (x, formato) => `${diaCurto(x.dia)} · ${formato === 'presencial' ? 'dia inteiro'
  : x.hora_inicio ? `${String(x.hora_inicio).slice(0, 5)}${x.duracao_min ? ` (${x.duracao_min} min)` : ''}`
  : !x.periodos || x.periodos.length === 3 ? 'dia inteiro' : x.periodos.map((p) => NOME_PERIODO[p].toLowerCase()).join(' e ')}`;
export const ondeReserva = (r) => (r.formato === 'presencial'
  ? `Presencial${r.local ? ` em ${r.local}` : ''}${r.com_deslocamento !== false ? ' (a véspera e o dia seguinte ficam reservados para o deslocamento)' : ''}` : 'Online');
export const textoEvento = (e) => `${e.ini ? `${horaDoISO(new Date(e.ini).toISOString())} · ` : ''}${e.titulo}${e.sub ? ` (${e.sub})` : ''}`;

// ---------- resumo da semana de um mentor ----------
export function emailResumoMentor(d, m, seg = segundaDaSemana(hoje())) {
  const dias = listaDias(seg, somarDias(seg, 6));
  const disp = dispDe(m);
  const linhas = [], livres = [];
  for (const dia of dias) {
    const evs = ordenar(d.idx.doDia(m.id, dia));
    const f = feriadoDe(dia);
    const trab = evs.filter((e) => e.tipo !== 'feriado');
    if (trab.length) linhas.push(`${diaCurto(dia)}: ${trab.map(textoEvento).join('; ')}${f ? ` · feriado (${f})` : ''}`);
    else if (!f && PERIODOS.some((p) => estadoPeriodo(evs, p, disp, dia).tipo === 'livre')) livres.push(diaCurto(dia));
  }
  const pendentes = d.reservas.filter((r) => r.situacao === 'pre' || r.situacao === 'confirmada')
    .map((r) => ({ r, x: (r.mentores || []).find((y) => y.mentor_id === m.id) })).filter((c) => c.x && c.x.resposta === 'aguardando');
  const blocos = [{ p: `Olá, ${primeiroNome(m.nome)}! Esta é a sua agenda da Mentorei para a semana de ${ddmm(seg)} a ${ddmm(somarDias(seg, 6))}.` }];
  blocos.push(linhas.length ? { lista: linhas } : { p: 'Nenhum compromisso marcado nesta semana.' });
  if (livres.length) blocos.push({ p: `Dias livres: ${livres.join(', ')}.` });
  if (pendentes.length) {
    blocos.push({ titulo: 'Pré-bloqueios esperando a sua resposta' });
    for (const { r, x } of pendentes) {
      blocos.push({ lista: [`${r.titulo}${clienteDe(r) ? ` · ${clienteDe(r)}` : ''}`, ondeReserva(r), ...(r.datas || []).slice().sort((a, b) => a.dia.localeCompare(b.dia)).map((y) => descreverDataReserva(y, r.formato))] });
      blocos.push({ botao: { texto: 'Responder: consigo ou não', link: `${SITE}/reserva.html?t=${x.token}` } });
    }
  }
  blocos.push({ botao: { texto: 'Abrir minha agenda', link: `${SITE}/app.html#/agenda` } });
  blocos.push({ nota: 'Precisa bloquear algum dia? Na sua agenda da plataforma, clique em "+ Pedir bloqueio". A coordenação é avisada na hora.' });
  return modeloEmail({ assunto: `Sua semana na Mentorei · ${ddmm(seg)} a ${ddmm(somarDias(seg, 6))}`, titulo: 'Sua agenda da semana', blocos });
}

// ---------- resumo da semana para a coordenação ----------
export function emailResumoCoordenacao(d, seg = segundaDaSemana(hoje())) {
  const h = hoje();
  const nome = (id) => (d.pessoas.find((p) => p.id === id) || {}).nome || 'Mentor';
  const vencidos = d.reservas.filter((r) => r.situacao === 'pre' && r.lembrar_em <= h);
  const respostas = d.reservas.filter((r) => r.situacao === 'pre' || r.situacao === 'confirmada')
    .flatMap((r) => (r.mentores || []).filter((x) => x.respondido_em && !x.visto_em).map((x) => `${nome(x.mentor_id)} ${x.resposta === 'aceito' ? 'aceitou' : 'não pode'}: ${r.titulo}${x.comentario ? ` (“${x.comentario}”)` : ''}`));
  const semResposta = d.reservas.filter((r) => r.situacao === 'pre' || r.situacao === 'confirmada')
    .flatMap((r) => (r.mentores || []).filter((x) => x.resposta === 'aguardando').map((x) => `${nome(x.mentor_id)}: ${r.titulo}`));
  const bloqueios = d.bloqueios.filter((b) => b.mentor_id && !b.visto_em && b.fim >= h).map((b) => `${nome(b.mentor_id)}: ${b.inicio === b.fim ? diaCurto(b.inicio) : `${ddmm(b.inicio)} a ${ddmm(b.fim)}`}${b.motivo ? ` (${b.motivo})` : ''}`);
  const lim = somarDias(h, 15);
  const viagens = d.modulos.filter((m) => m.formato === 'presencial' && m.data_hora && diaDe(m.data_hora) >= h && diaDe(m.data_hora) <= lim)
    .flatMap((m) => (m.mentores || []).filter((v) => v.com_deslocamento !== false && !(v.viagem && v.viagem.passagem && v.viagem.hotel))
      .map((v) => `${diaCurto(diaDe(m.data_hora))} · ${nome(v.mentor_id)} · ${m.turma ? m.turma.nome : 'turma'}${m.local ? ` (${m.local})` : ''}: ${!(v.viagem && v.viagem.passagem) ? 'passagem' : ''}${!(v.viagem && v.viagem.passagem) && !(v.viagem && v.viagem.hotel) ? ' e ' : ''}${!(v.viagem && v.viagem.hotel) ? 'hotel' : ''} pendente`));
  const dias = listaDias(seg, somarDias(seg, 6));
  const semana = d.mentores.map((m) => {
    const evs = dias.flatMap((dia) => d.idx.doDia(m.id, dia).filter((e) => e.tipo !== 'feriado'));
    const sess = evs.filter((e) => e.tipo === 'individual').length, aulas = evs.filter((e) => e.tipo === 'turma' || e.tipo === 'presencial').length;
    const viag = new Set(evs.filter((e) => e.tipo === 'presencial' || e.tipo === 'deslocamento').map((e) => e.dia)).size;
    return `${m.nome}: ${sess} ${sess === 1 ? 'sessão individual' : 'sessões individuais'}, ${aulas} ${aulas === 1 ? 'aula' : 'aulas'} de turma${viag ? `, ${viag} ${viag === 1 ? 'dia' : 'dias'} de viagem` : ''}`;
  });
  const blocos = [{ p: `Resumo da agenda da equipe para a semana de ${ddmm(seg)} a ${ddmm(somarDias(seg, 6))}.` }];
  if (vencidos.length) blocos.push({ titulo: 'Pré-bloqueios com mais de 5 dias: confirmar ou liberar' }, { lista: vencidos.map((r) => `${r.titulo}${clienteDe(r) ? ` · ${clienteDe(r)}` : ''}`) });
  if (respostas.length) blocos.push({ titulo: 'Respostas novas dos mentores' }, { lista: respostas });
  if (semResposta.length) blocos.push({ titulo: 'Ainda sem resposta' }, { lista: semResposta });
  if (bloqueios.length) blocos.push({ titulo: 'Bloqueios novos pedidos pelos mentores' }, { lista: bloqueios });
  if (viagens.length) blocos.push({ titulo: 'Viagens nos próximos 15 dias com pendência' }, { lista: viagens });
  if (!vencidos.length && !respostas.length && !bloqueios.length && !viagens.length) blocos.push({ p: 'Nada pendente na agenda.' });
  blocos.push({ titulo: 'A semana de cada mentor' }, { lista: semana });
  blocos.push({ botao: { texto: 'Abrir a agenda', link: `${SITE}/app.html#/agenda` } });
  return modeloEmail({ assunto: `Agenda da equipe · semana de ${ddmm(seg)}`, titulo: 'Agenda da equipe', blocos });
}
