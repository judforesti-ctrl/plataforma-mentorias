// Lê o texto de uma proposta comercial (PDF ou PowerPoint) e organiza, com o Claude, empresa, turma(s), perfil e módulos.
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
        required: ['nome', 'formato', 'local', 'perfil_turma', 'metodologia', 'participantes_previstos', 'inicio', 'fim_previsto', 'modulos'],
        properties: {
          nome: texto,
          formato: { type: 'string', enum: ['online', 'presencial', 'misto', 'indefinido'] },
          local: textoOuNulo,
          perfil_turma: texto,
          metodologia: textoOuNulo,
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
    comercial: {
      type: 'object',
      additionalProperties: false,
      required: ['servico', 'valor_total', 'validade', 'contato', 'condicoes'],
      properties: {
        servico: { type: 'string', enum: ['palestra', 'treinamento', 'workshop', 'mentoria_grupo', 'mentoria_individual', 'diagnostico', 'outro'] },
        valor_total: { type: ['number', 'null'] },
        validade: textoOuNulo,
        contato: { type: 'object', additionalProperties: false, required: ['nome', 'cargo', 'email', 'whatsapp'],
          properties: { nome: textoOuNulo, cargo: textoOuNulo, email: textoOuNulo, whatsapp: textoOuNulo } },
        condicoes: textoOuNulo,
      },
    },
  },
};
ESQUEMA.required = ['empresa', 'turmas', 'faltando', 'comercial'];

const INSTRUCOES = `Você organiza propostas comerciais da Mentorei (workshops, treinamentos e mentorias em grupo) para cadastrar turmas numa plataforma interna. Responda em português do Brasil, no formato pedido.

Como as propostas da Mentorei costumam ser:
- Capa: tipo (ex.: "Proposta de workshop"), nome do programa, subtítulo, a cooperativa ou empresa e o público (ex.: "Sicoob Unic • Gerentes de carteira e relacionamento"), carga horária.
- "O que entendemos da sua demanda": o contexto e os objetivos da empresa. Vai para o perfil da turma.
- Páginas institucionais ("Quem desenvolve", "Expertise", "As sócias da Mentorei"): ignore.
- "O workshop em N pilares" ou "Jornada": a lista de módulos. Cada pilar ou módulo é um módulo da turma.
- A página de cada pilar ou módulo traz OBJETIVO, ENTREGA PRÁTICA, TÓPICOS ABORDADOS e o período e a duração (ex.: "Manhã • 2 horas").
- "Uma experiência dinâmica e aplicada" e "Personalização que faz diferença": a metodologia. Vai para "metodologia".
- "Organização da jornada": a grade com período, duração e foco de cada módulo.
- "Investimento" e "Próximos passos": o valor e as condições vão SÓ para "comercial" (nunca para turmas ou módulos).
- O texto vem de um PDF do Canva ou de um PowerPoint (marcado por slide): palavras às vezes aparecem grudadas ("Fomentara carteira") ou partidas ("Experi ê ncia"). Corrija a separação das palavras, sem mudar o conteúdo.

Regras:
- Use só o que está na proposta. Nunca invente datas, números, nomes ou temas. O que não estiver no texto fica nulo e entra em "faltando".
- empresa: o nome da empresa contratante, como aparece na proposta (sem "Proposta", sem o nome da Mentorei).
- turmas: uma turma por público ou programa distinto. Se a proposta tiver dois públicos (por exemplo, diretores e gerentes), são duas turmas.
- nome da turma: o nome do programa ou da trilha mais o público, curto (ex.: "Trilha de Desenvolvimento · Gerentes").
- formato da turma: "presencial" se todos os encontros forem presenciais, "online" se todos forem online (Meet, Zoom, Teams, ao vivo pela internet), "misto" se houver dos dois; "indefinido" se a proposta não disser.
- local da turma: a cidade (e o estado) dos encontros presenciais, só se estiver escrita; senão nulo.
- perfil_turma: quem são os participantes (cargos, nível, público atendido), o contexto e o que a empresa espera ("O que entendemos da sua demanda"), em parágrafos curtos.
- metodologia: como a aula é conduzida e personalizada (casos, simulações, momentos individuais, ferramentas entregues, personalização), em linhas começando com "• ". Nulo se não houver.
- participantes_previstos: só se a proposta disser a quantidade.
- inicio e fim_previsto: datas no formato AAAA-MM-DD, só se a proposta trouxer datas completas.
- modulos: na ordem da proposta. titulo = nome do módulo ou pilar, sem o número (ex.: "Leitura do cooperado e da carteira"). tematica = três partes, nesta ordem: "Objetivo: ..." (uma frase), "Entrega prática: ..." (se houver) e os tópicos abordados como linhas começando com "• ". Se a proposta disser o período (manhã, tarde), comece a temática com "Período: Manhã". duracao_min = duração do módulo em minutos (ex.: "2 horas" = 120); se só houver a carga total, deixe nulo. formato = online (meet, zoom, teams) ou presencial só se a proposta disser; senão "indefinido". data (AAAA-MM-DD) e hora (HH:MM) só se estiverem escritas. recomendacoes = orientações para quem vai conduzir que a proposta mencionar (metodologia, dinâmicas, ferramentas, cuidados); senão nulo.
- individual = true quando o "módulo" for mentoria individual ou sessão um a um (não é aula em grupo).
- Nas turmas e módulos não inclua preços, valores, investimento, condições de pagamento nem dados bancários: isso vai só em "comercial".
- faltando: lista curta, em linguagem simples, do que a coordenação precisa completar à mão (ex.: "Datas e horários dos módulos", "Link da sala", "Quantidade de participantes", "Mentores de cada módulo").
- comercial (para o pipeline de vendas): servico = o tipo principal do que está sendo vendido (palestra; treinamento ou curso; workshop; mentoria_grupo = mentoria em grupo, trilha ou jornada com encontros em grupo; mentoria_individual = sessões um a um; diagnostico = Radar ou avaliação; outro). valor_total = o investimento total da proposta em reais, como número (ex.: "R$ 18.500,00" = 18500); se houver parcelas, some o total; se houver mais de uma opção de valor, use a opção completa e explique em condicoes; nulo se a proposta não trouxer valor. validade = data (AAAA-MM-DD) até quando a proposta vale, só se estiver escrita. contato = nome, cargo, e-mail e WhatsApp/telefone da pessoa da empresa a quem a proposta é dirigida, só se estiverem escritos (nunca os dados da Mentorei). condicoes = forma de pagamento, parcelas, o que está incluso ou não, em uma ou duas frases; nulo se não houver.`;

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
    try { await criarOportunidade(secreta, id, resultado, String(b.arquivo || ''), eu.dados.id); } catch (_) { /* o pipeline não pode travar a importação */ }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(`O Claude respondeu com erro (${e.status}). Tente de novo.`);
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }
};

// ---------- pipeline de vendas (Fase 4): toda proposta importada vira uma oportunidade ----------
// Se a empresa já tem uma oportunidade aberta em "proposta" ou "negociação", a importação entra como nova versão da proposta.
// Sem o script 19 no Supabase, nada acontece aqui (a importação segue normal).
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
async function criarOportunidade(chave, importacaoId, r, arquivo, criadoPor) {
  const c = r.comercial || {};
  const ler = async (caminho) => { const x = await supa(caminho, { chave }); return x.ok && Array.isArray(x.dados) ? x.dados : null; };
  const gravar = async (caminho, corpo) => {
    const headers = { apikey: chave, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    const x = await fetch(`${SUPABASE_URL}${caminho}`, { method: 'POST', headers, body: JSON.stringify(corpo) });
    const t = await x.text(); try { return x.ok ? JSON.parse(t)[0] : null; } catch (_) { return null; }
  };
  const tabela = await ler('/rest/v1/oportunidades?select=id&limit=1');
  if (tabela === null) return;                                      // script 19 ainda não rodado
  // empresa: a já cadastrada com o mesmo nome, ou uma nova
  const empresas = (await ler('/rest/v1/empresas?select=id,nome')) || [];
  const nomeN = norm(r.empresa);
  let empresa = empresas.find((e) => norm(e.nome) === nomeN) || empresas.find((e) => norm(e.nome) && nomeN.includes(norm(e.nome)));
  if (!empresa && r.empresa) empresa = await gravar('/rest/v1/empresas', { nome: String(r.empresa).trim().slice(0, 200) });
  if (!empresa) return;
  // contato da proposta
  let contato = null;
  if (c.contato && c.contato.nome) {
    const existentes = (await ler(`/rest/v1/contatos?empresa_id=eq.${empresa.id}&select=id,nome`)) || [];
    contato = existentes.find((x) => norm(x.nome) === norm(c.contato.nome))
      || await gravar('/rest/v1/contatos', { empresa_id: empresa.id, nome: c.contato.nome, cargo: c.contato.cargo || null, email: c.contato.email || null, whatsapp: c.contato.whatsapp || null, criado_por: criadoPor });
  }
  const valor = typeof c.valor_total === 'number' && c.valor_total > 0 ? Math.round(c.valor_total * 100) / 100 : null;
  const titulo = ((r.turmas || [])[0] && r.turmas[0].nome) || `Proposta · ${r.empresa}`;
  const abertas = (await ler(`/rest/v1/oportunidades?empresa_id=eq.${empresa.id}&etapa=in.(proposta,negociacao)&select=id,titulo&order=criado_em.desc`)) || [];
  let op = abertas[0] || null;
  let versao = 1;
  if (op) {
    const vs = (await ler(`/rest/v1/propostas?oportunidade_id=eq.${op.id}&select=versao`)) || [];
    versao = vs.reduce((m, v) => Math.max(m, v.versao || 0), 0) + 1;
    await supa(`/rest/v1/oportunidades?id=eq.${op.id}`, { metodo: 'PATCH', chave, corpo: { ...(valor ? { valor } : {}), importacao_id: importacaoId, ...(contato ? { contato_id: contato.id } : {}) } });
  } else {
    const prox = new Date(); prox.setUTCDate(prox.getUTCDate() + 7); prox.setUTCHours(12, 0, 0, 0);   // 9h de Brasília, daqui a 7 dias
    op = await gravar('/rest/v1/oportunidades', { empresa_id: empresa.id, titulo: titulo.slice(0, 200), servico: c.servico || 'treinamento', valor, etapa: 'proposta',
      contato_id: contato ? contato.id : null, responsavel_id: criadoPor, proximo_contato_em: prox.toISOString(), proximo_contato_por: criadoPor,
      proximo_contato_obs: 'Confirmar se recebeu a proposta e tirar dúvidas', importacao_id: importacaoId, observacoes: c.condicoes || null, criado_por: criadoPor });
    if (!op) return;
  }
  await gravar('/rest/v1/propostas', { oportunidade_id: op.id, versao, valor, validade: c.validade || null, arquivo: arquivo.slice(0, 200), importacao_id: importacaoId,
    resumo: [c.servico ? `Serviço: ${c.servico}` : '', c.condicoes || '', (r.turmas || []).map((t) => t.nome).join('; ')].filter(Boolean).join('\n'), enviada_em: new Date().toISOString().slice(0, 10), criado_por: criadoPor });
  await gravar('/rest/v1/interacoes', { oportunidade_id: op.id, contato_id: contato ? contato.id : null, tipo: 'proposta',
    texto: `Proposta importada${versao > 1 ? ` (versão ${versao})` : ''}: ${arquivo}${valor ? ` · R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`, por: criadoPor });
}
