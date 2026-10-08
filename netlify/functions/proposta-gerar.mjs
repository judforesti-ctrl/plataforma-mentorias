// Gera o conteúdo de uma proposta comercial com o Claude a partir do pedido (briefing) colado na tela, nos moldes
// do PowerPoint da Mentorei, e monta o arquivo. Roda em segundo plano (pode levar mais de um minuto): a tela acompanha
// a linha da tabela propostas (status gerando → rascunho | erro). Só a administração usa.
import Anthropic from '@anthropic-ai/sdk';
import { supa, env } from '../lib/google.mjs';
import { lerProposta, montarEGuardar } from '../lib/propostas.mjs';

export const config = { path: '/api/proposta-gerar', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';

const texto = { type: 'string' };
const textoOuNulo = { type: ['string', 'null'] };
const item = { type: 'object', additionalProperties: false, required: ['titulo', 'texto'], properties: { titulo: texto, texto: texto } };
const quatro = { type: 'array', items: item };
const secao = (extra = {}) => ({ type: 'object', additionalProperties: false, required: ['titulo', 'itens', ...Object.keys(extra)], properties: { titulo: texto, itens: quatro, ...extra } });
export const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['capa', 'demanda', 'quem_titulo', 'socias_rodape', 'expertise', 'visao', 'modulos', 'destaques', 'metodologia', 'personalizacao', 'organizacao', 'investimento', 'proximos', 'frase_final', 'mensagem_email', 'mensagem_whatsapp', 'resumo', 'valor_total', 'validade_dias'],
  properties: {
    capa: { type: 'object', additionalProperties: false, required: ['tipo', 'nome', 'subtitulo', 'rodape'], properties: { tipo: texto, nome: texto, subtitulo: texto, rodape: texto } },
    demanda: secao({ frase: texto }),
    quem_titulo: texto,
    socias_rodape: texto,
    expertise: secao(),
    visao: { type: 'object', additionalProperties: false, required: ['titulo', 'rodape'], properties: { titulo: texto, rodape: texto } },
    modulos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['titulo', 'titulo_curto', 'subtitulo', 'quando', 'objetivo', 'entrega', 'topicos'],
      properties: { titulo: texto, titulo_curto: texto, subtitulo: texto, quando: texto, objetivo: texto, entrega: texto, topicos: { type: 'array', items: texto } } } },
    destaques: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['apos_modulo', 'titulo', 'itens'], properties: { apos_modulo: { type: 'integer' }, titulo: texto, itens: quatro } } },
    metodologia: secao(),
    personalizacao: secao({ frase: texto }),
    organizacao: { type: 'object', additionalProperties: false, required: ['titulo', 'subtitulo', 'colunas', 'linhas', 'rodape'],
      properties: { titulo: texto, subtitulo: texto, colunas: { type: 'array', items: texto }, rodape: texto,
        linhas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['c1', 'c2', 'c3', 'c4'], properties: { c1: texto, c2: texto, c3: texto, c4: texto } } } } },
    investimento: { type: 'object', additionalProperties: false, required: ['titulo', 'opcoes', 'incluso', 'nao_incluso'],
      properties: { titulo: texto, incluso: texto, nao_incluso: texto, opcoes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nome', 'valor', 'descricao'], properties: { nome: texto, valor: texto, descricao: texto } } } } },
    proximos: secao({ rodape: texto }),
    frase_final: texto,
    mensagem_email: { type: 'object', additionalProperties: false, required: ['assunto', 'texto'], properties: { assunto: texto, texto: texto } },
    mensagem_whatsapp: texto,
    resumo: texto,
    valor_total: { type: ['number', 'null'] },
    validade_dias: { type: ['integer', 'null'] },
  },
};

const INSTRUCOES = `Você escreve propostas comerciais da Mentorei, empresa brasileira de desenvolvimento de líderes (treinamentos, workshops, palestras, mentorias individuais e em grupo, diagnósticos), muito presente em cooperativas de crédito e agro, mas também em empresas. As sócias são Claudia Kreniczki (gente, cultura e liderança), Juliana Foresti (negócios, comunicação e imagem) e Viviane Sotoriva (finanças e cooperativismo). Responda em português do Brasil, no formato pedido, preenchendo o modelo de apresentação abaixo.

Como é o modelo (uma página por item; o texto precisa caber nas caixas, por isso os limites de letras são obrigatórios):
1. capa: tipo (ex.: "PROPOSTA DE WORKSHOP", "PROPOSTA DE TREINAMENTO", "PROPOSTA DE PROGRAMA", "PROPOSTA DE MENTORIA", em maiúsculas), nome do programa (até 40 letras, curto e marcante), subtitulo em 1 ou 2 linhas separadas por quebra de linha (cada linha até 55 letras), rodape em 2 linhas: "Empresa  •  Público" e "carga horária  •  formato/quantidade de módulos" (cada linha até 60 letras).
2. demanda ("O que entendemos da sua demanda"): exatamente 4 itens (titulo até 35 letras; texto até 120 letras) + frase de fechamento (até 100 letras). Use o que o pedido diz sobre contexto, dores e objetivos do cliente.
3. quem_titulo: título da página institucional, ex.: "Quem desenvolve o workshop" ou "Quem conduz o programa". socias_rodape: uma linha até 100 letras sobre a complementaridade das sócias (ex.: "Experiência complementar em pessoas, negócios e cooperativismo. Condução a definir.").
4. expertise: exatamente 4 itens (titulo até 40 letras, texto até 125 letras). Para cooperativas, título "Expertise em cooperativismo"; para empresas, "Expertise que faz diferença". O último item costuma ser "Conteúdo construído para [cliente]".
5. visao: titulo da página-resumo dos módulos (ex.: "O workshop em quatro pilares", "O programa em cinco encontros") e rodape (até 110 letras: carga total, intervalos, "datas e local a definir" quando não houver).
6. modulos: entre 2 e 6 módulos (pilares, encontros ou aulas), na ordem. titulo até 45 letras; titulo_curto até 24 letras (para a página-resumo); subtitulo até 70 letras (uma promessa curta); quando = período e duração ou condução, ex.: "Manhã  •  2 horas", "Tarde  •  2 horas", "Condução: Claudia Kreniczki" (se o pedido disser quem conduz); objetivo até 125 letras (uma frase); entrega até 115 letras (entrega prática: o que o participante sai com); topicos: de 3 a 5 tópicos, cada um até 90 letras, sem ponto final obrigatório.
7. destaques: 0 a 2 páginas extras de aprofundamento (apenas quando o pedido traz um tema que merece página própria, ex.: "Secretárias: relacionamento estratégico"); apos_modulo = número do módulo (1 = primeiro) depois do qual a página entra; titulo até 45 letras; exatamente 4 itens (titulo até 40, texto até 125).
8. metodologia ("Uma experiência dinâmica e aplicada"): exatamente 4 itens (ex.: casos reais do cliente, simulações e discussão em grupo, momentos individuais de análise, ferramentas para o dia seguinte).
9. personalizacao ("Personalização que faz diferença"): exatamente 4 itens numerados (realidade do cliente/briefing, portfólio ou processos aplicados, casos do cliente, aplicação e continuidade) + frase (até 100 letras).
10. organizacao: titulo ("Organização da jornada" ou "Cronograma sugerido"), subtitulo (até 90 letras, ex.: "Um dia presencial  •  8 horas efetivas  •  Data e local a definir"), colunas = 4 cabeçalhos em maiúsculas (ex.: ["PERÍODO", "DURAÇÃO", "PILAR", "FOCO"] ou, com datas, ["DATA", "DIA", "MÊS", "ENCONTRO"]), linhas = uma por módulo com c1 (até 10 letras, ex.: "Manhã", "16/09"), c2 (até 10, ex.: "2h", "Quarta"), c3 (até 12, ex.: "01" ou "Setembro"), c4 (até 50, o foco ou nome do módulo); rodape até 110 letras (intervalos, horários a alinhar).
11. investimento: titulo "Investimento"; opcoes = 1 ou 2 caixas: a primeira é o que está sendo vendido (nome até 30 letras; valor = "R$ 18.500,00" se o pedido trouxer o valor, senão "A definir"; descricao até 110 letras); a segunda pode ser "Escopo contemplado" (valor "Conteúdo + prática") ou uma opção alternativa (ex.: "Palestra avulsa" com valor); incluso = linha começando com "Incluso:" (até 150 letras); nao_incluso = linha começando com "Não incluso:" e as condições de pagamento (até 190 letras). Nunca invente valores: sem valor no pedido, use "A definir".
12. proximos ("Próximos passos"): exatamente 4 itens numerados (Alinhamento, Customização, Execução, Aplicação ou Expansão; titulo até 20 letras, texto até 70 letras) + rodape (até 100 letras, ex.: "Validade da proposta: 30 dias.  •  contato@mentorei.com.br  •  www.mentorei.com.br").
13. frase_final: uma frase de impacto entre aspas tipográficas (“ ”), até 110 letras, ligada ao tema.
14. mensagem_email: assunto (até 80 letras) e texto (e-mail curto e cordial, em parágrafos, para a pessoa de contato: diz que a proposta segue em anexo, resume em uma frase o que foi proposto, se coloca à disposição e assina com o nome do responsável da Mentorei). mensagem_whatsapp: versão curta para WhatsApp (até 400 letras, sem assunto, pode usar 1 emoji no máximo).
15. resumo: 2 ou 3 linhas para o histórico interno (o que foi proposto, carga, valor). valor_total: o investimento total em reais como número, ou null se "A definir". validade_dias: validade da proposta em dias, se informada, senão null.

Regras de escrita:
- Use o pedido como fonte principal. O que o pedido não disser: deixe "a definir" (datas, local, valor, quantidade) e não invente números, resultados, depoimentos, nomes de pessoas do cliente nem promessas de promoção ou aumento.
- Tom consultivo, direto, sem jargão, frases curtas, verbos no infinitivo nos objetivos. Sem exclamações. Fale do cliente pelo nome e do público pelo cargo.
- Respeite os limites de letras: eles existem porque o texto precisa caber na página.
- Quando o pedido for um ajuste, mantenha tudo o que não foi pedido para mudar.`;

export default async (req) => {
  const chave = env('SUPABASE_SECRET_KEY');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.proposta_id || '');
  if (!UUID.test(id) || !chave) return;
  const falhar = (erro) => supa(`/rest/v1/propostas?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });

  // quem pediu tem de ser da administração
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = token ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: chave, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  if (!u || !u.id) return falhar('Sessão expirada. Entre de novo e repita.');
  const perfil = await supa(`/rest/v1/perfis?id=eq.${u.id}&select=papel,ativo,nome`);
  const meu = perfil.ok && perfil.dados && perfil.dados[0];
  if (!meu || meu.papel !== 'admin' || !meu.ativo) return falhar('Só a administração gera propostas.');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');

  const p = await lerProposta(id);
  if (!p) return falhar('Proposta não encontrada.');
  const o = p.oportunidade || {};
  const emp = o.empresa || {};
  const contato = o.contato || {};
  const responsavel = (o.responsavel && o.responsavel.nome) || meu.nome;
  const pedido = String(p.pedido || '').slice(0, 60000);
  const ajustes = String(b.ajustes || p.ajustes || '').slice(0, 8000);
  if (pedido.trim().length < 20 && !p.conteudo) return falhar('O pedido está vazio. Cole o briefing da proposta.');

  const contexto = [
    `Cliente: ${emp.nome || '(não informado)'}${emp.tipo ? ` (${emp.tipo})` : ''}${emp.cidade ? ` · ${emp.cidade}${emp.uf ? `/${emp.uf}` : ''}` : ''}${emp.porte ? ` · porte: ${emp.porte}` : ''}`,
    `Oportunidade: ${o.titulo || ''} · serviço: ${o.servico || ''}${o.valor ? ` · valor combinado: R$ ${Number(o.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`,
    contato.nome ? `Pessoa de contato: ${contato.nome}${contato.cargo ? `, ${contato.cargo}` : ''}` : '',
    `Responsável da Mentorei que assina: ${responsavel}`,
    o.observacoes ? `Observações da oportunidade: ${o.observacoes}` : '',
    `Data de hoje: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  ].filter(Boolean).join('\n');
  const mensagens = [];
  if (p.conteudo && ajustes) {
    mensagens.push({ role: 'user', content: `Contexto:\n${contexto}\n\nPedido original:\n${pedido}\n\nProposta atual (JSON):\n${JSON.stringify(p.conteudo)}\n\nAJUSTE PEDIDO: ${ajustes}\n\nDevolva a proposta inteira com o ajuste aplicado, mantendo o resto.` });
  } else {
    mensagens.push({ role: 'user', content: `Contexto:\n${contexto}\n\nPedido (briefing da proposta):\n${pedido}${ajustes ? `\n\nObservações adicionais: ${ajustes}` : ''}` });
  }

  let conteudo;
  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 20000,
      system: INSTRUCOES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: mensagens,
    });
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    try { conteudo = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu a proposta organizada. Tente de novo.'); }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(`O Claude respondeu com erro (${e.status}). Tente de novo.`);
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }

  const valor = typeof conteudo.valor_total === 'number' && conteudo.valor_total > 0 ? Math.round(conteudo.valor_total * 100) / 100 : (p.valor || null);
  let validade = p.validade || null;
  if (conteudo.validade_dias && conteudo.validade_dias > 0) { const d = new Date(); d.setUTCDate(d.getUTCDate() + conteudo.validade_dias); validade = d.toISOString().slice(0, 10); }
  const g = await supa(`/rest/v1/propostas?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'rascunho', conteudo, resumo: conteudo.resumo || null, valor, validade, erro: null, ajustes: ajustes || null } });
  if (!g.ok) return falhar('Não consegui salvar o conteúdo gerado.');
  try {
    await montarEGuardar({ ...p, conteudo });
  } catch (e) {
    await supa(`/rest/v1/propostas?id=eq.${id}`, { metodo: 'PATCH', corpo: { erro: `O conteúdo foi gerado, mas o arquivo não foi montado: ${e.message}` } });
  }
};
