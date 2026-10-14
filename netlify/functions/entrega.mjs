// Envio do mentorado (script 37): depois que o mentorado manda uma tarefa, ferramenta preenchida ou documento,
// os mentores dele recebem um e-mail (uma vez por envio, coluna entregas.avisado_em). Só recebe quem já usa a plataforma
// (aceitou o termo) e tem e-mail de verdade. Os arquivos não vão no e-mail: ficam na plataforma, que confere quem pode abrir.
import { json, supa, quemPede, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';

export const config = { path: '/api/entrega', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTULO = { tarefa: 'a tarefa', ferramenta: 'a ferramenta preenchida', documento: 'um documento' };

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ ok: false, mensagem: 'Entre de novo na plataforma.' }, 401);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }
  if (!UUID.test(String(b.id || ''))) return json({ ok: false, mensagem: 'Pedido desconhecido.' }, 400);

  const r = await supa(`/rest/v1/entregas?id=eq.${b.id}&select=*,mentorado:mentorados(id,nome,perfil_id)`);
  const e = r.ok && Array.isArray(r.dados) && r.dados[0];
  if (!e || !e.mentorado) return json({ ok: false, mensagem: 'Envio não encontrado.' }, 404);
  if (e.mentorado.perfil_id !== eu.id) return json({ ok: false, mensagem: 'Sem acesso a este envio.' }, 403);
  if (e.avisado_em) return json({ ok: true, enviados: [] });

  // marca antes de mandar: um segundo pedido não repete o e-mail
  await supa(`/rest/v1/entregas?id=eq.${e.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { avisado_em: new Date().toISOString() } });

  const v = await supa(`/rest/v1/mentor_mentorado?mentorado_id=eq.${e.mentorado.id}&select=mentor:perfis(id,nome,email,ativo,termo_aceito_em)`);
  const mentores = (v.ok && Array.isArray(v.dados) ? v.dados : []).map((x) => x.mentor)
    .filter((p) => p && p.ativo && p.termo_aceito_em && emailReal(p.email));
  const primeiro = String(e.mentorado.nome || '').split(' ')[0];
  const arquivos = (e.arquivos || []).map((a) => a.nome);
  const enviados = [];
  for (const m of mentores) {
    const mail = modeloEmail({
      assunto: `${primeiro} enviou ${ROTULO[e.tipo] || 'um documento'}`,
      titulo: `${primeiro} enviou ${ROTULO[e.tipo] || 'um documento'}`,
      blocos: [
        { p: `Olá, ${String(m.nome || '').split(' ')[0]}! ${e.mentorado.nome} mandou para você pela plataforma da Mentorei.` },
        { lista: [e.titulo ? `${e.tipo === 'tarefa' ? 'Tarefa' : e.tipo === 'ferramenta' ? 'Ferramenta' : 'Sobre'}: ${e.titulo}` : '',
          arquivos.length ? `Arquivos: ${arquivos.join(', ')}` : 'Sem arquivo, só o recado'].filter(Boolean) },
        ...(e.mensagem ? [{ titulo: 'Recado' }, { p: e.mensagem }] : []),
        { botao: { texto: 'Abrir na plataforma', link: `${SITE}/app.html#/mentorado/${e.mentorado.id}` } },
        { nota: 'Os arquivos ficam na ficha do mentorado e na tela da sessão, em "Documentos enviados".' },
      ],
    });
    const env = await enviarEmail({ para: [{ email: m.email, name: m.nome }], assunto: mail.assunto, html: mail.html, texto: mail.texto });
    if (env.enviado) enviados.push(m.nome);
  }
  return json({ ok: true, enviados });
};
