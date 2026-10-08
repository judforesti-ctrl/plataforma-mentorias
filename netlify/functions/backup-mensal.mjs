// Todo dia 1 às 7h (Brasília): cópia de segurança para o Drive e por e-mail para as sócias.
import { chaveBackup } from '../lib/backup.mjs';
import { SITE } from '../lib/google.mjs';

export const config = { schedule: '0 10 1 * *' }; // dia 1, 10h no horário universal = 7h em Brasília

export default async () => {
  await fetch(`${SITE}/api/backup-fundo`, { method: 'POST', headers: { 'x-mentorei-backup': chaveBackup(), 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'mensal' }) }).catch(() => null);
  return new Response('Cópia mensal pedida.');
};
