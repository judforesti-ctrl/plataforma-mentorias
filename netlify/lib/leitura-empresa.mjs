// Relatório da mentoria para a empresa (script 68): a leitura macro de um ou mais programas de mentoria individual, para a
// diretoria e o RH do cliente. Contas e montagem sem banco e sem IA (testáveis no Node).
// Os NÚMEROS saem daqui: os do programa (sessões, horas, tarefas, notas) e os de cada dificuldade, tema e medo, que a plataforma
// conta pelas listas de CÓDIGOS que a IA devolve (L3 = um líder; L3.S2 = a sessão 2 dele). A IA nunca escreve contagens.
// Para a IA vão só códigos, cargos e os registros das sessões REALIZADAS, com os nomes dos mentorados trocados por [líder];
// as informações delicadas nem são lidas do banco, nem as visões do gestor da ficha.
import { montarDados, tarefasDaSessao, dataCurta } from './jornada.mjs';

const PASSOU_MS = 2 * 3600 * 1000;
const STATUS_DENTRO = new Set(['ativo', 'concluido', 'pausado']);
const MOTIVO_FORA = { desligado: 'desligado do programa', suspenso: 'programa suspenso' };
const limpo = (t) => String(t || '').trim();
const primeiro = (n) => limpo(n).split(/\s+/)[0] || '';
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const pontosDe = (m) => (Array.isArray(m.pontos_desenvolver) ? m.pontos_desenvolver : []).map((x) => (typeof x === 'string' ? x : x && x.ponto)).map(limpo).filter(Boolean);
const FALTA = new Set(['falta_avisada', 'falta_sem_aviso']);

// Quem entra: os mentorados ativos, concluídos ou pausados (sem o "mentorado modelo" de teste). Desligado e suspenso ficam de
// fora, com aviso para a administração.
export function escolherMentorados(mentorados) {
  const dentro = [], fora = [];
  for (const m of mentorados || []) {
    if (/\b(modelo|teste)\b/i.test(m.nome || '')) continue;
    if (STATUS_DENTRO.has(m.status || 'ativo')) dentro.push(m);
    else fora.push({ nome: m.nome, motivo: MOTIVO_FORA[m.status] || m.status });
  }
  dentro.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { dentro, fora };
}

// mentorados: só os que entram (escolherMentorados), cada um com programa {id, nome, duracao_min, empresa} e vínculos;
// sessoesPor: Map mentorado → sessões (com mentor, interno {resumo_mentor, notas_evolucao}, avaliacao {nota}).
export function montarDadosEmpresa({ empresa, programas = [], mentorados, sessoesPor, porSessao = null, escala10 = true, fora = [], agora = Date.now() }) {
  const lideres = mentorados.map((m, i) => ({ m, codigo: `L${i + 1}`, d: montarDados({ m, sessoes: sessoesPor.get(m.id) || [], porSessao, escala10, agora }) }));
  let previstas = 0, realizadas = 0, faltas = 0, minutos = 0, tarefas = 0, tarefasFeitas = 0;
  const notas = [], datas = [], sessoes = [], semRegistro = [];
  const mentores = new Map();
  for (const { m, codigo, d } of lideres) {
    previstas += d.numeros.previstas; realizadas += d.numeros.realizadas; faltas += d.numeros.faltas;
    tarefas += d.numeros.tarefas; tarefasFeitas += d.numeros.tarefas_feitas;
    for (const s of d.sessoes) {
      if (!s.realizada) continue;
      minutos += s.duracao_min || (m.programa && m.programa.duracao_min) || 50;
      if (s.nota != null) notas.push(s.nota);
      if (s.data) datas.push(s.data);
      sessoes.push({ codigo: `${codigo}.S${s.numero}`, lider: codigo, numero: s.numero, data: s.data, tema: s.tema });
      if (s.mentor_id) {
        const x = mentores.get(s.mentor_id) || { nome: s.mentor, foto_url: null, sessoes: 0 };
        x.sessoes += 1; mentores.set(s.mentor_id, x);
      }
    }
    for (const v of m.vinculos || []) {
      if (!v.mentor) continue;
      const x = mentores.get(v.mentor.id) || { nome: v.mentor.nome, foto_url: null, sessoes: 0 };
      x.foto_url = x.foto_url || v.mentor.foto_url || null;
      mentores.set(v.mentor.id, x);
    }
    if (d.avisos.sem_registro.length) semRegistro.push({ nome: m.nome, numeros: d.avisos.sem_registro });
  }
  datas.sort();
  const progs = programas.map((p) => {
    const ls = lideres.filter((l) => l.m.programa_id === p.id || (l.m.programa && l.m.programa.id === p.id));
    return { id: p.id, nome: p.nome, sessoes_por_lider: p.sessoes_por_mentorado || null, inicio: p.inicio || null, fim_previsto: p.fim_previsto || null,
      lideres: ls.length, previstas: ls.reduce((a, l) => a + l.d.numeros.previstas, 0), realizadas: ls.reduce((a, l) => a + l.d.numeros.realizadas, 0) };
  }).filter((p) => p.lideres);
  return {
    gerado_em: new Date(agora).toISOString(),
    empresa: { id: empresa.id, nome: empresa.nome },
    programas: progs,
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
    numeros: {
      lideres: lideres.length, com_sessao: lideres.filter((l) => l.d.numeros.realizadas).length,
      previstas, realizadas, realizadas_pct: pct(realizadas, previstas), faltas, presenca_pct: pct(realizadas, realizadas + faltas),
      horas: Math.round((minutos / 60) * 10) / 10, tarefas, tarefas_feitas: tarefasFeitas, tarefas_pct: pct(tarefasFeitas, tarefas),
      notas: notas.length, nota_media: media(notas), notas_10: notas.filter((x) => x === 10).length,
    },
    mentores: [...mentores.values()].sort((a, b) => b.sessoes - a.sessoes || a.nome.localeCompare(b.nome, 'pt-BR')),
    // para a administração conferir (o PDF nunca mostra): quem é cada código
    lideres: lideres.map(({ m, codigo, d }) => ({ codigo, id: m.id, nome: m.nome, cargo: limpo(m.cargo) || null, programa: m.programa ? m.programa.nome : null,
      realizadas: d.numeros.realizadas, previstas: d.numeros.previstas })),
    sessoes,
    avisos: { sem_registro: semRegistro, fora },
  };
}

// Troca o nome de cada mentorado (completo, os dois primeiros, primeiro + último e o primeiro nome) por [líder] nos textos que
// vão para a IA.
export function tiraNomes(nomes) {
  const partes = new Set();
  for (const n of nomes) {
    const c = limpo(n).replace(/\s+/g, ' ');
    if (!c) continue;
    const ps = c.split(' ');
    partes.add(c);
    if (ps.length > 2) {
      if (!/^(da|de|do|das|dos|e)$/i.test(ps[1])) partes.add(`${ps[0]} ${ps[1]}`);
      partes.add(`${ps[0]} ${ps[ps.length - 1]}`);
    }
    if (ps[0].length >= 3) partes.add(ps[0]);
  }
  const lista = [...partes].sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!lista.length) return (t) => limpo(t);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${lista.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return (t) => limpo(t).replace(re, '[líder]');
}

// O que vai para a IA. Os textos de cada sessão são cortados para caber todos (programas grandes recebem um pedaço menor de cada).
export function entradaParaIA({ mentorados, sessoesPor, porSessao = null, dados, orcamento = 450000 }) {
  const semNomes = tiraNomes(mentorados.map((m) => m.nome));
  const porCodigo = new Map(dados.lideres.map((l) => [l.id, l.codigo]));
  const total = Math.max(1, dados.sessoes.length);
  const fator = Math.min(1, orcamento / (total * 5500));
  const corteNotas = Math.max(500, Math.round(4000 * fator)), corteResumo = Math.max(200, Math.round(1500 * fator));
  const cortar = (t, n) => { const x = semNomes(t); return x.length > n ? `${x.slice(0, n)}…` : x; };
  return {
    empresa: dados.empresa.nome,
    programas: dados.programas.map((p) => ({ nome: p.nome, sessoes_por_lider: p.sessoes_por_lider, inicio: p.inicio, fim_previsto: p.fim_previsto })),
    momento_do_programa: {
      lideres: dados.numeros.lideres, sessoes_realizadas: dados.numeros.realizadas, sessoes_previstas: dados.numeros.previstas, faltas: dados.numeros.faltas,
      tarefas_combinadas: dados.numeros.tarefas, tarefas_feitas: dados.numeros.tarefas_feitas, nota_media_das_sessoes_0_a_10: dados.numeros.nota_media,
    },
    lideres: mentorados.map((m) => {
      const codigo = porCodigo.get(m.id);
      const sess = (sessoesPor.get(m.id) || []).slice().sort((a, b) => a.numero - b.numero);
      const agora = Date.parse(dados.gerado_em);
      return {
        codigo, cargo: limpo(m.cargo) || '(não informado)', programa: m.programa ? m.programa.nome : '',
        objetivo_da_mentoria: cortar(m.objetivo_principal, 1200) || '(não registrado)',
        pontos_a_desenvolver: pontosDe(m),
        sessoes_realizadas: sess.filter((s) => s.situacao === 'realizada').map((s) => ({
          codigo: `${codigo}.S${s.numero}`, numero: s.numero, data: s.data_hora ? dataCurta(s.data_hora) : 'sem data', tema: limpo(s.tema),
          anotacoes_do_mentor: cortar(s.interno && s.interno.resumo_mentor, corteNotas) || '(sem anotações)',
          resumo_enviado_ao_lider: s.concluida_em ? cortar(s.resumo_mentorado, corteResumo) : '',
          tarefas_combinadas: tarefasDaSessao(s, porSessao).map((t) => semNomes(t.texto)).filter(Boolean),
        })),
        proximas_sessoes: sess.filter((s) => !['realizada', 'cancelada'].includes(s.situacao) && !FALTA.has(s.situacao) && (!s.data_hora || Date.parse(s.data_hora) > agora - PASSOU_MS))
          .map((s) => `Sessão ${s.numero}${limpo(s.tema) ? `: ${limpo(s.tema)}` : ''}`),
      };
    }),
  };
}

const texto = { type: 'string' };
const objeto = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const lista = (item) => ({ type: 'array', items: item });
const codigos = lista(texto);
export const ESQUEMA = objeto({
  titulo: texto,
  abertura: texto,
  avancos: texto,
  respostas: objeto({ dificuldades: texto, pontos: texto, medos: texto, proximos: texto }),
  grupos: lista(objeto({ titulo: texto, lideres: codigos })),
  numeros_leitura: texto,
  dificuldades_leitura: texto,
  dificuldades: lista(objeto({ titulo: texto, descricao: texto, lideres: codigos })),
  temas_leitura: texto,
  temas: lista(objeto({ titulo: texto, sessoes: codigos })),
  evolucoes: lista(objeto({ titulo: texto, texto })),
  medos_leitura: texto,
  medos: lista(objeto({ titulo: texto, como_aparece: texto, lideres: codigos })),
  medos_conclusao: texto,
  proximos_abertura: texto,
  proximos_mentoria: lista(texto),
  proximos_diretoria: lista(texto),
  proximos_rh: lista(texto),
});

export const INSTRUCOES = `Você escreve, em nome da Mentorei (consultoria de desenvolvimento de lideranças), a leitura macro de um programa de mentoria individual para a DIRETORIA e o RH da empresa cliente. Você recebe os registros de todos os líderes em mentoria (anotações internas dos mentores, resumos enviados aos líderes, temas, tarefas, objetivo e pontos a desenvolver de cada um) e cruza tudo para responder às quatro perguntas da diretoria:
1. Quais são as maiores dificuldades relatadas pelo time?
2. Quais pontos de atenção foram mais trabalhados na mentoria?
3. Quais são os maiores medos relatados pelos líderes?
4. Quais são os próximos passos?

Cada líder vem com um CÓDIGO (L1, L2...) e cada sessão realizada também (L3.S2 = sessão 2 do líder L3). Os números do relatório quem conta é a plataforma, pelos códigos que você devolve. Por isso:
- Em dificuldades e medos, "lideres" = os códigos dos líderes em cujos registros aquilo aparece de forma clara (não force: só quem de fato relatou ou viveu aquilo).
- Em temas, "sessoes" = os códigos das sessões cujo tema PRINCIPAL é aquele. Cada sessão entra em um tema só. Sessões de abertura, diagnóstico ou contrato da mentoria não entram em tema nenhum; as outras, todas.
- Em grupos, divida os líderes por área ou função, pelos cargos (ex.: "Pós-vendas", "Áreas corporativas e novos negócios"), cada líder em um grupo só, de 0 a 4 grupos. Nunca um grupo com um líder só (junte em "Outras áreas"). Se os cargos não permitem agrupar, devolva a lista vazia.
- Use exatamente os códigos recebidos. Nunca escreva códigos nos textos.

O que escrever (devolva no formato pedido):
- titulo: curto, ex.: "Leitura macro do programa de mentoria · Trilha de Liderança 2026".
- abertura: 2 ou 3 frases que resumem o momento do grupo: o desafio central que atravessa os líderes e onde o programa está.
- respostas: uma frase curta para cada uma das quatro perguntas (dificuldades, pontos, medos, proximos), para o quadro "Em uma página".
- avancos: 1 ou 2 frases com as mudanças concretas que os registros já mostram no grupo (vazio se não houver registro de mudança).
- numeros_leitura: 1 ou 2 frases que leem o engajamento (presença, tarefas entre sessões, avaliação), sem números: o que vai bem e o que é o ponto fraco, e por quê, se os registros explicarem.
- dificuldades_leitura: 1 frase com o padrão principal por trás das dificuldades.
- dificuldades: de 4 a 9, da mais comum para a menos comum. titulo = a dificuldade em 3 a 7 palavras, como situação ("Centralizar o operacional e não delegar"); descricao = 1 ou 2 frases de como ela aparece no dia a dia, de forma geral.
- temas_leitura: 1 frase que liga os temas mais trabalhados às dificuldades.
- temas: de 4 a 10 temas, títulos de 2 a 6 palavras ("Delegação e autonomia da equipe").
- evolucoes: de 0 a 6 itens com o que já evoluiu nos pontos trabalhados, segundo os registros. titulo = o ponto (1 a 3 palavras); texto = 1 ou 2 frases concretas (o que os líderes já fazem diferente). Só o que está registrado; se nada, lista vazia.
- medos_leitura: 1 frase com o padrão principal dos medos.
- medos: de 3 a 8, do mais comum para o menos comum. titulo = o medo em 3 a 8 palavras; como_aparece = 1 frase de como ele aparece nas conversas.
- medos_conclusao: 1 frase final sobre os medos (ex.: quais dependem mais do ambiente que do líder e a diretoria pode reduzir).
- proximos_abertura: 1 ou 2 frases sobre o que vem a seguir e de quem depende.
- proximos_mentoria: 2 a 4 passos da mentoria (use as próximas sessões e o fim do programa).
- proximos_diretoria: 2 a 5 recomendações práticas para a diretoria, ligadas ao que os líderes relataram.
- proximos_rh: 2 a 5 recomendações práticas para o RH, ligadas ao que os líderes relataram.

Regras:
- SIGILO DA MENTORIA: nada pode identificar quem disse o quê. Não escreva nomes de pessoas (líderes, colegas, gestores, diretores, clientes, nem dos mentores), nem cargo, unidade, cidade, loja ou situação tão específica que deixe reconhecer alguém. Nada de citações literais de um líder. Fale sempre do grupo ("os líderes", "parte do grupo", "em algumas áreas").
- Deixe de fora assuntos pessoais ou delicados, mesmo que apareçam nos registros: saúde, família, vida pessoal, confidências, conflitos pessoais, salário de alguém, vontade de uma pessoa de sair da empresa.
- Não exponha críticas a pessoas específicas da empresa: fale de estrutura, processos, rituais e decisões.
- Use só o que está registrado. Não invente fatos, falas, resultados nem informações sobre a empresa. As recomendações devem nascer do que os líderes trouxeram.
- Não escreva contagens nem percentuais (quantos líderes, quantas sessões, quantas tarefas, notas): a plataforma coloca esses números. Outros números que estão nos registros (um prazo de 90 dias, o número de uma sessão do programa) podem aparecer.
- Português do Brasil, tom profissional, claro e direto, escrito para um diretor. Frases curtas, uma ideia por frase. Sem markdown, sem exclamações, sem jargão de coaching em inglês (nada de "accountability", "follow-up", "mindset"). Não use travessão nem hífen como pontuação.
- Quando vier um AJUSTE, mude só o que foi pedido e devolva o relatório inteiro com o resto igual (inclusive os códigos).`;

// Resposta da IA → texto guardado. Códigos conferidos (só os que existem, sem repetir; cada sessão em um tema só) e o número
// de cada item contado aqui (n). Item sem código válido sai. Ordem: do mais comum para o menos comum.
export function textoFinal(gerado, dados) {
  const g = gerado || {};
  const okL = new Set(dados.lideres.map((l) => l.codigo));
  const okS = new Set(dados.sessoes.map((s) => s.codigo));
  const cods = (l, ok) => [...new Set((Array.isArray(l) ? l : []).map((x) => limpo(x).toUpperCase()).filter((x) => ok.has(x)))];
  const linhas = (x) => (Array.isArray(x) ? x.map(limpo).filter(Boolean) : []);
  const ordenar = (l) => l.map((x, i) => [x, i]).sort((a, b) => b[0].n - a[0].n || a[1] - b[1]).map(([x]) => x);
  const itens = (l, campos, chave, ok) => ordenar((Array.isArray(l) ? l : []).map((x) => {
    const c = cods(x && x[chave], ok);
    return { ...Object.fromEntries(campos.map((k) => [k, limpo(x && x[k])])), [chave]: c, n: c.length };
  }).filter((x) => x.titulo && x.n));
  // temas: cada sessão em um tema só (o primeiro em que a IA pôs)
  const usadas = new Set();
  const temas = ordenar((Array.isArray(g.temas) ? g.temas : []).map((t) => {
    const c = cods(t && t.sessoes, okS).filter((x) => !usadas.has(x));
    c.forEach((x) => usadas.add(x));
    return { titulo: limpo(t && t.titulo), sessoes: c, n: c.length };
  }).filter((t) => t.titulo && t.n));
  // grupos por área: cada líder em um só; grupo de uma pessoa vai para "Outras áreas"
  const naArea = new Set();
  let grupos = (Array.isArray(g.grupos) ? g.grupos : []).map((x) => {
    const c = cods(x && x.lideres, okL).filter((y) => !naArea.has(y));
    c.forEach((y) => naArea.add(y));
    return { titulo: limpo(x && x.titulo), lideres: c, n: c.length };
  }).filter((x) => x.titulo && x.n);
  const sozinhos = grupos.filter((x) => x.n < 2);
  if (sozinhos.length) {
    grupos = grupos.filter((x) => x.n >= 2);
    const outras = grupos.find((x) => /^outras áreas$/i.test(x.titulo)) || (grupos.push({ titulo: 'Outras áreas', lideres: [], n: 0 }), grupos[grupos.length - 1]);
    sozinhos.forEach((x) => { outras.lideres.push(...x.lideres); });
    outras.n = outras.lideres.length;
  }
  const r = g.respostas || {};
  return {
    titulo: limpo(g.titulo) || `Leitura macro do programa de mentoria${dados.programas.length === 1 ? ` · ${dados.programas[0].nome}` : ''}`,
    abertura: limpo(g.abertura),
    avancos: limpo(g.avancos),
    respostas: { dificuldades: limpo(r.dificuldades), pontos: limpo(r.pontos), medos: limpo(r.medos), proximos: limpo(r.proximos) },
    grupos: ordenar(grupos),
    numeros_leitura: limpo(g.numeros_leitura),
    dificuldades_leitura: limpo(g.dificuldades_leitura),
    dificuldades: itens(g.dificuldades, ['titulo', 'descricao'], 'lideres', okL),
    temas_leitura: limpo(g.temas_leitura),
    temas,
    evolucoes: (Array.isArray(g.evolucoes) ? g.evolucoes : []).map((x) => ({ titulo: limpo(x && x.titulo), texto: limpo(x && x.texto) })).filter((x) => x.titulo || x.texto),
    medos_leitura: limpo(g.medos_leitura),
    medos: itens(g.medos, ['titulo', 'como_aparece'], 'lideres', okL),
    medos_conclusao: limpo(g.medos_conclusao),
    proximos_abertura: limpo(g.proximos_abertura),
    proximos_mentoria: linhas(g.proximos_mentoria),
    proximos_diretoria: linhas(g.proximos_diretoria),
    proximos_rh: linhas(g.proximos_rh),
  };
}

// O texto guardado de volta no formato da resposta, para os ajustes (sem os números contados aqui).
export function paraIA(t) {
  const sem = (l, campos) => (l || []).map((x) => Object.fromEntries(campos.map((k) => [k, x[k] || (k === 'lideres' || k === 'sessoes' ? [] : '')])));
  return {
    titulo: t.titulo || '', abertura: t.abertura || '', avancos: t.avancos || '',
    respostas: { dificuldades: '', pontos: '', medos: '', proximos: '', ...(t.respostas || {}) },
    grupos: sem(t.grupos, ['titulo', 'lideres']),
    numeros_leitura: t.numeros_leitura || '',
    dificuldades_leitura: t.dificuldades_leitura || '', dificuldades: sem(t.dificuldades, ['titulo', 'descricao', 'lideres']),
    temas_leitura: t.temas_leitura || '', temas: sem(t.temas, ['titulo', 'sessoes']),
    evolucoes: sem(t.evolucoes, ['titulo', 'texto']),
    medos_leitura: t.medos_leitura || '', medos: sem(t.medos, ['titulo', 'como_aparece', 'lideres']), medos_conclusao: t.medos_conclusao || '',
    proximos_abertura: t.proximos_abertura || '', proximos_mentoria: t.proximos_mentoria || [], proximos_diretoria: t.proximos_diretoria || [], proximos_rh: t.proximos_rh || [],
  };
}
