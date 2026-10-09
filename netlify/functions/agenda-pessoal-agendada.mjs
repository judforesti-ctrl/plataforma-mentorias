// A cada 15 minutos, lê de novo as agendas pessoais ligadas (reuniões que os clientes marcaram, mudanças e cancelamentos).
import { chaveFundoPessoal } from '../lib/agenda-pessoal.mjs';
import { SITE } from '../lib/google.mjs';

export const config = { schedule: '*/15 * * * *' };

export default async () => {
  await fetch(`${SITE}/api/agenda-pessoal-fundo`, { method: 'POST', headers: { 'x-mentorei-sync': chaveFundoPessoal() } }).catch(() => null);
  return new Response('Leitura das agendas pessoais pedida.');
};
