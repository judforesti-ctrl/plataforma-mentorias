// Ferramenta online aberta dentro da plataforma. O mentorado responde e o resultado vai para "testes".
// Para a equipe, é só uma prévia: nada é guardado.
import { sb, esc, avisar, explicarErro, hojeISO } from '../base.js';
import { ONLINE } from '../ferramentas-online.js';

export async function render(ctx, el, [id]) {
  const o = ONLINE[id];
  if (!o || !o.interna) { el.innerHTML = '<div class="vazio">Ferramenta não encontrada.</div>'; return; }
  const { data: f } = await sb.from('ferramentas').select('id, nome').eq('id', id).maybeSingle();
  const nome = (f && f.nome) || 'Ferramenta';
  const ehMentorado = ctx.perfil.papel === 'mentorado';
  let m = null;
  if (ehMentorado) {
    const { data } = await sb.from('mentorados').select('id, nome, email, cargo, programa:programas(empresa:empresas(nome))').eq('perfil_id', ctx.perfil.id).maybeSingle();
    m = data;
  }

  el.innerHTML = `
    <div class="linha" style="margin-bottom:12px"><div style="flex:1"><p class="peq apagado"><a href="${ehMentorado ? '#/minha-area' : '#/arsenal'}">← Voltar</a></p><h1>${esc(nome)}</h1></div></div>
    ${ehMentorado ? '' : '<div class="aviso" style="margin-bottom:12px">Prévia para a equipe: as respostas aqui não são guardadas. Quando o mentorado responder pela área dele, o resultado aparece na ficha.</div>'}
    <iframe id="quadro" src="${esc(o.url)}" title="${esc(nome)}" style="width:100%;height:calc(100vh - 200px);min-height:620px;border:1px solid var(--linha);border-radius:14px;background:#091216"></iframe>`;

  const quadro = el.querySelector('#quadro');
  let testeId = null; // a mesma resposta atualiza o mesmo registro
  const ouvir = async (e) => {
    if (e.origin !== location.origin || e.source !== quadro.contentWindow || !e.data) return;
    if (e.data.tipo === 'mentorei-pronta' && m) {
      quadro.contentWindow.postMessage({ tipo: 'mentorei-dados', nome: m.nome, email: m.email || ctx.perfil.email, whatsapp: ctx.perfil.whatsapp || '',
        cargo: m.cargo || '', empresa: (m.programa && m.programa.empresa && m.programa.empresa.nome) || '' }, location.origin);
    }
    if (e.data.tipo === 'mentorei-resultado' && m) fila = fila.then(() => guardar(e.data));
  };
  let fila = Promise.resolve(); // um envio de cada vez, para não criar dois registros
  const guardar = async ({ pacote, notas, manual }) => {
    const linha = { mentorado_id: m.id, ferramenta_id: id, nome, feito_em: hojeISO(), resultado: { pacote, notas } };
    const r = testeId ? await sb.from('testes').update(linha).eq('id', testeId)
      : await sb.from('testes').insert(linha).select('id').single();
    if (r.error) { avisar(explicarErro(r.error), true); return; }
    if (!testeId && r.data) testeId = r.data.id;
    if (manual) avisar('Resultado guardado. Seu mentor já pode ver.');
  };
  window.addEventListener('message', ouvir);
  return { sair: () => window.removeEventListener('message', ouvir) };
}
