// De hora em hora: procura gravações novas na pasta do Zoom no Google Drive (só se a administração já escolheu a pasta).
import { lerConfigGravacoes, pedirLeitura } from '../lib/gravacoes.mjs';

export const config = { schedule: '40 * * * *' };

export default async () => {
  const cfg = await lerConfigGravacoes();
  if (!cfg.pasta_id) return new Response('Nenhuma pasta de gravações escolhida.');
  await pedirLeitura();
  return new Response('Leitura das gravações pedida.');
};
