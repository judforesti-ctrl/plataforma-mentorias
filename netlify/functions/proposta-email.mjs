// Envia a proposta (PowerPoint ou PDF) por e-mail, de contato@mentorei.com.br pelo Brevo, para uma ou várias pessoas
// (contatos do cliente e outros e-mails), com cópia oculta para quem enviou (se pedir). Arquivo de até 4 MB vai anexado;
// maior que isso (ou se o Brevo recusar o anexo) vai um botão com link para baixar, que vale 60 dias.
// Cada envio fica em proposta_envios (script 38). A tela marca a proposta como enviada e agenda o retorno. Só a administração.
import { json, quemPede, supa } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';
import { lerProposta, baixarArquivo, linkAssinado } from '../lib/propostas.mjs';

export const config = { path: '/api/proposta-email', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ANEXO_MAX = 4 * 1024 * 1024;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel !== 'admin') return json({ mensagem: 'Só a administração.' }, 403);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const id = String(b.proposta_id || '');
  // "para": lista [{ email, nome, contato_id }] (ou, do jeito antigo, um e-mail só com "nome")
  const lista = Array.isArray(b.para) ? b.para : [{ email: b.para, nome: b.nome }];
  const vistos = new Set();
  const para = lista.map((x) => ({ email: String((x && x.email) || '').trim().toLowerCase(), nome: String((x && x.nome) || '').trim().slice(0, 120), contato_id: UUID.test(String(x && x.contato_id)) ? x.contato_id : null }))
    .filter((x) => x.email && !vistos.has(x.email) && vistos.add(x.email));
  const assunto = String(b.assunto || '').trim().slice(0, 200);
  const texto = String(b.texto || '').trim().slice(0, 8000);
  if (!UUID.test(id)) return json({ mensagem: 'Proposta inválida.' }, 400);
  if (!para.length) return json({ mensagem: 'Escolha pelo menos uma pessoa para receber.' }, 400);
  const errado = para.find((x) => !EMAIL.test(x.email));
  if (errado) return json({ mensagem: `Este e-mail está escrito errado: ${errado.email}` }, 400);
  if (para.length > 15) return json({ mensagem: 'No máximo 15 pessoas por envio.' }, 400);
  if (!assunto || !texto) return json({ mensagem: 'Preencha assunto e mensagem.' }, 400);
  const p = await lerProposta(id);
  if (!p) return json({ mensagem: 'Proposta não encontrada.' }, 404);
  if (!p.arquivo_storage) return json({ mensagem: 'Esta proposta ainda não tem o arquivo. Anexe o arquivo da proposta antes de enviar.' }, 409);
  const arquivo = await baixarArquivo(p.arquivo_storage);
  if (!arquivo) return json({ mensagem: 'Não consegui ler o arquivo da proposta no Supabase.' }, 500);
  const nomeArq = p.arquivo || p.arquivo_storage.split('/').pop() || 'Proposta-Mentorei.pptx';

  // cópia oculta para quem enviou
  let copia = null;
  if (b.copia) {
    const r = await supa(`/rest/v1/perfis?id=eq.${eu.id}&select=email`);
    const e = r.ok && r.dados && r.dados[0] && r.dados[0].email;
    if (emailReal(e) && !vistos.has(String(e).toLowerCase())) copia = String(e).toLowerCase();
  }

  const montar = (link) => modeloEmail({ assunto, titulo: assunto, rodape: `Mensagem enviada por ${eu.nome} · Mentorei · contato@mentorei.com.br`,
    blocos: [...texto.split(/\n{2,}/).map((x) => ({ p: x })), ...(link ? [{ botao: { texto: 'Baixar a proposta', link } }, { nota: `O link para baixar o arquivo ${nomeArq} vale por 60 dias.` }] : [])] });
  const enviar = async (comoLink) => {
    const link = comoLink ? await linkAssinado(p.arquivo_storage, nomeArq, 60) : null;
    if (comoLink && !link) return { enviado: false, mensagem: 'não consegui criar o link para baixar o arquivo' };
    const e = montar(link);
    return enviarEmail({ para: para.map((x) => ({ email: x.email, name: x.nome || undefined })), assunto, html: e.html, texto: e.texto,
      ...(comoLink ? {} : { anexos: [{ name: nomeArq, content: arquivo.toString('base64') }] }),
      ...(copia ? { copiaOculta: [{ email: copia, name: eu.nome }] } : {}) });
  };
  let como = arquivo.length <= ANEXO_MAX ? 'anexo' : 'link';
  let r = await enviar(como === 'link');
  // o Brevo recusou o anexo (tamanho ou tipo): manda com o link
  if (!r.enviado && como === 'anexo' && /recusou o envio/i.test(r.mensagem || '')) { como = 'link'; r = await enviar(true); }
  if (!r.enviado) return json({ mensagem: `Não consegui enviar: ${r.mensagem}.` }, 502);

  // registro do envio (sem o script 38, segue sem registrar aqui; a tela ainda grava no histórico da oportunidade)
  const reg = await supa('/rest/v1/proposta_envios', { metodo: 'POST', prefer: 'return=minimal', corpo: {
    proposta_id: p.id, oportunidade_id: p.oportunidade_id, enviado_por: eu.id, canal: 'email', para, copia_para: copia, assunto, mensagem: texto, arquivo: nomeArq, como } });
  return json({ ok: true, arquivo: nomeArq, como, copia, registrado: reg.ok });
};
