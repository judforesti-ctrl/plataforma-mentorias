// Todo dia às 8h (Brasília): 1) cada responsável recebe por e-mail os contatos de venda do dia e os atrasados;
// 2) programa ou turma que terminou vira uma oportunidade "Renovação", com contato marcado para 30 dias depois.
import { supa, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';

export const config = { schedule: '0 11 * * *' }; // 11h no horário universal = 8h em Brasília

const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const horaBR = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

export default async () => {
  const ops = await supa('/rest/v1/oportunidades?etapa=not.in.(fechado,perdido)&select=id,titulo,valor,proximo_contato_em,proximo_contato_por,proximo_contato_obs,empresa:empresas(nome)');
  if (!ops.ok) return new Response('Script 19 ainda não rodado.');
  const pessoas = await supa('/rest/v1/perfis?ativo=eq.true&select=id,nome,email,papel,criado_em&order=criado_em');
  const nomeDe = (id) => (pessoas.dados || []).find((p) => p.id === id) || null;
  const fimHoje = new Date(`${new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })}T23:59:59-03:00`).getTime();

  // 1. lembretes por responsável
  const porPessoa = new Map();
  for (const o of ops.dados) {
    if (!o.proximo_contato_em || !o.proximo_contato_por || new Date(o.proximo_contato_em).getTime() > fimHoje) continue;
    if (!porPessoa.has(o.proximo_contato_por)) porPessoa.set(o.proximo_contato_por, []);
    porPessoa.get(o.proximo_contato_por).push(o);
  }
  let enviados = 0;
  for (const [id, lista] of porPessoa) {
    const p = nomeDe(id);
    if (!p || !emailReal(p.email)) continue;
    lista.sort((a, b) => a.proximo_contato_em.localeCompare(b.proximo_contato_em));
    const atrasados = lista.filter((o) => new Date(o.proximo_contato_em).getTime() < Date.now() - 86400e3);
    const linha = (o) => `${dataBR(o.proximo_contato_em)} ${horaBR(o.proximo_contato_em)} · ${(o.empresa && o.empresa.nome) || ''} · ${o.proximo_contato_obs || o.titulo}`;
    const e = modeloEmail({ assunto: `Contatos de venda de hoje (${lista.length})`, titulo: 'Seus contatos de venda', blocos: [
      { p: `Olá, ${String(p.nome).split(' ')[0]}! Estes são os contatos de venda marcados para você${atrasados.length ? `, inclusive ${atrasados.length} atrasado(s)` : ''}:` },
      { lista: lista.map(linha) },
      { botao: { texto: 'Abrir o pipeline', link: `${SITE}/app.html#/vendas` } },
      { nota: 'Depois de falar com o cliente, registre no histórico da oportunidade e marque o próximo contato.' },
    ] });
    const r = await enviarEmail({ para: [{ email: p.email, name: p.nome }], assunto: e.assunto, html: e.html, texto: e.texto });
    if (r.enviado) enviados += 1;
  }

  // 2. renovações: programa ou turma que terminou e ainda não tem oportunidade de renovação
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [prog, turm, todas] = await Promise.all([
    supa(`/rest/v1/programas?select=id,nome,empresa_id,status,fim_previsto,sessoes_por_mentorado&or=(status.eq.concluido,fim_previsto.lt.${hoje})`),
    supa(`/rest/v1/turmas?select=id,nome,empresa_id,status,fim_previsto&or=(status.eq.concluida,fim_previsto.lt.${hoje})`),
    supa('/rest/v1/oportunidades?select=programa_id,turma_id,titulo'),
  ]);
  const admin = (pessoas.dados || []).find((p) => p.papel === 'admin');
  let renov = 0;
  const jaTem = (campo, id) => (todas.dados || []).some((o) => o[campo] === id && /^Renovação/.test(o.titulo || ''));
  const prox = new Date(); prox.setUTCDate(prox.getUTCDate() + 30); prox.setUTCHours(12, 0, 0, 0);
  const criar = async (base) => {
    const r = await supa('/rest/v1/oportunidades', { metodo: 'POST', prefer: 'return=minimal', corpo: { ...base, etapa: 'contato', responsavel_id: admin ? admin.id : null,
      proximo_contato_em: prox.toISOString(), proximo_contato_por: admin ? admin.id : null, proximo_contato_obs: 'Conversar sobre renovação ou próxima turma', criado_por: admin ? admin.id : null } });
    if (r.ok) renov += 1;
  };
  for (const p of (prog.ok && prog.dados) || []) if (!jaTem('programa_id', p.id)) await criar({ empresa_id: p.empresa_id, titulo: `Renovação · ${p.nome}`, servico: 'mentoria_individual', programa_id: p.id });
  for (const t of (turm.ok && turm.dados) || []) if (!jaTem('turma_id', t.id)) await criar({ empresa_id: t.empresa_id, titulo: `Renovação · ${t.nome}`, servico: 'mentoria_grupo', turma_id: t.id });

  return new Response(`Lembretes: ${enviados}. Renovações criadas: ${renov}.`);
};
