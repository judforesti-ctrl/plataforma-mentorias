// Agenda no celular: o link secreto de cada pessoa devolve a agenda dela no formato de calendário (.ics),
// que o Google Agenda e o iPhone leem e atualizam sozinhos algumas vezes por dia.
import { supa, SITE } from '../lib/google.mjs';
import { dadosAgenda } from '../lib/agenda.mjs';
import { hoje, somarDias, PERIODOS } from '../../public/assets/agenda-regras.js';

export const config = { path: '/api/agenda-celular/:arquivo', method: 'GET' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// horário usado quando o item ocupa só alguns períodos, sem hora exata
const FAIXA = { manha: ['08:00', '12:00'], tarde: ['13:00', '18:00'], noite: ['18:00', '22:00'] };

const texto = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dataICS = (dia) => dia.replace(/-/g, '');
const isoDe = (dia, hora) => Date.parse(`${dia}T${hora}:00-03:00`);
function dobrar(linha) { // linhas de no máximo 75 bytes, como pede o formato
  const out = []; let atual = '', bytes = 0;
  for (const ch of linha) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(atual); atual = ''; bytes = 0; }
    atual += ch; bytes += n;
  }
  out.push(atual);
  return out.join('\r\n ');
}

export default async (req, context) => {
  const token = String((context.params && context.params.arquivo) || '').replace(/\.ics$/i, '');
  if (!UUID.test(token)) return new Response('Link inválido.', { status: 404 });
  const l = await supa(`/rest/v1/agenda_links?token=eq.${token}&select=perfil:perfis(id,nome,ativo)`);
  const p = l.ok && l.dados && l.dados[0] && l.dados[0].perfil;
  if (!p || !p.ativo) return new Response('Link inválido.', { status: 404 });

  const d = await dadosAgenda();
  const de = somarDias(hoje(), -31), ate = somarDias(hoje(), 366);
  const agora = utc(Date.now());
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mentorei//Plataforma de Mentorias//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${texto(`Mentorei · ${p.nome}`)}`, 'X-WR-TIMEZONE:America/Sao_Paulo', 'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H'];

  const meus = d.eventos.filter((e) => e.dia >= de && e.dia <= ate && e.tipo !== 'feriado' && (e.todos ? e.tipo === 'recesso' : e.mentores.includes(p.id)));
  for (const e of meus) {
    let quando;
    if (e.ini && e.fim) quando = [`DTSTART:${utc(e.ini)}`, `DTEND:${utc(e.fim)}`];
    else if (e.diaInteiro || e.periodos.length === 3) quando = [`DTSTART;VALUE=DATE:${dataICS(e.dia)}`, `DTEND;VALUE=DATE:${dataICS(somarDias(e.dia, 1))}`];
    else {
      const pers = PERIODOS.filter((x) => e.periodos.includes(x));
      quando = [`DTSTART:${utc(isoDe(e.dia, FAIXA[pers[0]][0]))}`, `DTEND:${utc(isoDe(e.dia, FAIXA[pers[pers.length - 1]][1]))}`];
    }
    const o = e.origem || {};
    let descricao = e.sub || '', local = '', link = '';
    if (e.tipo === 'individual') {
      const sala = o.mentorado && o.mentorado.sala_meet;
      if (sala) { descricao += `\nSala do Google Meet: ${sala}`; local = sala; }
      link = `${SITE}/app.html#/sessao/${o.id}`;
    } else if (e.tipo === 'turma' || e.tipo === 'presencial' || (e.tipo === 'deslocamento' && !e.provisorio)) {
      if (e.tipo === 'presencial' || e.tipo === 'deslocamento') local = o.local || '';
      else if (o.link) { descricao += `\nSala: ${o.link}`; local = o.link; }
      link = `${SITE}/app.html#/modulo/${o.id}`;
    } else if (e.tipo === 'pre' || e.tipo === 'reservado' || e.provisorio) {
      const minha = (o.mentores || []).find((x) => x.mentor_id === p.id);
      if (minha && minha.resposta === 'aguardando') descricao += `\nEsperando a sua resposta: ${SITE}/reserva.html?t=${minha.token}`;
      local = o.local || '';
      link = `${SITE}/app.html#/agenda`;
    } else if (e.tipo === 'bloqueio' || e.tipo === 'ferias') {
      if (o.motivo) descricao += `\n${o.motivo}`;
      link = `${SITE}/app.html#/agenda`;
    }
    const tentativo = e.tipo === 'pre' || e.provisorio;
    linhas.push('BEGIN:VEVENT', `UID:${e.id}@plataforma.mentorei.com.br`, `DTSTAMP:${agora}`, ...quando,
      `SUMMARY:${texto(e.titulo)}`, ...(descricao ? [`DESCRIPTION:${texto(descricao.trim())}`] : []), ...(local ? [`LOCATION:${texto(local)}`] : []),
      ...(link ? [`URL:${link}`] : []), `STATUS:${tentativo ? 'TENTATIVE' : 'CONFIRMED'}`, `TRANSP:${e.tipo === 'deslocamento' && e.provisorio ? 'TRANSPARENT' : 'OPAQUE'}`, 'END:VEVENT');
  }
  linhas.push('END:VCALENDAR');
  return new Response(`${linhas.map(dobrar).join('\r\n')}\r\n`, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="mentorei.ics"', 'Cache-Control': 'private, max-age=900' },
  });
};
