// Escreve, com o Claude, o resumo de apresentação do mentor para os mentorados, a partir da trajetória que ele preencheu.
// Não grava nada: o mentor lê, ajusta e aprova na tela "Meu perfil".
import Anthropic from '@anthropic-ai/sdk';

export const config = { path: '/api/apresentacao', method: 'POST' };

const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const resposta = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function ler(caminho, chave, token) {
  const headers = { apikey: chave };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { headers });
  return r.ok ? r.json() : null;
}

const CAMPOS = [['cargo_atual', 'Cargo ou função hoje'], ['anos_lideranca', 'Anos liderando pessoas'], ['empresas', 'Cargos e empresas por onde passou'],
  ['formacao', 'Formação e certificações'], ['setores', 'Setores que conhece bem'], ['especialidades', 'Especialidades na mentoria'],
  ['conquistas', 'Conquistas'], ['estilo', 'Como é a sua mentoria'], ['frase', 'Frase que a move'], ['fora', 'Fora do trabalho']];

const INSTRUCOES = `Você escreve, em português do Brasil, o texto de apresentação de um mentor ou mentora da Mentorei (mentoria de liderança), que os mentorados leem na área deles da plataforma para conhecer quem vai acompanhá-los.

Regras:
- Terceira pessoa, começando pelo primeiro nome. Entre 70 e 120 palavras, em 1 ou 2 parágrafos. Sem títulos, listas, emojis ou markdown.
- Deve causar confiança e vontade de começar: mostre experiência concreta, o que essa pessoa sabe fazer pelo mentorado e como é a mentoria dela.
- Use só o que está nos dados. Não invente empresas, números, títulos nem conquistas. Se um dado faltar, apenas não fale dele.
- Tom humano e firme, sem exagero, sem bajulação, sem clichês ("apaixonada por pessoas", "transformar vidas") e sem jargão em inglês.
- Se houver uma frase pessoal, pode fechar com ela entre aspas. Use o gênero gramatical que os dados indicarem; se não der para saber, escreva de forma neutra.
- Responda só com o texto.`;

export default async (req) => {
  const secreta = env('SUPABASE_SECRET_KEY').trim();
  const chaveClaude = env('ANTHROPIC_API_KEY').trim();
  if (!secreta) return resposta({ mensagem: 'A chave secreta do Supabase não está configurada na Netlify.' }, 500);
  if (!chaveClaude) return resposta({ mensagem: 'A chave do Claude (ANTHROPIC_API_KEY) ainda não foi colocada na Netlify.' }, 500);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return resposta({ mensagem: 'Faça login de novo.' }, 401);
  const eu = await ler('/auth/v1/user', secreta, token);
  if (!eu || !eu.id) return resposta({ mensagem: 'Sua sessão expirou. Faça login de novo.' }, 401);

  let b = {}; try { b = await req.json(); } catch (_) { /* sem corpo: o próprio perfil */ }
  let alvo = eu.id;
  if (b.perfil_id && b.perfil_id !== eu.id) {
    const [quem] = (await ler(`/rest/v1/perfis?id=eq.${eu.id}&select=papel,ativo`, secreta)) || [];
    if (!quem || quem.papel !== 'admin' || !quem.ativo) return resposta({ mensagem: 'Só a administração gera o texto de outra pessoa.' }, 403);
    if (!/^[0-9a-f-]{36}$/i.test(String(b.perfil_id))) return resposta({ mensagem: 'Pessoa inválida.' }, 400);
    alvo = b.perfil_id;
  }
  const [p] = (await ler(`/rest/v1/perfis?id=eq.${alvo}&select=nome,papel,tambem_mentor,ativo,trajetoria`, secreta)) || [];
  if (!p || !p.ativo || !(p.papel === 'mentor' || p.tambem_mentor)) return resposta({ mensagem: 'Só mentores têm resumo de apresentação.' }, 403);

  const t = p.trajetoria || {};
  const linhas = CAMPOS.filter(([k]) => String(t[k] || '').trim()).map(([k, rot]) => `${rot}: ${String(t[k]).trim().slice(0, 1500)}`);
  if (linhas.length < 3) return resposta({ mensagem: 'Preencha mais campos da sua trajetória (pelo menos cargo, especialidades e como é a sua mentoria) antes de gerar.' }, 400);

  const client = new Anthropic({ apiKey: chaveClaude });
  try {
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1500,
      system: INSTRUCOES,
      messages: [{ role: 'user', content: `Nome: ${p.nome}\n\n${linhas.join('\n')}` }],
    });
    const texto = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n').trim();
    if (!texto) return resposta({ mensagem: 'O Claude não devolveu texto. Tente de novo.' }, 502);
    return resposta({ texto });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return resposta({ mensagem: 'A chave do Claude na Netlify não está valendo. Confira a ANTHROPIC_API_KEY.' }, 500);
    if (e instanceof Anthropic.RateLimitError) return resposta({ mensagem: 'Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.' }, 429);
    if (e instanceof Anthropic.APIError) return resposta({ mensagem: `O Claude respondeu com erro (${e.status}). Tente de novo.` }, 502);
    return resposta({ mensagem: 'Não foi possível falar com o Claude agora. Tente de novo.' }, 502);
  }
};
