// Certificados (script 47): a tela pede aqui para gerar os PDFs de um lote; só a administração.
// O trabalho pesado roda em segundo plano (certificados-fundo), e a tela acompanha o andamento pela tabela cert_lotes.
import { supa, json, quemPede } from '../lib/google.mjs';
import { pedirGeracao } from '../lib/certificados.mjs';

export const config = { path: '/api/certificados', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu || eu.papel !== 'admin') return json({ mensagem: 'Só a administração emite certificados.' }, 403);
  let corpo = {};
  try { corpo = await req.json(); } catch (_) { /* sem corpo */ }
  if (corpo.acao !== 'gerar' || !UUID.test(String(corpo.lote || ''))) return json({ mensagem: 'Pedido inválido.' }, 400);
  const l = await supa(`/rest/v1/cert_lotes?id=eq.${corpo.lote}&select=id,status`);
  if (!l.ok || !l.dados || !l.dados[0]) return json({ mensagem: 'Lote não encontrado.' }, 404);
  if (l.dados[0].status !== 'pronto') await supa(`/rest/v1/cert_lotes?id=eq.${corpo.lote}`, { metodo: 'PATCH', corpo: { status: 'fila', erro: null } });
  const ok = await pedirGeracao(corpo.lote);
  if (!ok) return json({ mensagem: 'Não consegui começar a gerar os PDFs agora. Tente de novo em instantes.' }, 502);
  return json({ ok: true, mensagem: 'Gerando os certificados.' }, 202);
};
