// Todo dia às 8h (Brasília): quem tem entrega do checklist hoje ou amanhã recebe um e-mail com elas (e as atrasadas, se houver).
// Atrasada sozinha não gera e-mail todo dia: ela aparece no checklist, na agenda e no Painel.
import { supa, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';
const prazoTexto = (a) => new Date(`${a.prazo}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' });

export const config = { schedule: '0 11 * * *' }; // 11h no horário universal = 8h em Brasília

export default async () => {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const amanha = new Date(Date.parse(`${hoje}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const r = await supa(`/rest/v1/atividades?situacao=eq.aberta&prazo=lte.${amanha}&select=id,titulo,prazo,prazo_hora,grupo,vinculo_nome,responsaveis&order=prazo`);
  if (!r.ok) return new Response('Script 25 ainda não rodado.');
  const porPessoa = new Map();
  for (const a of r.dados) for (const id of a.responsaveis || []) { if (!porPessoa.has(id)) porPessoa.set(id, []); porPessoa.get(id).push(a); }
  if (!porPessoa.size) return new Response('Nada para lembrar.');
  const p = await supa(`/rest/v1/perfis?id=in.(${[...porPessoa.keys()].join(',')})&ativo=eq.true&select=id,nome,email,termo_aceito_em`);
  let enviados = 0;
  for (const pessoa of (p.ok && Array.isArray(p.dados) ? p.dados : [])) {
    if (!pessoa.termo_aceito_em || !emailReal(pessoa.email)) continue;
    const lista = porPessoa.get(pessoa.id) || [];
    const deHoje = lista.filter((a) => a.prazo === hoje), deAmanha = lista.filter((a) => a.prazo === amanha), atrasadas = lista.filter((a) => a.prazo < hoje);
    if (!deHoje.length && !deAmanha.length) continue;
    const item = (a) => `${a.titulo}${a.prazo_hora ? ` (até ${String(a.prazo_hora).slice(0, 5)})` : ''}${a.grupo ? ` · ${a.grupo}` : ''}`;
    const blocos = [{ p: `Bom dia, ${String(pessoa.nome || '').split(' ')[0]}! Estas são as suas entregas do checklist da Mentorei.` }];
    if (deHoje.length) blocos.push({ titulo: 'Para hoje' }, { lista: deHoje.map(item) });
    if (deAmanha.length) blocos.push({ titulo: 'Para amanhã' }, { lista: deAmanha.map(item) });
    if (atrasadas.length) blocos.push({ titulo: 'Atrasadas' }, { lista: atrasadas.map((a) => `${item(a)} · era para ${prazoTexto(a)}`) });
    blocos.push({ botao: { texto: 'Abrir o checklist', link: `${SITE}/app.html#/checklist` } });
    blocos.push({ nota: 'Quando terminar, marque como feita no checklist. Se a data mudou, abra a atividade e troque a data da entrega.' });
    const assunto = deHoje.length ? `Checklist: ${deHoje.length} ${deHoje.length === 1 ? 'entrega' : 'entregas'} para hoje` : `Checklist: ${deAmanha.length} ${deAmanha.length === 1 ? 'entrega' : 'entregas'} para amanhã`;
    const e = modeloEmail({ assunto, titulo: 'Suas entregas do checklist', blocos });
    const env = await enviarEmail({ para: [{ email: pessoa.email, name: pessoa.nome }], assunto: e.assunto, html: e.html, texto: e.texto });
    if (env.enviado) enviados += 1;
  }
  return new Response(`${enviados} lembrete(s) enviado(s).`);
};
