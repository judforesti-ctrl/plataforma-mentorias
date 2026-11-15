// Mentorei Ao Vivo · a IA lê os slides da aula e sugere onde entram nuvem, quiz, votação, escala e exercício em grupo
// (pedido da Juliana, 15/11/2026). Quem chama é o editor do Ao Vivo (mentorei-aovivo.netlify.app/api/aovivo-sugerir, que a
// Netlify do Ao Vivo repassa para cá): manda o id do pedido (aovivo_pedir_sugestao), a sessão e a chave da aula e o texto de
// cada slide. Roda em segundo plano e grava o resultado em aovivo_sugestoes; a tela do Ao Vivo acompanha pelo aovivo_ver_sugestao.
// Quando a aula veio de um módulo da plataforma, a temática do módulo entra como contexto. Nada de dado de aluno vai para a IA.
import Anthropic from '@anthropic-ai/sdk';
import { motivoClaude } from '../lib/claude-erro.mjs';
import { supa, env } from '../lib/google.mjs';

export const config = { path: '/api/aovivo-sugerir', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ['nuvem', 'quiz', 'votacao', 'escala', 'grupo'];

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'sugestoes'],
  properties: {
    resumo: { type: 'string', description: 'Uma ou duas frases sobre como as interações ajudam esta aula.' },
    sugestoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['depois_do_slide', 'tipo', 'motivo', 'pergunta', 'opcoes', 'correta', 'tempo_segundos',
          'rotulo_min', 'rotulo_max', 'passos', 'entrega', 'pergunta_resposta', 'slide_instrucao'],
        properties: {
          depois_do_slide: { type: 'integer', description: 'Número do slide depois do qual a atividade entra (0 = antes do primeiro slide).' },
          tipo: { type: 'string', enum: TIPOS },
          motivo: { type: 'string', description: 'Por que aqui, em uma frase curta para o mentor.' },
          pergunta: { type: 'string', description: 'Pergunta da atividade. No exercício em grupo, o título do exercício.' },
          opcoes: { type: 'array', items: { type: 'string' }, description: 'Quiz: 2 a 4 alternativas. Votação: 2 a 6 opções. Nos outros tipos, lista vazia.' },
          correta: { type: 'integer', description: 'Quiz: posição da alternativa certa (começa em 0). Nos outros tipos, -1.' },
          tempo_segundos: { type: 'integer' },
          rotulo_min: { type: 'string', description: 'Escala: o que significa o 0, com até 35 caracteres. Nos outros tipos, vazio.' },
          rotulo_max: { type: 'string', description: 'Escala: o que significa o 10, com até 35 caracteres. Nos outros tipos, vazio.' },
          passos: { type: 'array', items: { type: 'string' }, description: 'Exercício em grupo: 3 a 6 passos curtos, na ordem. Nos outros tipos, lista vazia.' },
          entrega: { type: 'string', description: 'Exercício em grupo: o que cada grupo leva de volta para a sala. Nos outros tipos, vazio.' },
          pergunta_resposta: { type: 'string', description: 'Exercício em grupo: o que um do grupo escreve no celular para mandar a resposta do grupo. Nos outros tipos, vazio.' },
          slide_instrucao: { type: 'integer', description: 'Exercício em grupo: número do slide que já traz as instruções desse exercício, ou 0 se não houver.' },
        },
      },
    },
  },
};

const INSTRUCOES = `Você é designer instrucional da Mentorei, empresa de treinamentos de liderança e comunicação para cooperativas e empresas no Brasil.
Você recebe o texto de cada slide de uma aula (e as anotações do apresentador) e sugere os momentos de interação que a turma vai fazer pelo celular no Mentorei Ao Vivo. O mentor vai ler a lista e marcar o que aceita.

Tipos que você pode sugerir:
- nuvem: nuvem de palavras. Cada aluno manda até 3 palavras ou expressões curtas (até 3 palavras). Ótima para abrir um tema ou colher percepções.
- quiz: pergunta com 2 a 4 alternativas e só uma certa, sobre um conceito que acabou de ser explicado. Nada de pegadinha.
- votacao: a turma escolhe uma opção entre 2 e 6 (prioridades, preferências, desafios mais comuns).
- escala: nota de 0 a 10 com o significado do 0 e do 10. Boa para autoavaliação e para medir antes e depois.
- grupo: exercício em grupo (casos, simulações, planos, discussões). O celular mostra as instruções, o cronômetro e um campo para o grupo mandar a resposta. As instruções precisam ser tão claras que ninguém precise voltar à sala principal para perguntar o que fazer: passo a passo curto (3 a 6 passos), o tempo e o que cada grupo leva de volta.

Regras:
1. Use as quatro funções (nuvem, quiz, votação e escala) pelo menos uma vez cada numa aula de 3 horas. Para 3 horas, sugira de 7 a 11 interações no total; para aulas mais curtas, menos, na mesma proporção.
2. Inclua 1 ou 2 exercícios em grupo quando o conteúdo pede prática (aplicar um método, analisar um caso, montar um plano). Se algum slide já traz as instruções de um exercício em grupo, use o texto desse slide e informe o número dele em slide_instrucao; se não houver, escreva as instruções do zero e deixe slide_instrucao = 0.
3. Nunca peça para a turma escrever algo longo no chat: as interações substituem isso.
4. Espalhe as interações pela aula: um aquecimento no começo (nuvem ou escala), quiz logo depois de um conceito importante, votação para escolher ou priorizar, escala para a pessoa se avaliar, exercício em grupo depois de explicar um método, e algo para fechar no fim.
5. Não repita uma atividade que já está no roteiro (a lista vem junto) e não coloque duas atividades seguidas sem slide entre elas, a não ser no exercício em grupo seguido de votação ou escala.
6. Linguagem simples, português do Brasil, frases curtas e tom acolhedor. Nada de jargão em inglês de coaching. Não use travessão nem hífen como pontuação.
7. Pergunta com até 120 caracteres; alternativas e opções com até 60; o significado do 0 e do 10 da escala com até 35 (curto, como "Nada preparado" e "Totalmente preparado").
8. Tempo: quiz de 20 a 45 segundos; nuvem, votação e escala de 60 a 90 segundos; exercício em grupo de 5 a 20 minutos (informe em segundos).
9. depois_do_slide vai de 0 (antes do primeiro slide) até o número do último slide.
10. Baseie tudo no conteúdo dos slides: o quiz testa o que foi ensinado, a nuvem e a votação conversam com o tema do slide.`;

// corta no fim de uma palavra (nunca no meio dela) quando passa do tamanho
const limpo = (t, n) => {
  const s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const c = s.slice(0, n + 1);
  const i = c.lastIndexOf(' ');
  return (i > n * 0.5 ? c.slice(0, i) : s.slice(0, n)).replace(/[\s,;:.]+$/, '');
};

export default async (req) => {
  const chaveClaude = env('ANTHROPIC_API_KEY');
  let b; try { b = JSON.parse(await req.text()); } catch (_) { return; }
  const id = String(b.id || ''), sessao = String(b.sessao || ''), chave = String(b.chave || '');
  if (!UUID.test(id) || !UUID.test(sessao) || !/^[0-9a-f]{64}$/i.test(chave) || !env('SUPABASE_SECRET_KEY')) return;

  // a chave da aula prova que quem pede é quem monta a aula
  const [ck, gq] = await Promise.all([
    supa(`/rest/v1/aovivo_chaves?sessao_id=eq.${sessao}&chave=eq.${chave}&select=sessao_id`),
    supa(`/rest/v1/aovivo_sugestoes?id=eq.${id}&sessao_id=eq.${sessao}&select=status`),
  ]);
  if (!ck.ok || !ck.dados || !ck.dados.length || !gq.ok || !gq.dados || !gq.dados.length || gq.dados[0].status !== 'gerando') return;
  const falhar = (erro) => supa(`/rest/v1/aovivo_sugestoes?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify da plataforma.');

  const slides = (Array.isArray(b.slides) ? b.slides : []).slice(0, 150).map((s, i) => ({
    n: i + 1, titulo: limpo(s.titulo, 200), texto: limpo(s.texto, 1500), notas: limpo(s.notas, 1500),
  }));
  if (!slides.length) return falhar('A aula ainda não tem slides para a IA ler. Envie o PDF ou o PowerPoint primeiro.');
  if (!slides.some((s) => s.texto || s.notas || s.titulo)) return falhar('Não achei texto nos slides (eles parecem ser só imagens). Envie também o arquivo .pptx para a IA ler o texto.');
  const roteiro = (Array.isArray(b.roteiro) ? b.roteiro : []).slice(0, 80).map((x) => ({
    depois_do_slide: Number(x.depois_do_slide) || 0, tipo: limpo(x.tipo, 20), pergunta: limpo(x.pergunta, 200),
  }));

  // contexto do módulo da plataforma (quando a aula foi aberta por ele)
  let contexto = `Título da aula: ${limpo(b.titulo, 120) || 'sem título'}`;
  const sq = await supa(`/rest/v1/aovivo_sessoes?id=eq.${sessao}&select=modulo_id,titulo`);
  const moduloId = sq.ok && sq.dados && sq.dados[0] && sq.dados[0].modulo_id;
  let duracao = Number(b.duracao_min) || 0;
  if (moduloId) {
    const mq = await supa(`/rest/v1/modulos?id=eq.${moduloId}&select=numero,titulo,tematica,duracao_min,formato,turma:turmas(nome,perfil_turma,observacoes)`);
    const m = mq.ok && mq.dados && mq.dados[0];
    if (m) {
      duracao = duracao || Number(m.duracao_min) || 0;
      contexto += `\nMódulo ${m.numero}: ${limpo(m.titulo, 200)}`
        + `${m.tematica ? `\nO que deve ser abordado (proposta): ${String(m.tematica).slice(0, 3000)}` : ''}`
        + `${m.turma && m.turma.perfil_turma ? `\nPerfil da turma: ${String(m.turma.perfil_turma).slice(0, 1500)}` : ''}`
        + `${m.formato ? `\nFormato: ${m.formato === 'presencial' ? 'presencial (os grupos se juntam na sala)' : 'on-line (os grupos vão para salas separadas)'}` : ''}`;
    }
  }
  contexto += `\nDuração: ${duracao ? `${duracao} minutos` : 'cerca de 3 horas'}.`;
  const pedidoMentor = limpo(b.pedido, 1500);
  if (pedidoMentor) contexto += `\nPedido do mentor: ${pedidoMentor}`;

  const pedido = `${contexto}\n\nSlides (JSON):\n${JSON.stringify(slides)}\n\nAtividades que já estão no roteiro (JSON):\n${JSON.stringify(roteiro)}`;

  let gerado;
  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: pedido }],
    }).finalMessage();
    if (r.stop_reason === 'refusal') return falhar('A IA não aceitou ler esta aula. Tente de novo.');
    const json = r.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
    try { gerado = JSON.parse(json); } catch (_) { return falhar('A IA não devolveu as sugestões organizadas. Tente de novo.'); }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(motivoClaude(e));
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }

  // confere cada sugestão (a IA às vezes erra o formato): o que não dá para usar sai
  const n = slides.length;
  const sugestoes = (gerado.sugestoes || []).map((s) => {
    const tipo = TIPOS.includes(s.tipo) ? s.tipo : null;
    if (!tipo) return null;
    const o = {
      depois_do_slide: Math.max(0, Math.min(n, Number(s.depois_do_slide) || 0)), tipo,
      motivo: limpo(s.motivo, 240), pergunta: limpo(s.pergunta, 200), opcoes: [], correta: null, tempo: 0, config: {},
    };
    if (!o.pergunta) return null;
    const ops = (s.opcoes || []).map((x) => limpo(x, 80)).filter(Boolean);
    if (tipo === 'quiz') {
      if (ops.length < 2) return null;
      o.opcoes = ops.slice(0, 4);
      o.correta = Number.isInteger(s.correta) && s.correta >= 0 && s.correta < o.opcoes.length ? s.correta : 0;
      o.tempo = Math.max(10, Math.min(120, Number(s.tempo_segundos) || 30));
    } else if (tipo === 'votacao') {
      if (ops.length < 2) return null;
      o.opcoes = ops.slice(0, 8);
      o.tempo = Math.max(0, Math.min(120, Number(s.tempo_segundos) || 60));
    } else if (tipo === 'nuvem') {
      o.config = { max_respostas: 3 };
      o.tempo = Math.max(0, Math.min(120, Number(s.tempo_segundos) || 60));
    } else if (tipo === 'escala') {
      o.config = { max: 10, rotulo_min: limpo(s.rotulo_min, 40), rotulo_max: limpo(s.rotulo_max, 40) };
      o.tempo = Math.max(0, Math.min(90, Number(s.tempo_segundos) || 60));
    } else {
      const passos = (s.passos || []).map((x) => limpo(x, 300)).filter(Boolean).slice(0, 8);
      if (!passos.length) return null;
      o.tempo = Math.max(180, Math.min(3600, Math.round((Number(s.tempo_segundos) || 600) / 60) * 60));
      o.config = {
        passos, entrega: limpo(s.entrega, 300),
        grupos: { modo: 'escolher', quantos: 6, tamanho: 4 },
        resposta: { ligada: true, pergunta: limpo(s.pergunta_resposta, 160) },
        pdf: '', nome_pdf: '',
      };
      const si = Number(s.slide_instrucao) || 0;
      o.slide_instrucao = si >= 1 && si <= n ? si : 0;
    }
    return o;
  }).filter(Boolean).sort((x, y) => x.depois_do_slide - y.depois_do_slide).slice(0, 20);

  if (!sugestoes.length) return falhar('A IA não achou sugestões para estes slides. Tente de novo ou escreva um pedido para ela.');
  await supa(`/rest/v1/aovivo_sugestoes?id=eq.${id}`, { metodo: 'PATCH',
    corpo: { status: 'pronto', erro: null, resultado: { resumo: limpo(gerado.resumo, 400), sugestoes } } });
};
