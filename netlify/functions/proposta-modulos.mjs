// Descritivo dos módulos pela proposta: o Claude lê a proposta e escreve, para cada módulo da turma, o que deve ser
// abordado (objetivo, entrega prática e tópicos), além do perfil da turma e da metodologia. Roda em segundo plano
// (pode levar mais de um minuto); o resultado vai para importacoes_proposta (resultado.tipo = 'modulos').
// Ao contrário de /api/proposta, NÃO cria oportunidade no pipeline de vendas (a turma já existe).
//
// Dois jeitos:
// - Na mão ("Descritivo da proposta" / "Trazer da proposta"): a tela manda o texto da proposta escolhida; nada é gravado
//   aqui, a administração confere na tela antes de colocar.
// - AUTOMÁTICO (2026-11-09, pedido da Juliana: "toda vez que formos criar uma turma a partir da proposta enviada para o
//   cliente, objetivo, descritivo e temas dos módulos entram sozinhos"): `automatico: true`. Depois que a turma ganha
//   módulos, o servidor acha sozinho a proposta da empresa (escolherProposta em descritivo-regras.js: a da oportunidade
//   ligada à turma; senão a enviada mais nova da empresa), lê (importação, conteúdo gerado pela IA ou o arquivo PDF/.pptx
//   guardado) e GRAVA só nos campos vazios (temática de cada módulo; perfil e metodologia da turma). Nunca troca o que
//   alguém escreveu: cada gravação só vale se o campo continua como estava quando foi lido.
import Anthropic from '@anthropic-ai/sdk';
import { motivoClaude } from '../lib/claude-erro.mjs';
import { supa, env, quemPede } from '../lib/google.mjs';
import { baixarArquivo } from '../lib/propostas.mjs';
import { textoDoPptx } from '../lib/texto-pptx.mjs';
import { textoDaImportacao, textoDaPropostaIA, importacaoComModulos, fonteDaProposta, escolherProposta, mesmaEmpresa, tipoArquivo, vazio }
  from '../../public/assets/descritivo-regras.js';

export const config = { path: '/api/proposta-modulos', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PDF_MAX = 20 * 1024 * 1024;   // o Claude aceita até 32 MB por pedido, e o PDF vai em base64 (um terço maior)

const texto = { type: 'string' };
const textoOuNulo = { type: ['string', 'null'] };
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposta_da_turma', 'modulos', 'perfil_turma', 'metodologia', 'aviso'],
  properties: {
    proposta_da_turma: { type: 'boolean' },
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

A turma pode ter sido cadastrada à mão, por uma planilha de programação ou a partir das datas reservadas na agenda: os títulos dos módulos podem estar resumidos, escritos de outro jeito, numa ordem diferente da proposta ou ser só "Módulo 1", "Módulo 2"... A proposta pode vir como texto de um PDF do Canva ou de um PowerPoint (marcado por página ou slide), como o próprio PDF ou como um resumo já organizado.

Como as propostas da Mentorei costumam ser:
- "O que entendemos da sua demanda": o contexto e os objetivos da empresa, e quem são os participantes.
- "O workshop em N pilares", "Jornada" ou a lista de módulos/encontros: cada pilar, módulo ou encontro é uma parte.
- A página de cada parte traz OBJETIVO, ENTREGA PRÁTICA e TÓPICOS ABORDADOS (às vezes período e duração).
- "Uma experiência dinâmica e aplicada" e "Personalização que faz diferença": a metodologia.
- Páginas institucionais (quem desenvolve, expertise, sócias), investimento e próximos passos: ignore.
- Palavras às vezes aparecem grudadas ("Fomentara carteira") ou partidas ("Experi ê ncia"): corrija a separação, sem mudar o conteúdo.

Regras:
- proposta_da_turma: true se a proposta é do mesmo cliente e do mesmo programa desta turma (os temas dos módulos batem com partes da proposta, ou os títulos são genéricos como "Módulo 1" e a proposta tem módulos/encontros para eles). false se parece ser de outro cliente ou de outro programa; nesse caso explique em "aviso".
- modulos: um item para CADA módulo da turma da lista recebida, com a mesma chave. Ache a parte da proposta que trata do mesmo tema, comparando primeiro o título e o assunto; use a ordem/número só para desempatar. Se o título do módulo for genérico (só "Módulo N", "Encontro N" ou parecido), ligue pela ordem: o módulo N da turma é a parte N da proposta. A mesma parte pode servir a mais de um módulo (por exemplo, quando a turma repete um tema). Se nenhuma parte da proposta corresponder ao módulo, achado = false, parte_da_proposta = null e tematica = "".
- Módulos marcados "(já tem descritivo)" não precisam de texto: achado = false, parte_da_proposta = null e tematica = "" (eles só ajudam a entender a ordem e os temas da turma).
- parte_da_proposta: como a parte se chama na proposta, curto (ex.: "Pilar 2 · Leitura do cooperado e da carteira").
- tematica: o que deve ser abordado, nesta ordem: "Objetivo: ..." (uma frase), "Entrega prática: ..." (se houver) e os tópicos abordados como linhas começando com "• ". Uma informação por linha. Use só o que está na proposta, com as palavras dela; não invente tópicos, números, ferramentas nem promessas. Não coloque período, duração, datas, preços ou valores.
- perfil_turma: quem são os participantes (cargos, nível, público atendido), o contexto e o que a empresa espera, em parágrafos curtos. Nulo se a proposta não disser.
- metodologia: como a aula é conduzida e personalizada (casos, simulações, momentos individuais, ferramentas entregues), em linhas começando com "• ". Nulo se não houver.
- aviso: uma frase simples para a coordenação quando algo merece atenção: a proposta parece ser de outra empresa ou de outro programa, módulos da turma que não estão na proposta, partes da proposta que não viraram módulo. Nulo se estiver tudo certo.
- Nunca inclua preços, valores, investimento, condições de pagamento nem dados bancários.`;

const lista = (r) => (r.ok && Array.isArray(r.dados) ? r.dados : []);
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
// filtro "o campo continua como estava quando foi lido" (para nunca trocar o que alguém escreveu enquanto a IA lia)
const comoEstava = (campo, valor) => (valor == null ? `${campo}=is.null` : `${campo}=eq.${encodeURIComponent(valor)}`);

export default async (req) => {
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.importacao_id || '');
  const turmaId = String(b.turma_id || '');
  const automatico = b.automatico === true;
  if (!UUID.test(id) || !env('SUPABASE_SECRET_KEY')) return;
  const marca = automatico ? { tipo: 'modulos', automatico: true, turma_id: turmaId } : null;
  const falhar = (erro) => supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });
  const terminar = (resultado) => supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'pronto', resultado } });

  const eu = await quemPede(req);
  if (!eu) return falhar('Sessão expirada. Entre de novo e tente outra vez.');
  if (eu.papel !== 'admin') return falhar('Só a administração traz o descritivo da proposta.');
  if (!UUID.test(turmaId)) return falhar('Turma não encontrada.');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');

  // no automático, espera outro automático da mesma turma que começou antes (módulos criados um atrás do outro)
  if (automatico) await esperarAnteriores(id, turmaId);

  const t = await supa(`/rest/v1/turmas?id=eq.${turmaId}&select=id,nome,empresa_id,perfil_turma,observacoes,empresa:empresas(nome),modulos(id,numero,titulo,tematica)`);
  const turma = lista(t)[0];
  if (!turma) return falhar('Turma não encontrada.');
  const mods = (turma.modulos || []).slice().sort((a, b2) => a.numero - b2.numero);
  if (!mods.length) return automatico ? terminar({ ...marca, nada: 'A turma ainda não tem módulos.' }) : falhar('Esta turma ainda não tem módulos. Cadastre os módulos e tente de novo.');

  // o que vai para a IA: o texto da proposta (na mão, vem da tela) ou a proposta achada aqui (automático)
  let proposta = null, conteudoProposta;
  if (automatico) {
    if (!mods.some((m) => vazio(m.tematica))) return terminar({ ...marca, nada: 'Todos os módulos já têm descritivo.' });
    try { proposta = await acharProposta(turma); } catch (_) { proposta = null; }
    if (!proposta) return terminar({ ...marca, nada: 'Não achei proposta desta empresa na plataforma (enviada, importada ou gerada pela IA). Use "Trazer da proposta" para enviar o arquivo.' });
    try { conteudoProposta = await lerProposta(proposta, turma); } catch (e) { conteudoProposta = null; proposta.erro = e.message; }
    if (!conteudoProposta) return terminar({ ...marca, proposta: resumo(proposta), nada: proposta.erro || `Não consegui ler a proposta "${proposta.nome}".` });
  } else {
    const conteudo = String(b.texto || '').slice(0, 150000);
    if (conteudo.replace(/--- (página|slide) \d+ ---/g, '').trim().length < 150) return falhar('Não consegui ler texto nesta proposta. Se ela for uma imagem escaneada, exporte de novo como PDF a partir do Canva ou do PowerPoint.');
    conteudoProposta = { texto: conteudo, arquivo: String(b.arquivo || '').slice(0, 160) };
  }

  const listaModulos = mods.map((m, i) => `chave ${i + 1}: Módulo ${m.numero} · ${m.titulo}${automatico && !vazio(m.tematica) ? ' (já tem descritivo)' : ''}`).join('\n');
  const cabeca = `Turma: ${turma.empresa ? turma.empresa.nome : ''} · ${turma.nome}\n\nMódulos da turma:\n${listaModulos}\n\n`;
  const content = conteudoProposta.pdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: conteudoProposta.pdf } },
      { type: 'text', text: `${cabeca}A proposta é o PDF acima (${conteudoProposta.arquivo}).` }]
    : `${cabeca}Proposta (${conteudoProposta.arquivo}):\n\n${conteudoProposta.texto}`;

  let res;
  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: INSTRUCOES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content }],
    });
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    try { res = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu o descritivo organizado. Tente de novo.'); }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(motivoClaude(e));
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }

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
    proposta_da_turma: res.proposta_da_turma !== false,
  };
  if (!automatico) return terminar(resultado);

  // automático: grava só onde está vazio e continua como foi lido
  Object.assign(resultado, marca, { proposta: resumo(proposta), gravados: [] });
  if (resultado.proposta_da_turma) {
    for (const item of resultado.modulos) {
      const m = mods.find((x) => x.id === item.modulo_id);
      if (!item.achado || !m || !vazio(m.tematica)) continue;
      const g = await supa(`/rest/v1/modulos?id=eq.${m.id}&${comoEstava('tematica', m.tematica)}&select=id`, { metodo: 'PATCH', corpo: { tematica: item.tematica }, prefer: 'return=representation' });
      if (lista(g).length) resultado.gravados.push(m.id);
    }
    const mudTurma = [['perfil_turma', resultado.perfil_turma], ['observacoes', resultado.metodologia]].filter(([k, v]) => v && vazio(turma[k]));
    for (const [k, v] of mudTurma) {
      const g = await supa(`/rest/v1/turmas?id=eq.${turmaId}&${comoEstava(k, turma[k])}&select=id`, { metodo: 'PATCH', corpo: { [k]: v }, prefer: 'return=representation' });
      if (lista(g).length) resultado[k === 'perfil_turma' ? 'perfil_gravado' : 'metodologia_gravada'] = true;
    }
  }
  return terminar(resultado);
};

const resumo = (p) => (p ? { chave: p.chave, nome: p.nome, fonte: p.fonte, proposta_id: p.propostaId || null, oportunidade_id: p.oportunidadeId || null } : null);

// Espera (até 5 minutos) outro descritivo automático desta turma que começou antes deste e ainda está lendo.
async function esperarAnteriores(id, turmaId) {
  const eu = lista(await supa(`/rest/v1/importacoes_proposta?id=eq.${id}&select=criado_em`))[0];
  if (!eu) return;
  const desde = new Date(Date.now() - 6 * 60000).toISOString();
  for (let i = 0; i < 60; i++) {
    const r = await supa(`/rest/v1/importacoes_proposta?status=eq.processando&resultado->>turma_id=eq.${turmaId}&resultado->>automatico=eq.true`
      + `&id=neq.${id}&criado_em=gte.${encodeURIComponent(desde)}&criado_em=lt.${encodeURIComponent(eu.criado_em)}&select=id`);
    if (!lista(r).length) return;
    await dormir(5000);
  }
}

// As propostas desta turma/empresa que estão na plataforma, e a escolhida (descritivo-regras.js: escolherProposta).
async function acharProposta(turma) {
  const empresaNome = turma.empresa ? turma.empresa.nome : '';
  // empresas com o mesmo nome (cadastro repetido) também contam, com menos peso
  const parecidas = lista(await supa('/rest/v1/empresas?select=id,nome')).filter((e) => e.id !== turma.empresa_id && mesmaEmpresa(e.nome, empresaNome)).map((e) => e.id);
  const empresas = [turma.empresa_id, ...parecidas].filter(Boolean);
  const filtro = [`turma_id.eq.${turma.id}`, ...(empresas.length ? [`empresa_id.in.(${empresas.join(',')})`] : [])].join(',');
  const ops = lista(await supa(`/rest/v1/oportunidades?or=(${filtro})&select=id,titulo,etapa,turma_id,empresa_id,empresa:empresas(nome)`));
  const candidatas = [];
  if (ops.length) {
    let r = await supa(`/rest/v1/propostas?oportunidade_id=in.(${ops.map((o) => o.id).join(',')})&select=id,oportunidade_id,versao,status,enviada_em,criado_em,conteudo,importacao_id,arquivo,arquivo_storage,resumo&order=criado_em.desc`);
    if (!r.ok) r = await supa(`/rest/v1/propostas?oportunidade_id=in.(${ops.map((o) => o.id).join(',')})&select=id,oportunidade_id,versao,enviada_em,criado_em,importacao_id,arquivo,resumo&order=criado_em.desc`);
    const props = lista(r);
    const idsImp = [...new Set(props.map((p) => p.importacao_id).filter(Boolean))];
    const imps = idsImp.length ? lista(await supa(`/rest/v1/importacoes_proposta?id=in.(${idsImp.join(',')})&status=eq.pronto&select=id,resultado`)) : [];
    const resultadoDe = new Map(imps.map((i) => [i.id, i.resultado]));
    for (const p of props) {
      const op = ops.find((o) => o.id === p.oportunidade_id) || {};
      const importacao = p.importacao_id ? resultadoDe.get(p.importacao_id) || null : null;
      const fonte = fonteDaProposta(p, importacao);
      if (!fonte) continue;
      const nome = (p.conteudo && p.conteudo.capa && p.conteudo.capa.nome) || p.arquivo || op.titulo || 'Proposta';
      candidatas.push({ chave: `p${p.id}`, propostaId: p.id, oportunidadeId: op.id, nome: `${nome}${p.versao > 1 ? ` (versão ${p.versao})` : ''}`, fonte,
        turmaId: op.turma_id || null, empresaId: op.empresa_id, empresaNome: op.empresa ? op.empresa.nome : '', status: p.status || 'enviada',
        enviada: !!p.enviada_em, etapa: op.etapa, quando: p.enviada_em || p.criado_em, proposta: p, importacao });
    }
  }
  // importações antigas sem proposta em Vendas (antes de 15/10 nem toda importação virava oportunidade)
  const usadas = new Set(lista(await supa('/rest/v1/propostas?importacao_id=not.is.null&select=importacao_id')).map((p) => p.importacao_id));
  for (const i of lista(await supa('/rest/v1/importacoes_proposta?status=eq.pronto&select=id,arquivo,criado_em,resultado&order=criado_em.desc&limit=200'))) {
    if (usadas.has(i.id) || !importacaoComModulos(i.resultado)) continue;
    candidatas.push({ chave: `i${i.id}`, nome: i.arquivo || 'Proposta importada', fonte: 'importacao', turmaId: null, empresaId: null,
      empresaNome: i.resultado.empresa || '', status: 'aprovada', enviada: false, etapa: null, quando: i.criado_em, importacao: i.resultado });
  }
  return escolherProposta(candidatas, turma);
}

// Texto (ou o PDF) da proposta escolhida.
async function lerProposta(p, turma) {
  const empresa = turma.empresa ? turma.empresa.nome : '';
  if (p.fonte === 'importacao') return { texto: textoDaImportacao(p.importacao).slice(0, 150000), arquivo: p.nome };
  if (p.fonte === 'ia') return { texto: textoDaPropostaIA(p.proposta.conteudo, empresa).slice(0, 150000), arquivo: p.nome };
  const caminho = p.proposta.arquivo_storage;
  const buf = await baixarArquivo(caminho);
  if (!buf) throw new Error(`Não consegui abrir o arquivo da proposta "${p.nome}" guardado na plataforma.`);
  if (tipoArquivo(caminho) === 'pptx') {
    const txt = await textoDoPptx(buf);
    if (txt.replace(/--- slide \d+ ---/g, '').trim().length < 150) throw new Error(`O PowerPoint "${p.nome}" quase não tem texto (os slides devem ser imagens). Use "Trazer da proposta" com o PDF.`);
    return { texto: txt.slice(0, 150000), arquivo: p.nome };
  }
  if (buf.length > PDF_MAX) throw new Error(`O PDF "${p.nome}" é grande demais para a leitura automática. Use "Trazer da proposta" com uma versão menor.`);
  return { pdf: buf.toString('base64'), arquivo: p.nome };
}
