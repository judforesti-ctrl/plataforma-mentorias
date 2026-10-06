// Gera, com o Claude, o resumo da sessão para o mentorado, a partir das anotações do mentor.
// As informações delicadas NUNCA são enviadas. O mentor revisa o texto antes de concluir a sessão.
import Anthropic from '@anthropic-ai/sdk';

export const config = { path: '/api/resumo', method: 'POST' };

const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const resposta = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ler(caminho, chave, token) {
  const headers = { apikey: chave };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { headers });
  return r.ok ? r.json() : null;
}

const INSTRUCOES = `Você escreve, em português do Brasil, o resumo de uma sessão de mentoria de liderança da Mentorei, para o próprio mentorado ler na área dele da plataforma (e às vezes no WhatsApp).

Regras:
- Fale direto com o mentorado, usando "você", em tom acolhedor, claro e profissional. Sem bajulação.
- Entre 90 e 180 palavras, em 2 ou 3 parágrafos curtos. Sem títulos, sem listas, sem emojis, sem markdown.
- Diga o que foi trabalhado, a principal percepção ou virada da conversa e o compromisso combinado.
- Se houver tarefa, termine lembrando a tarefa e o prazo, com as palavras do mentor.
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
  const [s] = (await ler(`/rest/v1/sessoes?id=eq.${id}&select=numero,tema,tarefa,tarefa_prazo,situacao,mentorado_id,`
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
  const prazo = s.tarefa_prazo ? new Date(`${s.tarefa_prazo}T12:00:00`).toLocaleDateString('pt-BR') : '';
  const pedido = [
    `Mentorado: ${primeiroNome}`,
    `Mentor(a): ${(s.mentor && s.mentor.nome) || perfil.nome}`,
    `Sessão número ${s.numero}${s.tema ? `, tema: ${s.tema}` : ''}`,
    `Anotações do mentor:\n${notas.slice(0, 12000)}`,
    s.tarefa ? `Tarefa combinada: ${s.tarefa}${prazo ? ` (prazo: ${prazo})` : ''}` : 'Nenhuma tarefa foi combinada.',
  ].join('\n\n');

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
    if (e instanceof Anthropic.APIError && e.status === 402) return resposta({ mensagem: 'Acabaram os créditos da conta do Claude. Coloque créditos no console da Anthropic.' }, 500);
    if (e instanceof Anthropic.APIError) return resposta({ mensagem: `O Claude respondeu com erro (${e.status}). Tente de novo.` }, 502);
    return resposta({ mensagem: 'Não foi possível falar com o Claude agora. Tente de novo.' }, 502);
  }
};
