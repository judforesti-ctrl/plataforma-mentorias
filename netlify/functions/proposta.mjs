// Lê o texto de uma proposta comercial (PDF) e organiza, com o Claude, empresa, turma(s), perfil e módulos.
// Roda em segundo plano (pode levar mais de um minuto): o resultado vai para a tabela importacoes_proposta,
// que a tela "Importar proposta" acompanha. Só a administração usa.
import Anthropic from '@anthropic-ai/sdk';

export const config = { path: '/api/proposta', background: true };

const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function supa(caminho, { metodo = 'GET', chave, token, corpo } = {}) {
  const headers = { apikey: chave, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text();
  try { return { ok: r.ok, dados: t ? JSON.parse(t) : null }; } catch (_) { return { ok: r.ok, dados: t }; }
}

const texto = { type: 'string' };
const textoOuNulo = { type: ['string', 'null'] };
const inteiroOuNulo = { type: ['integer', 'null'] };
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['empresa', 'turmas', 'faltando'],
  properties: {
    empresa: texto,
    turmas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome', 'perfil_turma', 'participantes_previstos', 'inicio', 'fim_previsto', 'modulos'],
        properties: {
          nome: texto,
          perfil_turma: texto,
          participantes_previstos: inteiroOuNulo,
          inicio: textoOuNulo,
          fim_previsto: textoOuNulo,
          modulos: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['numero', 'titulo', 'tematica', 'duracao_min', 'formato', 'data', 'hora', 'recomendacoes', 'individual'],
              properties: {
                numero: { type: 'integer' },
                titulo: texto,
                tematica: texto,
                duracao_min: inteiroOuNulo,
                formato: { type: 'string', enum: ['meet', 'zoom', 'teams', 'presencial', 'outro', 'indefinido'] },
                data: textoOuNulo,
                hora: textoOuNulo,
                recomendacoes: textoOuNulo,
                individual: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    faltando: { type: 'array', items: texto },
  },
};

const INSTRUCOES = `Você organiza propostas comerciais da Mentorei (treinamentos e mentorias de liderança em grupo) para cadastrar turmas numa plataforma interna. Responda em português do Brasil, no formato pedido.

Regras:
- Use só o que está na proposta. Nunca invente datas, números, nomes ou temas. O que não estiver no texto fica nulo e entra em "faltando".
- empresa: o nome da empresa contratante, como aparece na proposta (sem "Proposta", sem o nome da Mentorei).
- turmas: uma turma por público ou programa distinto. Se a proposta tiver dois públicos (por exemplo, diretores e gerentes), são duas turmas.
- nome da turma: o nome do programa ou da trilha mais o público, curto (ex.: "Trilha de Desenvolvimento · Gerentes").
- perfil_turma: quem são os participantes (cargos, nível de liderança), o contexto e o briefing da empresa e os objetivos do programa para esse público, em parágrafos curtos.
- participantes_previstos: só se a proposta disser a quantidade.
- inicio e fim_previsto: datas no formato AAAA-MM-DD, só se a proposta trouxer datas completas.
- modulos: na ordem da proposta. titulo = nome do módulo, sem "Módulo 1". tematica = objetivo do módulo e temas abordados, como linhas começando com "• ". duracao_min = carga horária em minutos, se houver. formato = online (meet, zoom, teams) ou presencial só se a proposta disser; senão "indefinido". data (AAAA-MM-DD) e hora (HH:MM) só se estiverem escritas. recomendacoes = orientações para quem vai conduzir que a proposta mencionar (metodologia, dinâmicas, ferramentas, cuidados); senão nulo.
- individual = true quando o "módulo" for mentoria individual ou sessão um a um (não é aula em grupo).
- Não inclua preços, valores, investimento, condições de pagamento nem dados bancários.
- faltando: lista curta, em linguagem simples, do que a coordenação precisa completar à mão (ex.: "Datas e horários dos módulos", "Link da sala", "Quantidade de participantes", "Mentores de cada módulo").`;

export default async (req) => {
  const secreta = env('SUPABASE_SECRET_KEY').trim();
  const chaveClaude = env('ANTHROPIC_API_KEY').trim();
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.importacao_id || '');
  if (!UUID.test(id) || !secreta) return;
  const falhar = (erro) => supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', chave: secreta, corpo: { status: 'erro', erro } });

  // quem pediu tem de ser da administração
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const eu = token ? await supa('/auth/v1/user', { chave: secreta, token }) : { ok: false };
  if (!eu.ok || !eu.dados || !eu.dados.id) return falhar('Sessão expirada. Entre de novo e repita a importação.');
  const perfil = await supa(`/rest/v1/perfis?id=eq.${eu.dados.id}&select=papel,ativo`, { chave: secreta });
  const meu = perfil.ok && perfil.dados && perfil.dados[0];
  if (!meu || meu.papel !== 'admin' || !meu.ativo) return falhar('Só a administração importa propostas.');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');

  const conteudo = String(b.texto || '').slice(0, 150000);
  if (conteudo.trim().length < 200) return falhar('Não consegui ler texto neste PDF. Se ele for uma imagem escaneada, a importação não funciona.');

  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: INSTRUCOES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: `Texto da proposta (arquivo "${String(b.arquivo || '').slice(0, 120)}"):\n\n${conteudo}` }],
    });
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    let resultado;
    try { resultado = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu a proposta organizada. Tente de novo.'); }
    await supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', chave: secreta, corpo: { status: 'pronto', resultado } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(`O Claude respondeu com erro (${e.status}). Tente de novo.`);
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }
};
