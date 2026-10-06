// Carregar arsenal (administração): lê a pasta do pacote "Arsenal_Mentorei_Lotes_..." já descompactada,
// grava as fichas (03_Para_o_Sistema/fichas.json e tags.json) e sobe os PDFs (01_Ferramentas_PDF) para a pasta privada.
import { sb, esc, avisar, explicarErro } from '../base.js';

export async function render(ctx, el) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração carrega o arsenal.</div>'; return; }
  const { count } = await sb.from('ferramentas').select('id', { count: 'exact', head: true });
  el.innerHTML = `
    <div class="cab"><div><h1>Carregar arsenal</h1><p class="sub">Hoje há ${count || 0} ferramentas na plataforma. Carregar de novo atualiza as fichas e os PDFs, sem apagar os envios já feitos.</p></div>
      <div class="acoes"><a class="btn" href="#/arsenal">Voltar ao arsenal</a></div></div>
    <div class="cartao" style="max-width:760px">
      <h3>Como fazer</h3>
      <ol class="peq mt" style="padding-left:18px;display:grid;gap:6px">
        <li>No computador, clique com o botão direito no arquivo do pacote, por exemplo <b>Arsenal_Mentorei_Lotes_1-11.zip</b>, e escolha <b>Extrair tudo</b>.</li>
        <li>Clique no botão abaixo e escolha a pasta que foi criada, <b>Arsenal_Mentorei_Lotes_1-11</b>. O navegador pode perguntar se você confia no site: confirme.</li>
        <li>Confira o resumo e clique em <b>Carregar</b>.</li>
      </ol>
      <label class="btn pri mt" for="pasta" style="cursor:pointer">Escolher a pasta do pacote</label>
      <input id="pasta" type="file" webkitdirectory directory multiple hidden>
      <div id="resumo" class="mt"></div>
    </div>`;

  el.querySelector('#pasta').addEventListener('change', async (ev) => {
    const arquivos = [...ev.target.files];
    const caminho = (f) => (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const fichasArq = arquivos.find((f) => /03_Para_o_Sistema\/fichas\.json$/i.test(caminho(f)));
    const tagsArq = arquivos.find((f) => /03_Para_o_Sistema\/tags\.json$/i.test(caminho(f)));
    const pdfs = arquivos.filter((f) => /01_Ferramentas_PDF\/[^/]+\.pdf$/i.test(caminho(f)));
    const resumo = el.querySelector('#resumo');
    if (!fichasArq) { resumo.innerHTML = '<div class="aviso erro">Não achei o arquivo 03_Para_o_Sistema/fichas.json nesta pasta. Escolha a pasta do pacote descompactado.</div>'; return; }
    let dados, tags = [];
    try { dados = JSON.parse(await fichasArq.text()); if (tagsArq) tags = JSON.parse(await tagsArq.text()); }
    catch (e) { resumo.innerHTML = '<div class="aviso erro">Não consegui ler o fichas.json.</div>'; return; }
    const ferramentas = dados.ferramentas || [];
    const nomeArq = (p) => (p ? p.split('/').pop() : null);
    const semPdf = ferramentas.filter((f) => f.arquivo_pdf && !pdfs.some((p) => p.name === nomeArq(f.arquivo_pdf)));
    resumo.innerHTML = `<div class="aviso ok">Encontrei <b>${ferramentas.length}</b> fichas, <b>${pdfs.length}</b> PDFs e <b>${tags.length}</b> tags${dados.lotes ? ` (${esc(dados.lotes)})` : ''}.</div>
      ${semPdf.length ? `<div class="aviso mt">${semPdf.length} ficha(s) citam um PDF que não está na pasta: ${semPdf.map((f) => esc(f.id)).join(', ')}.</div>` : ''}
      <div class="linha mt"><button class="btn pri" id="carregar">Carregar</button><span class="peq apagado" id="prog"></span></div>`;

    resumo.querySelector('#carregar').addEventListener('click', async (e2) => {
      const prog = resumo.querySelector('#prog'); e2.target.disabled = true;
      try {
        prog.textContent = 'Gravando as fichas…';
        const linhas = ferramentas.map((f) => ({ id: f.id, numero: f.numero || null, nome: f.nome, lote: f.lote || null,
          arquivo: nomeArq(f.arquivo_pdf), dados: f, atualizado_em: new Date().toISOString() }));
        const r1 = await sb.from('ferramentas').upsert(linhas, { onConflict: 'id' }); if (r1.error) throw r1.error;
        if (tags.length) {
          const r2 = await sb.from('arsenal_tags').upsert(tags.map((t) => ({ tag: t.tag, quando_aplicar: t.quando_aplicar || null })), { onConflict: 'tag' });
          if (r2.error) throw r2.error;
        }
        let i = 0;
        for (const p of pdfs) {
          i++; prog.textContent = `Enviando PDFs: ${i} de ${pdfs.length}…`;
          const { error: e3 } = await sb.storage.from('arsenal').upload(p.name, p, { upsert: true, contentType: 'application/pdf' });
          if (e3) throw new Error(`${p.name}: ${explicarErro(e3)}`);
        }
        prog.textContent = '';
        avisar(`Arsenal carregado: ${ferramentas.length} fichas e ${pdfs.length} PDFs.`);
        location.hash = '#/arsenal';
      } catch (err) { prog.textContent = ''; avisar(explicarErro(err), true); e2.target.disabled = false; }
    });
  });
}
