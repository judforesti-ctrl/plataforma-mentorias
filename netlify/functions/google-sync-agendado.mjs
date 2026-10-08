// A cada 15 minutos, confere os convites da Google Agenda (pega também o que mudou fora das telas, como importações).
import { lerConfig, chaveFundo } from '../lib/google-sync.mjs';
import { SITE } from '../lib/google.mjs';

export const config = { schedule: '*/15 * * * *' };

export default async () => {
  const cfg = await lerConfig();
  if (!cfg.equipe && !cfg.mentorados) return new Response('Convites desligados.');
  await fetch(`${SITE}/api/google-sync-fundo`, { method: 'POST', headers: { 'x-mentorei-sync': chaveFundo() } }).catch(() => null);
  return new Response('Sincronização pedida.');
};
