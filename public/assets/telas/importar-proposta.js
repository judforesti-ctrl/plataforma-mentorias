// Importar proposta (PDF ou PowerPoint): lê o texto do arquivo no navegador, a IA organiza empresa, turma(s), perfil e módulos
// (em segundo plano, no servidor) e a administração revisa tudo antes de criar as turmas.
// O que a proposta não traz (datas, link, mentores) a coordenação completa depois na turma.
// Depois de criar, a plataforma confere a agenda e avisa se alguma data já tem conflito.
import { sb, esc, avisar, explicarErro, localParaISO } from '../base.js';
import { COMO, gravarTurma } from './turmas.js';

const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const FORMATO = { indefinido: 'A definir', meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams', presencial: 'Presencial', outro: 'Outro' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function lerTextoPdf(arquivo, aoAvancar) {
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

// PowerPoint (.pptx): o arquivo é um pacote de textos; lê os slides na ordem da apresentação.
export async function lerTextoPptx(arquivo, aoAvancar) {
  const JSZip = (await import(JSZIP)).default;
  const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
  const xml = async (nome) => (zip.file(nome) ? new DOMParser().parseFromString(await zip.file(nome).async('string'), 'application/xml') : null);
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  let slides = [];
  const pres = await xml('ppt/presentation.xml'), rels = await xml('ppt/_rels/presentation.xml.rels');
  if (pres && rels) {
    const alvo = Object.fromEntries([...rels.getElementsByTagName('Relationship')].map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
    slides = [...pres.getElementsByTagNameNS(P, 'sldId')].map((x) => `ppt/${String(alvo[x.getAttributeNS(R, 'id')] || '').replace(/^\/?ppt\//, '')}`).filter((n) => zip.file(n));
  }
  if (!slides.length) {
    slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  }
  const partes = [];
  for (const [i, nome] of slides.entries()) {
    aoAvancar(`Lendo o slide ${i + 1} de ${slides.length}…`);
    const doc = await xml(nome);
    const linhas = [...doc.getElementsByTagNameNS(A, 'p')].map((p) => [...p.getElementsByTagNameNS(A, 't')].map((t) => t.textContent).join('')).filter((t) => t.trim());
    partes.push(`--- slide ${i + 1} ---\n${linhas.join('\n')}`);
  }
  return partes.join('\n\n');
}

export async function render(ctx, el) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração importa propostas.</div>'; return; }
  const { data: empresas } = await sb.from('empresas').select('id, nome').order('nome');

  el.innerHTML = `
    <div class="cab"><div><p class="peq apagado"><a href="#/turmas">← Turmas</a></p><h1>Importar proposta</h1>
      <p class="sub">Envie a proposta em PDF ou PowerPoint. A plataforma lê a empresa, as turmas, o perfil e os módulos, e você confere tudo antes de criar.</p></div></div>
    <div class="cartao" style="max-width:760px">
      <h3>1. Escolha o arquivo da proposta</h3>
      <p class="peq apagado mt">PDF ou PowerPoint (.pptx). Leva de 1 a 3 minutos. Pode deixar a tela aberta enquanto isso. Preços e condições comerciais não são copiados.</p>
      <label class="btn pri mt" style="cursor:pointer">Escolher o arquivo<input type="file" id="pdf" accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.ppt" hidden></label>
      <p class="mt" id="estado" role="status"></p>
    </div>
    <div id="revisao"></div>`;

  const estado = el.querySelector('#estado');
  let parar = false;

  el.querySelector('#pdf').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0]; if (!arq) return;
    el.querySelector('#revisao').innerHTML = '';
    try {
      const ext = (arq.name.split('.').pop() || '').toLowerCase();
      if (ext === 'ppt') { estado.innerHTML = '<span class="selo erro">Formato antigo do PowerPoint</span> Abra no PowerPoint e salve como .pptx (ou exporte como PDF) e envie de novo.'; return; }
      const texto = ext === 'pptx' ? await lerTextoPptx(arq, (t) => { estado.textContent = t; }) : await lerTextoPdf(arq, (t) => { estado.textContent = t; });
      if (texto.replace(/--- (página|slide) \d+ ---/g, '').trim().length < 200) {
        estado.innerHTML = ext === 'pptx' ? '<span class="selo erro">Este PowerPoint quase não tem texto</span> Se os slides forem imagens, exporte a proposta como PDF a partir do Canva e envie o PDF.'
          : '<span class="selo erro">Este PDF não tem texto legível</span> Parece ser uma imagem escaneada. Exporte a proposta de novo como PDF a partir do Canva ou do PowerPoint.';
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
      revisar(ctx, el.querySelector('#revisao'), res.resultado, empresas || [], imp.id);
    } catch (e) { estado.textContent = ''; avisar(explicarErro(e), true); }
  });

  return { sair: () => { parar = true; } };
}

// formato inicial de cada módulo na revisão: o que a proposta disse; se não disse, o da turma
function formatoInicial(t, m) {
  if (m.formato && m.formato !== 'indefinido') return m.formato;
  if (t.formato === 'presencial') return 'presencial';
  if (t.formato === 'online') return 'meet';
  return 'indefinido';
}

function revisar(ctx, box, r, empresas, importacaoId = null) {
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
        <div class="campo" style="grid-column:1/-1"><span class="rotulo">Como vai ser *</span><div class="linha">
          ${Object.entries(COMO).map(([k, rot]) => `<label class="check"><input type="radio" name="formato-${i}" data-formato value="${k}"${k === t.formato ? ' checked' : ''}><span>${rot}</span></label>`).join('')}</div>
          <small>${t.formato && t.formato !== 'indefinido' ? 'Lido na proposta. Confira.' : 'A proposta não dizia: marque aqui.'} A agenda usa essa informação (aula presencial reserva a véspera e o dia seguinte para o deslocamento).</small></div>
        <div class="campo" data-local-caixa${t.formato === 'online' ? ' hidden' : ''}><label>Cidade das aulas presenciais</label><input type="text" data-c="local" value="${esc(t.local || '')}" placeholder="Ex.: Curitiba (PR)"></div>
        <div class="campo"><label>Participantes esperados</label><input type="number" min="0" data-c="participantes_previstos" value="${esc(t.participantes_previstos ?? '')}"></div>
        <div class="grade g2" style="gap:10px"><div class="campo"><label>Início</label><input type="date" data-c="inicio" value="${esc(t.inicio || '')}"></div>
          <div class="campo"><label>Fim previsto</label><input type="date" data-c="fim_previsto" value="${esc(t.fim_previsto || '')}"></div></div>
        <div class="campo" style="grid-column:1/-1"><label>Perfil da turma</label><textarea data-c="perfil_turma" style="min-height:130px">${esc(t.perfil_turma || '')}</textarea></div>
        <div class="campo" style="grid-column:1/-1"><label>Metodologia e personalização (os mentores veem)</label><textarea data-c="observacoes" style="min-height:90px">${esc(t.metodologia || '')}</textarea></div>
      </div>
      <h4 class="mt2">Módulos (${(t.modulos || []).length})</h4>
      <div class="lista mt">${(t.modulos || []).map((m, j) => `<div class="cartao" style="background:var(--bg);border:0;margin-top:0" data-mod="${j}">
        <div class="linha"><label class="check" style="flex:1"><input type="checkbox" data-incluir${m.individual ? '' : ' checked'}><span><b>Módulo ${m.numero}</b>${m.individual ? ' <span class="selo alerta">mentoria individual: cadastre em Mentorados</span>' : ''}</span></label></div>
        <div class="grade g2 mt" style="gap:10px">
          <div class="campo" style="grid-column:1/-1"><label>Título</label><input type="text" data-m="titulo" value="${esc(m.titulo)}"></div>
          <div class="campo"><label>Data e hora (Brasília)</label><input type="datetime-local" data-m="data_hora" value="${m.data ? esc(`${m.data}T${m.hora || '09:00'}`) : ''}"></div>
          <div class="grade g2" style="gap:10px"><div class="campo"><label>Onde *</label><select data-m="formato">${Object.entries(FORMATO).map(([k, rot]) => `<option value="${k}"${k === formatoInicial(t, m) ? ' selected' : ''}>${rot}</option>`).join('')}</select></div>
            <div class="campo"><label>Duração (min)</label><input type="number" min="0" data-m="duracao_min" value="${esc(m.duracao_min ?? '')}"></div></div>
          <div class="campo" style="grid-column:1/-1"><label>Temática</label><textarea data-m="tematica" style="min-height:110px">${esc(m.tematica || '')}</textarea></div>
          <div class="campo" style="grid-column:1/-1"><label>Recomendações da aula</label><textarea data-m="recomendacoes" style="min-height:60px">${esc(m.recomendacoes || '')}</textarea></div>
        </div></div>`).join('') || '<p class="apagado">A proposta não tinha módulos identificáveis. Cadastre-os depois, na turma.</p>'}</div>
    </div>`).join('') || '<div class="vazio">Não encontrei turmas nesta proposta.</div>'}
    ${turmas.length ? '<div class="linha mt2" style="max-width:980px"><button class="btn pri" id="criar">Criar turma' + (turmas.length > 1 ? 's' : '') + '</button><span class="peq apagado">Depois, na turma, você define os mentores, o link da sala e envia os slides.</span></div>' : ''}`;

  box.querySelector('#r-emp').addEventListener('change', (ev) => { box.querySelector('#r-emp-nome').disabled = ev.target.value !== 'nova'; });
  // ao escolher como a turma vai ser, os módulos acompanham (no "parte de cada", escolha módulo a módulo)
  box.querySelectorAll('[data-formato]').forEach((r) => r.addEventListener('change', () => {
    const cx = r.closest('[data-turma]');
    cx.querySelector('[data-local-caixa]').hidden = r.value === 'online';
    cx.querySelectorAll('[data-m="formato"]').forEach((sel) => {
      if (r.value === 'presencial') sel.value = 'presencial';
      else if (r.value === 'online' && (sel.value === 'presencial' || sel.value === 'indefinido')) sel.value = 'meet';
    });
  }));

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
      const criadas = [], novosModulos = [];
      for (const cx of box.querySelectorAll('[data-turma]')) {
        if (!cx.querySelector('[data-criar]').checked) continue;
        const v = (k) => cx.querySelector(`[data-c="${k}"]`).value.trim();
        if (!v('nome')) throw new Error('Toda turma precisa de um nome.');
        const formatoTurma = (cx.querySelector('[data-formato]:checked') || {}).value;
        if (!formatoTurma) throw new Error(`Turma "${v('nome')}": marque se é online, presencial ou parte de cada.`);
        for (const mx of cx.querySelectorAll('[data-mod]')) {
          if (mx.querySelector('[data-incluir]').checked && mx.querySelector('[data-m="formato"]').value === 'indefinido') {
            throw new Error(`Turma "${v('nome')}": escolha em "Onde" se o módulo "${mx.querySelector('[data-m="titulo"]').value.trim()}" é online ou presencial.`);
          }
        }
        const { data: t, error } = await gravarTurma({ empresa_id: empresaId, nome: v('nome'), perfil_turma: v('perfil_turma') || null, observacoes: v('observacoes') || null,
          participantes_previstos: v('participantes_previstos') === '' ? null : Number(v('participantes_previstos')),
          inicio: v('inicio') || null, fim_previsto: v('fim_previsto') || null, formato: formatoTurma, local: formatoTurma === 'online' ? null : (v('local') || null) });
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
            formato, local: formato === 'presencial' ? (v('local') || null) : null });
        }
        if (linhas.length) {
          const r2 = await sb.from('modulos').insert(linhas).select('id, numero, titulo, data_hora, duracao_min, formato');
          if (r2.error) throw r2.error;
          (r2.data || []).forEach((m) => novosModulos.push({ ...m, titulo: `${v('nome')} · ${m.titulo}`, turma: { formato: formatoTurma }, mentorIds: [] }));
        }
        criadas.push(t.id);
      }
      if (!criadas.length) throw new Error('Marque pelo menos uma turma para criar.');
      // pipeline de vendas: a oportunidade desta proposta fecha e fica ligada à turma
      if (importacaoId) {
        const { data: ops } = await sb.from('oportunidades').select('id, etapa').eq('importacao_id', importacaoId);
        for (const op of (ops || []).filter((o) => o.etapa !== 'fechado' && o.etapa !== 'perdido')) {
          await sb.from('oportunidades').update({ etapa: 'fechado', chance: 100, fechado_em: new Date().toISOString(), turma_id: criadas[0], empresa_id: empresaId }).eq('id', op.id);
          await sb.from('interacoes').insert({ oportunidade_id: op.id, tipo: 'etapa', texto: 'Fechou: turma criada a partir da proposta.' });
        }
      }
      avisar(criadas.length > 1 ? `${criadas.length} turmas criadas.` : 'Turma criada. Agora defina os mentores e o link de cada módulo.');
      const destino = criadas.length === 1 ? `#/turma/${criadas[0]}` : '#/turmas';
      import('./agenda-dados.js').then(({ avisarGoogle }) => avisarGoogle());
      const { conferirModulos, mostrarConflitos } = await import('./agenda-dados.js');
      const conflitos = await conferirModulos(ctx, novosModulos);
      if (conflitos.length) {
        mostrarConflitos(conflitos, { intro: `${criadas.length > 1 ? 'As turmas foram criadas' : 'A turma foi criada'}, mas estas datas batem com algo na agenda:`, aoFechar: () => ctx.irPara(destino) });
        return;
      }
      ctx.irPara(destino);
    } catch (e) { avisar(explicarErro(e), true); btn.disabled = false; }
  });
}
