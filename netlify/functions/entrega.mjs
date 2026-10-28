// Envio do mentorado (script 37) ou do aluno da turma (script 49): depois que a pessoa manda uma tarefa, ferramenta preenchida ou
// documento, os mentores recebem um e-mail (uma vez por envio, coluna entregas.avisado_em). Mentorado: os mentores dele.
// Aluno: os mentores do módulo (sem módulo, os mentores da turma). Só recebe quem já usa a plataforma (aceitou o termo) e tem
// e-mail de verdade. Os arquivos não vão no e-mail: ficam na plataforma, que confere quem pode abrir.
// acao 'retorno' (script 49): o mentor respondeu; quem enviou recebe o aviso por e-mail, se autorizou e-mails no termo.
import { json, supa, quemPede, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';

export const config = { path: '/api/entrega', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTULO = { tarefa: 'a tarefa', ferramenta: 'a ferramenta preenchida', documento: 'um documento' };
const primeiroNome = (n) => String(n || '').split(' ')[0];

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ ok: false, mensagem: 'Entre de novo na plataforma.' }, 401);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }
  if (!UUID.test(String(b.id || ''))) return json({ ok: false, mensagem: 'Pedido desconhecido.' }, 400);

  let r = await supa(`/rest/v1/entregas?id=eq.${b.id}&select=*,mentorado:mentorados(id,nome,perfil_id),aluno:turma_alunos(id,nome,perfil_id,turma_id,turma:turmas(nome)),modulo:modulos(id,numero,titulo)`);
  if (!r.ok) r = await supa(`/rest/v1/entregas?id=eq.${b.id}&select=*,mentorado:mentorados(id,nome,perfil_id)`);   // antes do script 49
  const e = r.ok && Array.isArray(r.dados) && r.dados[0];
  const dono = e && (e.mentorado || e.aluno);
  if (!dono) return json({ ok: false, mensagem: 'Envio não encontrado.' }, 404);

  if (b.acao === 'retorno') return avisarRetorno(eu, e, dono, !!b.primeira);

  if (dono.perfil_id !== eu.id) return json({ ok: false, mensagem: 'Sem acesso a este envio.' }, 403);
  if (e.avisado_em) return json({ ok: true, enviados: [] });

  // marca antes de mandar: um segundo pedido não repete o e-mail
  await supa(`/rest/v1/entregas?id=eq.${e.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { avisado_em: new Date().toISOString() } });

  let pessoas = [], link, onde;
  if (e.mentorado) {
    const v = await supa(`/rest/v1/mentor_mentorado?mentorado_id=eq.${e.mentorado.id}&select=mentor:perfis(id,nome,email,ativo,termo_aceito_em)`);
    pessoas = (v.ok && Array.isArray(v.dados) ? v.dados : []).map((x) => x.mentor);
    link = `${SITE}/app.html#/mentorado/${e.mentorado.id}`;
    onde = 'Os arquivos ficam na ficha do mentorado e na tela da sessão, em "Documentos enviados".';
  } else {
    const filtro = e.modulo_id ? `modulo_id=eq.${e.modulo_id}` : `modulo_id=in.(${await modulosDaTurma(e.aluno.turma_id)})`;
    const v = await supa(`/rest/v1/modulo_mentores?${filtro}&select=mentor:perfis(id,nome,email,ativo,termo_aceito_em)`);
    const vistos = new Set();
    pessoas = (v.ok && Array.isArray(v.dados) ? v.dados : []).map((x) => x.mentor).filter((p) => p && !vistos.has(p.id) && vistos.add(p.id));
    link = e.modulo_id ? `${SITE}/app.html#/modulo/${e.modulo_id}` : `${SITE}/app.html#/turma/${e.aluno.turma_id}`;
    onde = e.modulo_id ? 'Os arquivos ficam no módulo, em "Envios dos alunos".' : 'Os arquivos ficam na página da turma, em "Envios dos alunos".';
  }
  const mentores = pessoas.filter((p) => p && p.ativo && p.termo_aceito_em && emailReal(p.email));
  const deOnde = e.aluno ? ` (${e.aluno.turma ? `trilha ${e.aluno.turma.nome}` : 'trilha'}${e.modulo ? `, Módulo ${e.modulo.numero} · ${e.modulo.titulo}` : ''})` : '';
  const arquivos = (e.arquivos || []).map((a) => a.nome);
  const enviados = [];
  for (const m of mentores) {
    const mail = modeloEmail({
      assunto: `${primeiroNome(dono.nome)} enviou ${ROTULO[e.tipo] || 'um documento'}`,
      titulo: `${primeiroNome(dono.nome)} enviou ${ROTULO[e.tipo] || 'um documento'}`,
      blocos: [
        { p: `Olá, ${primeiroNome(m.nome)}! ${dono.nome}${deOnde} mandou para você pela plataforma da Mentorei.` },
        { lista: [e.titulo ? `${e.tipo === 'tarefa' ? 'Tarefa' : e.tipo === 'ferramenta' ? 'Ferramenta' : 'Sobre'}: ${e.titulo}` : '',
          arquivos.length ? `Arquivos: ${arquivos.join(', ')}` : 'Sem arquivo, só o recado'].filter(Boolean) },
        ...(e.mensagem ? [{ titulo: 'Recado' }, { p: e.mensagem }] : []),
        { botao: { texto: 'Abrir na plataforma', link } },
        { nota: `${onde} Lá você também pode responder.` },
      ],
    });
    const env = await enviarEmail({ para: [{ email: m.email, name: m.nome }], assunto: mail.assunto, html: mail.html, texto: mail.texto });
    if (env.enviado) enviados.push(m.nome);
  }
  return json({ ok: true, enviados });
};

async function modulosDaTurma(turmaId) {
  const r = await supa(`/rest/v1/modulos?turma_id=eq.${turmaId}&select=id`);
  return ((r.ok && r.dados) || []).map((x) => x.id).join(',') || '00000000-0000-0000-0000-000000000000';
}

// O mentor respondeu: e-mail para quem enviou (só na primeira resposta, e só se autorizou e-mails).
async function avisarRetorno(eu, e, dono, primeira) {
  if (!e.retorno || e.retorno_por !== eu.id) return json({ ok: false, mensagem: 'Sem resposta para avisar.' }, 400);
  if (!primeira) return json({ ok: true, enviados: [] });
  if (!dono.perfil_id) return json({ ok: true, enviados: [] });
  const p = await supa(`/rest/v1/perfis?id=eq.${dono.perfil_id}&select=nome,email,ativo,autorizacoes`);
  const pessoa = p.ok && p.dados && p.dados[0];
  if (!pessoa || !pessoa.ativo || !emailReal(pessoa.email) || !(pessoa.autorizacoes && pessoa.autorizacoes.email)) return json({ ok: true, enviados: [] });
  const link = e.aluno ? `${SITE}/app.html#/trilha/${e.aluno.turma_id}` : `${SITE}/app.html#/minha-area`;
  const mail = modeloEmail({
    assunto: `${primeiroNome(eu.nome)} respondeu o que você enviou`,
    titulo: `${primeiroNome(eu.nome)} respondeu o que você enviou`,
    blocos: [
      { p: `Olá, ${primeiroNome(pessoa.nome)}! ${eu.nome} leu ${e.tipo === 'tarefa' ? 'a sua tarefa' : e.tipo === 'ferramenta' ? 'a ferramenta que você preencheu' : 'o que você enviou'}${e.titulo ? ` (${e.titulo})` : ''} e deixou uma resposta.` },
      { titulo: 'Resposta' }, { p: e.retorno },
      { botao: { texto: 'Abrir na plataforma', link } },
    ],
  });
  const env = await enviarEmail({ para: [{ email: pessoa.email, name: pessoa.nome }], assunto: mail.assunto, html: mail.html, texto: mail.texto });
  return json({ ok: true, enviados: env.enviado ? [pessoa.nome] : [] });
}
