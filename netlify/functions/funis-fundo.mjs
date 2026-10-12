// Rodada dos funis de e-mail em segundo plano (chamada de hora em hora e pelo botão "Rodar agora"). Só aceita pedidos da plataforma.
import { timingSafeEqual } from 'node:crypto';
import { rodarFunis, chaveFundoFunis } from '../lib/funis.mjs';

export const config = { path: '/api/funis-fundo', method: 'POST', background: true };

export default async (req) => {
  const veio = Buffer.from(String(req.headers.get('x-mentorei-sync') || ''));
  const certo = Buffer.from(chaveFundoFunis());
  if (veio.length !== certo.length || !timingSafeEqual(veio, certo)) return;
  await rodarFunis();
};
