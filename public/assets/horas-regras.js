// Horas dos mentores (Relatórios › Ranking de horas dos mentores, 17/11/2026, pedido da Juliana): regras sem tela e sem banco,
// testáveis no Node. Soma, por mentor, as horas das sessões individuais, dos módulos online e dos módulos presenciais num
// período escolhido, separando o que JÁ FOI FEITO do que AINDA ESTÁ AGENDADO.
// Decisões dela (17/11/2026):
// - sessão individual conta se foi "realizada"; a que JÁ PASSOU e continua "agendada" (ou "remarcada") também conta como feita
//   (caixinha na tela, já marcada); falta e cancelada não contam; o "mentorado modelo" e os de teste ficam de fora;
// - sessão em dupla (script 83) e módulo com 2 ou mais mentores: cada mentor ganha as horas inteiras;
// - duração = a anotada; sessão sem duração = a do programa (senão 60 min); módulo sem duração = estimativa (aviso na tela);
// - módulo sem mentor cadastrado não entra em ninguém (aviso na tela);
// - módulo e sessão contam como feitos a partir da hora de início.
import { mentoresDaSessao } from './agenda-regras.js';

const FUSO = '-03:00';
const FUSO_MS = 3 * 3600 * 1000;

export const PERIODOS = [
  ['2m', 'Últimos 2 meses'],
  ['30d', 'Últimos 30 dias'],
  ['3m', 'Últimos 3 meses'],
  ['mes', 'Este mês'],
  ['mes-passado', 'Mês passado'],
  ['2m-fim-ano', 'Dos últimos 2 meses até o fim do ano'],
  ['hoje-fim-ano', 'De hoje até o fim do ano'],
  ['ano', 'Este ano (janeiro a dezembro)'],
  ['outro', 'Escolher as datas'],
];

export const O_QUE = [
  ['tudo', 'Tudo: sessões e módulos'],
  ['ind', 'Só sessões individuais'],
  ['modulos', 'Só módulos (online e presenciais)'],
  ['online', 'Só módulos online'],
  ['presencial', 'Só módulos presenciais'],
];
const TIPOS_DO = { tudo: ['ind', 'online', 'presencial'], ind: ['ind'], modulos: ['online', 'presencial'], online: ['online'], presencial: ['presencial'] };
export const NOME_TIPO = { ind: 'Sessão individual', online: 'Módulo online', presencial: 'Módulo presencial' };

// ---------- datas (dias "AAAA-MM-DD" no horário de Brasília) ----------
export const diaDe = (iso) => new Date(new Date(iso).getTime() - FUSO_MS).toISOString().slice(0, 10);
const partes = (dia) => dia.split('-').map(Number);
const doisDig = (n) => String(n).padStart(2, '0');
const ultimoDia = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();   // m de 1 a 12
const montar = (a, m, d) => `${a}-${doisDig(m)}-${doisDig(d)}`;
export function somarDias(dia, n) {
  const [a, m, d] = partes(dia);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
// mesmo dia N meses antes (31/12 menos 2 meses = 31/10; 31/03 menos 1 mês = 28 ou 29/02)
export function voltarMeses(dia, n) {
  const [a, m, d] = partes(dia);
  const total = a * 12 + (m - 1) - n;
  const na = Math.floor(total / 12), nm = (total % 12) + 1;
  return montar(na, nm, Math.min(d, ultimoDia(na, nm)));
}

// De que dia a que dia vai o período escolhido. `hoje` = "AAAA-MM-DD" (Brasília).
export function intervalo(periodo, hoje, { de, ate } = {}) {
  const [a, m] = partes(hoje);
  const fimDoAno = `${a}-12-31`;
  switch (periodo) {
    case '30d': return { de: somarDias(hoje, -30), ate: hoje };
    case '3m': return { de: voltarMeses(hoje, 3), ate: hoje };
    case 'mes': return { de: montar(a, m, 1), ate: montar(a, m, ultimoDia(a, m)) };
    case 'mes-passado': { const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1; return { de: montar(pa, pm, 1), ate: montar(pa, pm, ultimoDia(pa, pm)) }; }
    case '2m-fim-ano': return { de: voltarMeses(hoje, 2), ate: fimDoAno };
    case 'hoje-fim-ano': return { de: hoje, ate: fimDoAno };
    case 'ano': return { de: `${a}-01-01`, ate: fimDoAno };
    case 'outro': {
      const ok = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));
      let d1 = ok(de) ? de : voltarMeses(hoje, 2), d2 = ok(ate) ? ate : hoje;
      if (d2 < d1) [d1, d2] = [d2, d1];
      return { de: d1, ate: d2 };
    }
    default: return { de: voltarMeses(hoje, 2), ate: hoje };   // '2m'
  }
}
// limites do período em ISO, para a consulta ao banco (o dia inteiro em Brasília)
export const inicioISO = (dia) => new Date(`${dia}T00:00:00${FUSO}`).toISOString();
export const fimISO = (dia) => new Date(`${dia}T23:59:59.999${FUSO}`).toISOString();

// ---------- horas ----------
// 4399 → "73h19"; 720 → "12h"; 50 → "50 min"; 0 → "0h"
export function fmtHoras(min) {
  const t = Math.round(Number(min) || 0);
  if (t > 0 && t < 60) return `${t} min`;
  const h = Math.floor(t / 60), r = t % 60;
  return r ? `${h}h${doisDig(r)}` : `${h}h`;
}

const ehTeste = (nome) => /\b(modelo|teste)\b/i.test(String(nome || ''));
const horaBrasilia = (iso) => new Date(new Date(iso).getTime() - FUSO_MS).getUTCHours();

// Duração do módulo: a cadastrada; sem ela, uma estimativa (presencial que começa de manhã = dia inteiro, 8 h; presencial à
// tarde ou à noite = 2 h, como as palestras; online = 3 h, como os módulos online da Mentorei).
export function duracaoModulo(m) {
  if (Number(m.duracao_min) > 0) return { min: Number(m.duracao_min), estimada: false };
  if (m.formato === 'presencial') return { min: m.data_hora && horaBrasilia(m.data_hora) < 12 ? 480 : 120, estimada: true };
  return { min: 180, estimada: true };
}
export const tipoDoModulo = (m) => (m.formato === 'presencial' ? 'presencial' : 'online');

const SITUACOES_QUE_CONTAM = new Set(['realizada', 'agendada', 'remarcada']);

// Calcula o ranking.
// sessoes: [{ id, numero, data_hora, situacao, duracao_min, mentor_id, outros_mentores, mentorado: { id, nome, programa: { nome, duracao_min, empresa: { nome } } } }]
// modulos: [{ id, numero, titulo, data_hora, duracao_min, formato, turma: { id, nome, empresa: { nome } }, mentores: [{ mentor_id }] }]
// pessoas: [{ id, nome, foto_url, ativo }]
// opções: de/ate ("AAAA-MM-DD"), agora (Date), passadasComoFeitas (padrão true), comAgendado (padrão true), oQue ('tudo'...).
export function calcularHoras({ sessoes = [], modulos = [], pessoas = [] } = {}, { de, ate, agora = new Date(), passadasComoFeitas = true, comAgendado = true, oQue = 'tudo' } = {}) {
  const ini = de ? new Date(inicioISO(de)).getTime() : -Infinity;
  const fim = ate ? new Date(fimISO(ate)).getTime() : Infinity;
  const ag = agora.getTime();
  const tipos = new Set(TIPOS_DO[oQue] || TIPOS_DO.tudo);
  const nomes = new Map(pessoas.map((p) => [p.id, p]));
  const porMentor = new Map();
  const avisos = { semMentor: [], semDuracao: [], passadasAgendadas: [] };
  const vazio = () => ({ feito: 0, agendado: 0, nFeito: 0, nAgendado: 0 });
  const doMentor = (id) => {
    if (!porMentor.has(id)) {
      const p = nomes.get(id) || {};
      porMentor.set(id, { id, nome: p.nome || 'Mentor sem cadastro', foto_url: p.foto_url || null, ativo: p.ativo !== false,
        ind: vazio(), online: vazio(), presencial: vazio(), feito: 0, agendado: 0, total: 0, itens: [] });
    }
    return porMentor.get(id);
  };
  const somar = (ids, item) => {
    for (const id of ids) {
      const r = doMentor(id), b = r[item.tipo];
      if (item.feito) { b.feito += item.min; b.nFeito += 1; r.feito += item.min; } else { b.agendado += item.min; b.nAgendado += 1; r.agendado += item.min; }
      r.total += item.min;
      r.itens.push(item);
    }
  };
  const noPeriodo = (iso) => { const t = new Date(iso).getTime(); return t >= ini && t <= fim; };

  if (tipos.has('ind')) {
    for (const s of sessoes) {
      if (!s.data_hora || !SITUACOES_QUE_CONTAM.has(s.situacao) || !noPeriodo(s.data_hora)) continue;
      const mtd = s.mentorado || {};
      if (ehTeste(mtd.nome)) continue;
      const passou = new Date(s.data_hora).getTime() <= ag;
      let feito;
      if (s.situacao === 'realizada') feito = true;
      else if (passou) {
        avisos.passadasAgendadas.push({ id: s.id, data_hora: s.data_hora, numero: s.numero, mentorado: mtd.nome || '', mentorado_id: mtd.id || null, mentores: mentoresDaSessao(s) });
        if (!passadasComoFeitas) continue;
        feito = true;
      } else feito = false;
      if (!feito && !comAgendado) continue;
      const prog = mtd.programa || {};
      const min = Number(s.duracao_min) > 0 ? Number(s.duracao_min) : Number(prog.duracao_min) > 0 ? Number(prog.duracao_min) : 60;
      const ids = mentoresDaSessao(s);
      if (!ids.length) continue;
      somar(ids, { tipo: 'ind', id: s.id, data_hora: s.data_hora, min, estimada: !(Number(s.duracao_min) > 0), feito,
        semBaixa: s.situacao !== 'realizada' && passou, titulo: `Sessão ${s.numero || ''} com ${mtd.nome || 'mentorado'}`.replace('  ', ' '),
        cliente: (prog.empresa && prog.empresa.nome) || prog.nome || '', link: `#/sessao/${s.id}`, emDupla: ids.length > 1, mentores: ids });
    }
  }

  for (const m of modulos) {
    const tipo = tipoDoModulo(m);
    if (!tipos.has(tipo) || !m.data_hora || !noPeriodo(m.data_hora)) continue;
    const feito = new Date(m.data_hora).getTime() <= ag;
    if (!feito && !comAgendado) continue;
    const { min, estimada } = duracaoModulo(m);
    const turma = m.turma || {};
    const cliente = (turma.empresa && turma.empresa.nome) || '';
    const titulo = `${m.numero ? `Módulo ${m.numero} · ` : ''}${m.titulo || 'Módulo'}`;
    const ids = [...new Set((m.mentores || []).map((x) => x.mentor_id).filter(Boolean))];
    const base = { id: m.id, data_hora: m.data_hora, titulo, turma: turma.nome || '', cliente, tipo, min, feito, link: `#/modulo/${m.id}` };
    if (!ids.length) { avisos.semMentor.push(base); continue; }
    if (estimada) avisos.semDuracao.push({ ...base, mentores: ids });
    somar(ids, { ...base, estimada, emDupla: ids.length > 1, mentores: ids });
  }

  const ranking = [...porMentor.values()].filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || b.feito - a.feito || a.nome.localeCompare(b.nome, 'pt-BR'));
  // posição de competição: empate fica na mesma posição (10, 10, 10, 13)
  ranking.forEach((r, i) => { r.posicao = i && ranking[i - 1].total === r.total ? ranking[i - 1].posicao : i + 1; });
  ranking.forEach((r) => r.itens.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora)));
  for (const k of Object.keys(avisos)) avisos[k].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  const soma = (f) => ranking.reduce((t, r) => t + f(r), 0);
  const unicos = (tipo) => new Set(ranking.flatMap((r) => r.itens.filter((x) => x.tipo === tipo).map((x) => x.id))).size;
  return {
    ranking, avisos,
    totais: { feito: soma((r) => r.feito), agendado: soma((r) => r.agendado), total: soma((r) => r.total), mentores: ranking.length,
      sessoes: unicos('ind'), online: unicos('online'), presencial: unicos('presencial') },
  };
}
