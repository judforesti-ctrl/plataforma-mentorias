// Aulas da trilha na agenda do aluno (script 49, pedido da Juliana em 28/10/2026).
// POST (com login): devolve o link secreto da pessoa. GET /api/trilha-calendario/<código>.ics: as aulas de todas as trilhas dela no
// formato de calendário, que o Google Agenda, o iPhone e o Outlook assinam e atualizam sozinhos (data mudou, a agenda muda).
// O código é o id da pessoa assinado com a chave secreta: não dá para adivinhar o de outra pessoa.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { json, supa, quemPede, env, SITE } from '../lib/google.mjs';

export const config = { path: ['/api/trilha-calendario', '/api/trilha-calendario/:arquivo'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assinar = (id) => createHmac('sha256', `mentorei-calendario:${env('SUPABASE_SECRET_KEY')}`).update(id).digest('base64url').slice(0, 24);

const texto = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const urlBoa = (x) => (x && /^https?:\/\//i.test(x) ? x : x ? `https://${x}` : '');
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
  if (req.method === 'POST') {
    const eu = await quemPede(req);
    if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
    return json({ url: `${SITE}/api/trilha-calendario/${eu.id}.${assinar(eu.id)}.ics` });
  }

  const codigo = String((context.params && context.params.arquivo) || '').replace(/\.ics$/i, '');
  const [id, sig] = codigo.split('.');
  const certo = UUID.test(id || '') && sig && Buffer.from(sig).length === Buffer.from(assinar(id)).length && timingSafeEqual(Buffer.from(sig), Buffer.from(assinar(id)));
  if (!certo) return new Response('Link inválido.', { status: 404 });
  const p = await supa(`/rest/v1/perfis?id=eq.${id}&select=nome,ativo`);
  const pessoa = p.ok && p.dados && p.dados[0];
  if (!pessoa || !pessoa.ativo) return new Response('Link inválido.', { status: 404 });

  const r = await supa(`/rest/v1/turma_alunos?perfil_id=eq.${id}&ativo=eq.true&select=turma:turmas(id,nome,empresa:empresas(nome),modulos(id,numero,titulo,data_hora,duracao_min,formato,link,local))`);
  const turmas = ((r.ok && r.dados) || []).map((x) => x.turma).filter(Boolean);
  const agora = utc(Date.now());
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mentorei//Plataforma de Mentorias//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${texto(turmas.length === 1 ? `Mentorei · ${turmas[0].nome}` : 'Mentorei · Minhas trilhas')}`, 'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H'];
  const vistos = new Set();
  for (const t of turmas) {
    for (const m of t.modulos || []) {
      if (!m.data_hora || vistos.has(m.id)) continue;
      vistos.add(m.id);
      const ini = Date.parse(m.data_hora), fim = ini + (Number(m.duracao_min) || 180) * 60000;
      const presencial = m.formato === 'presencial';
      const sala = presencial ? '' : urlBoa(m.link || '');
      const descricao = [sala && `Entrar na aula: ${sala}`, `Área da trilha (materiais, tarefas e gravações): ${SITE}/app.html#/trilha/${t.id}`].filter(Boolean).join('\n');
      linhas.push('BEGIN:VEVENT', `UID:aula-${m.id}@plataforma.mentorei.com.br`, `DTSTAMP:${agora}`, `DTSTART:${utc(ini)}`, `DTEND:${utc(fim)}`,
        `SUMMARY:${texto(`Módulo ${m.numero} · ${m.titulo} (${t.nome})`)}`, `DESCRIPTION:${texto(descricao)}`,
        ...((presencial ? m.local : sala) ? [`LOCATION:${texto(presencial ? m.local : sala)}`] : []),
        `URL:${sala || `${SITE}/app.html#/trilha/${t.id}`}`, 'STATUS:CONFIRMED', 'END:VEVENT');
    }
  }
  linhas.push('END:VCALENDAR');
  return new Response(`${linhas.map(dobrar).join('\r\n')}\r\n`, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="mentorei-trilha.ics"', 'Cache-Control': 'private, max-age=900' },
  });
};
