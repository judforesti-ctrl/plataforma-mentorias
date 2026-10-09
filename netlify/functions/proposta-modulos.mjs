// Descritivo dos módulos pela proposta: para uma turma que JÁ existe (por exemplo, vinda da planilha de programação),
// o Claude lê a proposta (arquivo enviado ou proposta já guardada na plataforma) e escreve, para cada módulo da turma,
// o que deve ser abordado (objetivo, entrega prática e tópicos), além do perfil da turma e da metodologia.
// Nada é gravado nos módulos aqui: o resultado vai para importacoes_proposta (resultado.tipo = 'modulos') e a
// administração confere na tela antes de colocar. Roda em segundo plano (pode levar mais de um minuto).
// Ao contrário de /api/proposta, NÃO cria oportunidade no pipeline de vendas (a turma já existe).
import Anthropic from '@anthropic-ai/sdk';
import { supa, env, quemPede } from '../lib/google.mjs';

export const config = { path: '/api/proposta-modulos', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = { type: 'string' };
const textoOuNulo = { type: ['string', 'null'] };
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['modulos', 'perfil_turma', 'metodologia', 'aviso'],
  properties: {
    modulos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chave', 'achado', 'parte_da_proposta', 'tematica'],
        properties: { chave: { type: 'integer' }, achado: { type: 'boolean' }, parte_da_proposta: textoOuNulo, tematica: texto },
      },
    },
    perfil_turma: textoOuNulo,
    metodologia: textoOuNulo,
    aviso: textoOuNulo,
  },
};

const INSTRUCOES = `Você liga o descritivo de uma proposta comercial da Mentorei (workshops, treinamentos, trilhas e mentorias em grupo) aos módulos de uma turma que JÁ está cadastrada numa plataforma interna. O descritivo é o que o mentor lê ao abrir o módulo para saber o que deve ser abordado na aula. Responda em português do Brasil, no formato pedido.

A turma geralmente foi cadastrada a partir de uma planilha de programação: os títulos dos módulos podem estar resumidos, escritos de outro jeito ou numa ordem diferente da proposta. A proposta pode vir como texto de um PDF do Canva ou de um PowerPoint (marcado por página ou slide) ou como um resumo já organizado.

Como as propostas da Mentorei costumam ser:
- "O que entendemos da sua demanda": o contexto e os objetivos da empresa, e quem são os participantes.
- "O workshop em N pilares", "Jornada" ou a lista de módulos/encontros: cada pilar, módulo ou encontro é uma parte.
- A página de cada parte traz OBJETIVO, ENTREGA PRÁTICA e TÓPICOS ABORDADOS (às vezes período e duração).
- "Uma experiência dinâmica e aplicada" e "Personalização que faz diferença": a metodologia.
- Páginas institucionais (quem desenvolve, expertise, sócias), investimento e próximos passos: ignore.
- Palavras às vezes aparecem grudadas ("Fomentara carteira") ou partidas ("Experi ê ncia"): corrija a separação, sem mudar o conteúdo.

Regras:
- modulos: um item para CADA módulo da turma da lista recebida, com a mesma chave. Ache a parte da proposta que trata do mesmo tema, comparando primeiro o título e o assunto; use a ordem/número só para desempatar. A mesma parte pode servir a mais de um módulo (por exemplo, quando a turma repete um tema). Se nenhuma parte da proposta corresponder ao módulo, achado = false, parte_da_proposta = null e tematica = "".
- parte_da_proposta: como a parte se chama na proposta, curto (ex.: "Pilar 2 · Leitura do cooperado e da carteira").
- tematica: o que deve ser abordado, nesta ordem: "Objetivo: ..." (uma frase), "Entrega prática: ..." (se houver) e os tópicos abordados como linhas começando com "• ". Uma informação por linha. Use só o que está na proposta, com as palavras dela; não invente tópicos, números, ferramentas nem promessas. Não coloque período, duração, datas, preços ou valores.
- perfil_turma: quem são os participantes (cargos, nível, público atendido), o contexto e o que a empresa espera, em parágrafos curtos. Nulo se a proposta não disser.
- metodologia: como a aula é conduzida e personalizada (casos, simulações, momentos individuais, ferramentas entregues), em linhas começando com "• ". Nulo se não houver.
- aviso: uma frase simples para a coordenação quando algo merece atenção: a proposta parece ser de outra empresa ou de outro programa, módulos da turma que não estão na proposta, partes da proposta que não viraram módulo. Nulo se estiver tudo certo.
- Nunca inclua preços, valores, investimento, condições de pagamento nem dados bancários.`;

export default async (req) => {
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.importacao_id || '');
  const turmaId = String(b.turma_id || '');
  if (!UUID.test(id) || !env('SUPABASE_SECRET_KEY')) return;
  const falhar = (erro) => supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });

  const eu = await quemPede(req);
  if (!eu) return falhar('Sessão expirada. Entre de novo e tente outra vez.');
  if (eu.papel !== 'admin') return falhar('Só a administração traz o descritivo da proposta.');
  if (!UUID.test(turmaId)) return falhar('Turma não encontrada.');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');

  const conteudo = String(b.texto || '').slice(0, 150000);
  if (conteudo.replace(/--- (página|slide) \d+ ---/g, '').trim().length < 150) return falhar('Não consegui ler texto nesta proposta. Se ela for uma imagem escaneada, exporte de novo como PDF a partir do Canva ou do PowerPoint.');

  const t = await supa(`/rest/v1/turmas?id=eq.${turmaId}&select=nome,empresa:empresas(nome),modulos(id,numero,titulo)`);
  const turma = t.ok && Array.isArray(t.dados) && t.dados[0];
  if (!turma) return falhar('Turma não encontrada.');
  const mods = (turma.modulos || []).slice().sort((a, b2) => a.numero - b2.numero);
  if (!mods.length) return falhar('Esta turma ainda não tem módulos. Cadastre os módulos e tente de novo.');
  const listaModulos = mods.map((m, i) => `chave ${i + 1}: Módulo ${m.numero} · ${m.titulo}`).join('\n');

  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: INSTRUCOES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: `Turma: ${turma.empresa ? turma.empresa.nome : ''} · ${turma.nome}\n\nMódulos da turma:\n${listaModulos}\n\n`
        + `Proposta (${String(b.arquivo || '').slice(0, 160)}):\n\n${conteudo}` }],
    });
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    let res;
    try { res = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu o descritivo organizado. Tente de novo.'); }
    const porChave = new Map((res.modulos || []).map((x) => [x.chave, x]));
    const resultado = {
      tipo: 'modulos',
      turma_id: turmaId,
      modulos: mods.map((m, i) => {
        const x = porChave.get(i + 1);
        const tem = !!(x && x.achado && String(x.tematica || '').trim());
        return { modulo_id: m.id, numero: m.numero, titulo: m.titulo, achado: tem, parte_da_proposta: tem ? x.parte_da_proposta || null : null, tematica: tem ? x.tematica.trim() : '' };
      }),
      perfil_turma: res.perfil_turma || null,
      metodologia: res.metodologia || null,
      aviso: res.aviso || null,
    };
    await supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'pronto', resultado } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(`O Claude respondeu com erro (${e.status}). Tente de novo.`);
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }
};
