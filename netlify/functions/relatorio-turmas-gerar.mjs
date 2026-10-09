// Relatório das turmas para a empresa cliente: junta os números de cada turma (calculados aqui, nunca pela IA) e pede ao
// Claude o texto para o cliente a partir das percepções que os mentores escreveram em cada módulo (o texto original é
// interno e não sai). Roda em segundo plano: a tela acompanha relatorios_turmas.status (gerando → rascunho | erro).
// Com "ajustes", a IA muda o texto atual só no que foi pedido. Só a administração usa.
import Anthropic from '@anthropic-ai/sdk';
import { supa, env, SUPABASE_URL } from '../lib/google.mjs';

export const config = { path: '/api/relatorio-turmas-gerar', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASSOU_MS = 2 * 3600 * 1000;   // aula conta como realizada duas horas depois do início (como na tela das turmas)

const texto = { type: 'string' };
const objeto = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const lista = (item) => ({ type: 'array', items: item });
const ESQUEMA = objeto({
  titulo: texto,
  apresentacao: texto,
  turmas: lista(objeto({
    turma_id: texto, resumo: texto, destaques: lista(texto), pontos_de_atencao: lista(texto),
    modulos: lista(objeto({ modulo_id: texto, como_foi: texto })),
  })),
  recomendacoes: lista(texto),
  encerramento: texto,
});

const INSTRUCOES = `Você escreve, em nome da Mentorei (consultoria de desenvolvimento de lideranças), o relatório das turmas para a empresa cliente: quem lê é o RH ou a diretoria que contratou.
A fonte são as percepções que os mentores da Mentorei escreveram depois de cada aula. Esse texto é INTERNO: você o transforma em um texto para o cliente; nada dele vai copiado.

O que escrever (devolva no formato pedido):
- titulo: curto, ex.: "Relatório das turmas · Programa de Liderança 2026".
- apresentacao: 1 ou 2 parágrafos de abertura: o que foi feito no período com a empresa, o que se buscou desenvolver e o tom geral da evolução das turmas.
- turmas: uma entrada para cada turma recebida (use o mesmo turma_id). resumo = 1 parágrafo sobre a caminhada da turma; destaques = 2 a 4 frases curtas sobre o que funcionou e o que a turma demonstrou; pontos_de_atencao = 0 a 3 frases, escritas como recomendação construtiva para a empresa ou para os próximos encontros (nunca como crítica); modulos = uma entrada para cada módulo realizado da turma (mesmo modulo_id) com como_foi = 2 a 4 frases sobre o tema trabalhado, como o grupo participou e o que levou para a prática.
- recomendacoes: 3 a 5 frases curtas, práticas, para a empresa sustentar o desenvolvimento das lideranças.
- encerramento: 1 parágrafo curto de agradecimento e continuidade, assinado implicitamente pela equipe Mentorei (sem nome de pessoa).

Regras:
- Use só o que os mentores registraram e os dados dos módulos. Não invente fatos, resultados, números, falas, depoimentos nem promessas (nada de promoção, aumento ou garantia de resultado). Os números (presença, quantidade de aulas) quem coloca é o sistema: não escreva números de presença nem percentuais.
- Fale do grupo, nunca de um participante: não cite nomes de participantes, não identifique ninguém por cargo único e omita situações pessoais ou delicadas de uma pessoa.
- Nada do que é interno da Mentorei vai para o cliente: comentários sobre contrato, preço, logística, dificuldades da equipe, opiniões sobre pessoas da empresa ou críticas ao RH ou à diretoria. Quando a percepção trouxer um problema real do grupo (pouca participação, atrasos, resistência), transforme em ponto de atenção construtivo e respeitoso.
- Módulo sem percepção registrada: escreva só sobre o tema trabalhado, sem dizer como foi.
- Português do Brasil, tom profissional, caloroso e direto, frases curtas, sem exclamações e sem jargão de coaching em inglês (nada de "accountability", "follow-up", "feedback loop", "mindset"). Os mentores da Mentorei podem ser citados pelo primeiro nome.
- Quando vier um AJUSTE, mude só o que foi pedido e devolva o relatório inteiro com o resto igual.`;

const passou = (m) => m.data_hora && Date.parse(m.data_hora) < Date.now() - PASSOU_MS;
const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

// Números e módulos de cada turma (calculados aqui; a IA não escreve números).
export function montarDados(empresa, turmas) {
  const saida = turmas.map((t) => {
    const mods = (t.modulos || []).slice().sort((a, b) => a.numero - b.numero);
    const feitos = mods.filter(passou);
    const presentes = feitos.map((m) => m.participantes_presentes).filter((x) => Number.isFinite(x));
    const mPresentes = media(presentes);
    const mentores = [...new Set(mods.flatMap((m) => (m.mentores || []).map((x) => x.mentor && x.mentor.nome).filter(Boolean)))];
    return {
      id: t.id, nome: t.nome, formato: t.formato || null, local: t.local || null, participantes_previstos: t.participantes_previstos || null,
      inicio: t.inicio || null, fim_previsto: t.fim_previsto || null, status: t.status, mentores,
      modulos: mods.map((m) => ({ id: m.id, numero: m.numero, titulo: m.titulo, data: m.data_hora || null, formato: m.formato, presentes: Number.isFinite(m.participantes_presentes) ? m.participantes_presentes : null, realizado: passou(m) })),
      numeros: { modulos: mods.length, realizados: feitos.length, media_presentes: mPresentes,
        presenca_pct: mPresentes != null && t.participantes_previstos ? Math.min(100, Math.round((mPresentes / t.participantes_previstos) * 100)) : null },
    };
  });
  const datas = saida.flatMap((t) => t.modulos.filter((m) => m.realizado && m.data).map((m) => m.data)).sort();
  const todasPres = saida.flatMap((t) => t.modulos.filter((m) => m.realizado && m.presentes != null).map((m) => m.presentes));
  const pcts = saida.map((t) => t.numeros.presenca_pct).filter((x) => x != null);
  return {
    empresa: { id: empresa.id, nome: empresa.nome }, gerado_em: new Date().toISOString(),
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
    turmas: saida,
    numeros: { turmas: saida.length, modulos: saida.reduce((a, t) => a + t.numeros.modulos, 0), realizados: saida.reduce((a, t) => a + t.numeros.realizados, 0),
      media_presentes: media(todasPres), presenca_pct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null },
  };
}

export default async (req) => {
  const chave = env('SUPABASE_SECRET_KEY');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.id || '');
  if (!UUID.test(id) || !chave) return;
  const falhar = (erro) => supa(`/rest/v1/relatorios_turmas?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });

  // quem pediu tem de ser da administração
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = token ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: chave, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  if (!u || !u.id) return falhar('Sessão expirada. Entre de novo e repita.');
  const perfil = await supa(`/rest/v1/perfis?id=eq.${u.id}&select=papel,ativo`);
  const meu = perfil.ok && perfil.dados && perfil.dados[0];
  if (!meu || meu.papel !== 'admin' || !meu.ativo) return falhar('Só a administração gera relatórios.');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');

  const rr = await supa(`/rest/v1/relatorios_turmas?id=eq.${id}&select=*,empresa:empresas(id,nome)`);
  const rel = rr.ok && rr.dados && rr.dados[0];
  if (!rel) return falhar('Relatório não encontrado.');
  const ids = (rel.turmas || []).filter((x) => UUID.test(x));
  if (!ids.length) return falhar('Escolha pelo menos uma turma.');
  const tq = await supa(`/rest/v1/turmas?id=in.(${ids.join(',')})&empresa_id=eq.${rel.empresa_id}&select=id,nome,perfil_turma,participantes_previstos,inicio,fim_previsto,status,formato,local,`
    + 'modulos(id,numero,titulo,tematica,data_hora,formato,participantes_presentes,percepcoes,mentores:modulo_mentores(mentor:perfis(nome)))');
  if (!tq.ok || !Array.isArray(tq.dados) || !tq.dados.length) return falhar('Não encontrei as turmas escolhidas.');
  const turmas = ids.map((x) => tq.dados.find((t) => t.id === x)).filter(Boolean);
  const dados = montarDados(rel.empresa || { id: rel.empresa_id, nome: '' }, turmas);
  if (!dados.numeros.realizados) return falhar('Nenhum módulo das turmas escolhidas aconteceu ainda: não há o que relatar.');

  // o que vai para a IA: só o necessário para escrever (nada de recomendações internas da aula nem observações da turma)
  const entrada = turmas.map((t) => ({
    turma_id: t.id, nome: t.nome, perfil_da_turma: t.perfil_turma || '', formato: t.formato || '', mentores: dados.turmas.find((x) => x.id === t.id).mentores.map((n) => n.split(' ')[0]),
    modulos_realizados: (t.modulos || []).filter(passou).sort((a, c) => a.numero - c.numero).map((m) => ({
      modulo_id: m.id, numero: m.numero, titulo: m.titulo, tema: m.tematica || '', data: dataCurta(m.data_hora),
      percepcoes_dos_mentores: String(m.percepcoes || '').slice(0, 6000) || '(sem percepção registrada)',
    })),
    proximos_modulos: (t.modulos || []).filter((m) => !passou(m)).sort((a, c) => a.numero - c.numero).map((m) => `${m.numero}. ${m.titulo}`),
  }));
  const contexto = `Empresa: ${dados.empresa.nome}\nData de hoje: ${dataCurta(new Date().toISOString())}${rel.observacoes ? `\nPedido da equipe da Mentorei para este relatório: ${String(rel.observacoes).slice(0, 3000)}` : ''}`;
  const atual = rel.conteudo && rel.conteudo.texto;
  const ajustes = String(b.ajustes || '').trim().slice(0, 4000);
  const pedido = ajustes && atual
    ? `${contexto}\n\nTurmas (JSON):\n${JSON.stringify(entrada)}\n\nRelatório atual (JSON):\n${JSON.stringify(paraIA(atual))}\n\nAJUSTE PEDIDO: ${ajustes}`
    : `${contexto}\n\nTurmas (JSON):\n${JSON.stringify(entrada)}`;

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
    if (r.stop_reason === 'max_tokens') return falhar('O relatório ficou grande demais para uma resposta. Escolha menos turmas e tente de novo.');
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    try { gerado = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu o relatório organizado. Tente de novo.'); }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError && e.status === 402) return falhar('Acabaram os créditos da conta do Claude. Coloque créditos no console da Anthropic.');
    if (e instanceof Anthropic.APIError) return falhar(`O Claude respondeu com erro (${e.status}). Tente de novo.`);
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }

  // guarda por turma e por módulo (a tela edita cada pedaço)
  const textoFinal = {
    titulo: gerado.titulo || `Relatório das turmas · ${dados.empresa.nome}`,
    apresentacao: gerado.apresentacao || '',
    turmas: Object.fromEntries(dados.turmas.map((t) => {
      const g = (gerado.turmas || []).find((x) => x.turma_id === t.id) || {};
      return [t.id, { resumo: g.resumo || '', destaques: g.destaques || [], atencao: g.pontos_de_atencao || [],
        modulos: Object.fromEntries(t.modulos.filter((m) => m.realizado).map((m) => [m.id, ((g.modulos || []).find((x) => x.modulo_id === m.id) || {}).como_foi || ''])) }];
    })),
    recomendacoes: gerado.recomendacoes || [],
    encerramento: gerado.encerramento || '',
  };
  const g = await supa(`/rest/v1/relatorios_turmas?id=eq.${id}`, { metodo: 'PATCH',
    corpo: { status: 'rascunho', erro: null, titulo: rel.titulo && ajustes ? rel.titulo : textoFinal.titulo, conteudo: { versao: 1, dados, texto: textoFinal } } });
  if (!g.ok) return falhar('Não consegui salvar o relatório gerado.');
};

// O texto guardado (por turma e módulo) de volta no formato da resposta, para os ajustes.
function paraIA(t) {
  return {
    titulo: t.titulo || '', apresentacao: t.apresentacao || '',
    turmas: Object.entries(t.turmas || {}).map(([turma_id, x]) => ({ turma_id, resumo: x.resumo || '', destaques: x.destaques || [], pontos_de_atencao: x.atencao || [],
      modulos: Object.entries(x.modulos || {}).map(([modulo_id, como_foi]) => ({ modulo_id, como_foi })) })),
    recomendacoes: t.recomendacoes || [], encerramento: t.encerramento || '',
  };
}
