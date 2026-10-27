// De hora em hora: procura gravações novas nas contas do Zoom ligadas e na pasta do Google Drive (se a administração escolheu uma).
import { lerConfigGravacoes, pedirLeitura } from '../lib/gravacoes.mjs';
import { lerContasZoom } from '../lib/zoom.mjs';

export const config = { schedule: '40 * * * *' };

export default async () => {
  const cfg = await lerConfigGravacoes();
  if (!cfg.pasta_id && !(await lerContasZoom()).length) return new Response('Nenhuma conta do Zoom nem pasta do Drive ligada.');
  await pedirLeitura();
  return new Response('Leitura das gravações pedida.');
};
