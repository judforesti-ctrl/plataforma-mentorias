// Gera o conteúdo de uma proposta comercial com o Claude a partir do pedido colado na tela (só o conteúdo: público,
// objetivos, módulos...), nos moldes dos modelos de PowerPoint da Mentorei, e monta o arquivo. Roda em segundo plano
// (pode levar mais de um minuto): a tela acompanha a linha da tabela propostas (status gerando → rascunho | erro).
// O que a tela escolhe e a IA NÃO mexe fica em conteudo: modelo (claro/escuro), precos, pagamento, validade_dias e logo.
// As páginas institucionais (números da Mentorei, sócias, contatos) são fixas no modelo. Só a administração usa.
import Anthropic from '@anthropic-ai/sdk';
import { supa, env } from '../lib/google.mjs';
import { lerProposta, montarEGuardar, OPCOES_DA_TELA, separarOpcoes, temTexto } from '../lib/propostas.mjs';
import { resumoPreco, precosValidos, valorDaProposta, ICONES } from '../../public/assets/proposta-comum.js';

export const config = { path: '/api/proposta-gerar', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';

const texto = { type: 'string' };
const objeto = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const lista = (item) => ({ type: 'array', items: item });
const icone = { type: 'string', enum: Object.keys(ICONES) };
const titulo = objeto({ texto, destaque: texto });
const item = objeto({ titulo: texto, texto });
const itemIcone = objeto({ icone, titulo: texto, texto });
export const ESQUEMA = objeto({
  secao: texto,
  rotulo_modulo: texto,
  capa: objeto({ tipo: texto, nome: texto, subtitulo1: texto, subtitulo2: texto, linha1: texto, linha2: texto }),
  demanda: objeto({ itens: lista(item), frase: texto }),
  quem_titulo: titulo,
  socias_rodape: texto,
  expertise: objeto({ titulo, itens: lista(itemIcone) }),
  visao: objeto({ titulo, rodape: texto }),
  modulos: lista(objeto({
    titulo: texto, titulo_curto: texto, chamada: texto, subtitulo: texto, quando: texto, quando_curto: texto, icone,
    objetivo: texto, entrega: texto, topicos: lista(objeto({ destaque: texto, texto })),
  })),
  destaques: lista(objeto({ apos_modulo: { type: 'integer' }, titulo, subtitulo: texto, itens: lista(objeto({ icone, destaque: texto, texto_destaque: texto, texto })) })),
  metodologia: objeto({ itens: lista(itemIcone) }),
  personalizacao: objeto({ itens: lista(item), frase: texto }),
  organizacao: objeto({ titulo, subtitulo: texto, colunas: lista(texto), linhas: lista(objeto({ c1: texto, c2: texto, c3: texto, c4: texto })), rodape: texto }),
  investimento: objeto({ nome_oferta: texto, descricao_oferta: texto, escopo: objeto({ rotulo: texto, destaque: texto, texto }), incluso: texto, nao_incluso: texto }),
  proximos: objeto({ itens: lista(item) }),
  frase_final: objeto({ antes: texto, destaque: texto, depois: texto }),
  mensagem_email: objeto({ assunto: texto, texto }),
  mensagem_whatsapp: texto,
  resumo: texto,
});

const INSTRUCOES = `Você escreve propostas comerciais da Mentorei, empresa brasileira de desenvolvimento de líderes (treinamentos, workshops, palestras, mentorias individuais e em grupo, trilhas, diagnósticos), muito presente em cooperativas de crédito e agro, mas também em empresas. As sócias são Claudia Kreniczki (gente, cultura e liderança), Juliana Foresti (negócios, comunicação e imagem) e Viviane Sotoriva (finanças e cooperativismo). Responda em português do Brasil, no formato pedido, preenchendo o modelo de apresentação descrito abaixo.

O que é FIXO no modelo e você não escreve: os números da Mentorei, a apresentação e os currículos das sócias, os contatos e os VALORES do investimento (a equipe digita os preços numa caixa separada; você nunca escreve valores, preços, parcelas ou descontos nas páginas).

Os limites de letras são obrigatórios: o texto precisa caber nas caixas de cada página. Conte as letras.

- secao: palavra que nomeia o trabalho nas etiquetas das páginas, em maiúsculas, com artigo: "O WORKSHOP", "O PROGRAMA", "A MENTORIA", "O TREINAMENTO", "A TRILHA", "A PALESTRA" (até 18 letras).
- rotulo_modulo: como cada parte se chama, em maiúsculas e no singular: "PILAR", "MÓDULO", "ENCONTRO", "SESSÃO", "AULA" ou "ETAPA" (até 10 letras). Use o mesmo nome nos títulos e na tabela.
- capa: tipo ("Proposta de workshop", "Proposta de mentoria em grupo"... até 32 letras); nome do programa (curto e marcante, 2 a 4 palavras, até 26 letras); subtitulo1 (a promessa, até 44 letras); subtitulo2 (o que é e para quem, até 52 letras); linha1 = "Cliente  •  Público" (até 52 letras); linha2 = "carga horária e formato  •  quantidade de partes", ex.: "16 horas online  •  4 encontros quinzenais" (até 52 letras). Use "  •  " (dois espaços, ponto, dois espaços) entre as partes.
- demanda ("O que entendemos da sua demanda"): exatamente 4 itens (titulo até 30 letras; texto até 110 letras) + frase de fechamento (até 85 letras, ex.: "Uma jornada aplicada à rotina real das agências da Cooperativa X.").
- quem_titulo: título da página "quem somos" em duas partes, a última vai destacada: {"texto": "Quem conduz a ", "destaque": "mentoria"} ou {"texto": "Quem desenvolve o ", "destaque": "workshop"} (total até 32 letras).
- socias_rodape: uma linha até 95 letras, ex.: "Experiência complementar em pessoas, negócios e cooperativismo. Condução: Claudia Kreniczki." (quem conduz só se o pedido disser; senão "Condução a definir.").
- expertise: titulo em duas partes (para cooperativas {"texto": "Expertise em ", "destaque": "cooperativismo"}; para empresas, ex.: {"texto": "Expertise que faz ", "destaque": "diferença"}); exatamente 4 itens (titulo até 42 letras; texto até 118 letras; o último costuma ser "Conteúdo construído para [cliente]").
- visao: titulo em duas partes, ex.: {"texto": "O workshop em ", "destaque": "quatro pilares"} (total até 34 letras; o número por extenso tem de bater com a quantidade de módulos); rodape (até 95 letras: carga total, intervalos, "datas e local a definir" quando não houver).
- modulos: de 1 a 6, na ordem. titulo até 40 letras; titulo_curto até 22 letras (com 5 ou 6 módulos, até 16); chamada = frase curtíssima para o cartão-resumo (até 34 letras, ex.: "Conhecer para ser relevante"); subtitulo até 55 letras; quando = período e duração, ex.: "Manhã  •  2 horas" ou "Encontro 1  •  4 horas" (até 22 letras); quando_curto, ex.: "Manhã / 2h" ou "4 horas" (até 12 letras); objetivo (uma frase com verbo no infinitivo, até 110 letras); entrega (o que o participante leva pronto, até 100 letras); topicos: de 3 a 5, cada um com destaque (o começo em negrito terminando em dois-pontos, ex.: "Conversas difíceis:", até 40 letras, ou "" quando não houver) e texto (o resto; destaque + texto até 85 letras).
- destaques: 0 a 2 páginas extras de aprofundamento, só quando o pedido traz um tema que merece página própria (ex.: produtos a revisitar, situações reais). apos_modulo = número do módulo depois do qual a página entra; titulo em duas partes (ex.: {"texto": "Revisitar produtos. ", "destaque": "Mudar a conversa."}, até 36 letras); subtitulo (até 60 letras, ou ""); exatamente 4 itens: destaque (palavra em negrito com dois-pontos, até 16 letras), texto_destaque (complemento da mesma linha, até 40 letras), texto (até 120 letras).
- metodologia ("Uma experiência dinâmica e aplicada"): exatamente 4 itens (titulo até 32 letras; texto até 112 letras), ex.: casos reais do cliente, simulações e discussão em grupo, momentos individuais de análise, ferramentas para o dia seguinte.
- personalizacao ("Personalização que faz diferença"): exatamente 4 itens (titulo até 26 letras; texto até 100 letras: realidade do cliente/briefing, portfólio ou processos aplicados, casos do cliente, aplicação e continuidade) + frase (até 85 letras).
- organizacao: titulo em duas partes ({"texto": "Organização da ", "destaque": "jornada"} ou {"texto": "Cronograma ", "destaque": "sugerido"}); subtitulo (até 70 letras, ex.: "Um dia presencial  •  8 horas efetivas  •  Data e local a definir"); colunas = 4 cabeçalhos curtos (até 10 letras cada, ex.: ["Período", "Duração", "Pilar", "Foco"] ou ["Data", "Horário", "Encontro", "Tema"]); linhas = uma por módulo (até 8): c1 até 12 letras (período ou data), c2 até 8 letras (duração ou horário), c3 até 6 letras (número, ex.: "01"), c4 até 48 letras (tema); rodape até 95 letras.
- investimento (os valores vêm da equipe; aqui só textos): nome_oferta = o que está sendo vendido, ex.: "Workshop personalizado" (até 30 letras); descricao_oferta = uma frase sobre o que a pessoa compra, sem valores (até 90 letras); escopo = caixa ao lado quando há um preço só: {"rotulo": "Escopo contemplado", "destaque": "Conteúdo + prática", "texto": até 95 letras}; incluso = o que está incluído, sem a palavra "Incluso" no começo (até 100 letras); nao_incluso = começando com "Não incluso:" (até 75 letras, ex.: "Não incluso: logística, materiais impressos e despesas de viagem.").
- proximos ("Próximos passos"): exatamente 4 itens (titulo até 14 letras: Alinhamento, Customização, Execução, Aplicação ou Continuidade; texto até 65 letras).
- frase_final: três frases curtas de impacto ligadas ao tema, uma por linha; a do meio fica destacada: {"antes": "Conhecer a rotina.", "destaque": "Construir confiança.", "depois": "Entregar soluções que fazem sentido."} (cada uma até 36 letras; sem aspas).
- icone (nos itens da expertise, da metodologia, das páginas extras e em cada módulo): escolha o desenho que combina com o item entre: ${Object.entries(ICONES).map(([k, v]) => `${k} (${v})`).join(', ')}.
- mensagem_email: assunto (até 80 letras) e texto (e-mail curto e cordial, em parágrafos, para a pessoa de contato: diz que a proposta segue em anexo, resume em uma frase o que foi proposto, se coloca à disposição e assina com o nome do responsável da Mentorei). mensagem_whatsapp: versão curta (até 400 letras, sem assunto, no máximo 1 emoji).
- resumo: 2 ou 3 linhas para o histórico interno (o que foi proposto, carga e o investimento informado pela equipe).

Regras de escrita:
- Use o pedido como fonte principal. O que o pedido não disser: deixe "a definir" (datas, local, quantidade) e não invente números, resultados, depoimentos, nomes de pessoas do cliente nem promessas de promoção ou aumento.
- Tom consultivo, direto, sem jargão de coaching em inglês (nada de "accountability" ou "follow-up"), frases curtas, verbos no infinitivo nos objetivos. Sem exclamações. Fale do cliente pelo nome e do público pelo cargo.
- Quando o pedido for um ajuste, mantenha tudo o que não foi pedido para mudar. Pedidos de mudança de preço não são com você: diga no resumo que o valor se muda na caixa "Investimento" da tela.`;

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
  const { opcoes, texto: atual } = separarOpcoes(p.conteudo);
  if (pedido.trim().length < 20 && !temTexto(atual)) return falhar('O pedido está vazio. Escreva o conteúdo da proposta.');

  const precos = precosValidos(opcoes.precos);
  const contexto = [
    `Cliente: ${emp.nome || '(não informado)'}${emp.tipo ? ` (${emp.tipo})` : ''}${emp.cidade ? ` · ${emp.cidade}${emp.uf ? `/${emp.uf}` : ''}` : ''}${emp.porte ? ` · porte: ${emp.porte}` : ''}`,
    `Oportunidade: ${o.titulo || ''} · serviço: ${o.servico || ''}`,
    contato.nome ? `Pessoa de contato: ${contato.nome}${contato.cargo ? `, ${contato.cargo}` : ''}` : '',
    `Responsável da Mentorei que assina: ${responsavel}`,
    o.observacoes ? `Observações da oportunidade: ${o.observacoes}` : '',
    `Investimento digitado pela equipe (só para o resumo e as mensagens; NÃO escreva valores nas páginas): ${precos.length ? precos.map(resumoPreco).join(' | ') : 'a definir'}${opcoes.pagamento ? ` · pagamento: ${opcoes.pagamento}` : ''}`,
    `Data de hoje: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  ].filter(Boolean).join('\n');
  const mensagens = [];
  if (temTexto(atual) && ajustes) {
    mensagens.push({ role: 'user', content: `Contexto:\n${contexto}\n\nPedido original:\n${pedido}\n\nProposta atual (JSON):\n${JSON.stringify(atual)}\n\nAJUSTE PEDIDO: ${ajustes}\n\nDevolva a proposta inteira com o ajuste aplicado, mantendo o resto.` });
  } else {
    mensagens.push({ role: 'user', content: `Contexto:\n${contexto}\n\nPedido (conteúdo da proposta):\n${pedido}${ajustes ? `\n\nObservações adicionais: ${ajustes}` : ''}` });
  }

  let gerado;
  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 20000,
      system: INSTRUCOES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: mensagens,
    });
    if (r.stop_reason === 'refusal') return falhar('A IA não aceitou escrever esta proposta. Reescreva o pedido e tente de novo.');
    if (r.stop_reason === 'max_tokens') return falhar('A proposta ficou grande demais para uma resposta. Peça menos módulos ou tópicos e tente de novo.');
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    try { gerado = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu a proposta organizada. Tente de novo.'); }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(`O Claude respondeu com erro (${e.status}). Tente de novo.`);
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }

  // o que a tela escolheu (modelo, preços, pagamento, validade, logo) volta por cima do que a IA escreveu
  const conteudo = { ...gerado, versao: 2 };
  for (const k of OPCOES_DA_TELA) if (opcoes[k] !== undefined) conteudo[k] = opcoes[k];
  const valor = valorDaProposta(conteudo.precos);
  let validade = p.validade || null;
  const dias = Number(conteudo.validade_dias) || 0;
  if (dias > 0) { const d = new Date(); d.setUTCDate(d.getUTCDate() + dias); validade = d.toISOString().slice(0, 10); }
  const g = await supa(`/rest/v1/propostas?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'rascunho', conteudo, resumo: conteudo.resumo || null, valor: valor != null ? valor : (p.valor || null), validade, erro: null, ajustes: ajustes || null } });
  if (!g.ok) return falhar('Não consegui salvar o conteúdo gerado.');
  try {
    await montarEGuardar({ ...p, conteudo });
  } catch (e) {
    await supa(`/rest/v1/propostas?id=eq.${id}`, { metodo: 'PATCH', corpo: { erro: `O conteúdo foi gerado, mas o arquivo não foi montado: ${e.message}` } });
  }
};
