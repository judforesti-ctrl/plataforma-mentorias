// Relatório da jornada do mentorado (script 67): junta as sessões do mentorado (números calculados aqui, nunca pela IA) e pede ao
// Claude o texto: cada sessão realizada (temas e um resumo curto) e, no fim, a síntese (pontos altos, o que ele reconhece que
// melhorou, desafios). Fontes: anotações dos mentores e resumos já enviados ao mentorado. As informações delicadas NUNCA são
// lidas daqui. Roda em segundo plano: a tela acompanha relatorios_mentorado.status (gerando → rascunho | erro).
// Com "ajustes", a IA muda o texto atual só no que foi pedido. Só a administração usa.
import Anthropic from '@anthropic-ai/sdk';
import { motivoClaude } from '../lib/claude-erro.mjs';
import { supa, env, SUPABASE_URL } from '../lib/google.mjs';
import { montarDados, entradaParaIA, ESQUEMA, INSTRUCOES, textoFinal, paraIA, dataCurta } from '../lib/jornada.mjs';

export const config = { path: '/api/relatorio-mentorado-gerar', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sessões SEM informacoes_delicadas (de propósito: nem chegam aqui).
const SEL_SESSOES = 'id,numero,extra,data_hora,tema,roteiro,situacao,duracao_min,resumo_mentorado,concluida_em,tarefa,tarefa_prazo,tarefa_feita_em,'
  + 'mentor:perfis!sessoes_mentor_id_fkey(id,nome,foto_url),interno:sessoes_interno(resumo_mentor,notas_evolucao),avaliacao:avaliacoes_sessao(nota)';

export default async (req) => {
  const chave = env('SUPABASE_SECRET_KEY');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.id || '');
  if (!UUID.test(id) || !chave) return;
  const falhar = (erro) => supa(`/rest/v1/relatorios_mentorado?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });

  // quem pediu tem de ser da administração
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = token ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: chave, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  if (!u || !u.id) return falhar('Sessão expirada. Entre de novo e repita.');
  const perfil = await supa(`/rest/v1/perfis?id=eq.${u.id}&select=papel,ativo`);
  const meu = perfil.ok && perfil.dados && perfil.dados[0];
  if (!meu || meu.papel !== 'admin' || !meu.ativo) return falhar('Só a administração gera o relatório da jornada.');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');

  const rr = await supa(`/rest/v1/relatorios_mentorado?id=eq.${id}&select=*`);
  const rel = rr.ok && rr.dados && rr.dados[0];
  if (!rel) return falhar('Relatório não encontrado.');
  const mq = await supa(`/rest/v1/mentorados?id=eq.${rel.mentorado_id}&select=id,nome,cargo,status,objetivo_principal,pontos_desenvolver,`
    + 'programa:programas(nome,duracao_min,empresa:empresas(nome)),vinculos:mentor_mentorado(ordem,mentor:perfis(id,nome,foto_url))');
  const m = mq.ok && mq.dados && mq.dados[0];
  if (!m) return falhar('Mentorado não encontrado.');
  const sq = await supa(`/rest/v1/sessoes?mentorado_id=eq.${m.id}&select=${SEL_SESSOES}&order=numero`);
  if (!sq.ok || !Array.isArray(sq.dados)) return falhar('Não consegui ler as sessões do mentorado.');
  const sessoes = sq.dados;
  if (!sessoes.some((s) => s.situacao === 'realizada')) return falhar('Nenhuma sessão deste mentorado está marcada como realizada: ainda não há o que relatar.');

  // tarefas (várias por sessão, script 33; sem a tabela, a tarefa única antiga), ferramentas enviadas e a escala das notas
  const [tq, fq, eq] = await Promise.all([
    supa(`/rest/v1/tarefas?mentorado_id=eq.${m.id}&select=sessao_id,texto,prazo,feita_em&order=ordem,criado_em`),
    supa(`/rest/v1/ferramentas_enviadas?mentorado_id=eq.${m.id}&select=sessao_id,ferramenta:ferramentas(nome)`),
    supa('/rest/v1/configuracoes?chave=eq.avaliacoes_escala&select=valor'),
  ]);
  let porSessao = null;
  if (tq.ok && Array.isArray(tq.dados)) {
    porSessao = new Map();
    tq.dados.forEach((t) => { if (!porSessao.has(t.sessao_id)) porSessao.set(t.sessao_id, []); porSessao.get(t.sessao_id).push(t); });
  }
  const ferramentas = new Map();
  ((fq.ok && fq.dados) || []).forEach((x) => {
    const n = x.ferramenta && x.ferramenta.nome;
    if (!n || !x.sessao_id) return;
    const l = ferramentas.get(x.sessao_id) || [];
    if (!l.includes(n)) l.push(n);
    ferramentas.set(x.sessao_id, l);
  });
  const valor = eq.ok && eq.dados && eq.dados[0] && eq.dados[0].valor;
  const escala10 = !!(valor && Number(valor.escala) === 10);   // antes do script 64 as notas iam de 1 a 5

  const dados = montarDados({ m, sessoes, porSessao, ferramentas, escala10 });
  const entrada = entradaParaIA({ m, sessoes, porSessao, ferramentas, dados });
  const contexto = `Data de hoje: ${dataCurta(new Date().toISOString())}${m.status === 'concluido' ? '\nO programa deste mentorado já terminou: este é o relatório final.' : '\nO programa ainda está em andamento: fale do caminho "até aqui".'}`
    + `${rel.observacoes ? `\nPedido da equipe da Mentorei para este relatório: ${String(rel.observacoes).slice(0, 3000)}` : ''}`;
  const atual = rel.conteudo && rel.conteudo.texto;
  const ajustes = String(b.ajustes || '').trim().slice(0, 4000);
  const pedido = ajustes && atual
    ? `${contexto}\n\nJornada (JSON):\n${JSON.stringify(entrada)}\n\nRelatório atual (JSON):\n${JSON.stringify(paraIA(atual))}\n\nAJUSTE PEDIDO: ${ajustes}`
    : `${contexto}\n\nJornada (JSON):\n${JSON.stringify(entrada)}`;

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
  const g = await supa(`/rest/v1/relatorios_mentorado?id=eq.${id}`, { metodo: 'PATCH',
    corpo: { status: 'rascunho', erro: null, titulo: rel.titulo && ajustes ? rel.titulo : texto.titulo, conteudo: { versao: 1, dados, texto } } });
  if (!g.ok) return falhar('Não consegui salvar o relatório gerado.');
};
