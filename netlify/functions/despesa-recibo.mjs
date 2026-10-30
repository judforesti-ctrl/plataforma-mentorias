// Financeiro, etapa 2 (script 54): a IA lê a foto ou o PDF de um recibo (passagem, hotel, restaurante, Uber, gráfica...) e devolve
// data, valor, quem vendeu, CNPJ, cidade, tipo de despesa e uma descrição curta. Roda em segundo plano: a tela envia o arquivo para
// a pasta privada "financeiro", cria a linha em fin_recibos e espera o `resultado`. Nada vira despesa aqui: a pessoa confere e salva.
import Anthropic from '@anthropic-ai/sdk';
import { motivoClaude } from '../lib/claude-erro.mjs';
import { supa, env, quemPede, SUPABASE_URL } from '../lib/google.mjs';

export const config = { path: '/api/despesa-recibo', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIAS = ['passagem', 'hospedagem', 'refeicao', 'transporte', 'impressao', 'material', 'ferramentas', 'marketing', 'contabilidade', 'impostos', 'bancarias', 'outros'];
const texto = (v, n = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

const INSTRUCOES = `Você lê comprovantes de despesa de uma empresa brasileira de treinamento e mentoria (Mentorei). As sócias e a equipe viajam
para dar aulas nos clientes e mandam a foto do recibo: passagem aérea, hotel, restaurante, Uber/táxi, estacionamento, pedágio, gráfica,
material, assinatura de ferramenta etc. Leia o comprovante e devolva SÓ o que está escrito nele:
- data: a data da compra ou do serviço (AAAA-MM-DD). Num bilhete aéreo, a data do voo de ida. Sem data legível = null.
- valor: o total pago em reais, como número (ex.: "R$ 1.710,21" = 1710.21). Se houver vários, o total final. Sem valor = null.
- estabelecimento: quem vendeu (nome fantasia se houver; ex.: "Azul Linhas Aéreas", "Uber", "Restaurante Lago do Holandês").
- cnpj: CNPJ de quem vendeu, se aparecer, no formato 00.000.000/0000-00. Senão null.
- cidade e uf: onde a despesa aconteceu (no voo, a cidade de DESTINO). Senão null.
- categoria: passagem (aérea ou rodoviária), hospedagem, refeicao, transporte (Uber, táxi, estacionamento, pedágio, combustível,
  aluguel de carro), impressao, material, ferramentas (assinaturas, apps, equipamento), marketing, contabilidade, impostos,
  bancarias, outros.
- descricao: uma frase curta em português para a lista de despesas (ex.: "Passagem Campinas → Goiânia", "Jantar em Maringá",
  "Uber aeroporto → hotel"). Sem nomes de clientes que não estejam no comprovante.
- pessoa: o nome do passageiro ou hóspede, se aparecer. Senão null.
- observacoes: no máximo 3 avisos curtos do que ficou difícil de ler ou parece estranho. Lista vazia se estiver tudo claro.
Nunca invente valor, data ou CNPJ.`;

const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['data', 'valor', 'estabelecimento', 'cnpj', 'cidade', 'uf', 'categoria', 'descricao', 'pessoa', 'observacoes'],
  properties: {
    data: { type: ['string', 'null'] }, valor: { type: ['number', 'null'] }, estabelecimento: { type: ['string', 'null'] },
    cnpj: { type: ['string', 'null'] }, cidade: { type: ['string', 'null'] }, uf: { type: ['string', 'null'] },
    categoria: { type: 'string', enum: CATEGORIAS }, descricao: { type: 'string' }, pessoa: { type: ['string', 'null'] },
    observacoes: { type: 'array', items: { type: 'string' } },
  },
};

async function baixar(caminho) {
  const chave = env('SUPABASE_SECRET_KEY');
  const seguro = String(caminho).split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/financeiro/${seguro}`, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } }).catch(() => null);
  return r && r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

export default async (req) => {
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.recibo_id || '');
  if (!UUID.test(id) || !env('SUPABASE_SECRET_KEY')) return;
  const falhar = (erro) => supa(`/rest/v1/fin_recibos?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });
  const eu = await quemPede(req);
  if (!eu) return falhar('Sessão expirada. Entre de novo e tente outra vez.');
  if (eu.papel !== 'admin') return falhar('Só a administração lança despesas.');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');
  const linha = await supa(`/rest/v1/fin_recibos?id=eq.${id}&select=caminho,tipo`);
  const rec = linha.ok && linha.dados && linha.dados[0];
  if (!rec) return falhar('Não achei o recibo enviado.');
  const arquivo = await baixar(rec.caminho);
  if (!arquivo) return falhar('Não consegui abrir o arquivo do recibo. Tente enviar de novo.');
  const tipo = /pdf/i.test(rec.tipo || rec.caminho) ? 'application/pdf' : /png/i.test(rec.tipo || '') ? 'image/png' : /webp/i.test(rec.tipo || '') ? 'image/webp' : 'image/jpeg';
  const bloco = tipo === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: tipo, data: arquivo.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: tipo, data: arquivo.toString('base64') } };
  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      system: INSTRUCOES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: [bloco, { type: 'text', text: 'Leia este comprovante.' }] }],
    });
    let res;
    try { res = JSON.parse(r.content.filter((x) => x.type === 'text').map((x) => x.text).join('')); } catch (_) {
      return falhar('A IA não conseguiu organizar o que leu. Preencha à mão ou tente outra foto.');
    }
    const valor = typeof res.valor === 'number' && Number.isFinite(res.valor) && res.valor > 0 ? Math.round(res.valor * 100) / 100 : null;
    const resultado = {
      data: DATA.test(String(res.data || '')) ? res.data : null,
      valor,
      estabelecimento: texto(res.estabelecimento) || null,
      cnpj: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(String(res.cnpj || '')) ? res.cnpj : null,
      cidade: texto(res.cidade, 80) || null,
      uf: /^[A-Z]{2}$/.test(String(res.uf || '').toUpperCase()) ? String(res.uf).toUpperCase() : null,
      categoria: CATEGORIAS.includes(res.categoria) ? res.categoria : 'outros',
      descricao: texto(res.descricao) || texto(res.estabelecimento) || 'Despesa',
      pessoa: texto(res.pessoa, 80) || null,
      observacoes: (Array.isArray(res.observacoes) ? res.observacoes : []).map((x) => texto(x)).filter(Boolean).slice(0, 3),
    };
    await supa(`/rest/v1/fin_recibos?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'pronto', resultado } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(motivoClaude(e));
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }
};
