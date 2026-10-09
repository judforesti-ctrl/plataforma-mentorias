// Leitura das agendas pessoais ligadas, em segundo plano (chamada pelo agendamento a cada 15 minutos).
// Só aceita pedidos da própria plataforma.
import { timingSafeEqual } from 'node:crypto';
import { atualizarTodas, chaveFundoPessoal } from '../lib/agenda-pessoal.mjs';

export const config = { path: '/api/agenda-pessoal-fundo', method: 'POST', background: true };

export default async (req) => {
  const veio = Buffer.from(String(req.headers.get('x-mentorei-sync') || ''));
  const certo = Buffer.from(chaveFundoPessoal());
  if (veio.length !== certo.length || !timingSafeEqual(veio, certo)) return;
  await atualizarTodas();
};
