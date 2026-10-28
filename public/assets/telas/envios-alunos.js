// "Envios dos alunos" (script 49): tarefas feitas e documentos que os alunos da trilha mandam pela área deles.
// No módulo: os envios daquele módulo. Na turma: todos (com o módulo de cada um). Mentores da turma e administração veem;
// o primeiro mentor que abre um arquivo marca como visto, e o mentor pode responder (o aluno lê na área dele).
import { sb, esc } from '../base.js';
import { carregarEntregas, htmlEntregas, ligarEntregas } from '../entregas.js';

export const cartaoEnviosAlunos = () => '<div class="cartao" id="envios-alunos" hidden></div>';

// alvo: { modulo } ou { turma } (turma com .modulos para mostrar o módulo de cada envio)
export async function ligarEnviosAlunos(ctx, el, { modulo = null, turma = null, souMentor = false }) {
  const box = el.querySelector('#envios-alunos');
  if (!box) return;
  const turmaId = modulo ? modulo.turma.id : turma.id;
  const { data: alunos, error } = await sb.from('turma_alunos').select('id, nome').eq('turma_id', turmaId);
  if (error || !(alunos || []).length) return;   // sem alunos (ou sem o script 44): o cartão fica escondido
  const nomes = new Map(alunos.map((a) => [a.id, a.nome]));
  const { existe, lista } = await carregarEntregas((q) => (modulo ? q.eq('modulo_id', modulo.id) : q.in('turma_aluno_id', [...nomes.keys()])));
  if (!existe || (lista.length === 0 && !modulo)) return;   // antes do script 49 (sem a coluna), ou turma sem nada enviado
  const titulos = new Map(((turma && turma.modulos) || []).map((m) => [m.id, `Módulo ${m.numero} · ${m.titulo}`]));
  const doAluno = lista.filter((e) => nomes.has(e.turma_aluno_id));
  doAluno.forEach((e) => { e._quem = [nomes.get(e.turma_aluno_id), !modulo && (titulos.get(e.modulo_id) || 'sem módulo')].filter(Boolean).join(' · '); });
  const novos = doAluno.filter((e) => !e.visto_em).length;
  box.hidden = false;
  box.innerHTML = `<div class="linha"><h3 style="flex:1">Envios dos alunos</h3>${novos ? `<span class="selo">${novos} novo${novos > 1 ? 's' : ''}</span>` : ''}</div>
    <p class="peq apagado">Tarefas feitas e documentos que os alunos mandaram pela área deles. Abra o arquivo e, se quiser, responda: o aluno lê a resposta lá.</p>
    ${doAluno.length ? htmlEntregas(doAluno, { mentor: true, responder: ctx.ehAdmin || souMentor }) : '<p class="apagado mt peq">Nenhum aluno enviou nada neste módulo ainda.</p>'}`;
  ligarEntregas(box, doAluno, { marcarVisto: souMentor, perfilId: ctx.perfil.id, aoMudar: () => ligarEnviosAlunos(ctx, el, { modulo, turma, souMentor }) });
}

// Para as pendências da equipe: envios de alunos ainda não abertos. turmaIds = só dessas turmas (mentor); vazio = todas (administração).
export async function enviosNovosAlunos(turmaIds = null) {
  let q = sb.from('entregas').select('id, tipo, titulo, enviado_em, modulo_id, aluno:turma_alunos(nome, turma_id, turma:turmas(nome))')
    .not('turma_aluno_id', 'is', null).is('visto_em', null).order('enviado_em', { ascending: false }).limit(50);
  const { data, error } = await q;
  if (error) return [];
  return (data || []).filter((e) => e.aluno && (!turmaIds || turmaIds.includes(e.aluno.turma_id)))
    .map((e) => ({ ...e, link: e.modulo_id ? `#/modulo/${e.modulo_id}` : `#/turma/${e.aluno.turma_id}`, texto: `${esc(e.aluno.nome)} · ${esc(e.aluno.turma ? e.aluno.turma.nome : '')}${e.titulo ? ` · ${esc(e.titulo.length > 40 ? `${e.titulo.slice(0, 40)}…` : e.titulo)}` : ''}` }));
}
