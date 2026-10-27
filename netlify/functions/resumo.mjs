// Gera, com o Claude, o resumo da sessão para o mentorado, a partir das anotações do mentor.
// As informações delicadas NUNCA são enviadas. O mentor revisa o texto antes de concluir a sessão.
import Anthropic from '@anthropic-ai/sdk';
import { motivoClaude } from '../lib/claude-erro.mjs';

export const config = { path: '/api/resumo', method: 'POST' };

const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const resposta = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tamanho do resumo pelo volume das anotações: quem escreve pouco não ganha texto inflado,
// quem escreve muito não perde assunto, e ninguém recebe um texto longo demais para ler.
function tamanho(palavras) {
  if (palavras < 120) return { min: 100, max: 160, paragrafos: '2 ou 3' };
  if (palavras < 300) return { min: 160, max: 240, paragrafos: '3' };
  if (palavras < 600) return { min: 230, max: 320, paragrafos: '3 ou 4' };
  return { min: 300, max: 400, paragrafos: '4 ou 5' };
}

async function ler(caminho, chave, token) {
  const headers = { apikey: chave };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { headers });
  return r.ok ? r.json() : null;
}

const INSTRUCOES = `Você escreve, em português do Brasil, o resumo de uma sessão de mentoria de liderança da Mentorei, para o próprio mentorado ler na área dele da plataforma (e às vezes no WhatsApp).

Regras:
- Fale direto com o mentorado, usando "você", em tom acolhedor, claro e profissional. Sem bajulação.
- Respeite o tamanho pedido no fim da mensagem: ele acompanha o volume das anotações, para o mentorado receber sempre um resumo equilibrado. Sem títulos, sem listas, sem emojis, sem markdown; parágrafos curtos separados por linha em branco.
- Siga esta ordem: o que foi trabalhado na sessão; as percepções e aprendizados; os exemplos ou situações concretas que o mentorado trouxe e como lidar com elas; as ferramentas usadas; o compromisso combinado.
- Não deixe nenhum assunto de fora: se a conversa passou por vários temas, cite cada um, mesmo que em uma frase. Para caber no tamanho, encurte a explicação de cada tema, nunca a lista de temas. Guarde os detalhes práticos (combinados, exemplos, frases-chave, orientações do mentor), porque é o que o mentorado vai querer reler.
- Se as anotações forem curtas, não encha o texto: use o tema, o roteiro e as ferramentas da sessão só para dar contexto ao que o mentor escreveu. Se mesmo assim não houver assunto para o mínimo de palavras, fique abaixo dele: é melhor um resumo menor do que um resumo inventado.
- Só fale de ferramentas se alguma foi usada ou enviada.
- Se houver tarefas, termine lembrando cada tarefa e o seu prazo, com as palavras do mentor (em frase corrida, sem lista).
- Use só o que está nas anotações. Não invente fatos, números, nomes nem conquistas.
- As anotações são do mentor, para uso interno: não copie julgamentos, hipóteses ou críticas sobre a pessoa; traduza em aprendizado e próximo passo.
- Não cite outras pessoas da empresa de forma negativa. Não use jargão de coaching em inglês.
- Responda só com o texto do resumo.`;

export default async (req) => {
  const secreta = env('SUPABASE_SECRET_KEY').trim();
  const chaveClaude = env('ANTHROPIC_API_KEY').trim();
  if (!secreta) return resposta({ mensagem: 'A chave secreta do Supabase não está configurada na Netlify.' }, 500);
  if (!chaveClaude) return resposta({ mensagem: 'A chave do Claude (ANTHROPIC_API_KEY) ainda não foi colocada na Netlify.' }, 500);

  // 1. Quem está pedindo?
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return resposta({ mensagem: 'Faça login de novo.' }, 401);
  const eu = await ler('/auth/v1/user', secreta, token);
  if (!eu || !eu.id) return resposta({ mensagem: 'Sua sessão expirou. Faça login de novo.' }, 401);

  let b; try { b = await req.json(); } catch (_) { return resposta({ mensagem: 'Pedido inválido.' }, 400); }
  const id = String(b.sessao_id || '');
  if (!UUID.test(id)) return resposta({ mensagem: 'Sessão inválida.' }, 400);

  // 2. A sessão, e se esta pessoa é mentora deste mentorado (ou administração)
  const [s] = (await ler(`/rest/v1/sessoes?id=eq.${id}&select=numero,tema,roteiro,tarefa,tarefa_prazo,situacao,mentorado_id,`
    + 'mentorado:mentorados(nome),mentor:perfis!sessoes_mentor_id_fkey(nome),interno:sessoes_interno(resumo_mentor)', secreta)) || [];
  if (!s) return resposta({ mensagem: 'Sessão não encontrada.' }, 404);
  const [perfil] = (await ler(`/rest/v1/perfis?id=eq.${eu.id}&select=papel,ativo,nome`, secreta)) || [];
  const vinculo = await ler(`/rest/v1/mentor_mentorado?mentorado_id=eq.${s.mentorado_id}&mentor_id=eq.${eu.id}&select=mentor_id`, secreta);
  if (!perfil || !perfil.ativo || (perfil.papel !== 'admin' && !(vinculo && vinculo.length))) {
    return resposta({ mensagem: 'Você não é mentor(a) deste mentorado.' }, 403);
  }

  const notas = String((s.interno && s.interno.resumo_mentor) || '').trim();
  if (notas.length < 40) return resposta({ mensagem: 'Escreva um pouco mais nas anotações da sessão antes de gerar o resumo.' }, 400);

  const primeiroNome = String((s.mentorado && s.mentorado.nome) || '').split(' ')[0];
  // Tarefas: várias por sessão (tabela tarefas, script 33); sem a tabela, a tarefa única antiga da sessão.
  const dataBR = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '');
  const novas = await ler(`/rest/v1/tarefas?sessao_id=eq.${id}&select=texto,prazo&order=ordem,criado_em`, secreta);
  const tarefas = (novas || (s.tarefa ? [{ texto: s.tarefa, prazo: s.tarefa_prazo }] : [])).filter((t) => String(t.texto || '').trim());
  const comPrazo = (t) => `${t.texto}${t.prazo ? ` (prazo: ${dataBR(t.prazo)})` : ''}`;
  const enviadas = await ler(`/rest/v1/ferramentas_enviadas?sessao_id=eq.${id}&select=ferramenta:ferramentas(nome)`, secreta);
  const nomesFerr = [...new Set((enviadas || []).map((x) => x.ferramenta && x.ferramenta.nome).filter(Boolean))];
  const roteiro = String(s.roteiro || '').trim();
  const t = tamanho(notas.split(/\s+/).filter(Boolean).length);
  const pedido = [
    `Mentorado: ${primeiroNome}`,
    `Mentor(a): ${(s.mentor && s.mentor.nome) || perfil.nome}`,
    `Sessão número ${s.numero}${s.tema ? `, tema: ${s.tema}` : ''}`,
    roteiro ? `Roteiro planejado para a sessão (só contexto; o que vale é o que aconteceu, nas anotações):\n${roteiro.slice(0, 3000)}` : '',
    nomesFerr.length ? `Ferramentas enviadas ao mentorado nesta sessão: ${nomesFerr.join(', ')}` : '',
    `Anotações do mentor:\n${notas.slice(0, 40000)}`,
    tarefas.length === 1 ? `Tarefa combinada: ${comPrazo(tarefas[0])}`
      : tarefas.length ? `Tarefas combinadas:\n${tarefas.map((x) => `- ${comPrazo(x)}`).join('\n')}` : 'Nenhuma tarefa foi combinada.',
    `Tamanho do resumo: entre ${t.min} e ${t.max} palavras, em ${t.paragrafos} parágrafos.`,
  ].filter(Boolean).join('\n\n');

  // 3. Pede o resumo ao Claude
  const client = new Anthropic({ apiKey: chaveClaude });
  try {
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1500,
      system: INSTRUCOES,
      messages: [{ role: 'user', content: pedido }],
    });
    const texto = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n').trim();
    if (!texto) return resposta({ mensagem: 'O Claude não devolveu texto. Tente de novo.' }, 502);
    return resposta({ resumo: texto });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return resposta({ mensagem: 'A chave do Claude na Netlify não está valendo. Confira a ANTHROPIC_API_KEY.' }, 500);
    if (e instanceof Anthropic.RateLimitError) return resposta({ mensagem: 'Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.' }, 429);
    if (e instanceof Anthropic.APIError) return resposta({ mensagem: motivoClaude(e) }, 502);
    return resposta({ mensagem: 'Não foi possível falar com o Claude agora. Tente de novo.' }, 502);
  }
};
