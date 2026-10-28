// Todo dia às 4h (Brasília): apaga os PDFs de certificados gerados há mais de 45 dias (decisão da Juliana, 27/10/2026).
// O certificado continua válido e a plataforma gera de novo, igual, quando alguém pedir (o retrato fica guardado).
import { supa } from '../lib/google.mjs';
import { apagarArquivos, DIAS_GUARDADOS } from '../lib/certificados.mjs';

export const config = { schedule: '0 7 * * *' }; // 7h no horário universal = 4h em Brasília

export default async () => {
  const antes = new Date(Date.now() - DIAS_GUARDADOS * 86400000).toISOString();
  let apagados = 0;
  for (let volta = 0; volta < 20; volta++) {
    const r = await supa(`/rest/v1/cert_certificados?pdf_caminho=not.is.null&pdf_em=lt.${encodeURIComponent(antes)}&select=id,pdf_caminho&limit=200`);
    if (!r.ok || !r.dados || !r.dados.length) break;
    if (!(await apagarArquivos(r.dados.map((c) => c.pdf_caminho)))) break;
    await supa(`/rest/v1/cert_certificados?id=in.(${r.dados.map((c) => c.id).join(',')})`, { metodo: 'PATCH', corpo: { pdf_caminho: null } });
    apagados += r.dados.length;
  }
  return new Response(`PDFs apagados: ${apagados}`);
};
