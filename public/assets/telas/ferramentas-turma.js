// Ferramentas da trilha (script 48, fase 2 da área do aluno, pedido da Juliana em 28/10/2026): na página da turma, a administração
// escolhe quais ferramentas online os alunos fazem e em que módulo cada uma abre (ou desde o começo), e pode incluir mais ao longo da
// trilha. Os resultados ficam para o aluno e para os mentores da trilha (a empresa nunca vê): o cartão mostra quem já fez e abre cada um.
// O mentor da turma vê a lista e os resultados, sem mudar.
import { sb, esc, avisar, explicarErro, diaMes } from '../base.js';
import { ONLINE, htmlResultado } from '../ferramentas-online.js';
import { janela } from './agenda-dados.js';

const faltaScript = (e) => /turma_ferramentas|testes_alunos|schema cache|42P01|PGRST20/.test(`${e && e.code} ${e && e.message}`);
const dataCurta = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

export const cartaoFerramentasTurma = () => '<div class="cartao" id="ferramentas-turma"><p class="peq apagado">Carregando as ferramentas da trilha…</p></div>';

export async function ligarFerramentasTurma(ctx, el, turma) {
  const velho = el.querySelector('#ferramentas-turma');
  if (!velho) return;
  const box = velho.cloneNode(true);   // a cada recarga o cartão nasce de novo, para os cliques não se acumularem
  velho.replaceWith(box);
  const adm = ctx.ehAdmin;
  const mods = (turma.modulos || []).slice().sort((a, b) => a.numero - b.numero);

  const [lista, resultados, alunos, catalogo] = await Promise.all([
    sb.from('turma_ferramentas').select('id, ferramenta_id, modulo_id, ordem').eq('turma_id', turma.id),
    sb.from('testes_alunos').select('id, perfil_id, ferramenta_id, nome, resultado, feito_em, atualizado_em').eq('turma_id', turma.id),
    sb.from('turma_alunos').select('nome, perfil_id, ativo').eq('turma_id', turma.id),
    sb.rpc('catalogo_ferramentas'),
  ]);
  const erro = lista.error || resultados.error;
  if (erro) {
    box.innerHTML = `<h3>Ferramentas da trilha</h3>${faltaScript(erro)
      ? `<div class="aviso mt">${adm ? 'Para escolher as ferramentas online que os alunos fazem na área deles, falta rodar o script <b>48-ferramentas-da-trilha.sql</b> no Supabase.' : 'As ferramentas da trilha ainda não foram liberadas na plataforma.'}</div>`
      : `<div class="aviso erro mt">${esc(explicarErro(erro))}</div>`}`;
    return;
  }
  const nomeDe = Object.fromEntries((catalogo.data || []).map((f) => [f.id, f.nome]));
  const nomeFerr = (id) => nomeDe[id] || (ONLINE[id] && ONLINE[id].publica) || id;
  const doCatalogo = new Set((catalogo.data || []).map((f) => f.id));
  const ativos = (alunos.data || []).filter((a) => a.ativo);   // quem ainda não entrou também conta (ainda não fez)
  const nomeAluno = Object.fromEntries((alunos.data || []).filter((a) => a.perfil_id).map((a) => [a.perfil_id, a.nome]));
  const modDe = Object.fromEntries(mods.map((m) => [m.id, m]));
  const escolhidas = (lista.data || []).slice().sort((a, b) => ((modDe[a.modulo_id] || {}).numero || 0) - ((modDe[b.modulo_id] || {}).numero || 0) || a.ordem - b.ordem);
  // a resposta mais recente de cada aluno em cada ferramenta
  const ultima = {};
  (resultados.data || []).forEach((r) => {
    const k = `${r.ferramenta_id}|${r.perfil_id}`;
    if (!ultima[k] || String(r.atualizado_em) > String(ultima[k].atualizado_em)) ultima[k] = r;
  });
  const quemFez = (fid) => Object.values(ultima).filter((r) => r.ferramenta_id === fid);
  // só as ferramentas que rodam dentro da plataforma (guardam o resultado) e que já têm ficha no arsenal
  const disponiveis = Object.keys(ONLINE).filter((id) => ONLINE[id].interna && doCatalogo.has(id) && !escolhidas.some((e) => e.ferramenta_id === id))
    .sort((a, b) => nomeFerr(a).localeCompare(nomeFerr(b), 'pt-BR'));
  const opcoesModulo = (atual) => `<option value=""${atual ? '' : ' selected'}>Desde o começo da trilha</option>${mods.map((m) => `<option value="${m.id}"${m.id === atual ? ' selected' : ''}>No módulo ${m.numero}${m.data_hora ? ` (${diaMes(m.data_hora)})` : ''} · ${esc(m.titulo)}</option>`).join('')}`;
  const quandoAbre = (e) => {
    const m = modDe[e.modulo_id];
    return m ? `Abre no módulo ${m.numero}${m.data_hora ? ` · ${diaMes(m.data_hora)}` : ''}` : 'Aberta desde o começo';
  };

  box.innerHTML = `
    <div class="linha"><h3 style="flex:1">Ferramentas da trilha <span class="selo neutro">${escolhidas.length}</span></h3></div>
    <p class="peq apagado">${adm ? 'Ferramentas online que os alunos fazem na área deles. Escolha em que módulo cada uma abre; dá para incluir mais ao longo da trilha.' : 'Ferramentas online que os alunos desta trilha fazem na área deles.'}
      O resultado fica com o aluno e com os mentores da trilha. A empresa não vê.</p>
    ${escolhidas.length ? `<div class="lista mt">${escolhidas.map((e) => { const fez = quemFez(e.ferramenta_id); return `
      <div class="item" style="grid-template-columns:1fr auto" data-tf="${e.id}">
        <div style="min-width:0"><b>${esc(nomeFerr(e.ferramenta_id))}</b>
          ${adm ? `<div class="linha mt" style="gap:6px"><label class="sr-only" for="tf-mod-${e.id}">Quando abre</label>
            <select id="tf-mod-${e.id}" data-mudar-modulo="${e.id}" style="max-width:340px;padding:6px 10px;font-size:13px">${opcoesModulo(e.modulo_id)}</select></div>`
            : `<p class="peq apagado">${esc(quandoAbre(e))}</p>`}
          <p class="peq mt">${fez.length} de ${ativos.length} aluno${ativos.length === 1 ? '' : 's'} já ${fez.length === 1 ? 'fez' : 'fizeram'}</p></div>
        <div class="linha" style="gap:6px">
          ${fez.length ? `<button class="btn peq" type="button" data-respostas="${esc(e.ferramenta_id)}">Ver respostas</button>` : ''}
          <a class="btn peq" href="#/ferramenta/${esc(e.ferramenta_id)}/${turma.id}" title="Abre a ferramenta como prévia: nada é guardado">Ver a ferramenta</a>
          ${adm ? `<button class="btn peq perigo" type="button" data-tirar="${e.id}" aria-label="Tirar ${esc(nomeFerr(e.ferramenta_id))} da trilha">Tirar</button>` : ''}
        </div></div>`; }).join('')}</div>`
      : `<p class="apagado mt">${adm ? 'Nenhuma ferramenta escolhida ainda.' : 'Nenhuma ferramenta escolhida para esta trilha.'}</p>`}
    ${adm ? (disponiveis.length ? `<form class="linha mt" id="tf-novo" style="gap:8px;align-items:flex-end">
        <div class="campo" style="flex:1 1 220px"><label for="tf-ferr">Incluir ferramenta</label>
          <select id="tf-ferr" required>${disponiveis.map((id) => `<option value="${id}">${esc(nomeFerr(id))}</option>`).join('')}</select></div>
        <div class="campo" style="flex:1 1 220px"><label for="tf-quando">Quando abre para os alunos</label><select id="tf-quando">${opcoesModulo(null)}</select></div>
        <button class="btn pri" type="submit">Incluir</button></form>`
      : '<p class="peq apagado mt">Todas as ferramentas online já estão nesta trilha.</p>') : ''}`;

  const recarregar = () => ligarFerramentasTurma(ctx, el, turma);
  const form = box.querySelector('#tf-novo');
  if (form) form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = form.querySelector('button'); b.disabled = true;
    const { error } = await sb.from('turma_ferramentas').insert({ turma_id: turma.id, ferramenta_id: form.querySelector('#tf-ferr').value,
      modulo_id: form.querySelector('#tf-quando').value || null, ordem: escolhidas.length });
    if (error) { avisar(explicarErro(error), true); b.disabled = false; return; }
    avisar('Ferramenta incluída. Os alunos veem na área deles quando ela abrir.');
    recarregar();
  });
  box.addEventListener('change', async (ev) => {
    const s = ev.target.closest('[data-mudar-modulo]');
    if (!s) return;
    const { error } = await sb.from('turma_ferramentas').update({ modulo_id: s.value || null }).eq('id', s.dataset.mudarModulo);
    if (error) { avisar(explicarErro(error), true); recarregar(); return; }
    avisar('Pronto: mudou quando a ferramenta abre para os alunos.');
  });
  box.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-tirar]');
    if (t) {
      const e = escolhidas.find((x) => x.id === t.dataset.tirar);
      const fez = quemFez(e.ferramenta_id).length;
      if (!window.confirm(`Tirar "${nomeFerr(e.ferramenta_id)}" da trilha? Ela some da área dos alunos.${fez ? ` As ${fez} respostas já feitas continuam guardadas.` : ''}`)) return;
      const { error } = await sb.from('turma_ferramentas').delete().eq('id', e.id);
      if (error) { avisar(explicarErro(error), true); return; }
      avisar('Ferramenta tirada da trilha.');
      recarregar();
      return;
    }
    const r = ev.target.closest('[data-respostas]');
    if (r) {
      const fid = r.dataset.respostas;
      const fez = quemFez(fid).sort((a, b) => String(nomeAluno[a.perfil_id] || '').localeCompare(String(nomeAluno[b.perfil_id] || ''), 'pt-BR'));
      const faltam = ativos.filter((a) => !fez.some((x) => x.perfil_id === a.perfil_id)).map((a) => a.nome);
      const j = janela(`${nomeFerr(fid)} · respostas dos alunos`, `
        <p class="peq apagado">Só você e os mentores da trilha veem. A empresa não vê.</p>
        <div class="lista mt">${fez.map((x) => `<div class="item" style="grid-template-columns:1fr auto">
          <div><b>${esc(nomeAluno[x.perfil_id] || 'Aluno(a)')}</b><p class="peq apagado">Feita em ${dataCurta(x.feito_em)}</p></div>
          <button class="btn peq" type="button" data-ver="${x.id}">Ver resultado</button></div>`).join('')}</div>
        ${faltam.length ? `<p class="peq mt"><b>Ainda não fizeram (${faltam.length}):</b> ${esc(faltam.join(', '))}</p>` : ''}
        <div id="tf-resultado" class="mt"></div>`, { largura: 680 });
      j.corpo.addEventListener('click', (e2) => {
        const v = e2.target.closest('[data-ver]');
        if (!v) return;
        const x = fez.find((y) => y.id === v.dataset.ver);
        const alvo = j.corpo.querySelector('#tf-resultado');
        alvo.innerHTML = `<p class="peq"><b>${esc(nomeAluno[x.perfil_id] || 'Aluno(a)')}</b></p>${htmlResultado(x)}`;
        alvo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  });
}
