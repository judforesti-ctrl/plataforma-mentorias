// Sincronização completa dos convites da Google Agenda, em segundo plano (pode levar alguns minutos na primeira vez).
// Chamada pelo agendamento a cada 15 minutos e pelo botão "Sincronizar agora"; só aceita pedidos da própria plataforma.
import { timingSafeEqual } from 'node:crypto';
import { sincronizar, salvarResultado, chaveFundo } from '../lib/google-sync.mjs';

export const config = { path: '/api/google-sync-fundo', method: 'POST', background: true };

export default async (req) => {
  const veio = Buffer.from(String(req.headers.get('x-mentorei-sync') || ''));
  const certo = Buffer.from(chaveFundo());
  if (veio.length !== certo.length || !timingSafeEqual(veio, certo)) return;
  const res = await sincronizar({ limiteMs: 13 * 60 * 1000 });
  if (!res.desligado) await salvarResultado(res);
};
