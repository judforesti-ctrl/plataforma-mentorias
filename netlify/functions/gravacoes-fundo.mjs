// Leitura da pasta das gravações do Zoom, em segundo plano (a primeira vez pode ter muitos vídeos).
// Chamada pela leitura de hora em hora e pelos botões "Procurar agora"/"Ligar a pasta"; só aceita pedidos da própria plataforma.
import { timingSafeEqual } from 'node:crypto';
import { lerGravacoes, chaveGravacoes } from '../lib/gravacoes.mjs';

export const config = { path: '/api/gravacoes-fundo', method: 'POST', background: true };

export default async (req) => {
  const veio = Buffer.from(String(req.headers.get('x-mentorei-gravacoes') || ''));
  const certo = Buffer.from(chaveGravacoes());
  if (veio.length !== certo.length || !timingSafeEqual(veio, certo)) return;
  await lerGravacoes({ limiteMs: 10 * 60 * 1000 });
};
