// Monta (ou remonta) o PowerPoint de uma proposta a partir do conteúdo salvo. Se a tela mandar "conteudo", salva as
// edições antes. Devolve o nome do arquivo e os avisos de texto que passou do tamanho. Só a administração.
import { json, quemPede, supa } from '../lib/google.mjs';
import { lerProposta, montarEGuardar } from '../lib/propostas.mjs';

export const config = { path: '/api/proposta-arquivo', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel !== 'admin') return json({ mensagem: 'Só a administração.' }, 403);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const id = String(b.proposta_id || '');
  if (!UUID.test(id)) return json({ mensagem: 'Proposta inválida.' }, 400);
  let p = await lerProposta(id);
  if (!p) return json({ mensagem: 'Proposta não encontrada.' }, 404);
  if (p.status === 'enviada') return json({ mensagem: 'Esta proposta já foi enviada: para mudar, gere uma nova versão.' }, 409);
  if (b.conteudo && typeof b.conteudo === 'object') {
    const corpo = { conteudo: b.conteudo, erro: null };
    if (p.status === 'erro' || p.status === 'gerando') corpo.status = 'rascunho';
    if (b.conteudo.resumo) corpo.resumo = String(b.conteudo.resumo).slice(0, 2000);
    const g = await supa(`/rest/v1/propostas?id=eq.${id}`, { metodo: 'PATCH', corpo });
    if (!g.ok) return json({ mensagem: 'Não consegui salvar as edições.' }, 500);
    p = { ...p, ...corpo };
  }
  try {
    const r = await montarEGuardar(p);
    return json({ ok: true, arquivo: r.nome, caminho: r.caminho, avisos: r.avisos });
  } catch (e) {
    return json({ mensagem: e.message || 'Não consegui montar o arquivo.' }, 500);
  }
};
