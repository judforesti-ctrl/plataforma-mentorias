// Resumo da semana por e-mail: toda segunda-feira às 7h (Brasília), se a administração ligou em Agenda → Celular e e-mail.
// Cada mentor que já usa a plataforma recebe a própria semana; a coordenação recebe o resumo da equipe.
import { supa } from '../lib/google.mjs';
import { enviarEmail, COORDENACAO } from '../lib/email.mjs';
import { dadosAgenda, emailResumoMentor, emailResumoCoordenacao } from '../lib/agenda.mjs';

export const config = { schedule: '0 10 * * 1' }; // 10h no horário universal = 7h em Brasília

export default async () => {
  const cfg = await supa('/rest/v1/configuracoes?chave=eq.resumo_semanal&select=valor');
  const ligado = cfg.ok && cfg.dados && cfg.dados[0] && cfg.dados[0].valor && cfg.dados[0].valor.ligado;
  if (!ligado) return new Response('Resumo semanal desligado.');
  const d = await dadosAgenda();
  let enviados = 0;
  for (const m of d.mentores) {
    if (!m.email || !m.termo_aceito_em) continue; // só quem já usa a plataforma
    const e = emailResumoMentor(d, m);
    const r = await enviarEmail({ para: [{ email: m.email, name: m.nome }], assunto: e.assunto, html: e.html, texto: e.texto });
    if (r.enviado) enviados += 1;
  }
  const c = emailResumoCoordenacao(d);
  await enviarEmail({ para: [{ email: COORDENACAO, name: 'Coordenação Mentorei' }], assunto: c.assunto, html: c.html, texto: c.texto });
  return new Response(`Resumo enviado para ${enviados} mentor(es) e para a coordenação.`);
};
