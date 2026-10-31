// Vídeos de boas-vindas de uma série, para a página PÚBLICA tutorial.html (o convidado assiste antes de criar a senha; script 63).
// Devolve só os tutoriais ativos que já têm vídeo: número, título, frase, duração e o endereço do vídeo na pasta pública.
import { supa, SUPABASE_URL } from '../lib/google.mjs';
import { SERIES } from '../../public/assets/tutoriais-regras.js';

export const config = { path: '/api/tutoriais', method: 'GET', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };

const resposta = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex, nofollow' },
});

export default async (req) => {
  const serie = new URL(req.url).searchParams.get('s') || '';
  if (!SERIES[serie]) return resposta({ mensagem: 'Série não encontrada.' }, 404);
  const r = await supa(`/rest/v1/tutoriais?serie=eq.${serie}&ativo=is.true&video=not.is.null&select=numero,titulo,descricao,duracao_seg,video&order=numero`);
  if (!r.ok) return resposta({ mensagem: 'Os vídeos ainda não estão disponíveis.' }, 503);
  return resposta({
    serie, titulo: SERIES[serie].titulo,
    videos: (r.dados || []).map((t) => ({ numero: t.numero, titulo: t.titulo, descricao: t.descricao, duracao_seg: t.duracao_seg,
      url: `${SUPABASE_URL}/storage/v1/object/public/tutoriais/${t.video.split('/').map(encodeURIComponent).join('/')}` })),
  });
};
