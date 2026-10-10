// QR code de avaliação do módulo (script 30): a administração coloca e troca a imagem; os mentores veem e baixam
// para pôr no ÚLTIMO SLIDE. Vale só para um módulo, para todos os módulos de uma turma ou para todas as turmas:
// o módulo usa o mais específico que existir. Imagem na pasta privada "turmas", em "avaliacao/<nível>/<arquivo>".
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';

export const NIVEL = { modulo: 'Só este módulo', turma: 'Todos os módulos desta turma', geral: 'Todas as turmas' };
const ORDEM = ['modulo', 'turma', 'geral'];   // do mais específico ao mais geral
const PRONTOS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const nomeArquivo = (t) => t.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// Os QR codes que valem para o módulo: { niveis: {modulo, turma, geral}, vale }. Sem o script 30: { falta: true }.
export async function lerQr(m) {
  const { data, error } = await sb.from('qr_avaliacao').select('id, escopo, turma_id, modulo_id, caminho, nome, link, atualizado_em')
    .or(`escopo.eq.geral,turma_id.eq.${m.turma.id},modulo_id.eq.${m.id}`);
  if (error) return { niveis: {}, vale: null, falta: /qr_avaliacao|42P01|PGRST20|schema cache/i.test(`${error.code} ${error.message}`), erro: error };
  const niveis = {};
  (data || []).forEach((q) => {
    if (q.escopo === 'geral' || (q.escopo === 'turma' && q.turma_id === m.turma.id) || (q.escopo === 'modulo' && q.modulo_id === m.id)) niveis[q.escopo] = q;
  });
  return { niveis, vale: ORDEM.map((k) => niveis[k]).find(Boolean) || null };
}

export function cartaoQr(ctx, m, qr, souMentor) {
  const adm = ctx.ehAdmin;
  const v = qr.vale;
  let corpo;
  if (qr.falta) corpo = adm ? '<div class="aviso mt">Para guardar o QR code, falta rodar o script <b>30-qr-avaliacao.sql</b> no Supabase.</div>'
    : '<p class="apagado mt">O QR code de avaliação ainda não foi liberado na plataforma. Avise a Cintia.</p>';
  else if (qr.erro) corpo = `<p class="apagado mt">${esc(explicarErro(qr.erro))}</p>`;
  else if (!v) corpo = adm ? '<p class="apagado mt">Nenhum QR code de avaliação ainda. Coloque a imagem: dá para valer só para este módulo, para a turma toda ou para todas as turmas.</p>'
    : '<p class="apagado mt">A coordenação ainda não colocou o QR code de avaliação deste módulo. Se a aula estiver chegando, clique em "Falar com a Cintia".</p>';
  else corpo = `<div class="qr-aval mt">
      <img alt="QR code de avaliação" data-qr-img>
      <div class="qr-aval-info">
        ${adm ? `<span class="selo neutro">Vale para: ${NIVEL[v.escopo].toLowerCase()}</span>` : ''}
        <span class="peq apagado">Atualizado em ${dataBR(v.atualizado_em)}</span>
        <div class="linha" style="gap:6px"><button class="btn peq pri" type="button" data-qr-baixar>Baixar o QR code</button>${v.link ? '<button class="btn peq" type="button" data-qr-copiar>Copiar o link</button>' : ''}</div>
        ${v.link ? '<span class="peq apagado">Aula online: dá para mandar o link no chat também.</span>' : ''}
      </div></div>`;
  return `<div class="cartao" id="qr-avaliacao">
    <h3>QR code de avaliação</h3>
    <div class="aviso mt"><b>Inclua o QR code de avaliação no último slide.</b> ${souMentor || !adm ? 'Baixe a imagem abaixo e coloque no último slide da sua apresentação deste módulo.' : 'Os mentores baixam esta imagem e colocam no último slide da apresentação.'}</div>
    ${corpo}
    ${adm && !qr.falta && !qr.erro ? `<button class="btn peq escuro mt" type="button" data-qr-trocar>${v ? 'Trocar o QR code' : 'Colocar o QR code'}</button>` : ''}
  </div>`;
}

export function ligarQr(ctx, el, m, qr, recarregar) {
  const card = el.querySelector('#qr-avaliacao'); if (!card) return;
  const v = qr.vale;
  if (v) sb.storage.from('turmas').createSignedUrl(v.caminho, 3600).then(({ data }) => { const img = card.querySelector('[data-qr-img]'); if (img && data) img.src = data.signedUrl; });
  card.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-qr-baixar]')) {
      const aba = window.open('', '_blank');   // abre já no clique, para o navegador não bloquear
      const ext = (v.caminho.split('.').pop() || 'png').toLowerCase();
      const nome = nomeArquivo(`QR code de avaliação - ${m.turma.nome} - Módulo ${m.numero}`) + `.${ext}`;
      const { data, error } = await sb.storage.from('turmas').createSignedUrl(v.caminho, 300, { download: nome });
      if (error) { if (aba) aba.close(); avisar(explicarErro(error), true); return; }
      if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
      return;
    }
    if (ev.target.closest('[data-qr-copiar]')) {
      try { await navigator.clipboard.writeText(v.link); avisar('Link da avaliação copiado.'); } catch (_) { window.prompt('Copie o link da avaliação:', v.link); }
      return;
    }
    if (ev.target.closest('[data-qr-trocar]')) abrirTroca(ctx, m, qr, recarregar);
  });
}

// Imagem pronta para guardar: PNG/JPG/WEBP até 5 MB vão como estão; o resto (SVG, GIF, foto do iPhone, arquivo grande)
// vira PNG, que não borra os quadradinhos do QR code.
async function prepararImagem(arq) {
  if (PRONTOS[arq.type] && arq.size <= 5 * 1048576) return { blob: arq, ext: PRONTOS[arq.type], tipo: arq.type };
  const { abrirImagem } = await import('./perfil-comum.js');
  const img = await abrirImagem(arq);
  const w = img.width || img.naturalWidth || 1000, h = img.height || img.naturalHeight || 1000;
  const escala = arq.type === 'image/svg+xml' ? 1200 / Math.max(w, h) : Math.min(1, 2000 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * escala)); c.height = Math.max(1, Math.round(h * escala));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = escala < 1;
  g.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível preparar a imagem.'))), 'image/png'));
  return { blob, ext: 'png', tipo: 'image/png' };
}

async function abrirTroca(ctx, m, qr, recarregar) {
  const { janela } = await import('./agenda-dados.js');
  const alvo = { modulo: `Módulo ${m.numero} · ${m.titulo}`, turma: m.turma.nome, geral: 'padrão da Mentorei' };
  const inicial = qr.vale ? qr.vale.escopo : 'turma';
  const j = janela(qr.vale ? 'Trocar o QR code de avaliação' : 'Colocar o QR code de avaliação', `
    <p class="peq">Escolha a imagem do QR code (PNG ou JPG; um print também serve). Os mentores baixam esta imagem para pôr no último slide.</p>
    <div class="qr-aval mt"><img alt="Imagem escolhida" id="qr-previa" hidden>
      <label class="btn pri" style="cursor:pointer">Escolher a imagem<input type="file" id="qr-arquivo" accept="image/*" hidden></label></div>
    <p class="peq apagado mt" id="qr-nome"></p>
    <div class="campo mt"><label for="qr-link">Link da avaliação (opcional)</label><input type="url" id="qr-link" placeholder="https://forms.gle/…"></div>
    <p class="peq mt"><b>Vale para</b></p>
    <div class="mt" style="display:grid;gap:8px">${ORDEM.map((k) => `<label class="check"><input type="radio" name="qr-nivel" value="${k}"${k === inicial ? ' checked' : ''}>
      <span>${NIVEL[k]} <span class="peq apagado">(${esc(alvo[k])})</span>${qr.niveis[k] ? ' <span class="selo neutro">já tem um</span>' : ''}</span></label>`).join('')}</div>
    <p class="peq apagado mt">Cada módulo usa o mais específico: o só dele; se não tiver, o da turma; se não tiver, o de todas as turmas.</p>
    <div id="qr-obs" class="mt" role="status"></div>
    <div class="linha mt"><button class="btn pri" type="button" id="qr-salvar">Salvar</button></div>
    ${Object.keys(qr.niveis).length ? `<div class="mt2"><p class="peq"><b>QR codes que já existem para este módulo</b></p><div class="lista mt">${ORDEM.filter((k) => qr.niveis[k]).map((k) => `<div class="item" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><div class="nome">${NIVEL[k]}${qr.vale === qr.niveis[k] ? ' <span class="selo">é o que vale aqui</span>' : ''}</div><div class="info">${esc(alvo[k])} · atualizado em ${dataBR(qr.niveis[k].atualizado_em)}</div></div>
      <button class="btn peq perigo" type="button" data-qr-tirar="${k}">Tirar</button></div>`).join('')}</div></div>` : ''}`, { largura: 640 });

  let arquivo = null;
  const nivel = () => j.corpo.querySelector('input[name=qr-nivel]:checked').value;
  const atualizarNivel = () => {
    const k = nivel();
    const ex = qr.niveis[k];
    j.corpo.querySelector('#qr-link').value = (ex && ex.link) || '';
    const maisEspecifico = ORDEM.slice(0, ORDEM.indexOf(k)).find((x) => qr.niveis[x]);
    const obs = [];
    if (ex) obs.push(arquivo ? `A imagem nova substitui a que já vale para "${NIVEL[k].toLowerCase()}".` : 'Sem escolher imagem nova, só o link muda.');
    if (maisEspecifico) obs.push(`Atenção: aqui continua valendo o QR code de "${NIVEL[maisEspecifico].toLowerCase()}". Para este módulo usar o novo, tire aquele na lista abaixo.`);
    j.corpo.querySelector('#qr-obs').innerHTML = obs.length ? `<div class="aviso peq">${obs.map(esc).join('<br>')}</div>` : '';
  };
  atualizarNivel();
  j.corpo.querySelectorAll('input[name=qr-nivel]').forEach((r) => r.addEventListener('change', atualizarNivel));

  j.corpo.querySelector('#qr-arquivo').addEventListener('change', (ev) => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    if (f.type && !f.type.startsWith('image/')) { avisar('Escolha uma imagem (PNG ou JPG). Se o QR code estiver em PDF, tire um print dele.', true); return; }
    arquivo = f;
    const previa = j.corpo.querySelector('#qr-previa');
    previa.src = URL.createObjectURL(f); previa.hidden = false;
    j.corpo.querySelector('#qr-nome').textContent = f.name;
    atualizarNivel();
  });

  j.corpo.querySelector('#qr-salvar').addEventListener('click', async (ev) => {
    const k = nivel();
    const ex = qr.niveis[k];
    const antigo = ex && ex.caminho;
    let link = j.corpo.querySelector('#qr-link').value.trim();
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    if (!arquivo && !ex) { avisar('Escolha a imagem do QR code.', true); return; }
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Salvando…';
    let novo = null;
    try {
      const dados = { escopo: k, turma_id: k === 'turma' ? m.turma.id : null, modulo_id: k === 'modulo' ? m.id : null, link: link || null,
        atualizado_por: ctx.perfil.id, atualizado_em: new Date().toISOString() };
      if (arquivo) {
        const { blob, ext, tipo } = await prepararImagem(arquivo);
        const pasta = k === 'geral' ? 'geral' : k === 'turma' ? `turma-${m.turma.id}` : `modulo-${m.id}`;
        novo = `avaliacao/${pasta}/${Date.now()}-qr-avaliacao.${ext}`;
        const up = await sb.storage.from('turmas').upload(novo, blob, { contentType: tipo });
        if (up.error) throw up.error;
        Object.assign(dados, { caminho: novo, nome: arquivo.name });
      }
      const r = ex ? await sb.from('qr_avaliacao').update(dados).eq('id', ex.id) : await sb.from('qr_avaliacao').insert(dados);
      if (r.error) throw r.error;
      if (novo && antigo) await sb.storage.from('turmas').remove([antigo]);   // a imagem antiga sai da pasta
      j.fechar();
      avisar(k === 'geral' ? 'QR code salvo para todas as turmas.' : k === 'turma' ? 'QR code salvo para todos os módulos desta turma.' : 'QR code salvo para este módulo.');
      recarregar();
    } catch (e) {
      if (novo) sb.storage.from('turmas').remove([novo]);
      btn.disabled = false; btn.textContent = 'Salvar';
      avisar(/mime|not allowed/i.test(String((e && e.message) || e)) ? 'A pasta ainda não aceita imagens: falta rodar o script 30-qr-avaliacao.sql no Supabase.' : explicarErro(e), true);
    }
  });

  j.corpo.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-qr-tirar]'); if (!b) return;
    const k = b.dataset.qrTirar;
    const q = qr.niveis[k];
    const proximo = ORDEM.slice(ORDEM.indexOf(k) + 1).find((x) => qr.niveis[x]);
    const depois = qr.vale === q ? (proximo ? `Este módulo passa a usar o de "${NIVEL[proximo].toLowerCase()}".` : 'Este módulo fica sem QR code.') : '';
    if (!window.confirm(`Tirar o QR code de "${NIVEL[k].toLowerCase()}" (${alvo[k]})? ${depois}`)) return;
    const r = await sb.from('qr_avaliacao').delete().eq('id', q.id);
    if (r.error) { avisar(explicarErro(r.error), true); return; }
    await sb.storage.from('turmas').remove([q.caminho]);
    j.fechar(); avisar('QR code tirado.'); recarregar();
  });
}
