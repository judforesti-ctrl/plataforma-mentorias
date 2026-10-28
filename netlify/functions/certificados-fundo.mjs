// Gera os PDFs de um lote de certificados em segundo plano (até 15 min por vez). Só aceita pedidos da própria plataforma
// (chave assinada por lote). Se o lote não couber no tempo, pede para continuar de onde parou.
import { processarLote, conferirChave, pedirGeracao } from '../lib/certificados.mjs';

export const config = { path: '/api/certificados-fundo', method: 'POST', background: true };

export default async (req) => {
  let corpo = {};
  try { corpo = await req.json(); } catch (_) { return; }
  if (!corpo.lote || !conferirChave(corpo.lote, req.headers.get('x-mentorei-cert'))) return;
  try {
    const r = await processarLote(corpo.lote);
    if (r === 'continuar') await pedirGeracao(corpo.lote);
  } catch (e) {
    console.error('certificados', corpo.lote, e && e.message);
  }
};
