// Checklist: avisar  manda e-mail para quem passou a ser responsável por uma atividade (uma vez por pessoa).
// Só recebe quem já usa a plataforma (aceitou o termo) e tem e-mail de verdade; quem criou para si mesmo não recebe.
import { json, supa, quemPede, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';

export const config = { path: '/api/atividade', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const prazoTexto = (a) => {
  if (!a.prazo) return 'sem data definida';
  const d = new Date(`${a.prazo}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' });
  return `${d}${a.prazo_hora ? ` às ${String(a.prazo_hora).slice(0, 5)}` : ''}`;
};

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ ok: false, mensagem: 'Entre de novo na plataforma.' }, 401);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }
  if (b.acao !== 'avisar' || !UUID.test(String(b.id || ''))) return json({ ok: false, mensagem: 'Pedido desconhecido.' }, 400);

  const r = await supa(`/rest/v1/atividades?id=eq.${b.id}&select=*`);
  const a = r.ok && Array.isArray(r.dados) && r.dados[0];
  if (!a) return json({ ok: false, mensagem: 'Atividade não encontrada.' });
  const resp = a.responsaveis || [];
  if (eu.papel !== 'admin' && a.criado_por !== eu.id && !resp.includes(eu.id)) return json({ ok: false, mensagem: 'Sem acesso a esta atividade.' }, 403);

  const novos = resp.filter((id) => !(a.avisados || []).includes(id) && id !== eu.id);
  const enviados = [];
  if (novos.length && a.situacao !== 'feita') {
    const p = await supa(`/rest/v1/perfis?id=in.(${novos.join(',')})&ativo=eq.true&select=id,nome,email,termo_aceito_em`);
    for (const pessoa of (p.ok && Array.isArray(p.dados) ? p.dados : [])) {
      if (!pessoa.termo_aceito_em || !emailReal(pessoa.email)) continue;
      const e = modeloEmail({
        assunto: `Nova atividade para você: ${a.titulo}`,
        titulo: 'Uma atividade do checklist é sua',
        blocos: [
          { p: `Olá, ${String(pessoa.nome || '').split(' ')[0]}! ${eu.nome} colocou uma atividade do checklist da Mentorei sob a sua responsabilidade.` },
          { lista: [`Atividade: ${a.titulo}`, `Entrega: ${prazoTexto(a)}`, a.grupo ? `Lista: ${a.grupo}` : '', a.vinculo_nome ? `Ligada a: ${a.vinculo_nome}` : '',
            (a.responsaveis_nomes || []).length > 1 ? `Junto com: ${a.responsaveis_nomes.filter((n) => n !== pessoa.nome).join(', ')}` : ''].filter(Boolean) },
          ...(a.descricao ? [{ p: a.descricao }] : []),
          { botao: { texto: 'Abrir a atividade', link: `${SITE}/app.html#/checklist/${a.id}` } },
          { nota: a.prazo ? 'A entrega já aparece na sua agenda da plataforma. Quando terminar, marque como feita no checklist.' : 'Quando terminar, marque como feita no checklist.' },
        ],
      });
      const env = await enviarEmail({ para: [{ email: pessoa.email, name: pessoa.nome }], assunto: e.assunto, html: e.html, texto: e.texto });
      if (env.enviado) enviados.push(pessoa.nome);
    }
  }
  // todos os responsáveis de agora ficam marcados (quem ainda não usa a plataforma não recebe e-mail atrasado depois)
  const avisados = [...new Set([...(a.avisados || []), ...resp])];
  if (avisados.length !== (a.avisados || []).length) {
    await supa(`/rest/v1/atividades?id=eq.${a.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { avisados } });
  }
  return json({ ok: true, enviados });
};
