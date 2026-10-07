// Importar proposta (PDF): lê o texto do PDF no navegador, a IA organiza empresa, turma(s), perfil e módulos
// (em segundo plano, no servidor) e a administração revisa tudo antes de criar as turmas.
// O que a proposta não traz (datas, link, mentores) a coordenação completa depois na turma.
import { sb, esc, avisar, explicarErro, localParaISO } from '../base.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const FORMATO = { indefinido: 'A definir', meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams', presencial: 'Presencial', outro: 'Outro' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function lerTextoPdf(arquivo, aoAvancar) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const partes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    aoAvancar(`Lendo a página ${i} de ${doc.numPages}…`);
    const pg = await doc.getPage(i);
    const c = await pg.getTextContent();
    let linha = '', txt = '';
    for (const it of c.items) { linha += it.str; if (it.hasEOL) { txt += `${linha}\n`; linha = ''; } else linha += ' '; }
    partes.push(`--- página ${i} ---\n${txt}${linha}`);
  }
  return partes.join('\n\n').replace(/[ \t]+/g, ' ');
}

export async function render(ctx, el) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração importa propostas.</div>'; return; }
  const { data: empresas } = await sb.from('empresas').select('id, nome').order('nome');

  el.innerHTML = `
    <div class="cab"><div><p class="peq apagado"><a href="#/turmas">← Turmas</a></p><h1>Importar proposta</h1>
      <p class="sub">Envie a proposta em PDF. A plataforma lê a empresa, as turmas, o perfil e os módulos, e você confere tudo antes de criar.</p></div></div>
    <div class="cartao" style="max-width:760px">
      <h3>1. Escolha o PDF da proposta</h3>
      <p class="peq apagado mt">Leva de 1 a 3 minutos. Pode deixar a tela aberta enquanto isso. Preços e condições comerciais não são copiados.</p>
      <label class="btn pri mt" style="cursor:pointer">Escolher o PDF<input type="file" id="pdf" accept="application/pdf,.pdf" hidden></label>
      <p class="mt" id="estado" role="status"></p>
    </div>
    <div id="revisao"></div>`;

  const estado = el.querySelector('#estado');
  let parar = false;

  el.querySelector('#pdf').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0]; if (!arq) return;
    el.querySelector('#revisao').innerHTML = '';
    try {
      const texto = await lerTextoPdf(arq, (t) => { estado.textContent = t; });
      if (texto.replace(/--- página \d+ ---/g, '').trim().length < 200) {
        estado.innerHTML = '<span class="selo erro">Este PDF não tem texto legível</span> Parece ser uma imagem escaneada. Exporte a proposta de novo como PDF a partir do Canva ou do PowerPoint.';
        return;
      }
      estado.textContent = 'Organizando a proposta com a IA… (de 1 a 3 minutos)';
      const { data: imp, error } = await sb.from('importacoes_proposta').insert({ arquivo: arq.name }).select('id').single();
      if (error) throw error;
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/api/proposta', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ importacao_id: imp.id, arquivo: arq.name, texto }) });
      if (!r.ok && r.status !== 202) throw new Error('Não foi possível começar a leitura da proposta.');
      // acompanha o resultado (a IA trabalha em segundo plano)
      const inicio = Date.now();
      let res = null;
      while (!parar && Date.now() - inicio < 5 * 60 * 1000) {
        await new Promise((ok) => setTimeout(ok, 4000));
        const { data } = await sb.from('importacoes_proposta').select('status, resultado, erro').eq('id', imp.id).single();
        if (data && data.status !== 'processando') { res = data; break; }
        estado.textContent = `Organizando a proposta com a IA… ${Math.round((Date.now() - inicio) / 1000)} s`;
      }
      if (parar) return;
      if (!res) { estado.textContent = 'Demorou mais que o esperado. Tente de novo em alguns minutos.'; return; }
      if (res.status === 'erro') { estado.innerHTML = `<span class="selo erro">Não deu certo</span> ${esc(res.erro || '')}`; return; }
      estado.innerHTML = '<span class="selo">Pronto</span> Confira abaixo, ajuste o que precisar e clique em "Criar".';
      revisar(ctx, el.querySelector('#revisao'), res.resultado, empresas || []);
    } catch (e) { estado.textContent = ''; avisar(explicarErro(e), true); }
  });

  return { sair: () => { parar = true; } };
}

function revisar(ctx, box, r, empresas) {
  const turmas = r.turmas || [];
  const achada = empresas.find((e) => norm(e.nome) === norm(r.empresa)) || empresas.find((e) => norm(e.nome) && norm(r.empresa).includes(norm(e.nome)));
  box.innerHTML = `
    <div class="cartao" style="max-width:980px"><h3>2. Empresa</h3>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo"><label for="r-emp">Empresa contratante</label><select id="r-emp">
          <option value="nova"${achada ? '' : ' selected'}>Nova empresa: ${esc(r.empresa)}</option>
          ${empresas.map((e) => `<option value="${e.id}"${achada && achada.id === e.id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="r-emp-nome">Nome da nova empresa</label><input id="r-emp-nome" type="text" value="${esc(r.empresa)}"${achada ? ' disabled' : ''}></div>
      </div>
      ${(r.faltando || []).length ? `<div class="aviso mt"><b>A proposta não trazia (a Cintia completa depois, na turma):</b><ul class="peq" style="margin:6px 0 0 18px">${r.faltando.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    </div>
    ${turmas.map((t, i) => `<div class="cartao" style="max-width:980px" data-turma="${i}">
      <div class="linha"><h3 style="flex:1">3. Turma ${turmas.length > 1 ? i + 1 : ''}</h3><label class="check"><input type="checkbox" data-criar checked><span>Criar esta turma</span></label></div>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo" style="grid-column:1/-1"><label>Nome da turma</label><input type="text" data-c="nome" value="${esc(t.nome)}"></div>
        <div class="campo"><label>Participantes esperados</label><input type="number" min="0" data-c="participantes_previstos" value="${esc(t.participantes_previstos ?? '')}"></div>
        <div class="grade g2" style="gap:10px"><div class="campo"><label>Início</label><input type="date" data-c="inicio" value="${esc(t.inicio || '')}"></div>
          <div class="campo"><label>Fim previsto</label><input type="date" data-c="fim_previsto" value="${esc(t.fim_previsto || '')}"></div></div>
        <div class="campo" style="grid-column:1/-1"><label>Perfil da turma</label><textarea data-c="perfil_turma" style="min-height:130px">${esc(t.perfil_turma || '')}</textarea></div>
      </div>
      <h4 class="mt2">Módulos (${(t.modulos || []).length})</h4>
      <div class="lista mt">${(t.modulos || []).map((m, j) => `<div class="cartao" style="background:var(--bg);border:0;margin-top:0" data-mod="${j}">
        <div class="linha"><label class="check" style="flex:1"><input type="checkbox" data-incluir${m.individual ? '' : ' checked'}><span><b>Módulo ${m.numero}</b>${m.individual ? ' <span class="selo alerta">mentoria individual: cadastre em Mentorados</span>' : ''}</span></label></div>
        <div class="grade g2 mt" style="gap:10px">
          <div class="campo" style="grid-column:1/-1"><label>Título</label><input type="text" data-m="titulo" value="${esc(m.titulo)}"></div>
          <div class="campo"><label>Data e hora (Brasília)</label><input type="datetime-local" data-m="data_hora" value="${m.data ? esc(`${m.data}T${m.hora || '09:00'}`) : ''}"></div>
          <div class="grade g2" style="gap:10px"><div class="campo"><label>Onde</label><select data-m="formato">${Object.entries(FORMATO).map(([k, rot]) => `<option value="${k}"${k === m.formato ? ' selected' : ''}>${rot}</option>`).join('')}</select></div>
            <div class="campo"><label>Duração (min)</label><input type="number" min="0" data-m="duracao_min" value="${esc(m.duracao_min ?? '')}"></div></div>
          <div class="campo" style="grid-column:1/-1"><label>Temática</label><textarea data-m="tematica" style="min-height:110px">${esc(m.tematica || '')}</textarea></div>
          <div class="campo" style="grid-column:1/-1"><label>Recomendações da aula</label><textarea data-m="recomendacoes" style="min-height:60px">${esc(m.recomendacoes || '')}</textarea></div>
        </div></div>`).join('') || '<p class="apagado">A proposta não tinha módulos identificáveis. Cadastre-os depois, na turma.</p>'}</div>
    </div>`).join('') || '<div class="vazio">Não encontrei turmas nesta proposta.</div>'}
    ${turmas.length ? '<div class="linha mt2" style="max-width:980px"><button class="btn pri" id="criar">Criar turma' + (turmas.length > 1 ? 's' : '') + '</button><span class="peq apagado">Depois, na turma, você define os mentores, o link da sala e envia os slides.</span></div>' : ''}`;

  box.querySelector('#r-emp').addEventListener('change', (ev) => { box.querySelector('#r-emp-nome').disabled = ev.target.value !== 'nova'; });

  box.querySelector('#criar')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      // empresa
      let empresaId = box.querySelector('#r-emp').value;
      if (empresaId === 'nova') {
        const nome = box.querySelector('#r-emp-nome').value.trim();
        if (!nome) throw new Error('Escreva o nome da empresa.');
        const ja = empresas.find((e) => norm(e.nome) === norm(nome));
        if (ja) empresaId = ja.id;
        else { const { data, error } = await sb.from('empresas').insert({ nome }).select('id').single(); if (error) throw error; empresaId = data.id; }
      }
      const criadas = [];
      for (const cx of box.querySelectorAll('[data-turma]')) {
        if (!cx.querySelector('[data-criar]').checked) continue;
        const v = (k) => cx.querySelector(`[data-c="${k}"]`).value.trim();
        if (!v('nome')) throw new Error('Toda turma precisa de um nome.');
        const { data: t, error } = await sb.from('turmas').insert({ empresa_id: empresaId, nome: v('nome'), perfil_turma: v('perfil_turma') || null,
          participantes_previstos: v('participantes_previstos') === '' ? null : Number(v('participantes_previstos')),
          inicio: v('inicio') || null, fim_previsto: v('fim_previsto') || null }).select('id').single();
        if (error) throw error;
        let n = 0;
        const linhas = [];
        for (const mx of cx.querySelectorAll('[data-mod]')) {
          if (!mx.querySelector('[data-incluir]').checked) continue;
          const mv = (k) => mx.querySelector(`[data-m="${k}"]`).value.trim();
          if (!mv('titulo')) continue;
          const formato = mv('formato');
          linhas.push({ turma_id: t.id, numero: ++n, titulo: mv('titulo'), tematica: mv('tematica') || null, recomendacoes: mv('recomendacoes') || null,
            data_hora: localParaISO(mv('data_hora')) || null, duracao_min: mv('duracao_min') === '' ? null : Number(mv('duracao_min')),
            formato });
        }
        if (linhas.length) { const r2 = await sb.from('modulos').insert(linhas); if (r2.error) throw r2.error; }
        criadas.push(t.id);
      }
      if (!criadas.length) throw new Error('Marque pelo menos uma turma para criar.');
      avisar(criadas.length > 1 ? `${criadas.length} turmas criadas.` : 'Turma criada. Agora defina os mentores e o link de cada módulo.');
      ctx.irPara(criadas.length === 1 ? `#/turma/${criadas[0]}` : '#/turmas');
    } catch (e) { avisar(explicarErro(e), true); btn.disabled = false; }
  });
}
