// Toda segunda-feira às 6h (Brasília): cópia de segurança em Excel para a pasta do Google Drive.
import { chaveBackup } from '../lib/backup.mjs';
import { SITE } from '../lib/google.mjs';

export const config = { schedule: '0 9 * * 1' }; // segunda, 9h no horário universal = 6h em Brasília

export default async () => {
  await fetch(`${SITE}/api/backup-fundo`, { method: 'POST', headers: { 'x-mentorei-backup': chaveBackup(), 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'semanal' }) }).catch(() => null);
  return new Response('Cópia semanal pedida.');
};
