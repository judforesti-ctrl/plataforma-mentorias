// Nota fiscal do mentor parceiro (script 58): depois que o mentor envia a nota pela plataforma, a coordenação (contato@, a Cintia)
// recebe um e-mail com o mês, o valor da nota e a data prevista de pagamento (uma vez por nota, coluna avisado_em). O arquivo não
// vai no e-mail: fica na plataforma (Financeiro → Agenda de pagamentos), que confere quem pode abrir.
import { json, supa, quemPede, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, COORDENACAO } from '../lib/email.mjs';

export const config = { path: '/api/nota-mentor', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m) => { const [a, n] = String(m).split('-').map(Number); return `${MESES[n - 1] || ''} de ${a}`; };
const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const real = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ ok: false, mensagem: 'Entre de novo na plataforma.' }, 401);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }
  if (!UUID.test(String(b.id || ''))) return json({ ok: false, mensagem: 'Pedido desconhecido.' }, 400);
  const r = await supa(`/rest/v1/fin_notas_mentor?id=eq.${b.id}&select=*,mentor:perfis!fin_notas_mentor_perfil_id_fkey(id,nome)`);
  const n = r.ok && Array.isArray(r.dados) && r.dados[0];
  if (!n) return json({ ok: false, mensagem: 'Nota não encontrada.' }, 404);
  if (n.perfil_id !== eu.id) return json({ ok: false, mensagem: 'Sem acesso a esta nota.' }, 403);
  if (n.avisado_em) return json({ ok: true, enviado: false });
  // marca antes de mandar: um segundo pedido não repete o e-mail
  await supa(`/rest/v1/fin_notas_mentor?id=eq.${n.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { avisado_em: new Date().toISOString() } });
  const nome = (n.mentor && n.mentor.nome) || 'Um mentor';
  const mail = modeloEmail({
    assunto: `Nota fiscal de ${nome} · ${nomeMes(n.mes_referencia)}`,
    titulo: `${nome} enviou a nota fiscal de ${nomeMes(n.mes_referencia)}`,
    blocos: [
      { lista: [`Valor da nota: ${real(n.valor)}`, n.numero ? `Número: ${n.numero}` : '', `Pagamento previsto: ${dataBR(n.pagamento_previsto)}`].filter(Boolean) },
      ...(n.observacao ? [{ titulo: 'Recado' }, { p: n.observacao }] : []),
      { botao: { texto: 'Abrir a agenda de pagamentos', link: `${SITE}/app.html#/financeiro/pagamentos` } },
      { nota: 'Confira o valor com o calculado pela plataforma antes de pagar. Pagamentos nos dias 5, 15 e 25.' },
    ],
  });
  const env = await enviarEmail({ para: [{ email: COORDENACAO, name: 'Coordenação Mentorei' }], assunto: mail.assunto, html: mail.html, texto: mail.texto });
  return json({ ok: true, enviado: !!env.enviado });
};
