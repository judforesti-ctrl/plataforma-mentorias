// "Logo e cores da área do aluno" (administração, na página da turma; script 44): a marca é da EMPRESA e vale para todas
// as trilhas dela. Logo (o mesmo lugar dos logos das propostas: pasta pública fotos/logos/<empresa>/), paleta pronta,
// "cores do logo" ou duas cores à mão. Salva na hora; a prévia mostra como o aluno vai ver.
import { sb, esc, avisar, explicarErro } from '../base.js';
import { PALETAS, MENTOREI, tema, corValida, coresDaImagem } from '../marca.js';

export const cartaoMarca = () => '<div class="cartao" id="marca-cliente"><p class="peq apagado">Carregando o logo e as cores…</p></div>';

export async function ligarMarca(ctx, el, turma) {
  const velho = el.querySelector('#marca-cliente');
  if (!velho || !ctx.ehAdmin) { if (velho) velho.remove(); return; }
  const box = velho.cloneNode(false);
  velho.replaceWith(box);
  const empresa = turma.empresa ? turma.empresa.nome : 'esta empresa';
  const { data, error } = await sb.from('empresas').select('id, marca').eq('id', turma.empresa_id).maybeSingle();
  if (error || !data || data.marca === undefined) {
    box.innerHTML = `<h3>Logo e cores da área do aluno</h3><div class="aviso mt">Para colocar o logo e as cores de ${esc(empresa)}, falta rodar o script <b>44-alunos-das-turmas.sql</b> no Supabase.</div>`;
    return;
  }
  const { paraPng, linkLogo, logoAnterior } = await import('./proposta.js');
  let marca = { ...(data.marca || {}) };
  const anterior = marca.logo ? null : await logoAnterior(turma.empresa_id);

  const salvar = async (mud, msg) => {
    const nova = { ...marca, ...mud };
    Object.keys(nova).forEach((k) => { if (nova[k] == null) delete nova[k]; });
    const { error: e } = await sb.from('empresas').update({ marca: nova }).eq('id', turma.empresa_id);
    if (e) { avisar(explicarErro(e), true); return false; }
    marca = nova;
    if (msg) avisar(msg);
    desenhar();
    return true;
  };

  function desenhar(enviando = false) {
    const t = tema(marca);
    const principal = corValida(marca.principal) ? marca.principal : MENTOREI.principal;
    const destaque = corValida(marca.destaque) ? marca.destaque : MENTOREI.destaque;
    const ajustou = (corValida(marca.principal) && t.principal.toUpperCase() !== `#${marca.principal.replace('#', '')}`.toUpperCase())
      || (corValida(marca.destaque) && t.destaque.toUpperCase() !== `#${marca.destaque.replace('#', '')}`.toUpperCase());
    const logoUrl = linkLogo(marca.logo);
    box.innerHTML = `
      <div class="linha"><h3 style="flex:1">Logo e cores da área do aluno</h3>${marca.paleta || marca.logo ? '<span class="selo">Personalizada</span>' : '<span class="selo neutro">Cores da Mentorei</span>'}</div>
      <p class="peq apagado">Os alunos de ${esc(empresa)} veem a área da trilha com o logo e as cores da empresa. Vale para todas as trilhas de ${esc(empresa)}. A Mentorei continua aparecendo no alto da tela.</p>
      <div class="grade g2 mt" style="align-items:start">
        <div>
          <h4>Logo de ${esc(empresa)}</h4>
          <div class="linha mt" style="gap:10px">
            ${logoUrl ? `<span class="mc-logo"><img src="${esc(logoUrl)}" alt="Logo de ${esc(empresa)}" crossorigin="anonymous" id="mc-img"></span>` : '<span class="peq apagado">Ainda sem logo.</span>'}
          </div>
          <div class="linha mt" style="gap:6px">
            <label class="btn peq pri" style="cursor:pointer">${logoUrl ? 'Trocar o logo' : '⬆ Enviar o logo (PNG ou JPG)'}<input type="file" id="mc-arquivo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
            ${!logoUrl && anterior ? '<button class="btn peq" type="button" id="mc-anterior">Usar o logo da proposta</button>' : ''}
            ${logoUrl ? '<button class="btn peq" type="button" id="mc-cores-logo">Usar as cores do logo</button><button class="btn peq" type="button" id="mc-tirar">Tirar o logo</button>' : ''}
            ${enviando ? '<span class="peq apagado">Enviando…</span>' : ''}
          </div>
          <h4 class="mt2">Cores</h4>
          <div class="mc-paletas mt">${PALETAS.map((p) => `<button type="button" class="mc-paleta${(marca.paleta || 'mentorei') === p.id ? ' atual' : ''}" data-paleta="${p.id}" aria-pressed="${(marca.paleta || 'mentorei') === p.id}">
            <i style="background:${p.principal}"></i><i style="background:${p.destaque}"></i><span>${esc(p.nome)}</span></button>`).join('')}
            ${marca.paleta === 'logo' || marca.paleta === 'propria' ? `<button type="button" class="mc-paleta atual" aria-pressed="true"><i style="background:${esc(principal)}"></i><i style="background:${esc(destaque)}"></i><span>${marca.paleta === 'logo' ? 'Cores do logo' : 'Escolhida à mão'}</span></button>` : ''}</div>
          <div class="linha mt" style="gap:16px">
            <label class="mc-cor"><input type="color" id="mc-principal" value="${esc(principal)}"><span>Cor principal<br><small class="apagado">fundo do alto da tela</small></span></label>
            <label class="mc-cor"><input type="color" id="mc-destaque" value="${esc(destaque)}"><span>Cor de destaque<br><small class="apagado">botões e detalhes</small></span></label>
          </div>
          ${ajustou ? '<p class="peq mt" style="color:var(--bege-texto)">Ajustamos um pouco o tom das cores para o texto ficar fácil de ler. A prévia ao lado já mostra como fica.</p>' : ''}
        </div>
        <div>
          <h4>Como o aluno vê</h4>
          <div class="mc-previa mt" style="${t.estilo}">
            <div class="mc-previa-topo">
              <div style="flex:1;min-width:0"><p class="peq" style="color:var(--bege);font-weight:700;letter-spacing:.06em;text-transform:uppercase">${esc(empresa)} · Sua trilha</p>
                <b style="font-size:19px;color:#fff;font-family:var(--f-titulo)">${esc(turma.nome)}</b></div>
              ${logoUrl ? `<span class="tr-logo"><img src="${esc(logoUrl)}" alt=""></span>` : ''}
            </div>
            <div class="mc-previa-corpo">
              <span class="tr-num" aria-hidden="true">1</span>
              <div style="flex:1"><b>Primeiro módulo</b><br><span class="selo">Próxima aula</span></div>
              <span class="btn peq pri tr-btn">Entrar na aula</span>
            </div>
          </div>
          <a class="btn peq mt" href="#/trilha/${turma.id}">Ver a área do aluno inteira</a>
        </div>
      </div>`;
  }
  desenhar();

  box.addEventListener('change', async (ev) => {
    if (ev.target.id === 'mc-arquivo') {
      const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
      if (arq.size > 8 * 1024 * 1024) { avisar('A imagem é grande demais (máximo 8 MB).', true); return; }
      desenhar(true);
      try {
        const png = await paraPng(arq);
        const caminho = `logos/${turma.empresa_id}/${Date.now()}.png`;
        const { error: e } = await sb.storage.from('fotos').upload(caminho, png.blob, { contentType: 'image/png', upsert: false });
        if (e) throw e;
        await salvar({ logo: { caminho, largura: png.largura, altura: png.altura } }, 'Logo colocado. Clique em "Usar as cores do logo" se quiser as cores dele.');
      } catch (e) { avisar(explicarErro(e), true); desenhar(); }
      return;
    }
    if (ev.target.id === 'mc-principal' || ev.target.id === 'mc-destaque') {
      const principal = box.querySelector('#mc-principal').value, destaque = box.querySelector('#mc-destaque').value;
      await salvar({ principal, destaque, paleta: 'propria' }, 'Cores salvas.');
    }
  });

  box.addEventListener('click', async (ev) => {
    const p = ev.target.closest('[data-paleta]');
    if (p) {
      const pal = PALETAS.find((x) => x.id === p.dataset.paleta);
      await salvar(pal.id === 'mentorei' ? { principal: null, destaque: null, paleta: null } : { principal: pal.principal, destaque: pal.destaque, paleta: pal.id }, `Cores "${pal.nome}" salvas.`);
      return;
    }
    if (ev.target.id === 'mc-anterior') { await salvar({ logo: anterior }, 'Logo da proposta colocado.'); return; }
    if (ev.target.id === 'mc-tirar') {
      if (!window.confirm(`Tirar o logo de ${empresa} da área do aluno?`)) return;
      await salvar({ logo: null }, 'Logo tirado.');
      return;
    }
    if (ev.target.id === 'mc-cores-logo') {
      const img = box.querySelector('#mc-img');
      try {
        if (!img.complete) await new Promise((ok, falha) => { img.onload = ok; img.onerror = falha; });
        const c = coresDaImagem(img);
        if (!c) { avisar('Não achei cores no logo (ele é todo branco ou transparente?). Escolha uma paleta.', true); return; }
        await salvar({ principal: c.principal, destaque: c.destaque, paleta: 'logo' }, 'Cores tiradas do logo e salvas. Confira na prévia.');
      } catch (_) { avisar('Não consegui ler as cores do logo. Escolha uma paleta ou as cores à mão.', true); }
    }
  });
}
