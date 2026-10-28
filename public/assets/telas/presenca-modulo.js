// "Presença dos alunos" no módulo da turma (script 49, pedido da Juliana em 28/10/2026): a lista de chamada do encontro.
// Três jeitos: "Puxar do Zoom" (a plataforma lê quem entrou na reunião do link do módulo), importar o arquivo de presença
// (relatório de participantes do Zoom, lista do Teams ou do Meet) ou marcar à mão. Do Zoom e do arquivo, a plataforma liga cada
// pessoa a um aluno (e-mail, depois nome), mostra para conferir e só grava depois do clique. O número de presentes vai sozinho
// para "Participantes presentes" das percepções. Fazem a chamada: administração e mentor do módulo; os outros mentores da turma veem.
import { sb, esc, avisar, explicarErro, dataHoraBR } from '../base.js';
import { minimoMinutos, lerArquivoPresenca, juntarParticipantes, casarParticipantes } from '../presenca-regras.js';

const ORIGEM = { zoom: 'Zoom', arquivo: 'arquivo', manual: 'à mão' };
const faltaScript = (e) => /presencas|schema cache|42P01|PGRST20/.test(`${e && e.code} ${e && e.message}`);
const ehZoom = (m) => m.formato === 'zoom' || /zoom\.us\//i.test(m.link || '');

export const cartaoPresenca = () => '<div class="cartao" id="presenca-alunos"><p class="peq apagado">Carregando a lista de chamada…</p></div>';

export async function ligarPresenca(ctx, el, m, pode) {
  const velho = el.querySelector('#presenca-alunos');
  if (!velho) return;
  const box = velho.cloneNode(true);   // nasce de novo a cada recarga (os cliques não se acumulam)
  velho.replaceWith(box);
  const recarregar = () => ligarPresenca(ctx, el, m, pode);

  const [al, pr] = await Promise.all([
    sb.from('turma_alunos').select('id, nome, email, cargo, ativo').eq('turma_id', m.turma.id).order('nome'),
    sb.from('presencas').select('*').eq('modulo_id', m.id),
  ]);
  if (al.error || pr.error) {
    const e = al.error || pr.error;
    box.innerHTML = `<h3>Presença dos alunos</h3>${faltaScript(e) ? `<div class="aviso mt peq">${ctx.ehAdmin ? 'Para a lista de chamada, falta rodar o script <b>49-presenca-rh-envios-lembretes.sql</b> no Supabase.' : 'A lista de chamada ainda não foi liberada na plataforma. Avise a Cintia.'}</div>`
      : `<p class="peq">${esc(explicarErro(e))}</p>`}`;
    return;
  }
  const marcadas = new Map((pr.data || []).map((p) => [p.turma_aluno_id, p]));
  // aluno que saiu da turma continua aparecendo se tinha presença neste encontro
  const alunos = (al.data || []).filter((a) => a.ativo || marcadas.has(a.id));
  const passou = !m.data_hora || Date.parse(m.data_hora) <= Date.now();
  const presentes = alunos.filter((a) => marcadas.get(a.id) && marcadas.get(a.id).presente).length;
  const feitas = alunos.filter((a) => marcadas.has(a.id)).length;

  box.innerHTML = `
    <div class="linha"><h3 style="flex:1">Presença dos alunos</h3>${feitas ? `<span class="selo${presentes ? '' : ' neutro'}">${presentes} de ${alunos.length} presentes</span>` : ''}</div>
    ${!alunos.length ? `<p class="peq apagado mt">${ctx.ehAdmin ? 'Para fazer a chamada, cadastre os alunos na página da turma ("Alunos da trilha").' : 'A coordenação ainda não cadastrou os alunos desta turma.'}</p>`
    : `<p class="peq apagado">${pode ? (passou ? 'Depois da aula, puxe a lista do Zoom (ou importe o arquivo de presença) e confira. Também dá para marcar cada um à mão.' : 'A chamada abre depois do início da aula.') : 'Quem esteve no encontro.'}</p>
      ${pode && passou ? `<div class="linha mt" style="gap:6px">
        ${ehZoom(m) ? '<button class="btn peq pri" type="button" id="pr-zoom">Puxar do Zoom</button>' : ''}
        <label class="btn peq${ehZoom(m) ? '' : ' pri'}" style="cursor:pointer">Importar lista de presença (arquivo)<input type="file" id="pr-arquivo" accept=".csv,.xlsx,.xls,.ods,.txt" hidden></label>
        ${feitas < alunos.length ? '<button class="btn peq" type="button" id="pr-todos">Marcar os que faltam como presentes</button>' : ''}</div>
        <p class="peq apagado" id="pr-msg" role="status"></p>` : ''}
      <div class="tabela mt"><table><tr><th>Aluno</th><th>Presença</th><th class="peq">Tempo na sala</th></tr>
        ${alunos.map((a) => { const p = marcadas.get(a.id); return `<tr${a.ativo ? '' : ' class="apagado"'}>
          <td><b>${esc(a.nome)}</b>${a.cargo ? `<br><span class="peq apagado">${esc(a.cargo)}</span>` : ''}${a.ativo ? '' : '<br><span class="peq">saiu da turma</span>'}</td>
          <td style="white-space:nowrap">${pode && passou ? `<button class="btn peq${p && p.presente ? ' pri' : ''}" type="button" data-pres="${a.id}" data-v="1" aria-pressed="${!!(p && p.presente)}">Presente</button>
            <button class="btn peq${p && !p.presente ? ' perigo' : ''}" type="button" data-pres="${a.id}" data-v="0" aria-pressed="${!!(p && !p.presente)}">Faltou</button>`
            : p ? `<span class="selo ${p.presente ? '' : 'erro'}">${p.presente ? 'Presente' : 'Faltou'}</span>` : '<span class="peq apagado">—</span>'}</td>
          <td class="peq apagado">${p && p.minutos != null ? `${p.minutos} min` : ''}${p ? `${p.minutos != null ? ' · ' : ''}${ORIGEM[p.origem] || ''}` : ''}</td></tr>`; }).join('')}</table></div>
      ${feitas ? `<p class="peq apagado mt">Chamada atualizada em ${dataHoraBR([...marcadas.values()].map((p) => p.registrado_em).sort().pop())}.</p>` : ''}`}`;
  if (!pode || !passou || !alunos.length) return;

  const msg = box.querySelector('#pr-msg');
  // grava a presença e atualiza "Participantes presentes" das percepções
  const gravar = async (linhas) => {
    const { error } = await sb.from('presencas').upsert(linhas.map((l) => ({ modulo_id: m.id, registrado_por: ctx.perfil.id, registrado_em: new Date().toISOString(), ...l })),
      { onConflict: 'modulo_id,turma_aluno_id' });
    if (error) { avisar(faltaScript(error) ? 'Falta rodar o script 49 no Supabase.' : explicarErro(error), true); return false; }
    const { count } = await sb.from('presencas').select('turma_aluno_id', { count: 'exact', head: true }).eq('modulo_id', m.id).eq('presente', true);
    if (count != null) {
      await sb.from('modulos').update({ participantes_presentes: count }).eq('id', m.id);
      const campo = el.querySelector('[data-perc="participantes_presentes"]');
      if (campo) campo.value = count;
    }
    return true;
  };

  box.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-pres]');
    if (b) {
      b.disabled = true;
      if (await gravar([{ turma_aluno_id: b.dataset.pres, presente: b.dataset.v === '1', origem: 'manual', minutos: (marcadas.get(b.dataset.pres) || {}).minutos ?? null }])) recarregar();
      else b.disabled = false;
      return;
    }
    if (ev.target.id === 'pr-todos') {
      const faltam = alunos.filter((a) => a.ativo && !marcadas.has(a.id));
      if (!window.confirm(`Marcar ${faltam.length} aluno${faltam.length > 1 ? 's' : ''} como presente${faltam.length > 1 ? 's' : ''}?`)) return;
      if (await gravar(faltam.map((a) => ({ turma_aluno_id: a.id, presente: true, origem: 'manual' })))) { avisar('Chamada atualizada.'); recarregar(); }
      return;
    }
    if (ev.target.id === 'pr-zoom') {
      ev.target.disabled = true;
      msg.textContent = 'Lendo a lista de participantes no Zoom…';
      try {
        const { data: { session } } = await sb.auth.getSession();
        const r = await fetch('/api/presenca-zoom', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ modulo_id: m.id }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.mensagem || 'Não foi possível ler o Zoom.');
        msg.textContent = '';
        conferir(juntarParticipantes(j.participantes), 'zoom', `Lista do Zoom${j.conta ? ` (conta ${j.conta})` : ''}${j.inicio ? `, reunião de ${dataHoraBR(j.inicio)}` : ''}.`);
      } catch (e) { msg.textContent = explicarErro(e); }
      ev.target.disabled = false;
    }
  });
  box.querySelector('#pr-arquivo').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    msg.textContent = `Lendo ${arq.name}…`;
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const livro = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
      let lista = [];
      for (const nome of livro.SheetNames) {
        lista = lerArquivoPresenca(XLSX.utils.sheet_to_json(livro.Sheets[nome], { header: 1, blankrows: false, defval: '', raw: false }));
        if (lista.length) break;
      }
      if (!lista.length) { msg.textContent = 'Não achei a lista de participantes nesse arquivo. Ele precisa ter uma coluna com o nome e outra com o e-mail ou o tempo na reunião.'; return; }
      msg.textContent = '';
      conferir(lista, 'arquivo', `${lista.length} pessoa${lista.length > 1 ? 's' : ''} em ${arq.name}.`);
    } catch (_) { msg.textContent = 'Não consegui abrir esse arquivo. Salve como CSV ou Excel e tente de novo.'; }
  });

  // janela para conferir antes de gravar
  async function conferir(participantes, origem, titulo) {
    const ativos = alunos.filter((a) => a.ativo);
    const minimo = minimoMinutos(m.duracao_min);
    const { porAluno, soltos } = casarParticipantes(participantes, ativos);
    const temTempo = participantes.some((p) => p.minutos != null);
    const { janela } = await import('./agenda-dados.js');
    const j = janela('Conferir a presença', `<div class="grade" style="gap:12px">
      <p class="peq">${esc(titulo)} ${temTempo ? `Conta como presente quem ficou pelo menos <b>${minimo} min</b> na sala (metade do encontro); dá para mudar cada um.` : ''}</p>
      <div class="tabela"><table><tr><th>Presente</th><th>Aluno</th><th>Na lista como</th>${temTempo ? '<th>Tempo</th>' : ''}</tr>
        ${ativos.map((a) => { const p = porAluno.get(a.id); const ok = !!p && (p.minutos == null || p.minutos >= minimo); return `<tr>
          <td><input type="checkbox" data-c="${a.id}"${ok ? ' checked' : ''} aria-label="${esc(a.nome)} esteve presente"></td>
          <td><b>${esc(a.nome)}</b></td>
          <td class="peq">${p ? esc(p.nome || p.email) : '<span class="apagado">não encontrado</span>'}</td>
          ${temTempo ? `<td class="peq">${p && p.minutos != null ? `${p.minutos} min${p.minutos < minimo ? ' <span class="selo alerta">pouco tempo</span>' : ''}` : ''}</td>` : ''}</tr>`; }).join('')}</table></div>
      ${soltos.length ? `<div><p class="peq"><b>Na lista, mas não reconhecidos como alunos</b> (mentores, convidados ou nome diferente do cadastro). Se for algum aluno, escolha quem é:</p>
        <div class="lista mt">${soltos.map((p, i) => `<div class="linha peq" style="gap:8px"><span style="flex:1;min-width:160px">${esc(p.nome || p.email)}${p.email && p.nome ? ` <span class="apagado">· ${esc(p.email)}</span>` : ''}${p.minutos != null ? ` <span class="apagado">· ${p.minutos} min</span>` : ''}</span>
          <select data-solto="${i}" style="width:auto"><option value="">Não é aluno</option>${ativos.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></div>`).join('')}</div></div>` : ''}
      <div class="linha"><button class="btn pri" type="button" id="cf-ok">Gravar a chamada</button><button class="btn" type="button" data-fechar>Desistir</button></div>
      <p class="peq apagado">Quem ficar desmarcado entra como falta. A chamada pode ser corrigida depois, aluno por aluno.</p></div>`, { largura: 720 });
    // participante não reconhecido que a pessoa diz quem é: passa a contar para aquele aluno
    j.corpo.addEventListener('change', (ev) => {
      const s = ev.target.closest('[data-solto]');
      if (!s || !s.value) return;
      const p = soltos[Number(s.dataset.solto)];
      porAluno.set(s.value, p);
      const c = j.corpo.querySelector(`[data-c="${s.value}"]`);
      if (c) { c.checked = p.minutos == null || p.minutos >= minimo; c.closest('tr').children[2].innerHTML = `${esc(p.nome || p.email)}`; }
    });
    j.corpo.querySelector('#cf-ok').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      const linhas = ativos.map((a) => { const p = porAluno.get(a.id); return { turma_aluno_id: a.id, presente: j.corpo.querySelector(`[data-c="${a.id}"]`).checked, origem, minutos: p && p.minutos != null ? p.minutos : null }; });
      if (await gravar(linhas)) {
        const n = linhas.filter((l) => l.presente).length;
        avisar(`Chamada gravada: ${n} presente${n === 1 ? '' : 's'} de ${linhas.length}.`);
        j.fechar(); recarregar();
      } else ev.target.disabled = false;
    });
  }
}
