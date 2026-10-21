// "Qual é o seu canal?" aberto ao público: manda o laudo para o e-mail de quem respondeu (Brevo, conta principal).
// POST /api/canal-laudo {nome, email, r: "8-4-3"} → {ok: true}
// Recebe só a contagem dos três canais (nunca as respostas) e não guarda nada: o laudo é montado na hora por canal-regras.js.
// Só envia para quem acabou de deixar o contato pela ferramenta (Vendas › Pessoa física, últimas 6 horas): ninguém usa a
// função para mandar e-mail a um endereço qualquer.
import { json, supa, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail } from '../lib/email.mjs';
import { laudo, lerCodigo, codigo, TEXTOS, AVISO } from '../../public/assets/canal-regras.js';

export const config = { path: '/api/canal-laudo', method: ['POST'] };

const FERRAMENTA = 'Qual é o seu canal?';
const JANELA_MS = 6 * 60 * 60 * 1000;
const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

export default async (req) => {
  let c = {};
  try { c = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const email = texto(c.email, 160).toLowerCase(), nome = texto(c.nome, 120);
  const contagem = lerCodigo(c.r);
  if (!contagem) return json({ mensagem: 'Resultado inválido.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ mensagem: 'Confira o e-mail.' }, 400);

  const r = await supa(`/rest/v1/pessoas_fisicas?select=nome,ferramentas,ultimo_em&email=eq.${encodeURIComponent(email)}`);
  const p = r.ok && Array.isArray(r.dados) ? r.dados[0] : null;
  if (!p || !(p.ferramentas || []).includes(FERRAMENTA) || Date.now() - new Date(p.ultimo_em).getTime() > JANELA_MS) {
    if (!r.ok) console.error('canal-laudo', r.status, JSON.stringify(r.dados).slice(0, 300));
    return json({ mensagem: 'Não encontramos o seu cadastro. Volte e confira os seus dados.' }, 403);
  }

  const L = laudo(contagem);
  const primeiro = (nome || p.nome || '').split(' ')[0];
  const m = modeloEmail({
    assunto: `Seu laudo: canal ${L.titulo.toLowerCase()}`,
    titulo: `${primeiro ? `${primeiro}, o` : 'O'} seu canal preferencial é: ${L.titulo}`,
    blocos: [
      { p: L.resumo },
      { lista: L.ordem.map((k) => `${TEXTOS[k].nome}: ${L.pct[k]}%`) },
      { p: L.leitura },
      { titulo: 'Como você aprende melhor' }, { lista: L.aprende },
      { titulo: 'Como as pessoas podem falar com você' }, { lista: L.falarComigo },
      { titulo: '3 atitudes para esta semana' }, { lista: L.atitudes },
      { botao: { texto: 'Abrir o laudo completo', link: `${SITE}/ferramentas/qual-e-o-seu-canal/?r=${codigo(contagem)}` } },
      { nota: AVISO },
    ],
    rodape: 'Você recebeu este e-mail porque respondeu "Qual é o seu canal?", da Mentorei. As suas respostas não ficam guardadas: o laudo foi montado só para este envio.',
  });
  const e = await enviarEmail({ para: [{ email, name: nome || p.nome }], assunto: m.assunto, html: m.html, texto: m.texto });
  if (!e.enviado) {
    console.error('canal-laudo', e.mensagem);
    return json({ mensagem: 'Não conseguimos enviar o e-mail agora.' }, 502);
  }
  return json({ ok: true });
};
