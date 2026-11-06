// Relatório da jornada do mentorado (script 67): a administração liberou o relatório na área do mentorado e pede para avisá-lo
// por e-mail (acao 'avisar'). Só manda se ele já usa a plataforma, tem e-mail de verdade e autorizou e-mails no termo.
// O relatório não vai anexado: o e-mail leva o botão para a página, que confere o login (só ele e a administração abrem).
import { json, supa, quemPede, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal, temChaveEmail } from '../lib/email.mjs';

export const config = { path: '/api/relatorio-mentorado', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0];

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ ok: false, mensagem: 'Entre de novo na plataforma.' }, 401);
  if (eu.papel !== 'admin') return json({ ok: false, mensagem: 'Só a administração avisa o mentorado.' }, 403);
  let b = {};
  try { b = await req.json(); } catch (_) { b = {}; }
  if (b.acao !== 'avisar' || !UUID.test(String(b.id || ''))) return json({ ok: false, mensagem: 'Pedido desconhecido.' }, 400);

  const r = await supa(`/rest/v1/relatorios_mentorado?id=eq.${b.id}&select=id,liberado_em,mentorado:mentorados(id,nome,perfil:perfis!mentorados_perfil_id_fkey(nome,email,ativo,autorizacoes,termo_aceito_em))`);
  const rel = r.ok && Array.isArray(r.dados) && r.dados[0];
  if (!rel) return json({ ok: false, mensagem: 'Relatório não encontrado.' }, 404);
  if (!rel.liberado_em) return json({ ok: false, mensagem: 'Libere o relatório na área do mentorado antes de avisar.' }, 400);
  const m = rel.mentorado || {};
  const p = m.perfil;
  const nome = primeiroNome(m.nome);
  if (!p || !p.termo_aceito_em) return json({ ok: false, mensagem: `${nome} ainda não entrou na plataforma. Mande o PDF por outro caminho ou espere o primeiro acesso.` }, 400);
  if (!p.ativo) return json({ ok: false, mensagem: `O acesso de ${nome} está desativado.` }, 400);
  if (!emailReal(p.email)) return json({ ok: false, mensagem: `${nome} não tem e-mail cadastrado.` }, 400);
  if (!(p.autorizacoes && p.autorizacoes.email)) return json({ ok: false, mensagem: `${nome} não autorizou receber e-mails. O relatório já está na área dele(a).` }, 400);
  if (!temChaveEmail()) return json({ ok: false, mensagem: 'O envio de e-mails da plataforma não está ligado (falta a chave do Brevo na Netlify).' }, 500);

  const mail = modeloEmail({
    assunto: 'O relatório da sua jornada de mentoria está pronto',
    titulo: `${nome}, o relatório da sua jornada está pronto`,
    blocos: [
      { p: `Olá, ${nome}! A equipe da Mentorei preparou o relatório da sua jornada de mentoria: cada sessão, os temas que vocês trabalharam e uma síntese do caminho, com os pontos altos, o que você já reconhece que melhorou e os desafios que seguem com você.` },
      { botao: { texto: 'Abrir o meu relatório', link: `${SITE}/relatorio-mentorado.html?id=${rel.id}` } },
      { nota: 'Ele também fica na sua área da plataforma, em "Minha mentoria". Na página do relatório, o botão "Baixar o PDF" guarda uma cópia no seu computador ou celular.' },
    ],
  });
  const env = await enviarEmail({ para: [{ email: p.email, name: p.nome || m.nome }], assunto: mail.assunto, html: mail.html, texto: mail.texto });
  if (!env.enviado) return json({ ok: false, mensagem: `O e-mail não saiu: ${env.mensagem}.` }, 502);
  await supa(`/rest/v1/relatorios_mentorado?id=eq.${rel.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { avisado_em: new Date().toISOString() } });
  return json({ ok: true, para: p.email });
};
