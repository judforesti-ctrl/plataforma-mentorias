// Envia a proposta (PowerPoint em anexo) por e-mail ao contato do cliente, de contato@mentorei.com.br pelo Brevo.
// A tela marca a proposta como enviada e agenda o retorno depois que o envio dá certo. Só a administração.
import { json, quemPede } from '../lib/google.mjs';
import { enviarEmail, modeloEmail } from '../lib/email.mjs';
import { lerProposta, baixarArquivo } from '../lib/propostas.mjs';

export const config = { path: '/api/proposta-email', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel !== 'admin') return json({ mensagem: 'Só a administração.' }, 403);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const id = String(b.proposta_id || '');
  const para = String(b.para || '').trim().toLowerCase();
  const assunto = String(b.assunto || '').trim().slice(0, 200);
  const texto = String(b.texto || '').trim().slice(0, 8000);
  if (!UUID.test(id)) return json({ mensagem: 'Proposta inválida.' }, 400);
  if (!EMAIL.test(para)) return json({ mensagem: 'E-mail do contato inválido.' }, 400);
  if (!assunto || !texto) return json({ mensagem: 'Preencha assunto e mensagem.' }, 400);
  const p = await lerProposta(id);
  if (!p) return json({ mensagem: 'Proposta não encontrada.' }, 404);
  if (!p.arquivo_storage) return json({ mensagem: 'Esta proposta ainda não tem o arquivo montado. Clique em "Montar o arquivo" antes.' }, 409);
  const arquivo = await baixarArquivo(p.arquivo_storage);
  if (!arquivo) return json({ mensagem: 'Não consegui ler o arquivo da proposta no Supabase.' }, 500);
  const e = modeloEmail({ assunto, titulo: assunto, blocos: texto.split(/\n{2,}/).map((x) => ({ p: x })), rodape: `Mensagem enviada por ${eu.nome} · Mentorei · contato@mentorei.com.br` });
  const r = await enviarEmail({ para: [{ email: para, name: String(b.nome || '').slice(0, 120) || undefined }], assunto, html: e.html, texto: e.texto,
    anexos: [{ name: p.arquivo || 'Proposta-Mentorei.pptx', content: arquivo.toString('base64') }] });
  if (!r.enviado) return json({ mensagem: `Não consegui enviar: ${r.mensagem}.` }, 502);
  return json({ ok: true, arquivo: p.arquivo });
};
