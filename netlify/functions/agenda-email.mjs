// E-mails da agenda, pedidos pela plataforma:
//  status            (administração) o envio de e-mail está configurado?
//  aviso-bloqueio    (mentor que bloqueou) avisa a coordenação, com os compromissos que já existem no período
//  convite-reserva   (administração) manda a cada mentor o pré-bloqueio com o link pessoal para responder
//  teste-resumo      (administração) manda para quem pediu o resumo da semana, para conferir
import { json, supa, quemPede, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, temChaveEmail, COORDENACAO } from '../lib/email.mjs';
import { dadosAgenda, emailResumoMentor, emailResumoCoordenacao, primeiroNome, clienteDe, ondeReserva, descreverDataReserva } from '../lib/agenda.mjs';
import { descreverBloqueio, choquesDoBloqueio } from '../../public/assets/agenda-regras.js';

export const config = { path: '/api/agenda-email', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPO = { bloqueio: 'Bloqueio', ferias: 'Férias / folga', recesso: 'Recesso' };

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const adm = eu.papel === 'admin';

  if (b.acao === 'status') {
    if (!adm) return json({ mensagem: 'Só a administração.' }, 403);
    return json({ email: temChaveEmail() });
  }

  if (b.acao === 'aviso-bloqueio') {
    if (!UUID.test(String(b.bloqueio_id || ''))) return json({ mensagem: 'Bloqueio inválido.' }, 400);
    const r = await supa(`/rest/v1/agenda_bloqueios?id=eq.${b.bloqueio_id}&select=*,mentor:perfis!agenda_bloqueios_mentor_id_fkey(id,nome)`);
    const bl = r.ok && r.dados && r.dados[0];
    if (!bl || !bl.mentor) return json({ mensagem: 'Bloqueio não encontrado.' }, 404);
    if (!adm && bl.mentor_id !== eu.id) return json({ mensagem: 'Este bloqueio não é seu.' }, 403);
    let choques = [];
    try { const d = await dadosAgenda(); choques = choquesDoBloqueio(d.idx, [bl.mentor], bl); } catch (_) { /* o aviso sai mesmo sem a lista */ }
    const nome = bl.mentor.nome;
    const quando = descreverBloqueio(bl);
    const blocos = [
      { p: `${nome} bloqueou a agenda na plataforma:` },
      { lista: [`${TIPO[bl.tipo] || 'Bloqueio'}: ${quando}`, ...(bl.motivo ? [`Motivo: ${bl.motivo}`] : [])] },
    ];
    if (choques.length) {
      blocos.push({ titulo: 'Atenção: já existe compromisso nesse período' }, { lista: choques.slice(0, 15) },
        { p: `Esses compromissos continuam marcados. Combine com ${primeiroNome(nome)} o que remarcar.` });
    } else blocos.push({ p: 'Não há nenhum compromisso marcado nesse período.' });
    blocos.push({ botao: { texto: 'Ver na agenda', link: `${SITE}/app.html#/agenda/bloqueios` } });
    const m = modeloEmail({ assunto: `${nome} bloqueou a agenda: ${quando}`, titulo: 'Bloqueio de agenda', blocos });
    const res = await enviarEmail({ para: [{ email: COORDENACAO, name: 'Coordenação Mentorei' }], assunto: m.assunto, html: m.html, texto: m.texto });
    return json(res);
  }

  if (b.acao === 'convite-reserva') {
    if (!adm) return json({ mensagem: 'Só a administração.' }, 403);
    if (!UUID.test(String(b.reserva_id || ''))) return json({ mensagem: 'Pré-bloqueio inválido.' }, 400);
    const r = await supa(`/rest/v1/agenda_reservas?id=eq.${b.reserva_id}&select=*,empresa:empresas(nome),datas:agenda_reserva_datas(*),mentores:agenda_reserva_mentores(mentor_id,resposta,token,mentor:perfis(nome,email))`);
    const res = r.ok && r.dados && r.dados[0];
    if (!res) return json({ mensagem: 'Pré-bloqueio não encontrado.' }, 404);
    const quem = Array.isArray(b.mentores) && b.mentores.length ? b.mentores : null;
    const alvos = (res.mentores || []).filter((x) => (quem ? quem.includes(x.mentor_id) : x.resposta !== 'recusado'));
    const datas = (res.datas || []).slice().sort((a, c) => a.dia.localeCompare(c.dia)).map((x) => descreverDataReserva(x, res.formato));
    const resultados = [];
    for (const x of alvos) {
      if (!x.mentor || !x.mentor.email) { resultados.push({ mentor_id: x.mentor_id, enviado: false, mensagem: 'sem e-mail cadastrado' }); continue; }
      const m = modeloEmail({
        assunto: `Pré-bloqueio na sua agenda: ${res.titulo}`, titulo: 'Pré-bloqueio na sua agenda',
        blocos: [
          { p: `Olá, ${primeiroNome(x.mentor.nome)}! A coordenação da Mentorei reservou estas datas na sua agenda para um cliente em negociação:` },
          { titulo: res.titulo },
          { lista: [...(clienteDe(res) ? [`Cliente: ${clienteDe(res)}`] : []), ondeReserva(res), ...datas] },
          ...(res.observacoes ? [{ p: res.observacoes }] : []),
          { p: 'Você consegue? Responda pelo botão abaixo. Leva menos de 1 minuto e não precisa de senha.' },
          { botao: { texto: 'Responder: consigo ou não', link: `${SITE}/reserva.html?t=${x.token}` } },
          { nota: 'O link é pessoal. Sua resposta vai direto para a agenda da plataforma e a coordenação é avisada.' },
        ],
      });
      const envio = await enviarEmail({ para: [{ email: x.mentor.email, name: x.mentor.nome }], assunto: m.assunto, html: m.html, texto: m.texto });
      if (envio.enviado) await supa(`/rest/v1/agenda_reserva_mentores?reserva_id=eq.${res.id}&mentor_id=eq.${x.mentor_id}`, { metodo: 'PATCH', corpo: { email_enviado_em: new Date().toISOString() } });
      resultados.push({ mentor_id: x.mentor_id, ...envio });
    }
    return json({ ok: true, resultados });
  }

  if (b.acao === 'teste-resumo') {
    if (!adm) return json({ mensagem: 'Só a administração.' }, 403);
    const p = await supa(`/rest/v1/perfis?id=eq.${eu.id}&select=id,nome,email,papel,tambem_mentor,disponibilidade`);
    const eu2 = p.ok && p.dados && p.dados[0];
    if (!eu2 || !eu2.email) return json({ mensagem: 'Seu perfil está sem e-mail.' }, 400);
    let d;
    try { d = await dadosAgenda(); } catch (e) { return json({ mensagem: 'Não consegui ler a agenda. Confira se o script 14 foi rodado no Supabase.' }, 500); }
    const envios = [emailResumoCoordenacao(d)];
    if (eu2.tambem_mentor || eu2.papel === 'mentor') envios.push(emailResumoMentor(d, eu2));
    let ultimo = { enviado: false };
    for (const m of envios) {
      ultimo = await enviarEmail({ para: [{ email: eu2.email, name: eu2.nome }], assunto: `[Teste] ${m.assunto}`, html: m.html, texto: m.texto });
      if (!ultimo.enviado) return json({ mensagem: `O e-mail não saiu: ${ultimo.mensagem}.` }, 502);
    }
    return json({ ok: true });
  }

  return json({ mensagem: 'Ação desconhecida.' }, 400);
};
