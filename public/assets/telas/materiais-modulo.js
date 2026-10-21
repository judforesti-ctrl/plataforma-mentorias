// Materiais necessários no módulo da turma (script 40): checklist de ferramentas, áudio e vídeo e materiais de apoio da aula.
// Três jeitos de montar: item por item, colar uma lista (um item por linha; títulos como "Ferramentas:" separam as partes)
// ou ler de um arquivo (Word, Excel, PDF, PowerPoint ou texto), sempre com prévia para conferir antes de gravar.
// Arquivos de apoio (vídeo, áudio, apostila, a própria lista) ficam anexados em "turmas/<módulo>/material/".
// A administração e o mentor do módulo editam e marcam como pronto; os outros mentores da turma só leem.
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';

export const CATEGORIAS = [
  ['ferramenta', '🧰 Ferramentas'],
  ['audio_video', '🎙️ Áudio e vídeo'],
  ['apoio', '📚 Materiais de apoio'],
  ['outro', '📌 Outros'],
];
const NOME_CAT = Object.fromEntries(CATEGORIAS);
const ORDEM_CAT = Object.fromEntries(CATEGORIAS.map(([k], i) => [k, i]));
const QUEM = { mentorei: 'Mentorei', mentor: 'Mentor', cliente: 'Cliente' };

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const URL_RE = /https?:\/\/[^\s<>"']+/i;
const nomeSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-90);

// ---------- ler uma lista colada ou tirada de um arquivo ----------
// título de parte ("Ferramentas", "Recursos de áudio e vídeo:", "MATERIAL DE APOIO") → categoria
const TITULOS = [
  ['ferramenta', /^(as )?ferramentas?( (da aula|do modulo|online|para usar|a usar|utilizadas|necessarias))?$/],
  ['audio_video', /^((recursos|equipamentos?) (de )?)?(audio|som|video|audio ?e ?video|audio ?\/ ?video|audiovisua(l|is)|multimidia)( e (som|video|imagem))?$|^equipamentos?$|^tecnologia$/],
  ['apoio', /^((os )?materia(l|is)( (de apoio|impressos?|didaticos?|para os participantes))?|apoio|papelaria|impressos?)$/],
  ['outro', /^(outros?|diversos|demais itens)$/],
];
// com dois-pontos no fim ("Ferramentas para usar no módulo:") basta o começo bater
const TITULOS_COM_DOIS_PONTOS = [
  ['ferramenta', /^(as )?ferramentas?\b/],
  ['audio_video', /^((recursos|equipamentos?) (de )?)?(audio|video|som|audiovisua|multimidia)|^equipamentos?\b/],
  ['apoio', /^((os )?materia(l|is) (de apoio|impress|didatic|para (os )?participantes)|apoio\b|papelaria|impressos?\b|kit\b)/],
  ['outro', /^(outros?|diversos|demais)\b/],
];
// título da lista inteira ("Materiais do módulo", "Checklist da aula 3"): não é item nem parte
const TITULO_GERAL = /^(lista( de)? (materiais|itens|recursos)|check ?list|materiais (do modulo|da aula|do encontro|necessarios)|itens necessarios|recursos necessarios|o que (levar|precisa))\b/;
function categoriaDoTitulo(t, comDoisPontos = false) {
  const x = norm(t).replace(/[:\-–—]+$/, '').replace(/^[^a-z0-9]+/, '').trim();
  const achado = TITULOS.find(([, re]) => re.test(x)) || (comDoisPontos ? TITULOS_COM_DOIS_PONTOS.find(([, re]) => re.test(x)) : null);
  return achado ? achado[0] : null;
}
// sem título: adivinha pelo nome do item (ela confere na prévia)
const PALAVRAS = [
  ['audio_video', /\b(microfones?|mic|caixas? de som|som|audio|videos?|projetor|datashow|data show|telao|tela|tv|televis\w*|notebook|computador|laptop|hdmi|vga|cabos?|adaptador\w*|passador( de slides?)?|clicker|camera|webcam|fones?|headset|internet|wi-?fi|extensao|tomadas?|filtro de linha|playlist|musicas?|spotify|youtube|vimeo|iluminacao|ring light|zoom|meet|teams)\b/],
  ['ferramenta', /\b(ferramentas?|canvas|roda|matriz|teste|assessment|disc|quiz|kahoot|mentimeter|menti|miro|mural|padlet|slido|jamboard|formularios?|forms|planilhas?|templates?|dinamicas?|baralho|cartas|jogo|mnt-\w+)\b/],
  ['apoio', /\b(apostilas?|impress\w*|copias?|folhas?|papel|papeis|canetas?|canetinhas?|pinceis|pincel|marcador\w*|post-?its?|flip ?charts?|cartolinas?|fitas?|crachas?|kits?|cadernos?|blocos?|lapis|tesouras?|colas?|envelopes?|pastas?|livros?|leituras?|artigos?|e-?books?|pdf|handouts?|certificados?|brindes?|cartaz\w*|banners?|materia(l|is)|lousa|quadro branco)\b/],
];
export function adivinharCategoria(texto) {
  const x = norm(texto);
  const achado = PALAVRAS.find(([, re]) => re.test(x));
  return achado ? achado[0] : 'outro';
}
const MARCADO = /^(x|ok|sim|s|✓|✔|✅|☑|☒|feito|pronto|separado|ok!)$/i;
const CABECALHO = /^(item|itens|material|materiais|categoria|tipo|descricao|quantidade|qtd|status|ok|responsavel|quem|quem providencia|observacoes?|obs|separado|pronto|feito|conferido|providenciado|check|checklist|link|onde)$/;
const ehCabecalho = (c) => CABECALHO.test(norm(c).replace(/[^a-z ]/g, '').trim());

// devolve [{ categoria, texto, pronto }] na ordem da lista; linhas vazias, marcadores e títulos somem
export function lerLista(texto) {
  const itens = [];
  let atual = null;   // categoria do último título visto
  const incluir = (t, pronto, cat) => {
    const limpo = String(t || '').replace(/\s+/g, ' ').trim().replace(/[;,.]$/, '').trim();
    if (!limpo || limpo.length < 2) return;
    itens.push({ categoria: cat || atual || adivinharCategoria(limpo), texto: limpo.slice(0, 300), pronto: !!pronto });
  };
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    if (/^\s*-{2,} *(pagina|slide)\b/i.test(norm(bruta))) continue;   // marcadores de página da leitura de PDF/PowerPoint
    // linha de planilha (colunas separadas por tabulação)
    if (bruta.includes('\t')) {
      let cel = bruta.split('\t').map((c) => c.trim()).filter(Boolean);
      if (!cel.length || cel.every(ehCabecalho)) continue;
      let pronto = false;
      cel = cel.filter((c, i) => { if (i > 0 && MARCADO.test(c)) { pronto = true; return false; } return true; });
      const catCelula = cel.length > 1 ? cel.map(categoriaDoTitulo).find(Boolean) : null;
      if (catCelula) cel = cel.filter((c) => !categoriaDoTitulo(c));
      else if (cel.length === 1 && categoriaDoTitulo(cel[0])) { atual = categoriaDoTitulo(cel[0]); continue; }
      incluir(limparMarcador(cel.join(' — ')).texto, pronto || limparMarcador(cel[0]).pronto, catCelula);
      continue;
    }
    const { texto: linha, pronto } = limparMarcador(bruta);
    if (!linha) continue;
    if (linha.length <= 60 && TITULO_GERAL.test(norm(linha))) { atual = null; continue; }
    // "Ferramentas: Roda da Vida, Canvas" → título com os itens na mesma linha
    const dois = linha.match(/^([^:]{2,45}):\s*(.*)$/);
    if (dois && !URL_RE.test(dois[1])) {
      if (/^obs(ervac\w+)?\.?$/.test(norm(dois[1])) && dois[2].trim()) { incluir(linha, pronto, 'outro'); continue; }   // "Obs: chegar 40 min antes"
      const cat = categoriaDoTitulo(dois[1], true);
      if (cat) {
        atual = cat;
        if (dois[2].trim()) dois[2].split(/\s*[;,]\s*/).forEach((p) => incluir(limparMarcador(p).texto, pronto));
        continue;
      }
      if (!dois[2].trim() && linha.length <= 46) { atual = null; continue; }   // título geral ("Lista do módulo 3:"): volta a adivinhar
    }
    const cat = categoriaDoTitulo(linha);
    if (cat && linha.length <= 50) { atual = cat; continue; }
    incluir(linha, pronto);
  }
  // tira repetidos (mesmo texto na mesma lista)
  const vistos = new Set();
  return itens.filter((i) => { const k = norm(i.texto); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

// tira "-", "•", "1.", "a)", "[ ]", "[x]", "☐", "☑"... do começo; [x] e ☑ viram "pronto"
function limparMarcador(s) {
  let t = String(s || '').trim(), pronto = false;
  for (let i = 0; i < 3; i++) {
    const antes = t;
    t = t.replace(/^\[\s*[xX✓✔]\s*\]\s*/, () => { pronto = true; return ''; })
      .replace(/^\[\s*\]\s*/, '')
      .replace(/^[☑☒✅✔✓]️?\s*/u, () => { pronto = true; return ''; })
      .replace(/^(?:[-–—•*·▪◦●○■□➢➤►▶✗☐⬜🔲]️?|\d{1,3}[.)-](?!\d)|[a-z][.)](?=\s))\s*/iu, '');
    if (t === antes) break;
  }
  return { texto: t.trim(), pronto };
}

// ---------- ler o texto de um arquivo (no navegador) ----------
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
export const LEGIVEL = /\.(txt|md|csv|xlsx|xls|ods|docx|pdf|pptx)$/i;
async function lerArquivo(arq, aoAvancar) {
  const ext = (arq.name.split('.').pop() || '').toLowerCase();
  if (['txt', 'md'].includes(ext)) return arq.text();
  if (['csv', 'xlsx', 'xls', 'ods'].includes(ext)) {
    const XLSX = await import(XLSX_URL);
    const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
    return wb.SheetNames.map((aba) => XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false, defval: '' })
      .map((l) => l.map((c) => String(c).replace(/\s+/g, ' ').trim()).join('\t')).join('\n')).join('\n');
  }
  if (ext === 'docx') {
    const JSZip = (await import(JSZIP)).default;
    const zip = await JSZip.loadAsync(await arq.arrayBuffer());
    const f = zip.file('word/document.xml');
    if (!f) throw new Error('Não consegui abrir este Word. Salve de novo como .docx ou copie e cole o texto.');
    const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    // caixinha de marcar do Word (☒) entra como "pronto"
    return [...doc.getElementsByTagNameNS(W, 'p')].map((p) => {
      const marcada = [...p.getElementsByTagNameNS('http://schemas.microsoft.com/office/word/2010/wordml', 'checked')].some((c) => /^(1|true)$/.test(c.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'val') || ''));
      const t = [...p.getElementsByTagNameNS(W, 't')].map((x) => x.textContent).join('');
      return marcada ? `[x] ${t.replace(/^[☒☐]\s*/, '')}` : t;
    }).join('\n');
  }
  if (ext === 'pdf' || ext === 'pptx') {
    const { lerTextoPdf, lerTextoPptx } = await import('./importar-proposta.js');
    return ext === 'pdf' ? lerTextoPdf(arq, aoAvancar) : lerTextoPptx(arq, aoAvancar);
  }
  throw new Error('Não consigo ler este tipo de arquivo. Use Word (.docx), Excel, PDF ou texto, ou copie e cole a lista.');
}

// ---------- arquivos de apoio ----------
const TIPO_POR_EXT = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime', zip: 'application/zip',
};
const ACEITA = Object.keys(TIPO_POR_EXT).map((e) => `.${e}`).join(',');
const LIMITE = 52428800;   // 50 MB, o mesmo da pasta "turmas"

// falta o script 40 (tabela nova, tipo novo de arquivo ou formato que a pasta ainda não aceita)
const faltaScript = (e) => /modulo_materiais|PGRST205|42P01|mime|check constraint|row-level security|permission denied|not allowed/i.test(String((e && (e.code || '') + ' ' + (e.message || e.error)) || e || ''));
const avisoScript = (adm) => (adm ? 'Para usar os materiais do módulo, falta rodar o script 40-materiais-do-modulo.sql no Supabase.' : 'O checklist de materiais ainda não foi liberado na plataforma. Avise a Cintia.');

async function enviarArquivos(ctx, moduloId, lista, prog) {
  let feitos = 0;
  for (const [i, arq] of lista.entries()) {
    const ext = (arq.name.split('.').pop() || '').toLowerCase();
    if (!TIPO_POR_EXT[ext]) { avisar(`${arq.name}: este tipo de arquivo não entra. Envie PDF, Word, Excel, PowerPoint, foto, áudio, vídeo ou .zip.`, true); continue; }
    if (arq.size > LIMITE) { avisar(`${arq.name} passa de 50 MB. Para vídeo grande, coloque no Google Drive ou no YouTube e cole o link como item do checklist.`, true); continue; }
    if (prog) prog.textContent = lista.length > 1 ? `Enviando ${i + 1} de ${lista.length}: ${arq.name}…` : `Enviando ${arq.name}…`;
    const caminho = `${moduloId}/material/${Date.now()}-${i}-${nomeSeguro(arq.name)}`;
    try {
      const up = await sb.storage.from('turmas').upload(caminho, arq, { contentType: TIPO_POR_EXT[ext] });
      if (up.error) throw up.error;
      const r = await sb.from('modulo_arquivos').insert({ modulo_id: moduloId, tipo: 'material', nome: arq.name, caminho, tamanho: arq.size, enviado_por: ctx.perfil.id });
      if (r.error) { await sb.storage.from('turmas').remove([caminho]); throw r.error; }
      feitos += 1;
    } catch (e) {
      avisar(faltaScript(e) ? avisoScript(ctx.ehAdmin) : `${arq.name}: ${explicarErro(e)}`, true);
      if (faltaScript(e)) break;   // os próximos iam falhar pelo mesmo motivo
    }
  }
  if (prog) prog.textContent = '';
  return feitos;
}

// ---------- o cartão ----------
// arquivosHtml: a lista dos arquivos de apoio já desenhada pela página do módulo (mesmo Baixar/Apagar dos slides)
export function cartaoMateriais(ctx, m, podeEditar, arquivosHtml) {
  return `<div class="cartao" id="materiais">
    <div class="linha"><h3 style="flex:1">Materiais necessários</h3><span class="selo neutro" id="mat-conta" hidden></span></div>
    <p class="peq apagado">${podeEditar ? 'Ferramentas, recursos de áudio e vídeo e materiais de apoio da aula. Preencha, cole uma lista ou traga de um arquivo; marque ✓ quando estiver separado.'
      : 'Ferramentas, recursos de áudio e vídeo e materiais de apoio desta aula.'}</p>
    <div id="mat-lista" class="mt"><p class="apagado peq">Carregando…</p></div>
    ${podeEditar ? `<form class="mat-novo mt" id="mat-novo" autocomplete="off">
        <select id="mat-cat" aria-label="Tipo do item">${CATEGORIAS.map(([k, r]) => `<option value="${k}">${r}</option>`).join('')}</select>
        <input type="text" id="mat-texto" placeholder="Ex.: 2 microfones sem fio · Roda da Vida impressa · link do vídeo" aria-label="Novo item" maxlength="300">
        <button class="btn peq pri" type="submit">Incluir</button>
      </form>
      <div class="linha mt" style="gap:8px;flex-wrap:wrap">
        <button class="btn peq" type="button" id="mat-colar">📋 Colar ou importar lista</button>
        <label class="btn peq" style="cursor:pointer">📎 Anexar arquivo<input type="file" id="mat-anexar" accept="${ACEITA}" multiple hidden></label>
        <button class="btn peq" type="button" id="mat-copiar" hidden>Copiar para outros módulos</button>
      </div>
      <p class="peq apagado mt" id="mat-progresso" role="status"></p>` : ''}
    <div id="mat-arquivos">${arquivosHtml || ''}</div>
  </div>`;
}

export function ligarMateriais(ctx, el, m, podeEditar) {
  const adm = ctx.ehAdmin;
  const box = el.querySelector('#mat-lista');
  if (!box) return;
  let itens = [];
  let semScript = false;

  const ordenar = () => itens.sort((a, b) => (ORDEM_CAT[a.categoria] - ORDEM_CAT[b.categoria]) || (a.ordem - b.ordem) || String(a.criado_em).localeCompare(String(b.criado_em)));
  const conta = () => {
    const c = el.querySelector('#mat-conta'); if (!c) return;
    const prontos = itens.filter((i) => i.pronto).length;
    c.hidden = !itens.length;
    c.className = `selo ${itens.length && prontos === itens.length ? 'ok' : 'neutro'}`;
    c.textContent = `${prontos} de ${itens.length} pronto${itens.length > 1 ? 's' : ''}`;
    const cp = el.querySelector('#mat-copiar'); if (cp) cp.hidden = !itens.length;
  };

  const desenhar = () => {
    ordenar(); conta();
    if (semScript) { box.innerHTML = `<div class="aviso">${avisoScript(adm)}</div>`; return; }
    if (!itens.length) { box.innerHTML = `<p class="apagado">${podeEditar ? 'Nenhum item ainda. Comece pelo campo abaixo ou cole a lista que você já tem.' : 'A lista de materiais deste módulo ainda não foi preenchida.'}</p>`; return; }
    box.innerHTML = CATEGORIAS.filter(([k]) => itens.some((i) => i.categoria === k)).map(([k, rotulo]) => `
      <div class="mat-grupo"><h4>${rotulo}</h4>
        ${itens.filter((i) => i.categoria === k).map((i) => {
          const link = (i.texto.match(URL_RE) || [])[0];
          const marcou = i.pronto && (i.marcou || i.pronto_em) ? `<span class="peq apagado mat-quem-marcou">✓ ${i.marcou ? esc(i.marcou.nome.split(' ')[0]) : ''}${i.pronto_em ? ` · ${dataBR(i.pronto_em)}` : ''}</span>` : '';
          return `<div class="mat-item${i.pronto ? ' pronto' : ''}" data-item="${i.id}">
            <input type="checkbox" data-pronto${i.pronto ? ' checked' : ''}${podeEditar ? '' : ' disabled'} aria-label="Pronto: ${esc(i.texto)}">
            ${podeEditar ? `<input type="text" class="mat-texto" data-texto value="${esc(i.texto)}" maxlength="300" aria-label="Item">`
              : `<span class="mat-texto">${esc(i.texto)}</span>`}
            <span class="mat-acoes">
              ${marcou}
              ${link ? `<a class="btn peq" href="${esc(link)}" target="_blank" rel="noopener">Abrir ↗</a>` : ''}
              ${podeEditar ? `<select data-quem aria-label="Quem providencia" title="Quem providencia"><option value="">Quem providencia?</option>${Object.entries(QUEM).map(([q, r]) => `<option value="${q}"${i.quem === q ? ' selected' : ''}>${r}</option>`).join('')}</select>
                <select data-cat aria-label="Tipo">${CATEGORIAS.map(([c, r]) => `<option value="${c}"${c === i.categoria ? ' selected' : ''}>${r.replace(/^\S+\s/, '')}</option>`).join('')}</select>
                <button class="btn peq" type="button" data-tirar aria-label="Tirar ${esc(i.texto)}" title="Tirar da lista">✕</button>`
                : i.quem ? `<span class="selo neutro">Quem providencia: ${QUEM[i.quem]}</span>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>`).join('');
  };

  const carregar = async () => {
    const { data, error } = await sb.from('modulo_materiais').select('*, marcou:perfis!modulo_materiais_pronto_por_fkey(nome)').eq('modulo_id', m.id).order('ordem');
    if (error) {
      if (faltaScript(error)) {
        semScript = true; desenhar();
        [el.querySelector('#mat-novo'), el.querySelector('#mat-colar')?.parentElement].forEach((x) => { if (x) x.hidden = true; });
        return;
      }
      box.innerHTML = `<div class="aviso erro">${esc(explicarErro(error))}</div>`; return;
    }
    itens = data || [];
    desenhar();
  };

  const gravarNovos = async (novos) => {
    const existentes = new Set(itens.map((i) => norm(i.texto)));
    const fica = novos.filter((n) => !existentes.has(norm(n.texto)));
    const repetidos = novos.length - fica.length;
    if (!fica.length) { avisar(repetidos ? 'Esses itens já estão na lista.' : 'Nada para incluir.', !repetidos); return 0; }
    let ordem = itens.reduce((mx, i) => Math.max(mx, i.ordem || 0), 0);
    const linhas = fica.map((n) => ({ modulo_id: m.id, categoria: n.categoria, texto: n.texto, quem: n.quem || null, pronto: !!n.pronto,
      pronto_por: n.pronto ? ctx.perfil.id : null, pronto_em: n.pronto ? new Date().toISOString() : null, ordem: ++ordem, criado_por: ctx.perfil.id }));
    const { data, error } = await sb.from('modulo_materiais').insert(linhas).select('*');
    if (error) { avisar(faltaScript(error) ? avisoScript(adm) : explicarErro(error), true); return 0; }
    itens.push(...(data || []).map((x) => ({ ...x, marcou: x.pronto ? { nome: ctx.perfil.nome } : null })));
    desenhar();
    if (repetidos) avisar(`${fica.length} ${fica.length === 1 ? 'item incluído' : 'itens incluídos'}; ${repetidos} já ${repetidos === 1 ? 'estava' : 'estavam'} na lista.`);
    return fica.length;
  };

  const mudar = async (item, mud) => {
    const antes = { ...item };
    Object.assign(item, mud);
    const { error } = await sb.from('modulo_materiais').update(mud).eq('id', item.id);
    if (error) { Object.assign(item, antes); desenhar(); avisar(explicarErro(error), true); return false; }
    return true;
  };

  // incluir um item
  el.querySelector('#mat-novo')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const inp = el.querySelector('#mat-texto');
    const { texto } = limparMarcador(inp.value);
    if (!texto) { inp.focus(); return; }
    const sel = el.querySelector('#mat-cat');
    if (await gravarNovos([{ categoria: sel.value, texto }])) { inp.value = ''; inp.focus(); }
  });
  // o tipo acompanha o que a pessoa escreve (até ela escolher na mão)
  let catNaMao = false;
  el.querySelector('#mat-cat')?.addEventListener('change', () => { catNaMao = true; });
  el.querySelector('#mat-texto')?.addEventListener('input', (ev) => {
    if (catNaMao) return;
    const t = ev.target.value.trim();
    if (t.length >= 3) { const c = adivinharCategoria(t); if (c !== 'outro') el.querySelector('#mat-cat').value = c; }
  });

  // marcar pronto, mudar texto, tipo e quem providencia, tirar
  box.addEventListener('change', async (ev) => {
    const linha = ev.target.closest('[data-item]'); if (!linha || !podeEditar) return;
    const item = itens.find((i) => i.id === linha.dataset.item); if (!item) return;
    if (ev.target.matches('[data-pronto]')) {
      const p = ev.target.checked;
      if (await mudar(item, { pronto: p, pronto_por: p ? ctx.perfil.id : null, pronto_em: p ? new Date().toISOString() : null })) { item.marcou = p ? { nome: ctx.perfil.nome } : null; desenhar(); }
    } else if (ev.target.matches('[data-texto]')) {
      const t = ev.target.value.replace(/\s+/g, ' ').trim();
      if (!t) { ev.target.value = item.texto; return; }
      if (t !== item.texto && await mudar(item, { texto: t })) { desenhar(); avisar('Item atualizado.'); }
    } else if (ev.target.matches('[data-cat]')) {
      if (await mudar(item, { categoria: ev.target.value })) desenhar();
    } else if (ev.target.matches('[data-quem]')) {
      await mudar(item, { quem: ev.target.value || null });
    }
  });
  box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('[data-texto]')) { ev.preventDefault(); ev.target.blur(); } });
  box.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-tirar]'); if (!b) return;
    const item = itens.find((i) => i.id === b.closest('[data-item]').dataset.item);
    if (!window.confirm(`Tirar "${item.texto}" da lista?`)) return;
    const { error } = await sb.from('modulo_materiais').delete().eq('id', item.id);
    if (error) { avisar(explicarErro(error), true); return; }
    itens = itens.filter((i) => i !== item);
    desenhar();
  });

  // anexar arquivos de apoio
  el.querySelector('#mat-anexar')?.addEventListener('change', async (ev) => {
    const lista = [...ev.target.files];
    ev.target.value = '';
    if (!lista.length) return;
    const feitos = await enviarArquivos(ctx, m.id, lista, el.querySelector('#mat-progresso'));
    if (feitos) { avisar(feitos === 1 ? 'Arquivo anexado ao módulo.' : `${feitos} arquivos anexados ao módulo.`); ctx.irPara(`#/modulo/${m.id}`); }
  });

  el.querySelector('#mat-colar')?.addEventListener('click', () => abrirImportar(ctx, m, { gravarNovos, existentes: () => itens }));
  el.querySelector('#mat-copiar')?.addEventListener('click', () => abrirCopiar(ctx, m, itens));

  carregar();
}

// ---------- janela: colar ou importar uma lista ----------
async function abrirImportar(ctx, m, { gravarNovos, existentes }) {
  const { janela } = await import('./agenda-dados.js');
  const j = janela('Colar ou importar lista', `
    <p class="peq">Cole a lista abaixo, um item por linha, ou escolha um arquivo (Word, Excel, PDF, PowerPoint ou texto).
      Títulos como <b>Ferramentas:</b>, <b>Áudio e vídeo:</b> ou <b>Material de apoio:</b> separam as partes; sem título, a plataforma
      adivinha pelo nome e você confere antes de incluir.</p>
    <div class="linha mt" style="gap:8px;flex-wrap:wrap">
      <label class="btn peq pri" style="cursor:pointer">Escolher arquivo<input type="file" id="mi-arq" accept=".docx,.xlsx,.xls,.csv,.ods,.pdf,.pptx,.txt,.md" hidden></label>
      <span class="peq apagado" id="mi-status" role="status"></span>
    </div>
    <textarea id="mi-texto" class="mt" style="min-height:150px" placeholder="Ferramentas:&#10;- Roda da Vida (online)&#10;- Canvas do líder impresso&#10;&#10;Áudio e vídeo:&#10;- Projetor e cabo HDMI&#10;- 2 microfones sem fio&#10;&#10;Material de apoio:&#10;- Post-its e canetinhas"></textarea>
    <label class="check mt" id="mi-guardar-l" hidden><input type="checkbox" id="mi-guardar" checked><span>Guardar também o arquivo no módulo, em "Arquivos de apoio"</span></label>
    <div id="mi-previa" class="mt"></div>
    <div class="linha mt2"><button class="btn pri" type="button" id="mi-incluir" disabled>Incluir</button><span class="peq apagado">Nada é gravado antes de você clicar.</span></div>`, { largura: 760 });
  const c = j.corpo;
  const txt = c.querySelector('#mi-texto');
  let arquivo = null;
  let lidos = [];
  const trocados = new Map();   // texto normalizado → categoria escolhida na prévia
  const ja = () => new Set(existentes().map((i) => norm(i.texto)));

  const previa = () => {
    lidos = lerLista(txt.value).map((i) => ({ ...i, categoria: trocados.get(norm(i.texto)) || i.categoria }));
    const tem = ja();
    const novos = lidos.filter((i) => !tem.has(norm(i.texto)));
    const b = c.querySelector('#mi-incluir');
    b.disabled = !novos.length;
    b.textContent = novos.length ? `Incluir ${novos.length} ${novos.length === 1 ? 'item' : 'itens'}` : 'Incluir';
    if (!lidos.length) { c.querySelector('#mi-previa').innerHTML = txt.value.trim() ? '<p class="apagado peq">Não achei itens neste texto.</p>' : ''; return; }
    c.querySelector('#mi-previa').innerHTML = `<p class="peq"><b>Prévia</b> · confira o tipo de cada item</p>
      <div class="mat-previa mt">${lidos.map((i, k) => `<div class="mat-previa-linha${tem.has(norm(i.texto)) ? ' repetido' : ''}">
        <select data-k="${k}" aria-label="Tipo de ${esc(i.texto)}">${CATEGORIAS.map(([cat, r]) => `<option value="${cat}"${cat === i.categoria ? ' selected' : ''}>${r}</option>`).join('')}</select>
        <span>${i.pronto ? '✓ ' : ''}${esc(i.texto)}${tem.has(norm(i.texto)) ? ' <span class="selo neutro">já está na lista</span>' : ''}</span></div>`).join('')}</div>`;
  };
  let espera = null;
  txt.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(previa, 250); });
  c.querySelector('#mi-previa').addEventListener('change', (ev) => {
    const s = ev.target.closest('select[data-k]'); if (!s) return;
    const i = lidos[Number(s.dataset.k)];
    trocados.set(norm(i.texto), s.value);
  });

  c.querySelector('#mi-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0]; ev.target.value = '';
    if (!arq) return;
    const st = c.querySelector('#mi-status');
    if (!LEGIVEL.test(arq.name)) { st.textContent = 'Este tipo de arquivo não dá para ler. Use Word (.docx), Excel, PDF, PowerPoint ou texto, ou copie e cole a lista.'; return; }
    st.textContent = `Lendo ${arq.name}…`;
    try {
      const texto = await lerArquivo(arq, (msg) => { st.textContent = msg; });
      txt.value = texto.replace(/\n{3,}/g, '\n\n').trim();
      arquivo = arq;
      c.querySelector('#mi-guardar-l').hidden = false;
      previa();
      st.textContent = lidos.length ? `${arq.name}: ${lidos.length} ${lidos.length === 1 ? 'item encontrado' : 'itens encontrados'}. Pode apagar ou corrigir linhas no texto.` : `${arq.name}: não achei uma lista neste arquivo. Dá para colar o texto à mão.`;
    } catch (e) { st.textContent = explicarErro(e); }
  });

  c.querySelector('#mi-incluir').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = 'Incluindo…';
    const feitos = await gravarNovos(lidos);
    if (arquivo && c.querySelector('#mi-guardar').checked) {
      if (await enviarArquivos(ctx, m.id, [arquivo], c.querySelector('#mi-status'))) { j.fechar(); avisar(`${feitos ? `${feitos} ${feitos === 1 ? 'item incluído' : 'itens incluídos'} e a` : 'A'} lista guardada em "Arquivos de apoio".`); ctx.irPara(`#/modulo/${m.id}`); return; }
    }
    if (feitos) { j.fechar(); avisar(`${feitos} ${feitos === 1 ? 'item incluído' : 'itens incluídos'} no checklist.`); return; }
    previa();
  });
  txt.focus();
}

// ---------- janela: copiar o checklist para outros módulos da turma ----------
async function abrirCopiar(ctx, m, itens) {
  const { data: mods, error } = await sb.from('modulos').select('id, numero, titulo, data_hora, mentores:modulo_mentores(mentor_id)').eq('turma_id', m.turma.id).order('numero');
  if (error) { avisar(explicarErro(error), true); return; }
  const alvos = (mods || []).filter((x) => x.id !== m.id && (ctx.ehAdmin || (x.mentores || []).some((v) => v.mentor_id === ctx.perfil.id)));
  if (!alvos.length) { avisar(ctx.ehAdmin ? 'Esta turma não tem outros módulos.' : 'Você não dá aula em outros módulos desta turma.', true); return; }
  const { data: jaTem } = await sb.from('modulo_materiais').select('modulo_id, texto').in('modulo_id', alvos.map((x) => x.id));
  const porModulo = new Map();
  (jaTem || []).forEach((x) => { if (!porModulo.has(x.modulo_id)) porModulo.set(x.modulo_id, new Set()); porModulo.get(x.modulo_id).add(norm(x.texto)); });
  const { janela } = await import('./agenda-dados.js');
  const j = janela('Copiar o checklist para outros módulos', `
    <p class="peq">Os ${itens.length} itens desta lista vão para os módulos marcados, ainda sem o ✓ de pronto. Item que o módulo já tem não se repete.</p>
    <div class="lista mt">${alvos.map((x) => {
      const n = porModulo.has(x.id) ? porModulo.get(x.id).size : 0;
      return `<label class="check"><input type="checkbox" value="${x.id}"><span>Módulo ${x.numero} · ${esc(x.titulo)}${n ? ` <span class="selo neutro">já tem ${n} ${n === 1 ? 'item' : 'itens'}</span>` : ''}</span></label>`;
    }).join('')}</div>
    <div class="linha mt2"><button class="btn pri" type="button" id="cp-ok" disabled>Copiar</button></div>`, { largura: 560 });
  const marcados = () => [...j.corpo.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
  j.corpo.addEventListener('change', () => { const n = marcados().length; const b = j.corpo.querySelector('#cp-ok'); b.disabled = !n; b.textContent = n ? `Copiar para ${n} ${n === 1 ? 'módulo' : 'módulos'}` : 'Copiar'; });
  j.corpo.querySelector('#cp-ok').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    const ids = marcados();
    const linhas = ids.flatMap((mid) => itens.filter((i) => !(porModulo.get(mid) || new Set()).has(norm(i.texto)))
      .map((i) => ({ modulo_id: mid, categoria: i.categoria, texto: i.texto, quem: i.quem || null, ordem: i.ordem, criado_por: ctx.perfil.id })));
    if (!linhas.length) { j.fechar(); avisar('Esses módulos já têm todos os itens.'); return; }
    const { error: e } = await sb.from('modulo_materiais').insert(linhas);
    if (e) { avisar(explicarErro(e), true); b.disabled = false; return; }
    j.fechar();
    avisar(`Checklist copiado para ${ids.length} ${ids.length === 1 ? 'módulo' : 'módulos'} (${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'}).`);
  });
}
