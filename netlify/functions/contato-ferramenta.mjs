// Contato de quem preenche uma ferramenta aberta ao público (QR code, sem login): vai para Vendas › Pessoa física (script 39).
// POST /api/contato-ferramenta {ferramenta, nome, email, whats, cargo, receber?} → {ok: true}
// Só os contatos chegam aqui: as respostas e as notas ficam no celular da pessoa.
// "receber" (true/false) só vem das ferramentas que perguntam se a pessoa quer conteúdos da Mentorei (script 42).
// A página tenta de novo sozinha enquanto não receber {ok: true} (a cada etapa e ao abrir de novo o link).
import { json, supa } from '../lib/google.mjs';

export const config = { path: '/api/contato-ferramenta', method: ['POST'] };

// ferramentas abertas ao público: o código que a página manda → o nome que aparece em Vendas › Pessoa física
const FERRAMENTAS = { 'roda-profissional-futuro': 'Roda do Profissional do Futuro', 'voce-e-assertivo': 'Você é Assertivo?', 'qual-e-o-seu-canal': 'Qual é o seu canal?',
  'roda-do-comunicador': 'Roda do Comunicador Influente' };

const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

export default async (req) => {
  let c = {};
  try { c = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const ferramenta = FERRAMENTAS[c.ferramenta];
  if (!ferramenta) return json({ mensagem: 'Ferramenta desconhecida.' }, 400);
  if (c.site) return json({ ok: true }); // campo invisível preenchido = robô: finge que gravou
  const nome = texto(c.nome, 120), email = texto(c.email, 160).toLowerCase(), cargo = texto(c.cargo, 120);
  const fone = texto(c.whats, 30), digitos = fone.replace(/\D/g, '');
  if (nome.length < 2) return json({ mensagem: 'Escreva o seu nome.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ mensagem: 'Confira o e-mail.' }, 400);
  if (digitos.length < 10 || digitos.length > 13) return json({ mensagem: 'Informe o WhatsApp com DDD.' }, 400);

  const corpo = { p_nome: nome, p_email: email, p_whatsapp: fone, p_cargo: cargo, p_ferramenta: ferramenta };
  let r = typeof c.receber === 'boolean'
    ? await supa('/rest/v1/rpc/registrar_pessoa_fisica', { metodo: 'POST', corpo: { ...corpo, p_conteudos: c.receber } })
    : null;
  // sem a resposta "quer conteúdos", ou antes do script 42 (a função com p_conteudos ainda não existe): grava só o contato
  if (!r || !r.ok) r = await supa('/rest/v1/rpc/registrar_pessoa_fisica', { metodo: 'POST', corpo });
  if (!r.ok) {
    console.error('contato-ferramenta', r.status, JSON.stringify(r.dados).slice(0, 300));
    return json({ mensagem: 'Não conseguimos registrar agora. Vamos tentar de novo sozinhos.' }, 500);
  }
  return json({ ok: true });
};
