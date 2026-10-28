// Assinaturas dos certificados (script 47, tabela cert_assinaturas, pasta privada "certificados/assinaturas/<id>/").
// Envia a foto uma vez: o navegador tira o fundo (assinatura.js, o mesmo cálculo da referência) e guarda as duas versões
// (tinta azul-petróleo para o padrão claro, tinta bege para o escuro) junto com a foto original. Só com o aceite de autorização.
// A lista é reaproveitada em qualquer pasta; excluir só tira da lista (certificado já emitido continua com a imagem).
// "Não salvar na lista" grava a assinatura já fora da lista (excluido_em), para ela servir só na pasta em que foi enviada.
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';
import { janela } from './agenda-dados.js';
import { prepararAssinatura } from '../assinatura.js';

const BALDE = 'certificados';
const LADOS = { mentorei: 'Pela Mentorei', cliente: 'Pelo cliente' };
const links = new Map();   // caminho → endereço temporário (1 hora)

// endereços temporários das imagens (a pasta é privada: nunca há link público de assinatura)
export async function linksDas(assinaturas) {
  const faltam = [...new Set(assinaturas.flatMap((a) => [a.clara_caminho, a.escura_caminho]).filter((c) => c && !links.has(c)))];
  if (faltam.length) {
    const { data, error } = await sb.storage.from(BALDE).createSignedUrls(faltam, 3600);
    if (error) throw error;
    (data || []).forEach((d) => { if (d.signedUrl) links.set(d.path, d.signedUrl); });
  }
  assinaturas.forEach((a) => { a.url = { clara: links.get(a.clara_caminho) || '', escura: links.get(a.escura_caminho) || '' }; });
  return assinaturas;
}

// as da lista + as que a pasta já usa (mesmo se saíram da lista)
export async function carregarAssinaturas(usadas = []) {
  const ids = usadas.filter(Boolean);
  const [lista, extras] = await Promise.all([
    sb.from('cert_assinaturas').select('*').is('excluido_em', null).order('nome'),
    ids.length ? sb.from('cert_assinaturas').select('*').in('id', ids) : Promise.resolve({ data: [] }),
  ]);
  if (lista.error) throw lista.error;
  const todas = [...(lista.data || [])];
  (extras.data || []).forEach((a) => { if (!todas.some((x) => x.id === a.id)) todas.push(a); });
  return linksDas(todas);
}

const amostras = (a) => `<div class="ct-ass">
  <div class="ct-ass-amostra clara" title="No padrão claro">${a && a.url && a.url.clara ? `<img src="${esc(a.url.clara)}" alt="Assinatura no padrão claro">` : '<span>sem assinatura</span>'}</div>
  <div class="ct-ass-amostra escura" title="No padrão escuro">${a && a.url && a.url.escura ? `<img src="${esc(a.url.escura)}" alt="Assinatura no padrão escuro">` : '<span>sem assinatura</span>'}</div></div>`;
export { amostras as amostrasAssinatura };

// ---------- enviar uma assinatura ----------
// inicial: { nome, cargo, lado, empresa_id }; aoUsar(assinatura gravada, com .url)
export function janelaEnviar(ctx, inicial, aoUsar) {
  let pronta = null, arquivo = null;
  const j = janela('Enviar assinatura', `<div class="grade" style="gap:14px">
    <label class="ct-solta"><input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" hidden>
      <b>Escolha a foto ou o escaneamento da assinatura</b><small>Caneta escura em papel branco, sem pauta. Foto de celular serve (JPG, PNG, WEBP ou HEIC do iPhone).</small></label>
    <div id="as-res"></div>
    <div class="grade g2" style="gap:12px"><div class="campo"><label for="as-nome">Nome de quem assina *</label><input id="as-nome" type="text"></div>
      <div class="campo"><label for="as-cargo">Cargo</label><input id="as-cargo" type="text" placeholder="Ex.: Sócia · Mentorei"></div></div>
    <div class="campo"><span class="rotulo">Assina</span><div class="ct-seg" id="as-lado">${Object.entries(LADOS).map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}</div></div>
    <label class="check"><input type="checkbox" id="as-salvar" checked><span>Salvar na lista de assinaturas, para usar em outras pastas</span></label>
    <label class="check"><input type="checkbox" id="as-aut"><span>Tenho autorização desta pessoa para usar a assinatura dela nos certificados</span></label>
    <p class="peq apagado">É uma imagem da assinatura, para o acabamento do certificado (não é assinatura digital). Quem garante que o certificado é verdadeiro é a verificação pelo código.</p>
    <div class="linha" style="justify-content:flex-end"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn pri" type="button" id="as-usar" disabled>Usar esta assinatura</button></div></div>`, { largura: 640 });
  const $ = (s) => j.corpo.querySelector(s);
  let lado = inicial.lado === 'cliente' ? 'cliente' : 'mentorei';
  $('#as-nome').value = inicial.nome || ''; $('#as-cargo').value = inicial.cargo || '';
  const marcarLado = () => j.corpo.querySelectorAll('#as-lado button').forEach((b) => b.classList.toggle('on', b.dataset.v === lado));
  j.corpo.querySelectorAll('#as-lado button').forEach((b) => b.addEventListener('click', () => {
    lado = b.dataset.v; marcarLado();
    $('#as-cargo').placeholder = lado === 'cliente' ? 'Ex.: Diretora de Pessoas · Sicoob Exemplo' : 'Ex.: Sócia · Mentorei';
  }));
  marcarLado();
  const pode = () => { $('#as-usar').disabled = !(pronta && $('#as-aut').checked && $('#as-nome').value.trim()); };
  ['#as-aut', '#as-nome'].forEach((s) => $(s).addEventListener('input', pode));
  $('#as-aut').addEventListener('change', pode);

  $('.ct-solta input').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
    ev.target.value = '';
    if (arq.size > 20 * 1024 * 1024) { avisar('A foto é grande demais (máximo 20 MB).', true); return; }
    pronta = null; arquivo = arq; pode();
    $('#as-res').innerHTML = '<p class="peq apagado">Preparando a assinatura: tirando o fundo e ajustando a cor…</p>';
    try {
      pronta = await prepararAssinatura(arq);
      $('#as-res').innerHTML = `<p class="peq"><b>Pronta.</b> Assim ela aparece nos dois padrões:</p>
        ${amostras({ url: { clara: pronta.clara.url, escura: pronta.escura.url } })}`;
    } catch (e) {
      $('#as-res').innerHTML = `<div class="aviso erro">${esc(e.message || explicarErro(e))}</div>`;
    }
    pode();
  });

  $('#as-usar').addEventListener('click', async () => {
    const b = $('#as-usar'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      const id = crypto.randomUUID();
      const ext = (String(arquivo.name || '').match(/\.([a-z0-9]{2,5})$/i) || [, 'jpg'])[1].toLowerCase();
      const tipo = arquivo.type || ({ heic: 'image/heic', heif: 'image/heif', png: 'image/png', webp: 'image/webp' }[ext] || 'image/jpeg');
      const pasta = `assinaturas/${id}`;
      const env = (caminho, blob, contentType) => sb.storage.from(BALDE).upload(caminho, blob, { contentType, upsert: false })
        .then(({ error }) => { if (error) throw error; });
      await Promise.all([
        env(`${pasta}/original.${ext}`, arquivo, tipo),
        env(`${pasta}/clara.png`, pronta.clara.blob, 'image/png'),
        env(`${pasta}/escura.png`, pronta.escura.blob, 'image/png'),
      ]);
      const agora = new Date().toISOString();
      const linha = {
        id, nome: $('#as-nome').value.trim(), cargo: $('#as-cargo').value.trim() || null, lado,
        empresa_id: lado === 'cliente' ? (inicial.empresa_id || null) : null,
        original_caminho: `${pasta}/original.${ext}`, clara_caminho: `${pasta}/clara.png`, escura_caminho: `${pasta}/escura.png`,
        largura: pronta.largura, altura: pronta.altura,
        autorizacao_confirmada_por: ctx.perfil.id, autorizacao_em: agora,
        ...($('#as-salvar').checked ? {} : { excluido_em: agora, excluido_por: ctx.perfil.id }),
      };
      const { data, error } = await sb.from('cert_assinaturas').insert(linha).select('*').single();
      if (error) throw error;
      const gravada = data || linha;
      links.set(gravada.clara_caminho, pronta.clara.url); links.set(gravada.escura_caminho, pronta.escura.url);
      gravada.url = { clara: pronta.clara.url, escura: pronta.escura.url };
      avisar($('#as-salvar').checked ? 'Assinatura guardada na lista.' : 'Assinatura colocada nesta pasta.');
      j.fechar();
      aoUsar(gravada);
    } catch (e) { avisar(explicarErro(e), true); b.disabled = false; b.textContent = 'Usar esta assinatura'; }
  });
  return j;
}

// ---------- assinaturas salvas (na lista de pastas) ----------
export async function janelaLista(ctx) {
  const j = janela('Assinaturas salvas', '<p class="peq apagado">Carregando…</p>', { largura: 820 });
  const desenhar = async () => {
    let lista;
    try { lista = (await carregarAssinaturas()).filter((a) => !a.excluido_em); } catch (e) { j.corpo.innerHTML = `<div class="aviso erro">${esc(explicarErro(e))}</div>`; return; }
    const { data: perfis } = await sb.from('perfis').select('id, nome').in('id', [...new Set(lista.map((a) => a.criado_por).filter(Boolean))]);
    const quem = (id) => ((perfis || []).find((p) => p.id === id) || {}).nome || '';
    j.corpo.innerHTML = `<p class="peq apagado">Envie a assinatura uma vez e use em qualquer pasta. Excluir tira da lista; os certificados já emitidos continuam com ela.</p>
      <div class="linha mt"><button class="btn pri" type="button" data-nova>+ Enviar assinatura</button></div>
      ${lista.length ? `<div class="ct-ass-lista mt">${lista.map((a) => `<div class="ct-ass-item">${amostras(a)}
          <div><b>${esc(a.nome)}</b>${a.cargo ? `<div class="peq">${esc(a.cargo)}</div>` : ''}
            <div class="peq apagado">${LADOS[a.lado] || ''} · enviada em ${esc(dataBR(a.criado_em))}${quem(a.criado_por) ? ` por ${esc(quem(a.criado_por))}` : ''}</div></div>
          <button class="btn peq perigo" type="button" data-excluir="${a.id}">Excluir</button></div>`).join('')}</div>`
        : '<div class="vazio mt">Nenhuma assinatura salva ainda.</div>'}`;
  };
  j.corpo.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-nova]')) { janelaEnviar(ctx, {}, () => desenhar()); return; }
    const b = ev.target.closest('[data-excluir]'); if (!b) return;
    if (!window.confirm('Excluir esta assinatura da lista? Os certificados já emitidos continuam com ela.')) return;
    b.disabled = true;
    const { error } = await sb.from('cert_assinaturas').update({ excluido_em: new Date().toISOString(), excluido_por: ctx.perfil.id }).eq('id', b.dataset.excluir);
    if (error) { avisar(explicarErro(error), true); b.disabled = false; return; }
    avisar('Assinatura tirada da lista.');
    desenhar();
  });
  desenhar();
}
