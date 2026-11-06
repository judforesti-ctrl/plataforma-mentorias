// Relatório da mentoria para a empresa (script 68): junta os mentorados dos programas escolhidos de uma empresa (números
// calculados aqui, nunca pela IA) e pede ao Claude a leitura macro para a diretoria e o RH: dificuldades, temas mais trabalhados,
// medos e próximos passos, com os CÓDIGOS dos líderes e das sessões por trás de cada item (a plataforma conta). Fontes: anotações
// dos mentores e resumos já enviados, com os nomes trocados por [líder]. As informações delicadas NUNCA são lidas daqui.
// Roda em segundo plano: a tela acompanha relatorios_empresa.status (gerando → rascunho | erro). Com "ajustes", a IA muda o texto
// atual só no que foi pedido. Só a administração usa.
import Anthropic from '@anthropic-ai/sdk';
import { motivoClaude } from '../lib/claude-erro.mjs';
import { supa, env, SUPABASE_URL } from '../lib/google.mjs';
import { dataCurta } from '../lib/jornada.mjs';
import { escolherMentorados, montarDadosEmpresa, entradaParaIA, ESQUEMA, INSTRUCOES, textoFinal, paraIA } from '../lib/leitura-empresa.mjs';

export const config = { path: '/api/relatorio-empresa-gerar', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sessões SEM informacoes_delicadas (de propósito: nem chegam aqui).
const SEL_SESSOES = 'id,mentorado_id,numero,extra,data_hora,tema,situacao,duracao_min,resumo_mentorado,concluida_em,tarefa,tarefa_prazo,tarefa_feita_em,'
  + 'mentor:perfis!sessoes_mentor_id_fkey(id,nome,foto_url),interno:sessoes_interno(resumo_mentor,notas_evolucao),avaliacao:avaliacoes_sessao(nota)';
const lote = (l, n) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

export default async (req) => {
  const chave = env('SUPABASE_SECRET_KEY');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.id || '');
  if (!UUID.test(id) || !chave) return;
  const falhar = (erro) => supa(`/rest/v1/relatorios_empresa?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });

  // quem pediu tem de ser da administração
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = token ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: chave, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  if (!u || !u.id) return falhar('Sessão expirada. Entre de novo e repita.');
  const perfil = await supa(`/rest/v1/perfis?id=eq.${u.id}&select=papel,ativo`);
  const meu = perfil.ok && perfil.dados && perfil.dados[0];
  if (!meu || meu.papel !== 'admin' || !meu.ativo) return falhar('Só a administração gera o relatório para a empresa.');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');

  const rr = await supa(`/rest/v1/relatorios_empresa?id=eq.${id}&select=*`);
  const rel = rr.ok && rr.dados && rr.dados[0];
  if (!rel) return falhar('Relatório não encontrado.');
  const eq = await supa(`/rest/v1/empresas?id=eq.${rel.empresa_id}&select=id,nome`);
  const empresa = eq.ok && eq.dados && eq.dados[0];
  if (!empresa) return falhar('Empresa não encontrada.');
  const ids = (rel.programas || []).filter((x) => UUID.test(x));
  if (!ids.length) return falhar('Nenhum programa escolhido.');
  const pq = await supa(`/rest/v1/programas?id=in.(${ids.join(',')})&empresa_id=eq.${empresa.id}&select=id,nome,sessoes_por_mentorado,duracao_min,inicio,fim_previsto,status&order=nome`);
  const programas = (pq.ok && pq.dados) || [];
  if (!programas.length) return falhar('Os programas escolhidos não foram encontrados nesta empresa.');
  const mq = await supa(`/rest/v1/mentorados?programa_id=in.(${programas.map((p) => p.id).join(',')})&select=id,nome,cargo,status,objetivo_principal,pontos_desenvolver,programa_id,`
    + 'programa:programas(id,nome,duracao_min,empresa:empresas(nome)),vinculos:mentor_mentorado(ordem,mentor:perfis(id,nome,foto_url))&order=nome');
  if (!mq.ok || !Array.isArray(mq.dados)) return falhar('Não consegui ler os mentorados dos programas.');
  const { dentro, fora } = escolherMentorados(mq.dados);
  if (!dentro.length) return falhar('Nenhum mentorado ativo ou concluído nos programas escolhidos.');

  // sessões e tarefas em lotes (programas grandes passam do limite de linhas de uma leitura)
  const sessoesPor = new Map(dentro.map((m) => [m.id, []]));
  let porSessao = new Map();
  for (const parte of lote(dentro.map((m) => m.id), 15)) {
    const lista = parte.join(',');
    const [sq, tq] = await Promise.all([
      supa(`/rest/v1/sessoes?mentorado_id=in.(${lista})&select=${SEL_SESSOES}&order=numero`),
      supa(`/rest/v1/tarefas?mentorado_id=in.(${lista})&select=sessao_id,texto,prazo,feita_em&order=ordem,criado_em`),
    ]);
    if (!sq.ok || !Array.isArray(sq.dados)) return falhar('Não consegui ler as sessões dos mentorados.');
    sq.dados.forEach((s) => sessoesPor.get(s.mentorado_id).push(s));
    if (porSessao && tq.ok && Array.isArray(tq.dados)) tq.dados.forEach((t) => { if (!porSessao.has(t.sessao_id)) porSessao.set(t.sessao_id, []); porSessao.get(t.sessao_id).push(t); });
    else porSessao = null;   // sem a tabela nova (script 33): a tarefa única antiga
  }
  if (![...sessoesPor.values()].some((l) => l.some((s) => s.situacao === 'realizada'))) {
    return falhar('Nenhuma sessão destes programas está marcada como realizada: ainda não há o que relatar.');
  }
  const cq = await supa('/rest/v1/configuracoes?chave=eq.avaliacoes_escala&select=valor');
  const valor = cq.ok && cq.dados && cq.dados[0] && cq.dados[0].valor;
  const escala10 = !!(valor && Number(valor.escala) === 10);   // antes do script 64 as notas iam de 1 a 5

  const dados = montarDadosEmpresa({ empresa, programas, mentorados: dentro, sessoesPor, porSessao, escala10, fora });
  const entrada = entradaParaIA({ mentorados: dentro, sessoesPor, porSessao, dados });
  const terminou = programas.every((p) => p.status === 'concluido');
  const contexto = `Data de hoje: ${dataCurta(new Date().toISOString())}${terminou ? '\nO programa já terminou: esta é a leitura final.' : '\nO programa ainda está em andamento: fale do caminho "até aqui".'}`
    + `${rel.observacoes ? `\nPedido da equipe da Mentorei para este relatório: ${String(rel.observacoes).slice(0, 3000)}` : ''}`;
  const atual = rel.conteudo && rel.conteudo.texto;
  const ajustes = String(b.ajustes || '').trim().slice(0, 4000);
  const pedido = ajustes && atual
    ? `${contexto}\n\nRegistros do programa (JSON):\n${JSON.stringify(entrada)}\n\nRelatório atual (JSON):\n${JSON.stringify(paraIA(atual))}\n\nAJUSTE PEDIDO: ${ajustes}`
    : `${contexto}\n\nRegistros do programa (JSON):\n${JSON.stringify(entrada)}`;

  let gerado;
  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    // em fluxo (stream): o texto pode ser longo e assim não estoura o tempo de resposta
    const r = await client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',     // se o modelo principal recusar, outro modelo recomendado responde na mesma chamada
      system: INSTRUCOES,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: pedido }],
    }).finalMessage();
    if (r.stop_reason === 'refusal') return falhar('A IA não aceitou escrever este relatório. Tente de novo ou mude o pedido.');
    if (r.stop_reason === 'max_tokens') return falhar('O relatório ficou grande demais para uma resposta. Tente de novo.');
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    try { gerado = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu o relatório organizado. Tente de novo.'); }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(motivoClaude(e));
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }

  const texto = textoFinal(gerado, dados);
  const g = await supa(`/rest/v1/relatorios_empresa?id=eq.${id}`, { metodo: 'PATCH',
    corpo: { status: 'rascunho', erro: null, titulo: rel.titulo && ajustes ? rel.titulo : texto.titulo, conteudo: { versao: 1, dados, texto } } });
  if (!g.ok) return falhar('Não consegui salvar o relatório gerado.');
};
