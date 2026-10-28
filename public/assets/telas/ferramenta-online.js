// Ferramenta online aberta dentro da plataforma. O mentorado responde e o resultado vai para "testes".
// Pela trilha ("#/ferramenta/<id>/<turma>", script 48): o aluno responde e o resultado vai para "testes_alunos", visível para ele e
// para os mentores da trilha (a empresa nunca vê).
// Para a equipe, é só uma prévia: nada é guardado.
import { sb, esc, avisar, explicarErro, hojeISO } from '../base.js';
import { ONLINE } from '../ferramentas-online.js';

export async function render(ctx, el, [id, turmaId]) {
  const o = ONLINE[id];
  if (!o || !o.interna) { el.innerHTML = '<div class="vazio">Ferramenta não encontrada.</div>'; return; }
  const { data: cat } = await sb.rpc('catalogo_ferramentas');
  const f = (cat || []).find((x) => x.id === id);
  const nome = (f && f.nome) || 'Ferramenta';
  const ehMentorado = ctx.perfil.papel === 'mentorado';
  // quem responde e onde guarda: aluno pela trilha (inclusive mentorado que faz trilha) ou mentorado individual
  let quem = null;   // { nome, email, whatsapp, cargo, empresa, guardar: (linha) => linha completa }
  if (turmaId && (ctx.perfil.papel === 'aluno' || ehMentorado)) {
    const [{ data: a }, { data: trilhas }] = await Promise.all([
      sb.from('turma_alunos').select('nome, email, whatsapp, cargo').eq('turma_id', turmaId).eq('perfil_id', ctx.perfil.id).maybeSingle(),
      sb.rpc('minhas_trilhas'),
    ]);
    const t = (trilhas || []).find((x) => x.id === turmaId);
    if (a) quem = { nome: a.nome, email: a.email || ctx.perfil.email, whatsapp: a.whatsapp || ctx.perfil.whatsapp || '', cargo: a.cargo || '',
      empresa: (t && t.empresa) || '', tabela: 'testes_alunos', extra: { turma_id: turmaId, perfil_id: ctx.perfil.id },
      aviso: 'Resultado guardado. Os mentores da trilha já podem ver.' };
  } else if (ehMentorado) {
    const { data: m } = await sb.from('mentorados').select('id, nome, email, cargo, programa:programas(empresa:empresas(nome))').eq('perfil_id', ctx.perfil.id).maybeSingle();
    if (m) quem = { nome: m.nome, email: m.email || ctx.perfil.email, whatsapp: ctx.perfil.whatsapp || '', cargo: m.cargo || '',
      empresa: (m.programa && m.programa.empresa && m.programa.empresa.nome) || '', tabela: 'testes', extra: { mentorado_id: m.id },
      aviso: 'Resultado guardado. Seu mentor já pode ver.' };
  }
  const voltar = turmaId && !(ctx.ehAdmin || ctx.atende) ? `#/trilha/${turmaId}` : turmaId ? `#/turma/${turmaId}` : ehMentorado ? '#/minha-area' : '#/arsenal';

  el.innerHTML = `
    <div class="linha" style="margin-bottom:12px"><div style="flex:1"><p class="peq apagado"><a href="${voltar}">← Voltar</a></p><h1>${esc(nome)}</h1></div></div>
    ${quem ? (turmaId ? '<p class="peq apagado" style="margin-bottom:12px">O seu resultado fica com você e com os mentores da trilha. A sua empresa não vê.</p>' : '')
      : `<div class="aviso" style="margin-bottom:12px">Prévia para a equipe: as respostas aqui não são guardadas. ${turmaId ? 'Quando o aluno responder pela área dele, o resultado aparece na página da turma, em "Ferramentas da trilha".' : 'Quando o mentorado responder pela área dele, o resultado aparece na ficha.'}</div>`}
    <iframe id="quadro" src="${esc(o.url)}" title="${esc(nome)}" style="width:100%;height:calc(100vh - 200px);min-height:620px;border:1px solid var(--linha);border-radius:14px;background:#091216"></iframe>`;

  const quadro = el.querySelector('#quadro');
  let testeId = null; // a mesma resposta atualiza o mesmo registro
  const ouvir = async (e) => {
    if (e.origin !== location.origin || e.source !== quadro.contentWindow || !e.data) return;
    if (e.data.tipo === 'mentorei-pronta' && quem) {
      quadro.contentWindow.postMessage({ tipo: 'mentorei-dados', nome: quem.nome, email: quem.email, whatsapp: quem.whatsapp,
        cargo: quem.cargo, empresa: quem.empresa }, location.origin);
    }
    if (e.data.tipo === 'mentorei-resultado' && quem) fila = fila.then(() => guardar(e.data));
  };
  let fila = Promise.resolve(); // um envio de cada vez, para não criar dois registros
  const guardar = async ({ pacote, notas, manual }) => {
    const linha = { ...quem.extra, ferramenta_id: id, nome, feito_em: hojeISO(), resultado: { pacote, notas } };
    if (quem.tabela === 'testes_alunos') linha.atualizado_em = new Date().toISOString();
    const r = testeId ? await sb.from(quem.tabela).update(linha).eq('id', testeId)
      : await sb.from(quem.tabela).insert(linha).select('id').single();
    if (r.error) { avisar(explicarErro(r.error), true); return; }
    if (!testeId && r.data) testeId = r.data.id;
    if (manual) avisar(quem.aviso);
  };
  window.addEventListener('message', ouvir);
  return { sair: () => window.removeEventListener('message', ouvir) };
}
