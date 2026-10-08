// Resposta do mentor a um pré-bloqueio, pelo link pessoal do e-mail ou do WhatsApp (sem senha).
// GET  /api/reserva-resposta?t=<link>  → dados do pré-bloqueio para a página reserva.html
// POST /api/reserva-resposta {t, resposta: aceito|recusado, comentario} → grava e avisa a coordenação
import { json, supa, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, COORDENACAO } from '../lib/email.mjs';
import { primeiroNome, clienteDe, ondeReserva, descreverDataReserva } from '../lib/agenda.mjs';
import { sincronizar } from '../lib/google-sync.mjs';

export const config = { path: '/api/reserva-resposta', method: ['GET', 'POST'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function buscar(token) {
  const r = await supa(`/rest/v1/agenda_reserva_mentores?token=eq.${token}&select=reserva_id,mentor_id,resposta,comentario,respondido_em,mentor:perfis(nome),`
    + 'reserva:agenda_reservas(id,titulo,cliente,formato,local,com_deslocamento,observacoes,situacao,empresa:empresas(nome),datas:agenda_reserva_datas(dia,periodos,hora_inicio,duracao_min))');
  return r.ok && r.dados && r.dados[0];
}

export default async (req) => {
  const url = new URL(req.url);
  let corpo = {};
  if (req.method === 'POST') { try { corpo = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); } }
  const token = String((req.method === 'POST' ? corpo.t : url.searchParams.get('t')) || '').trim();
  if (!UUID.test(token)) return json({ mensagem: 'Este link não é válido. Confira se copiou o endereço inteiro.' }, 404);
  const x = await buscar(token);
  if (!x || !x.reserva) return json({ mensagem: 'Este link não é mais válido. Fale com a coordenação da Mentorei.' }, 404);
  const r = x.reserva;
  const encerrado = r.situacao === 'liberada' || r.situacao === 'convertida';
  const datas = (r.datas || []).slice().sort((a, b) => a.dia.localeCompare(b.dia)).map((d) => descreverDataReserva(d, r.formato));

  if (req.method === 'GET') {
    return json({ nome: primeiroNome(x.mentor && x.mentor.nome), titulo: r.titulo, cliente: clienteDe(r), onde: ondeReserva(r), datas,
      observacoes: r.observacoes || '', resposta: x.resposta, comentario: x.comentario || '', encerrado, situacao: r.situacao });
  }

  if (encerrado) return json({ mensagem: r.situacao === 'liberada' ? 'Este pré-bloqueio foi liberado pela coordenação: as datas já estão livres na sua agenda.' : 'Este pré-bloqueio já virou turma. As aulas estão na sua agenda.' }, 409);
  const resposta = corpo.resposta === 'aceito' ? 'aceito' : corpo.resposta === 'recusado' ? 'recusado' : null;
  if (!resposta) return json({ mensagem: 'Escolha "Aceito" ou "Não posso".' }, 400);
  const comentario = String(corpo.comentario || '').trim().slice(0, 500) || null;
  const p = await supa(`/rest/v1/agenda_reserva_mentores?token=eq.${token}`, { metodo: 'PATCH',
    corpo: { resposta, comentario, respondido_em: new Date().toISOString(), visto_em: null } });
  if (!p.ok) return json({ mensagem: 'Não consegui gravar a resposta. Tente de novo em instantes.' }, 500);

  const nome = (x.mentor && x.mentor.nome) || 'O mentor';
  const m = modeloEmail({
    assunto: `${nome} ${resposta === 'aceito' ? 'aceitou' : 'não pode'}: ${r.titulo}`,
    titulo: resposta === 'aceito' ? 'Pré-bloqueio aceito' : 'Pré-bloqueio recusado',
    blocos: [
      { p: `${nome} ${resposta === 'aceito' ? 'aceitou' : 'respondeu que não pode'} o pré-bloqueio:` },
      { lista: [r.titulo, ...(clienteDe(r) ? [`Cliente: ${clienteDe(r)}`] : []), ondeReserva(r), ...datas] },
      ...(comentario ? [{ p: `Comentário: “${comentario}”` }] : []),
      ...(resposta === 'recusado' ? [{ p: 'Na tela de pré-bloqueios, use "Mudar" para trocar de mentor ou de data.' }] : []),
      { botao: { texto: 'Ver pré-bloqueios', link: `${SITE}/app.html#/agenda/pre` } },
    ],
  });
  await enviarEmail({ para: [{ email: COORDENACAO, name: 'Coordenação Mentorei' }], assunto: m.assunto, html: m.html, texto: m.texto });
  // convites da Google Agenda deste pré-bloqueio (quem não pode sai dos convidados)
  try { await sincronizar({ limiteMs: 5000, prefixos: [`reserva:${r.id}`, `desloc-res:${r.id}`] }); } catch (_) { /* o agendamento acerta depois */ }
  return json({ ok: true, resposta });
};
