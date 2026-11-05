// Arquivos que o mentor manda para o mentorado (script 66, tabela "arquivos_mentorado", pasta privada "entregas" em
// "<mentorado>/do-mentor/…"): PowerPoint, PDF, Word, Excel ou foto, pela tela da sessão ou pela ficha. O mentorado baixa em
// Minha mentoria; a primeira vez que ele baixa fica marcada (rpc marcar_arquivo_baixado) e a equipe vê "Baixado em…".
// Mandam: os mentores do mentorado e a administração; apaga quem mandou (ou a administração).
import { sb, esc, dataHoraBR, diaMes, avisar, explicarErro } from './base.js';

const TAMANHO_MAX = 52428800; // 50 MB por arquivo (script 66)
const TIPO_POR_EXT = {
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odp: 'application/vnd.oasis.opendocument.presentation', odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain', csv: 'text/csv', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
const ACEITA = Object.keys(TIPO_POR_EXT).map((e) => `.${e}`).join(',');
const extDe = (n) => (String(n).split('.').pop() || '').toLowerCase();
const icone = (n) => ({ ppt: '📊', pptx: '📊', odp: '📊', pdf: '📄', xls: '📈', xlsx: '📈', ods: '📈', csv: '📈', jpg: '🖼', jpeg: '🖼', png: '🖼', webp: '🖼' }[extDe(n)] || '📝');
const nomeSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-90);
const tamanhoTexto = (b) => (!b ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const faltaTabela = (e) => !!e && /arquivos_mentorado|does not exist|Could not find|schema cache|42P01|PGRST20[45]/i.test(`${e.code || ''} ${e.message || ''}`);

// Lê os arquivos de um mentorado (ou, sem id, os que o mentorado logado pode ver). Sem o script 66: { existe: false, lista: [] }.
export async function carregarArquivosMentorado(mentoradoId = null) {
  let q = sb.from('arquivos_mentorado').select('*, por:perfis(nome)');
  if (mentoradoId) q = q.eq('mentorado_id', mentoradoId);
  const { data, error } = await q.order('enviado_em', { ascending: false });
  if (error) {
    if (!faltaTabela(error)) console.warn('Arquivos para o mentorado:', error);
    return { existe: false, lista: [] };
  }
  return { existe: true, lista: data || [] };
}

async function baixar(a) {
  const aba = window.open('', '_blank');
  const { data, error } = await sb.storage.from('entregas').createSignedUrl(a.caminho, 300, { download: a.nome });
  if (error) { if (aba) aba.close(); avisar(explicarErro(error), true); return false; }
  if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
  return true;
}

// ---------- equipe (sessão e ficha) ----------
// Bloco com a lista e o botão "Enviar arquivo". Vai dentro de um cartão; ligarArquivosEquipe() faz os cliques.
export function htmlArquivosEquipe({ existe, pode, ehAdmin }) {
  if (!existe) {
    return ehAdmin ? '<p class="peq apagado mt">Para mandar PowerPoint, PDF e outros arquivos ao mentorado, falta rodar no Supabase o script 66-arquivos-para-o-mentorado.sql.</p>'
      : '<p class="peq apagado mt">Mandar arquivos (PowerPoint, PDF…) ao mentorado ainda não foi ligado na plataforma. Avise a Cintia.</p>';
  }
  return `<div data-am-lista></div>
    ${pode ? '<div class="linha mt"><button type="button" class="btn peq pri" data-am-enviar>📎 Enviar arquivo (PowerPoint, PDF, Word…)</button></div>' : ''}`;
}

export function ligarArquivosEquipe(raiz, { ctx, mentorado, sessaoId = null, lista, vazio = 'Nenhum arquivo enviado ainda.' }) {
  const caixa = raiz.querySelector('[data-am-lista]');
  if (!caixa) return;
  const meus = () => (sessaoId ? lista.filter((a) => a.sessao_id === sessaoId) : lista);
  const desenhar = () => {
    const xs = meus();
    caixa.innerHTML = xs.length ? `<div class="lista mt">${xs.map((a) => `<div class="item" style="grid-template-columns:1fr auto" data-am="${a.id}">
        <div style="min-width:0"><div class="nome" style="word-break:break-word">${icone(a.nome)} ${esc(a.nome)}</div>
          <div class="info">${tamanhoTexto(a.tamanho)}${a.por && a.por.nome ? ` · ${esc(a.por.nome)}` : ''} · ${dataHoraBR(a.enviado_em)}
            · ${a.baixado_em ? `<span class="selo">Baixado em ${diaMes(a.baixado_em)}</span>` : '<span class="selo neutro">Ainda não baixado</span>'}</div>
          ${a.recado ? `<p class="peq mt" style="white-space:pre-wrap">${esc(a.recado)}</p>` : ''}</div>
        <div class="linha" style="gap:6px"><button type="button" class="btn peq" data-am-baixar="${a.id}">Baixar</button>
          ${ctx.ehAdmin || a.enviado_por === ctx.perfil.id ? `<button type="button" class="btn peq" data-am-apagar="${a.id}" aria-label="Apagar ${esc(a.nome)}">✕</button>` : ''}</div>
      </div>`).join('')}</div>` : `<p class="peq apagado mt">${vazio}</p>`;
  };
  desenhar();

  raiz.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-am-enviar]')) {
      janelaEnviar(ctx, mentorado, sessaoId, (novos) => { lista.unshift(...novos); desenhar(); });
      return;
    }
    const dl = ev.target.closest('[data-am-baixar]');
    if (dl) { const a = lista.find((x) => x.id === dl.dataset.amBaixar); if (a) baixar(a); return; }
    const ap = ev.target.closest('[data-am-apagar]');
    if (ap) {
      const a = lista.find((x) => x.id === ap.dataset.amApagar); if (!a) return;
      if (!window.confirm(`Apagar "${a.nome}"? O mentorado deixa de ver.`)) return;
      ap.disabled = true;
      const { error } = await sb.from('arquivos_mentorado').delete().eq('id', a.id);
      if (error) { avisar(explicarErro(error), true); ap.disabled = false; return; }
      await sb.storage.from('entregas').remove([a.caminho]);
      lista.splice(lista.indexOf(a), 1);
      desenhar(); avisar('Arquivo apagado.');
    }
  });
}

// mentorado = { id, nome, perfil: { whatsapp, autorizacoes, termo_aceito_em } }
function janelaEnviar(ctx, mentorado, sessaoId, aoEnviar) {
  const primeiro = String(mentorado.nome || '').split(' ')[0];
  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(9,18,22,.55);z-index:40;display:grid;place-items:center;padding:16px';
  fundo.innerHTML = `<div class="cartao" role="dialog" aria-modal="true" aria-label="Enviar arquivo para ${esc(primeiro)}" style="width:100%;max-width:540px;max-height:90vh;overflow:auto">
    <div class="linha"><h3 style="flex:1">Enviar arquivo para ${esc(primeiro)}</h3><button class="btn peq" data-fechar>Fechar</button></div>
    <div id="am-form">
      <p class="peq apagado mt">O arquivo aparece na área de ${esc(primeiro)} (Minha mentoria), para baixar. Só ${esc(primeiro)}, os mentores do programa e a equipe da Mentorei veem.</p>
      <div class="campo mt"><label for="am-arquivos">Arquivos</label>
        <input id="am-arquivos" type="file" multiple accept="${ACEITA}">
        <p class="peq apagado">PowerPoint, PDF, Word, Excel ou foto, até 50 MB cada. Dá para escolher vários.</p></div>
      <div class="lista mt" id="am-escolhidos"></div>
      <div class="campo mt"><label for="am-recado">Recado para ${esc(primeiro)} (opcional)</label>
        <textarea id="am-recado" style="min-height:70px" placeholder="Ex.: Preencha os slides 3 e 4 antes da próxima sessão."></textarea></div>
      <div class="linha mt"><button class="btn pri" id="am-mandar">Enviar</button><span class="peq apagado" id="am-prog" role="status"></span></div>
    </div>
    <div id="am-depois"></div>
  </div>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });

  let escolhidos = [];
  const desenhar = () => {
    fundo.querySelector('#am-escolhidos').innerHTML = escolhidos.map((f, i) => `<div class="linha peq" style="gap:8px"><span style="flex:1;min-width:0;overflow-wrap:anywhere">${icone(f.name)} ${esc(f.name)} <span class="apagado">· ${tamanhoTexto(f.size)}</span></span>
      <button type="button" class="btn peq" data-tirar="${i}" aria-label="Tirar ${esc(f.name)}">✕</button></div>`).join('');
  };
  const entrada = fundo.querySelector('#am-arquivos');
  entrada.addEventListener('change', () => {
    for (const f of entrada.files) {
      if (!TIPO_POR_EXT[extDe(f.name)]) { avisar(`"${f.name}" não é um tipo aceito. Envie PowerPoint, PDF, Word, Excel ou foto.`, true); continue; }
      if (f.size > TAMANHO_MAX) { avisar(`"${f.name}" passa de 50 MB. No PowerPoint: Arquivo → Compactar mídia (ou reduza as imagens) e tente de novo.`, true); continue; }
      if (!escolhidos.some((x) => x.name === f.name && x.size === f.size)) escolhidos.push(f);
    }
    entrada.value = ''; desenhar();
  });
  fundo.querySelector('#am-escolhidos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tirar]'); if (!b) return;
    escolhidos.splice(Number(b.dataset.tirar), 1); desenhar();
  });

  fundo.querySelector('#am-mandar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget, prog = fundo.querySelector('#am-prog');
    if (!escolhidos.length) { avisar('Escolha o arquivo.', true); return; }
    const recado = fundo.querySelector('#am-recado').value.trim() || null;
    btn.disabled = true;
    const novos = [];
    try {
      for (const [i, f] of escolhidos.entries()) {
        prog.textContent = escolhidos.length > 1 ? `Enviando ${i + 1} de ${escolhidos.length}…` : `Enviando ${f.name}…`;
        const tipo = TIPO_POR_EXT[extDe(f.name)];
        const caminho = `${mentorado.id}/do-mentor/${Date.now()}-${i + 1}-${nomeSeguro(f.name)}`;
        const up = await sb.storage.from('entregas').upload(caminho, f, { contentType: tipo });
        if (up.error) throw up.error;
        const { data, error } = await sb.from('arquivos_mentorado').insert({ mentorado_id: mentorado.id, sessao_id: sessaoId, nome: f.name, caminho,
          tamanho: f.size, tipo, recado, enviado_por: ctx.perfil.id }).select('*').single();
        if (error) { await sb.storage.from('entregas').remove([caminho]); throw error; }
        novos.push({ enviado_em: new Date().toISOString(), ...data, por: { nome: ctx.perfil.nome } });
      }
    } catch (e) {
      prog.textContent = ''; btn.disabled = false;
      const msg = `${e && e.message}`;
      avisar(faltaTabela(e) ? 'Falta rodar no Supabase o script 66-arquivos-para-o-mentorado.sql.'
        : /exceeded|too large|413|maximum allowed size/i.test(msg) ? 'O arquivo passa do limite da pasta. Falta rodar no Supabase o script 66 (ele aumenta o limite para 50 MB).'
        : explicarErro(e), true);
      if (novos.length) aoEnviar(novos);
      return;
    }
    aoEnviar(novos);
    avisar(novos.length > 1 ? `${novos.length} arquivos enviados.` : 'Arquivo enviado.');
    // depois de enviar: avisar pelo WhatsApp, se ele autorizou (mesma regra das ferramentas)
    const p = mentorado.perfil || {};
    const whats = (p.whatsapp || '').replace(/\D/g, '');
    const autorizou = p.autorizacoes && p.autorizacoes.whatsapp;
    const nomes = novos.map((a) => `"${a.nome}"`).join(', ');
    const texto = `Olá, ${primeiro}! Enviei para você ${novos.length > 1 ? `os arquivos ${nomes}` : `o arquivo ${nomes}`}. Está na sua área da plataforma de mentorias: ${location.origin}/app.html#/minha-area`;
    fundo.querySelector('#am-form').hidden = true;
    fundo.querySelector('#am-depois').innerHTML = `<div class="aviso ok mt">Enviado para ${esc(mentorado.nome)}.</div>
      ${!p.termo_aceito_em ? `<p class="peq apagado mt">${esc(primeiro)} ainda não entrou na plataforma. Vai ver o arquivo quando entrar.</p>`
        : whats && autorizou ? `<div class="linha mt"><a class="btn" href="https://wa.me/55${whats.replace(/^55/, '')}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Avisar pelo WhatsApp</a></div>`
        : `<p class="peq apagado mt">${esc(primeiro)} não autorizou mensagens por WhatsApp. O arquivo já está na área de ${esc(primeiro)}.</p>`}
      <div class="linha mt"><button class="btn peq" data-fechar>Fechar</button></div>`;
  });
}

// ---------- mentorado (Minha mentoria) ----------
export function htmlArquivosParaMim(lista) {
  return `<div class="lista">${lista.map((a) => `<div class="item" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><b style="word-break:break-word">${icone(a.nome)} ${esc(a.nome.replace(/\.[^.]+$/, ''))}</b>
        <p class="peq apagado">${a.por && a.por.nome ? `${esc(a.por.nome)} · ` : ''}${diaMes(a.enviado_em)}${a.tamanho ? ` · ${tamanhoTexto(a.tamanho)}` : ''}</p>
        ${a.recado ? `<p class="peq" style="white-space:pre-wrap">${esc(a.recado)}</p>` : ''}</div>
      <div class="linha" style="gap:6px"><button type="button" class="btn peq pri" data-am-meu="${a.id}">Baixar</button></div></div>`).join('')}</div>`;
}

export function ligarArquivosParaMim(raiz, lista) {
  raiz.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-am-meu]'); if (!b) return;
    const a = lista.find((x) => x.id === b.dataset.amMeu); if (!a) return;
    if (await baixar(a) && !a.baixado_em) {
      a.baixado_em = new Date().toISOString();
      sb.rpc('marcar_arquivo_baixado', { p_id: a.id }).then(({ error }) => { if (error) console.warn('Marcar como baixado:', error); });
    }
  });
}
