// Relatório da jornada do mentorado (script 67): contas e montagem, sem banco e sem IA (testáveis no Node).
// Os NÚMEROS saem daqui (a IA nunca escreve números). O que vai para a IA também sai daqui: as anotações dos mentores e os
// resumos enviados ao mentorado, NUNCA as informações delicadas (nem são lidas do banco) nem as visões do gestor da ficha.

const PASSOU_MS = 2 * 3600 * 1000;   // sessão "já passou" duas horas depois do início (como nas outras telas)
const FUSO = 'America/Sao_Paulo';
export const NIVEIS = ['', 'Começando', 'Em construção', 'Praticando', 'Consistente', 'Referência'];   // notas de evolução (tela da sessão)

const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const limpo = (t) => String(t || '').trim();
export const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const pontosDe = (m) => (Array.isArray(m.pontos_desenvolver) ? m.pontos_desenvolver : []).map((x) => (typeof x === 'string' ? x : x && x.ponto)).map(limpo).filter(Boolean);
const FALTA = new Set(['falta_avisada', 'falta_sem_aviso']);

// Tarefas da sessão: a lista nova (script 33) ou a tarefa única antiga.
export function tarefasDaSessao(s, porSessao) {
  if (porSessao) return porSessao.get(s.id) || [];
  return limpo(s.tarefa) ? [{ texto: s.tarefa, prazo: s.tarefa_prazo || null, feita_em: s.tarefa_feita_em || null }] : [];
}

// m: mentorado (com programa e vínculos); sessoes: com mentor, interno {resumo_mentor, notas_evolucao}, avaliacao {nota};
// porSessao: Map sessao_id → tarefas (null = sem a tabela nova); ferramentas: Map sessao_id → nomes; escala10: notas já de 0 a 10.
export function montarDados({ m, sessoes, porSessao = null, ferramentas = new Map(), escala10 = true, agora = Date.now() }) {
  const prog = m.programa || {};
  const sess = (sessoes || []).slice().sort((a, b) => a.numero - b.numero);
  const passou = (s) => s.data_hora && Date.parse(s.data_hora) < agora - PASSOU_MS;
  const lista = sess.map((s) => {
    const ts = tarefasDaSessao(s, porSessao);
    const nota = s.avaliacao && Number.isFinite(s.avaliacao.nota) ? (escala10 ? s.avaliacao.nota : s.avaliacao.nota * 2) : null;
    return {
      id: s.id, numero: s.numero, extra: !!s.extra, data: s.data_hora || null,
      mentor: s.mentor ? s.mentor.nome : null, mentor_id: s.mentor ? s.mentor.id : null,
      tema: limpo(s.tema) || null, situacao: s.situacao, realizada: s.situacao === 'realizada',
      duracao_min: Number.isFinite(s.duracao_min) && s.duracao_min > 0 ? s.duracao_min : null,
      nota,
      tarefas: s.concluida_em ? { total: ts.length, feitas: ts.filter((t) => t.feita_em).length } : { total: 0, feitas: 0 },
      ferramentas: ferramentas.get(s.id) || [],
    };
  });
  const feitas = lista.filter((s) => s.realizada);
  const faltas = lista.filter((s) => FALTA.has(s.situacao)).length;
  const previstas = lista.filter((s) => s.situacao !== 'cancelada').length;
  const tarefas = lista.reduce((a, s) => a + s.tarefas.total, 0);
  const tarefasFeitas = lista.reduce((a, s) => a + s.tarefas.feitas, 0);
  const notas = feitas.map((s) => s.nota).filter((x) => x != null);
  const minutos = feitas.reduce((a, s) => a + (s.duracao_min || prog.duracao_min || 50), 0);
  const datas = feitas.map((s) => s.data).filter(Boolean).sort();

  // mentores: quem atendeu as sessões realizadas (com quantas) e quem acompanha hoje
  const mentores = new Map();
  for (const s of sess.filter((x) => x.situacao === 'realizada' && x.mentor)) {
    const x = mentores.get(s.mentor.id) || { nome: s.mentor.nome, foto_url: s.mentor.foto_url || null, sessoes: 0 };
    x.sessoes += 1; mentores.set(s.mentor.id, x);
  }
  for (const v of (m.vinculos || []).slice().sort((a, b) => a.ordem - b.ordem)) {
    if (v.mentor && !mentores.has(v.mentor.id)) mentores.set(v.mentor.id, { nome: v.mentor.nome, foto_url: v.mentor.foto_url || null, sessoes: 0 });
  }

  // evolução nos pontos a desenvolver (notas 1 a 5 dos mentores, sessão a sessão)
  const evolucao = pontosDe(m).map((pt) => {
    const serie = sess.filter((s) => s.situacao === 'realizada' || s.concluida_em)
      .map((s) => ({ numero: s.numero, nota: s.interno && s.interno.notas_evolucao ? Number(s.interno.notas_evolucao[pt]) : NaN }))
      .filter((x) => Number.isInteger(x.nota) && x.nota >= 1 && x.nota <= 5);
    return serie.length ? { ponto: pt, serie, inicio: serie[0].nota, atual: serie[serie.length - 1].nota } : null;
  }).filter(Boolean);

  return {
    gerado_em: new Date(agora).toISOString(),
    mentorado: { id: m.id, nome: m.nome, primeiro_nome: primeiro(m.nome), cargo: limpo(m.cargo) || null, status: m.status || null },
    programa: { nome: prog.nome || null, empresa: prog.empresa ? prog.empresa.nome : null },
    objetivo: limpo(m.objetivo_principal) || null,
    pontos: pontosDe(m),
    mentores: [...mentores.values()],
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
    sessoes: lista,
    evolucao,
    numeros: {
      previstas, realizadas: feitas.length, faltas, presenca_pct: pct(feitas.length, feitas.length + faltas),
      horas: Math.round((minutos / 60) * 10) / 10, tarefas, tarefas_feitas: tarefasFeitas, tarefas_pct: pct(tarefasFeitas, tarefas),
      nota_media: media(notas), notas: notas.length,
    },
    // para a revisão da equipe (não aparece no relatório): sessões que já passaram e não foram marcadas como realizadas
    avisos: { sem_registro: lista.filter((s) => ['agendada', 'remarcada'].includes(s.situacao) && passou(sess.find((x) => x.id === s.id))).map((s) => s.numero) },
  };
}

// O que vai para a IA: só o necessário para escrever. Nada de informações delicadas, nada das visões do gestor.
export function entradaParaIA({ m, sessoes, porSessao = null, ferramentas = new Map(), dados }) {
  const prog = m.programa || {};
  const sess = (sessoes || []).filter((s) => s.situacao === 'realizada').sort((a, b) => a.numero - b.numero);
  return {
    mentorado: { primeiro_nome: primeiro(m.nome), cargo: limpo(m.cargo), empresa: prog.empresa ? prog.empresa.nome : '', programa: prog.nome || '' },
    objetivo_da_mentoria: limpo(m.objetivo_principal) || '(não registrado)',
    pontos_a_desenvolver: pontosDe(m),
    sessoes_realizadas: sess.map((s) => ({
      sessao_id: s.id, numero: s.numero, data: s.data_hora ? dataCurta(s.data_hora) : 'sem data',
      mentor: s.mentor ? primeiro(s.mentor.nome) : '', tema: limpo(s.tema),
      roteiro_planejado: limpo(s.roteiro).slice(0, 1500),
      anotacoes_do_mentor: limpo(s.interno && s.interno.resumo_mentor).slice(0, 6000) || '(sem anotações)',
      resumo_enviado_ao_mentorado: s.concluida_em ? limpo(s.resumo_mentorado).slice(0, 3000) : '',
      tarefas_combinadas: tarefasDaSessao(s, porSessao).map((t) => limpo(t.texto)).filter(Boolean),
      ferramentas_usadas: ferramentas.get(s.id) || [],
    })),
    sessoes_com_falta: dados.numeros.faltas,
    proximas_sessoes: dados.sessoes.filter((s) => !s.realizada && !FALTA.has(s.situacao) && s.situacao !== 'cancelada' && (!s.data || Date.parse(s.data) > Date.parse(dados.gerado_em) - PASSOU_MS))
      .map((s) => `Sessão ${s.numero}${s.tema ? `: ${s.tema}` : ''}`),
  };
}

const texto = { type: 'string' };
const objeto = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const lista = (item) => ({ type: 'array', items: item });
export const ESQUEMA = objeto({
  titulo: texto,
  abertura: texto,
  sessoes: lista(objeto({ sessao_id: texto, temas: lista(texto), resumo: texto })),
  pontos_altos: lista(texto),
  melhorias: lista(texto),
  desafios: lista(texto),
  encerramento: texto,
});

export const INSTRUCOES = `Você escreve, em nome da Mentorei (consultoria de desenvolvimento de lideranças), o relatório da jornada de mentoria individual de uma pessoa. Quem lê é o próprio mentorado (no fim do processo ele recebe este relatório) e a equipe da Mentorei. Escreva direto para o mentorado, usando "você".
As fontes são as anotações que os mentores fizeram em cada sessão e os resumos que o mentorado já recebeu. As anotações são INTERNAS: você as transforma em texto para o mentorado; nada delas vai copiado.

O que escrever (devolva no formato pedido):
- titulo: curto, ex.: "Sua jornada de mentoria · Programa de Liderança 2026".
- abertura: 1 parágrafo (3 a 5 frases) que apresenta a jornada: o objetivo combinado, os grandes assuntos que atravessaram as sessões e o tom geral da caminhada.
- sessoes: uma entrada para cada sessão realizada recebida (use o mesmo sessao_id). temas = 1 a 4 temas curtos (2 a 5 palavras cada, sem ponto final) do que foi conversado de fato; resumo = 2 a 4 frases: o que foi trabalhado, a principal percepção ou aprendizado e o combinado para a prática, quando houver.
- pontos_altos: 2 a 4 frases curtas com os momentos mais fortes das conversas até agora: descobertas, viradas, conquistas, falas marcantes (sem aspas longas).
- melhorias: 0 a 4 frases curtas SÓ com o que o próprio mentorado reconheceu que melhorou, ou resultados concretos que ele trouxe para as sessões (ex.: "Você contou que já consegue..."). Se as anotações não registram nada disso, devolva a lista vazia. Nunca deduza uma melhoria que ele não reconheceu.
- desafios: 1 a 4 frases curtas com as situações que ele apresenta como os grandes desafios que ainda existem, escritas como próximo passo, de forma respeitosa e construtiva.
- encerramento: 2 ou 3 frases de incentivo para a continuidade, assinadas implicitamente pela equipe Mentorei (sem nome de pessoa).

Para a síntese (pontos_altos, melhorias, desafios), olhe o processo inteiro: ligue os assuntos que voltaram em várias sessões, mostre de onde a pessoa partiu e onde está, e seja específico com as situações que ela trouxe. Frases curtas, uma ideia por frase.

Regras:
- Use só o que está registrado. Não invente fatos, falas, resultados, nomes, números nem promessas (nada de promoção, aumento ou garantia de resultado). Os números (sessões, presença, tarefas, notas) quem coloca é o sistema: não escreva números nem percentuais.
- As anotações são do mentor: não copie julgamentos, hipóteses, diagnósticos ou críticas sobre a pessoa; traduza em aprendizado e próximo passo.
- Não cite o nome de outras pessoas da empresa (gestor, colegas, equipe): fale de forma geral ("sua equipe", "uma pessoa do time"). Nunca fale de alguém de forma negativa.
- Deixe de fora assuntos pessoais ou delicados (saúde, família, conflitos pessoais, confidências), mesmo que apareçam nas anotações.
- Sessão sem anotações nem resumo: escreva só sobre o tema, em uma frase, sem dizer como foi.
- Os mentores da Mentorei podem ser citados pelo primeiro nome.
- Português do Brasil, tom acolhedor, claro e profissional, sem bajulação, sem exclamações, sem markdown e sem jargão de coaching em inglês (nada de "accountability", "follow-up", "feedback loop", "mindset").
- Quando vier um AJUSTE, mude só o que foi pedido e devolva o relatório inteiro com o resto igual.`;

// Resposta da IA → texto guardado (por sessão, para a tela editar cada pedaço). Só as sessões realizadas entram.
export function textoFinal(gerado, dados) {
  const g = gerado || {};
  const linhas = (x) => (Array.isArray(x) ? x.map(limpo).filter(Boolean) : []);
  return {
    titulo: limpo(g.titulo) || `Sua jornada de mentoria${dados.programa.nome ? ` · ${dados.programa.nome}` : ''}`,
    abertura: limpo(g.abertura),
    sessoes: Object.fromEntries(dados.sessoes.filter((s) => s.realizada).map((s) => {
      const x = (g.sessoes || []).find((y) => y && y.sessao_id === s.id) || {};
      return [s.id, { temas: linhas(x.temas).slice(0, 4), resumo: limpo(x.resumo) }];
    })),
    pontos_altos: linhas(g.pontos_altos),
    melhorias: linhas(g.melhorias),
    desafios: linhas(g.desafios),
    encerramento: limpo(g.encerramento),
  };
}

// O texto guardado de volta no formato da resposta, para os ajustes.
export function paraIA(t) {
  return {
    titulo: t.titulo || '', abertura: t.abertura || '',
    sessoes: Object.entries(t.sessoes || {}).map(([sessao_id, x]) => ({ sessao_id, temas: x.temas || [], resumo: x.resumo || '' })),
    pontos_altos: t.pontos_altos || [], melhorias: t.melhorias || [], desafios: t.desafios || [], encerramento: t.encerramento || '',
  };
}
