// De hora em hora (minuto 7): pede a rodada dos funis de e-mail em segundo plano (ler eventos do Brevo, regras e envios).
import { chaveFundoFunis } from '../lib/funis.mjs';
import { SITE } from '../lib/google.mjs';

export const config = { schedule: '7 * * * *' };

export default async () => {
  await fetch(`${SITE}/api/funis-fundo`, { method: 'POST', headers: { 'x-mentorei-sync': chaveFundoFunis() } }).catch(() => null);
  return new Response('Rodada dos funis pedida.');
};
