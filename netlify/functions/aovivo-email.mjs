// Mentorei Ao Vivo · e-mail com os materiais da aula para o aluno que não está na plataforma (pedido da Juliana, 15/11/2026).
// No celular, o aluno pede "Quero receber os materiais por e-mail" (aovivo_pedir_email). Quando a mentora encerra a aula, o painel
// chama esta função com a chave da aula; quem pede depois que a aula acabou chama com o próprio token. Vai: os PDFs da aula, o que
// ele fez em cada atividade (palavras, acertos, voto, nota, resposta do grupo), os pontos e os links das ferramentas usadas. Sem slides.
// Desde 16/11: a frase do check-out ("o que você leva desta aula"), as ideias do mural, as perguntas, a rodada relâmpago e as medalhas.
// Cada um recebe uma vez (email_enviado_em). O contato vai para Vendas › Pessoa física e, se marcou "Quero receber conteúdos da
// Mentorei", entra no funil "Alunos das aulas ao vivo" (que começa parado até a Juliana revisar e ligar).
import { supa, env, SUPABASE_URL } from '../lib/google.mjs';
import { enviarEmail, modeloEmail } from '../lib/email.mjs';

export const config = { path: '/api/aovivo-email', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FUNIL = 'Alunos das aulas ao vivo';
const PASTA_PDF = `${SUPABASE_URL}/storage/v1/object/public/aovivo-slides/`;
const lista = (r) => (r && r.ok && Array.isArray(r.dados) ? r.dados : []);
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const corta = (t, n) => { const s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const ordinal = (n) => `${n}º`;

// o que a pessoa fez em cada atividade, em uma linha
function linhaDaAtividade(a, resp, respostasGrupo) {
  const vals = resp.map((r) => r.valor);
  const p = corta(a.pergunta, 110);
  if (a.tipo === 'nuvem') return vals.length ? `Nuvem de palavras · ${p}: você mandou ${vals.map((v) => `"${corta(v, 40)}"`).join(', ')}.` : null;
  if (a.tipo === 'quiz') {
    if (!vals.length) return null;
    const certa = (a.opcoes || [])[a.correta];
    return resp[0].correta ? `Quiz · ${p}: você acertou (${corta(certa, 60)}).` : `Quiz · ${p}: a resposta certa era "${corta(certa, 60)}".`;
  }
  if (a.tipo === 'votacao') {
    if (!vals.length) return null;
    const op = (a.opcoes || [])[Number(vals[0])];
    return `Votação · ${p}: você votou em "${corta(op, 60)}".`;
  }
  if (a.tipo === 'escala') return vals.length ? `Escala · ${p}: sua nota foi ${vals[0]} de ${(a.config && a.config.max) || 10}.` : null;
  if (a.tipo === 'grupo') {
    const meu = vals.map((v) => v && v.grupo).filter(Boolean).pop();
    const r = meu ? respostasGrupo.get(`${a.id}:${meu}`) : null;
    return r ? `Exercício em grupo · ${p}: a resposta do Grupo ${meu} foi: ${corta(r, 300)}` : null;
  }
  if (a.tipo === 'mural') {
    const ideias = resp.filter((r) => r.valor && r.valor.texto);
    if (!ideias.length) return null;
    return `Mural de ideias · ${p}: você sugeriu ${ideias.map((r) => `"${corta(r.valor.texto, 100)}" (${votosDe.get(r.id) || 0} ${(votosDe.get(r.id) || 0) === 1 ? 'voto' : 'votos'})`).join(', ')}.`;
  }
  if (a.tipo === 'perguntas') {
    const ps = resp.filter((r) => r.valor && r.valor.texto);
    return ps.length ? `Mural de perguntas: você perguntou ${ps.map((r) => `"${corta(r.valor.texto, 120)}"`).join(', ')}.` : null;
  }
  if (a.tipo === 'relampago') {
    if (!resp.length) return null;
    const n = ((a.config || {}).perguntas || []).length, certos = resp.filter((r) => r.correta).length;
    return `${/^rodada rel[aâ]mpago$/i.test(p) ? 'Rodada relâmpago' : `Rodada relâmpago · ${p}`}: você acertou ${certos} de ${n} ${n === 1 ? 'pergunta' : 'perguntas'}.`;
  }
  return null;
}
let votosDe = new Map();   // ideia do mural → votos que ela recebeu

export default async (req) => {
  let b; try { b = JSON.parse(await req.text()); } catch (_) { return; }
  const sessao = String(b.sessao || '');
  if (!UUID.test(sessao) || !env('SUPABASE_SECRET_KEY')) return;

  // quem pede: a mentora (chave da aula) ou o próprio aluno (participante + token), e só com a aula encerrada
  let filtroAluno = '';
  if (b.chave) {
    if (!/^[0-9a-f]{64}$/i.test(String(b.chave))) return;
    const ck = await supa(`/rest/v1/aovivo_chaves?sessao_id=eq.${sessao}&chave=eq.${b.chave}&select=sessao_id`);
    if (!lista(ck).length) return;
  } else {
    if (!UUID.test(String(b.participante || '')) || !UUID.test(String(b.token || ''))) return;
    const pq = await supa(`/rest/v1/aovivo_participantes?id=eq.${b.participante}&token=eq.${b.token}&sessao_id=eq.${sessao}&select=id`);
    if (!lista(pq).length) return;
    filtroAluno = `&id=eq.${b.participante}`;
  }
  const sq = await supa(`/rest/v1/aovivo_sessoes?id=eq.${sessao}&select=titulo,fase,modulo_id`);
  const s = lista(sq)[0];
  if (!s || s.fase !== 'encerrada') return;

  // separa cada aluno antes de mandar (quem já está na lista não recebe de novo, nem se a função for chamada duas vezes)
  const agora = new Date().toISOString();
  const pegos = lista(await supa(`/rest/v1/aovivo_participantes?sessao_id=eq.${sessao}${filtroAluno}&email=not.is.null&email_enviado_em=is.null&turma_aluno_id=is.null`, {
    metodo: 'PATCH', corpo: { email_enviado_em: agora }, prefer: 'return=representation' }));
  if (!pegos.length) return;

  const [aq, rq, todos] = await Promise.all([
    supa(`/rest/v1/aovivo_atividades?sessao_id=eq.${sessao}&arquivada=eq.false&select=id,tipo,pergunta,opcoes,correta,config,ordem,criado_em&order=ordem,criado_em`),
    supa(`/rest/v1/aovivo_respostas?sessao_id=eq.${sessao}&select=atividade_id,participante_id,valor,correta,pontos,id&order=id`),
    supa(`/rest/v1/aovivo_participantes?sessao_id=eq.${sessao}&select=id,pontos`),
  ]);
  const atividades = lista(aq), respostas = lista(rq), participantes = lista(todos);

  // materiais (PDF) da aula, sem repetir
  const vistos = new Set(), materiais = [];
  atividades.forEach((a) => {
    const c = a.config || {};
    const ms = (c.materiais || []).slice();
    if (c.pdf) ms.unshift({ pdf: c.pdf, nome: c.nome_pdf || 'Instruções do exercício' });
    ms.forEach((m) => {
      // só PDF guardado no Ao Vivo (nunca um link qualquer em nome da Mentorei)
      if (!m || !m.pdf || vistos.has(m.pdf) || !String(m.pdf).startsWith(PASTA_PDF)) return;
      vistos.add(m.pdf);
      materiais.push({ texto: corta(m.nome || 'Material', 80), link: m.pdf, detalhe: m.grupo ? `(do Grupo ${m.grupo})` : '' });
    });
  });
  const ferramentasDaAula = atividades.filter((a) => a.tipo === 'ferramenta' && a.config && /^https:\/\/[^\s"<>]+$/i.test(String(a.config.url || '')));
  const ferramentas = ferramentasDaAula.map((a) => ({ texto: corta(a.pergunta, 80), link: a.config.url, detalhe: '(abra de novo quando quiser)' }));
  // a última resposta de cada grupo em cada exercício
  const respostasGrupo = new Map();
  respostas.forEach((r) => { if (r.valor && typeof r.valor === 'object' && r.valor.grupo) respostasGrupo.set(`${r.atividade_id}:${r.valor.grupo}`, r.valor.texto); });
  votosDe = new Map();
  respostas.forEach((r) => { if (r.valor && typeof r.valor === 'object' && r.valor.curte) { const k = Number(r.valor.curte); votosDe.set(k, (votosDe.get(k) || 0) + 1); } });
  const checkout = new Set(atividades.filter((a) => a.tipo === 'checkout').map((a) => a.id));

  let funilId = null;
  if (pegos.some((p) => p.quer_conteudos)) {
    const fq = await supa(`/rest/v1/funis?nome=eq.${encodeURIComponent(FUNIL)}&arquivado=eq.false&select=id&limit=1`);
    funilId = (lista(fq)[0] || {}).id || null;
  }

  for (const p of pegos) {
    const minhas = respostas.filter((r) => r.participante_id === p.id);
    const feitas = atividades.filter((a) => a.tipo !== 'slide' && a.tipo !== 'ferramenta')
      .map((a) => linhaDaAtividade(a, minhas.filter((r) => r.atividade_id === a.id), respostasGrupo)).filter(Boolean);
    // a frase do check-out abre o e-mail; as medalhas vêm depois dos pontos
    const leva = minhas.filter((r) => checkout.has(r.atividade_id) && typeof r.valor === 'string').map((r) => r.valor).pop();
    const mq = await supa('/rest/v1/rpc/aovivo_medalhas', { metodo: 'POST', corpo: { p_sessao: sessao, p_participante: p.id } });
    const medalhas = mq && mq.ok && Array.isArray(mq.dados) ? mq.dados : [];
    const pos = participantes.filter((x) => (x.pontos || 0) > (p.pontos || 0)).length + 1;
    const blocos = [
      { p: `Olá, ${primeiro(p.nome)}! Obrigada por participar da aula ao vivo. Como você pediu, aqui estão os materiais e o que você fez hoje.` },
    ];
    if (leva) blocos.push({ titulo: 'O que você leva desta aula' }, { p: `"${corta(leva, 200)}"` });
    if (materiais.length) blocos.push({ titulo: 'Materiais da aula' }, { links: materiais });
    if (feitas.length) blocos.push({ titulo: 'O que você fez na aula' }, { lista: feitas });
    if ((p.pontos || 0) > 0) blocos.push({ p: `Você fez ${Number(p.pontos).toLocaleString('pt-BR')} pontos e terminou em ${ordinal(pos)} lugar entre ${participantes.length} pessoas.` });
    if (medalhas.length) blocos.push({ titulo: 'Suas medalhas' }, { lista: medalhas.map((m) => `${m.icone} ${m.nome}: ${m.texto}`) });
    // ferramentas que a pessoa abriu e não terminou, ou guardou com "Fazer depois" (16/11/2026): vêm primeiro, com destaque
    const valorDe = (a) => minhas.filter((r) => r.atividade_id === a.id).map((r) => (typeof r.valor === 'string' ? r.valor : ''));
    const paraDepois = ferramentasDaAula.filter((a) => { const v = valorDe(a); return !v.includes('terminou') && (v.includes('depois') || v.includes('abriu')); });
    if (paraDepois.length) blocos.push({ titulo: 'Para fazer com calma' },
      { links: paraDepois.map((a) => ({ texto: corta(a.pergunta, 80), link: a.config.url, detalhe: valorDe(a).includes('depois') ? '(você guardou para fazer depois)' : '(você começou e não terminou)' })) });
    const outras = ferramentas.filter((f, i) => !paraDepois.includes(ferramentasDaAula[i]));
    if (outras.length) blocos.push({ titulo: paraDepois.length ? 'Outras ferramentas da aula' : 'Ferramentas que você usou' }, { links: outras });
    if (!materiais.length && !feitas.length && !ferramentas.length) blocos.push({ p: 'Desta vez a aula não teve materiais em PDF nem atividades respondidas por você. Na próxima, participe pelo celular: tudo o que você fizer chega por aqui.' });
    blocos.push({ nota: p.quer_conteudos
      ? 'Você pediu os materiais da aula no Dinamiquei, da Mentorei, e marcou que quer receber conteúdos da Mentorei. Em todo e-mail tem um link para sair da lista, quando quiser.'
      : 'Você recebeu este e-mail porque pediu os materiais da aula no Dinamiquei, da Mentorei. Não vamos mandar outros e-mails sem você pedir.' });
    const m = modeloEmail({ assunto: `Os materiais da aula: ${corta(s.titulo, 80)}`, titulo: corta(s.titulo, 120), blocos,
      rodape: 'Mentorei · educação corporativa e mentoria para líderes.' });
    const r = await enviarEmail({ para: [{ email: p.email, name: p.nome }], assunto: m.assunto, html: m.html, texto: m.texto });
    if (!r.enviado) {
      // não saiu: volta para a fila (a próxima chamada tenta de novo)
      await supa(`/rest/v1/aovivo_participantes?id=eq.${p.id}`, { metodo: 'PATCH', corpo: { email_enviado_em: null }, prefer: 'return=minimal' });
      console.error('aovivo-email', r.mensagem);
      continue;
    }
    // contato para Vendas › Pessoa física (origem: a aula) e, se quis, o funil das aulas
    const contato = { p_nome: corta(p.nome, 120), p_email: p.email, p_whatsapp: '', p_cargo: '', p_ferramenta: `Dinamiquei · ${corta(s.titulo, 90)}` };
    const rc = await supa('/rest/v1/rpc/registrar_pessoa_fisica', { metodo: 'POST', corpo: { ...contato, p_conteudos: !!p.quer_conteudos } });
    if (!rc.ok) await supa('/rest/v1/rpc/registrar_pessoa_fisica', { metodo: 'POST', corpo: contato });
    if (p.quer_conteudos && funilId) {
      const desc = lista(await supa(`/rest/v1/descadastros?email=eq.${encodeURIComponent(p.email)}&select=email`));
      if (!desc.length) {
        await supa('/rest/v1/funil_membros?on_conflict=funil_id,email', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
          corpo: { funil_id: funilId, email: p.email, nome: corta(p.nome, 120), origem: `Dinamiquei · ${corta(s.titulo, 90)}`, status: 'ativo' } });
      }
    }
  }
};
