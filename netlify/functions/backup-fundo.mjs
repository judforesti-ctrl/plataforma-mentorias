// Faz a cópia de segurança em segundo plano (pode levar alguns minutos). Chamada pelos agendamentos (semanal e mensal)
// e pelo botão "Fazer cópia agora" do Painel; só aceita pedidos da própria plataforma.
import { timingSafeEqual } from 'node:crypto';
import { executarBackup, chaveBackup } from '../lib/backup.mjs';

export const config = { path: '/api/backup-fundo', method: 'POST', background: true };

export default async (req) => {
  const veio = Buffer.from(String(req.headers.get('x-mentorei-backup') || ''));
  const certo = Buffer.from(chaveBackup());
  if (veio.length !== certo.length || !timingSafeEqual(veio, certo)) return;
  let modo = 'semanal';
  try { modo = (await req.json()).modo || modo; } catch (_) { /* sem corpo */ }
  await executarBackup(['semanal', 'mensal', 'manual'].includes(modo) ? modo : 'semanal');
};
