// E-mail para um contato do cliente, enviado do pipeline de vendas (sai de contato@mentorei.com.br, pelo Brevo).
// A tela registra a interação no histórico depois que o envio dá certo.
import { json, quemPede } from '../lib/google.mjs';
import { enviarEmail, modeloEmail } from '../lib/email.mjs';

export const config = { path: '/api/vendas-email', method: 'POST' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel !== 'admin') return json({ mensagem: 'Só a administração.' }, 403);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const para = String(b.para || '').trim().toLowerCase();
  const assunto = String(b.assunto || '').trim().slice(0, 200);
  const texto = String(b.texto || '').trim().slice(0, 8000);
  if (!EMAIL.test(para)) return json({ mensagem: 'E-mail do contato inválido.' }, 400);
  if (!assunto || !texto) return json({ mensagem: 'Preencha assunto e mensagem.' }, 400);
  const e = modeloEmail({ assunto, titulo: assunto, blocos: texto.split(/\n{2,}/).map((p) => ({ p })), rodape: `Mensagem enviada por ${eu.nome} · Mentorei · contato@mentorei.com.br` });
  const r = await enviarEmail({ para: [{ email: para, name: String(b.nome || '').slice(0, 120) || undefined }], assunto, html: e.html, texto: e.texto });
  if (!r.enviado) return json({ mensagem: `Não consegui enviar: ${r.mensagem}.` }, 502);
  return json({ ok: true });
};
