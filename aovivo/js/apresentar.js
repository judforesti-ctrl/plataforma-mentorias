/* Mentorei Ao Vivo · montar a aula e conduzir pelo painel da apresentadora */
(function () {
  const A = window.AoVivo;
  const { rpc, esc, corEquipe, ALTERNATIVAS, formaSVG, agoraServidor, TIPOS } = A;
  const $ = id => document.getElementById(id);
  const PLATAFORMA = 'https://plataforma.mentorei.com.br';
  const CHAVE_AULAS = 'aovivo_aulas_v1';
  const NOMES_EQUIPE = ['Menta', 'Coral', 'Azul', 'Dourado', 'Lilás', 'Rosa', 'Limão', 'Ciano'];
  const BASE_SLIDES = 'https://mixnubenhaleohkcanma.supabase.co/storage/v1/object/public/aovivo-slides/';

  // aula aberta pelo módulo da plataforma: o endereço traz os links temporários dos slides do módulo
  const doModulo = (() => {
    const h = new URLSearchParams(location.hash.slice(1));
    const pdf = h.get('pdf'), pptx = h.get('pptx');
    return pdf || pptx ? { pdf, pdfnome: h.get('pdfnome') || 'slides.pdf', pptx, pptxnome: h.get('pptxnome') || 'slides.pptx' } : null;
  })();
  let pptxGuardado = null;      // PowerPoint do módulo sem PDF: entra junto quando a pessoa enviar o PDF
  let moduloTrazido = false;

  let aulas = carregarAulas();
  let atual = null;        // { id, chave }
  let painel = null;       // último retorno do servidor
  let rascunho = null;     // dados do editor
  let sujo = false;
  let ocupado = false;

  /* ---------- Utilidades ---------- */
  function carregarAulas() { try { return JSON.parse(localStorage.getItem(CHAVE_AULAS)) || []; } catch (e) { return []; } }
  function salvarAulas() { try { localStorage.setItem(CHAVE_AULAS, JSON.stringify(aulas)); } catch (e) {} }
  function lembrarAula(dados) {
    const i = aulas.findIndex(a => a.id === dados.id);
    const item = Object.assign({}, i >= 0 ? aulas[i] : {}, dados, { em: Date.now() });
    if (i >= 0) aulas.splice(i, 1);
    aulas.unshift(item);
    salvarAulas();
  }
  function infoAula() { return (atual && aulas.find(a => a.id === atual.id)) || {}; }

  function toast(msg, erro) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle('erro', !!erro);
    setTimeout(() => t.classList.add('visivel'), 10);
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('visivel'), erro ? 5200 : 3200);
  }

  function vista(nome) {
    ['vistaInicio', 'vistaEditor', 'vistaPainel'].forEach(v => $(v).classList.toggle('oculto', v !== nome));
    document.body.classList.toggle('modo-painel', nome === 'vistaPainel');
    if (nome !== 'vistaPainel') clearInterval(timerPainel);
    window.scrollTo(0, 0);
  }

  function linkControle(a) { return location.origin + location.pathname + '#s=' + a.id + '&k=' + a.chave; }

  function modal(html, aoMontar) {
    const f = document.createElement('div');
    f.className = 'fundo-modal';
    f.innerHTML = '<div class="modal" role="dialog">' + html + '</div>';
    document.body.appendChild(f);
    const fechar = () => f.remove();
    f.addEventListener('click', e => { if (e.target === f) fechar(); });
    f.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar));
    if (aoMontar) aoMontar(f, fechar);
    return fechar;
  }

  function popover(ev, texto, rotulo, acaoSim) {
    document.querySelectorAll('.popover').forEach(p => p.remove());
    const p = document.createElement('div');
    p.className = 'popover';
    p.innerHTML = '<p>' + texto + '</p><div class="acoes"><button class="btn btn-perigo btn-pequeno" data-sim>' + rotulo + '</button><button class="btn btn-secundario btn-pequeno" data-nao>Cancelar</button></div>';
    document.body.appendChild(p);
    const x = Math.min(ev.clientX, innerWidth - p.offsetWidth - 12), y = Math.min(ev.clientY + 12, innerHeight - p.offsetHeight - 12);
    p.style.left = Math.max(12, x) + 'px'; p.style.top = Math.max(12, y) + 'px';
    p.querySelector('[data-nao]').onclick = () => p.remove();
    p.querySelector('[data-sim]').onclick = () => { p.remove(); acaoSim(); };
    setTimeout(() => document.addEventListener('click', function f(e) { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('click', f); } }), 0);
  }

  async function copiar(txt, msg) {
    try { await navigator.clipboard.writeText(txt); toast(msg || 'Copiado!'); }
    catch (e) {
      const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); toast(msg || 'Copiado!'); } catch (x) { toast('Não consegui copiar. Selecione o texto e copie.', true); }
      t.remove();
    }
  }

  function textoConvite() {
    return '📲 Participe da aula pelo celular: ' + A.enderecoAluno(painel.codigo) + '  Código: ' + A.formatarCodigo(painel.codigo);
  }

  const espera = ms => new Promise(r => setTimeout(r, ms));

  /* =========================================================
     MINHAS AULAS
     ========================================================= */
  // Início (15/11/2026, decisão da Juliana): o Ao Vivo não cria aula sozinho. Mentor abre pelo módulo dele na plataforma;
  // sócias e coordenação, por Gestão › Aulas ao vivo. Aqui só fica o caminho.
  function abrirInicio() {
    vista('vistaInicio');
    history.replaceState(null, '', location.pathname);
  }

  async function abrirAula(a, nova) {
    try {
      atual = { id: a.id, chave: a.chave };
      painel = await rpc('aovivo_painel', { p_sessao: a.id, p_chave: a.chave });
      ultVersao = -1; ultAgora = 0;
      lembrarAula({ id: a.id, chave: a.chave, codigo: painel.codigo, titulo: painel.titulo });
      history.replaceState(null, '', '#s=' + a.id + '&k=' + a.chave);
      ligarCanalTelao();
      try { const v = localStorage.getItem('aovivo_pos_' + a.id); ultimaPos = v == null ? -1 : Number(v); if (isNaN(ultimaPos)) ultimaPos = -1; } catch (e) { ultimaPos = -1; }
      // se a aula já está rolando, vai direto para o painel
      if (!nova && painel.fase !== 'lobby' && painel.fase !== 'encerrada') abrirPainel();
      else abrirEditor(nova);
    } catch (e) {
      toast(e.message, true);
      abrirInicio();
    }
  }

  /* =========================================================
     MONTAR A AULA
     ========================================================= */
  let contadorK = 0;
  let selK = null;

  function paraRascunho(a) {
    const it = {
      _k: ++contadorK, id: a.id, tipo: a.tipo, pergunta: a.pergunta || '',
      opcoes: a.tipo === 'quiz' ? padOpcoes(a.opcoes, 4) : (a.opcoes || []).slice(),
      correta: a.correta, tempo: a.tempo, config: JSON.parse(JSON.stringify(a.config || {})), notas: a.notas || ''
    };
    if (it.tipo === 'slide' || it.tipo === 'grupo') {
      if (!Array.isArray(it.config.materiais)) it.config.materiais = [];
      // o "PDF com as instruções" de antes vira o 1º material do exercício
      if (it.tipo === 'grupo' && it.config.pdf) {
        it.config.materiais.unshift({ pdf: it.config.pdf, nome: it.config.nome_pdf || 'Instruções', grupo: null });
        it.config.pdf = ''; it.config.nome_pdf = '';
      }
    }
    return it;
  }

  function abrirEditor(nova) {
    rascunho = {
      titulo: nova ? '' : painel.titulo,
      modo_equipes: painel.modo_equipes,
      equipes: painel.equipes && painel.equipes.length ? painel.equipes.slice() : NOMES_EQUIPE.slice(0, 3),
      itens: painel.atividades.map(paraRascunho)
    };
    const tirouQR = tirarQRAutomatico();
    const idAtual = painel.atividade && painel.atividade.id;
    const sel = rascunho.itens.find(i => i.id === idAtual) || rascunho.itens[0];
    selK = sel ? sel._k : null;
    sujo = false;
    vista('vistaEditor');
    $('campoTitulo').value = rascunho.titulo;
    $('chkEquipes').checked = rascunho.modo_equipes;
    desenharEquipes();
    desenharArquivo();
    desenharLista();
    desenharItem();
    marcarSalvo();
    atualizarBotaoAoVivo();
    desenharAvaliacao();
    desenharSala();
    if (nova) setTimeout(() => $('campoTitulo').focus(), 100);
    if (doModulo && !moduloTrazido && !rascunho.itens.some(i => i.tipo === 'slide')) setTimeout(trazerSlidesDoModulo, 300);
    if (sel && idAtual) setTimeout(() => { const el = document.querySelector('.ed-item.selecionado'); if (el) el.scrollIntoView({ block: 'center' }); }, 50);
    if (tirouQR) mudou();
  }

  // 16/11/2026 (de manhã) o QR code entrou como item logo depois da capa; à tarde, depois da aula, a Juliana pediu de volta o
  // QR code como a 1ª tela (agora a tela de boas-vindas). Este tira o item que a plataforma tinha posto sozinha (logo depois do
  // 1º slide e sem frase), em aula que ainda não começou. O item "QR code para entrar" continua existindo para mostrar de novo no meio.
  function tirarQRAutomatico() {
    if (!rascunho || (painel && painel.comecou_em)) return false;
    const L = rascunho.itens;
    if (L.length < 2 || L[0].tipo !== 'slide' || L[1].tipo !== 'entrada' || (L[1].pergunta || '').trim()) return false;
    L.splice(1, 1);
    return true;
  }

  function padOpcoes(o, n) { const r = (o || []).slice(); while (r.length < n) r.push(''); return r; }

  let timerAutoSalvar = null;
  function mudou() {
    sujo = true;
    $('statusSalvar').textContent = 'Alterações não salvas';
    clearTimeout(timerAutoSalvar);
    timerAutoSalvar = setTimeout(() => { if (sujo && !importando && !validar()) salvar(true); }, 2500);
  }
  function marcarSalvo() { sujo = false; $('statusSalvar').textContent = 'Tudo salvo · código ' + A.formatarCodigo(painel.codigo); }

  $('campoTitulo').addEventListener('input', e => { rascunho.titulo = e.target.value; mudou(); });
  $('chkEquipes').addEventListener('change', e => { rascunho.modo_equipes = e.target.checked; desenharEquipes(); desenharItem(); mudou(); });
  $('btnMaisEquipe').onclick = () => { if (rascunho.equipes.length < 8) { rascunho.equipes.push(NOMES_EQUIPE[rascunho.equipes.length]); desenharEquipes(); mudou(); } };
  $('btnMenosEquipe').onclick = () => { if (rascunho.equipes.length > 2) { rascunho.equipes.pop(); desenharEquipes(); mudou(); } };

  function desenharEquipes() {
    $('blocoEquipes').classList.toggle('oculto', !rascunho.modo_equipes);
    $('listaNomesEquipe').innerHTML = rascunho.equipes.map((n, i) =>
      '<div class="nome-equipe"><i style="background:' + A.CORES_EQUIPE[i] + '"></i><input class="entrada" maxlength="30" data-i="' + i + '" value="' + esc(n) + '"></div>').join('');
    $('listaNomesEquipe').querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
      rascunho.equipes[Number(inp.dataset.i)] = inp.value; mudou();
    }));
  }

  function novoItem(tipo) {
    const base = { _k: ++contadorK, tipo, pergunta: '', opcoes: [], correta: null, tempo: 0, config: {}, notas: '' };
    if (tipo === 'quiz') { base.opcoes = ['', '', '', '']; base.correta = 0; base.tempo = 30; }
    if (tipo === 'votacao') base.opcoes = ['', ''];
    if (tipo === 'nuvem') base.config = { max_respostas: 3 };
    if (tipo === 'escala') base.config = { max: 10, rotulo_min: '', rotulo_max: '' };
    if (tipo === 'grupo') {
      base.tempo = 600;
      base.config = { passos: [], entrega: '', grupos: { modo: 'escolher', quantos: 6, tamanho: 4 }, resposta: { ligada: true, pergunta: '' }, pdf: '', nome_pdf: '', materiais: [] };
    }
    if (tipo === 'ferramenta') base.config = { url: '', codigo: '', instrucao: '' };
    return base;
  }

  function inserirItem(tipo, depoisDe) {
    const ja = tipo === 'entrada' && rascunho.itens.find(i => i.tipo === 'entrada');
    if (ja) {   // um QR code por aula: mostra o que já está no roteiro
      selK = ja._k; desenharLista(); desenharItem();
      const el = document.querySelector('.ed-item.selecionado');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('A aula já tem o QR code para entrar. Arraste ou use ↑ ↓ para mudar o lugar dele.');
    }
    const novo = novoItem(tipo);
    if (depoisDe) rascunho.itens.splice(rascunho.itens.indexOf(depoisDe) + 1, 0, novo);
    else rascunho.itens.push(novo);
    selK = novo._k;
    desenharLista(); desenharItem(); mudou();
    const el = document.querySelector('.ed-item.selecionado');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { const c = document.querySelector('#editorItem [data-campo="pergunta"]'); if (c) c.focus(); }, 250);
  }

  document.querySelectorAll('[data-novo]').forEach(b => b.addEventListener('click', () => inserirItem(b.dataset.novo, null)));

  function itemSel() { return rascunho.itens.find(i => i._k === selK) || null; }
  function numeroSlideRascunho(it) { let n = 0; for (const x of rascunho.itens) { if (x.tipo === 'slide') n++; if (x === it) return n; } return n; }

  function resumoTempo(it) {
    if (it.tipo === 'quiz') return (it.tempo || 30) + ' segundos';
    if (it.tipo === 'grupo') return Math.round((it.tempo || 600) / 60) + ' min';
    if (!it.tempo) return 'sem limite de tempo';
    return it.tempo >= 60 ? (it.tempo / 60).toString().replace('.', ',') + ' min' : it.tempo + ' segundos';
  }

  /* ---------- Arquivo de slides ---------- */
  let importando = false;
  let soNotas = false;   // "+ Notas do PowerPoint": só traz as anotações, não troca os slides
  function desenharArquivo(progresso) {
    const box = $('caixaArquivo');
    const nSlides = rascunho.itens.filter(i => i.tipo === 'slide').length;
    const info = infoAula();
    if (progresso) {
      box.innerHTML = '<div class="ed-arquivo"><span class="ed-arq-icone">⏳</span><div class="ed-arq-txt"><b>' + esc(progresso.texto) + '</b>' +
        '<div class="barra-progresso"><i style="width:' + Math.round(progresso.parte * 100) + '%"></i></div><span class="dica">Pode continuar mexendo no resto da aula enquanto isso.</span></div></div>';
      return;
    }
    if (!nSlides) {
      box.innerHTML = '<div class="ed-soltar" id="zonaSoltar"><b>Arraste aqui a sua apresentação</b>' +
        '<span class="dica">Pode ser o arquivo do PowerPoint (.pptx) do jeito que está: o Ao Vivo transforma em slides sozinho e traz as anotações do apresentador. Também aceita PDF (do Google Slides ou do Canva, por exemplo).</span>' +
        '<button class="btn btn-secundario" id="btnEscolherArquivo">Escolher arquivo</button>' +
        '<span class="dica">Sem slides? Tudo bem: dá para usar só as atividades, como antes.</span></div>';
    } else {
      box.innerHTML = '<div class="ed-arquivo" id="zonaSoltar"><span class="ed-arq-icone">📄</span><div class="ed-arq-txt"><b>' + esc(info.arquivo || 'Slides da aula') + '</b>' +
        '<span class="dica">' + nSlides + (nSlides === 1 ? ' slide' : ' slides') + (info.notasPptx ? ' · notas trazidas do PowerPoint' : '') + '</span></div>' +
        '<span class="espaco"></span><button class="btn btn-secundario btn-pequeno" id="btnNotasPptx" title="Traz as anotações do apresentador de um arquivo .pptx">+ Notas do PowerPoint</button>' +
        (doModulo ? '<button class="btn btn-secundario btn-pequeno" id="btnDoModulo" title="Traz de novo os slides que estão no módulo da plataforma">Slides do módulo</button>' : '') +
        '<button class="btn btn-secundario btn-pequeno" id="btnEscolherArquivo">Trocar arquivo</button></div>';
      $('btnNotasPptx').onclick = () => { soNotas = true; $('campoArquivo').accept = '.pptx'; $('campoArquivo').click(); };
      if (doModulo) $('btnDoModulo').onclick = ev => popover(ev, 'Trazer de novo os slides do módulo (' + esc(doModulo.pdf ? doModulo.pdfnome : doModulo.pptxnome) + ')? As atividades e as notas ficam.', 'Trazer', trazerSlidesDoModulo);
    }
    $('btnEscolherArquivo').onclick = () => { soNotas = false; $('campoArquivo').accept = '.pptx,.ppt,.ppsx,.pps,.odp,.pdf,.key,application/pdf'; $('campoArquivo').click(); };
    const z = $('zonaSoltar');
    ['dragenter', 'dragover'].forEach(t => z.addEventListener(t, ev => { if (arrastandoK != null) return; ev.preventDefault(); z.classList.add('em-cima'); }));
    ['dragleave', 'drop'].forEach(t => z.addEventListener(t, () => z.classList.remove('em-cima')));
    z.addEventListener('drop', ev => { if (arrastandoK != null) return; ev.preventDefault(); importarArquivos(Array.from(ev.dataTransfer.files || [])); });
  }

  $('campoArquivo').addEventListener('change', e => { const f = Array.from(e.target.files || []); e.target.value = ''; importarArquivos(f); });

  // manda a apresentação para a plataforma, que devolve o PDF (pelo Google Drive da Mentorei; o mentor não precisa fazer nada)
  async function converterParaPdf(arquivo) {
    if (arquivo.size > 50 * 1024 * 1024) throw new Error('Esse arquivo tem mais de 50 MB. Diminua as imagens da apresentação e tente de novo.');
    const nome = arquivo.name.replace(/\.[^.]+$/, '');
    let parte = 0.02;
    const passo = txt => desenharArquivo({ texto: txt, parte: Math.min(0.95, parte) });
    passo('Enviando ' + arquivo.name + '...');
    const b = await rpc('aovivo_bilhete_arquivo', { p_sessao: atual.id, p_chave: atual.chave, p_nome: arquivo.name });
    const ext = (arquivo.name.match(/\.([a-z0-9]+)$/i) || [])[1].toLowerCase();
    const tipos = { pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
      ppt: 'application/vnd.ms-powerpoint', pps: 'application/vnd.ms-powerpoint', odp: 'application/vnd.oasis.opendocument.presentation' };
    const { error } = await A.sb.storage.from('aovivo-slides').upload(b.caminho, arquivo, { contentType: tipos[ext] || 'application/octet-stream', upsert: false });
    if (error) throw new Error('Não consegui enviar a apresentação (' + (error.message || 'erro') + '). Tente de novo.');
    const c = await rpc('aovivo_pedir_conversao', { p_sessao: atual.id, p_chave: atual.chave, p_caminho: b.caminho });
    const r = await fetch('/api/converter-slides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, sessao: atual.id, chave: atual.chave }) });
    if (!r.ok && r.status !== 202) throw new Error('Não consegui falar com a plataforma para transformar os slides (' + r.status + '). Tente de novo.');
    const t0 = Date.now();
    let v = null;
    while (Date.now() - t0 < 6 * 60 * 1000) {
      await espera(2500);
      parte += (0.6 - parte) * 0.12;
      passo('Transformando o PowerPoint em slides (leva até 1 minuto)...');
      v = await rpc('aovivo_ver_conversao', { p_sessao: atual.id, p_chave: atual.chave, p_id: c.id });
      if (v.status !== 'convertendo') break;
    }
    if (!v || v.status === 'convertendo') throw new Error('A conversão demorou demais. Tente de novo.');
    if (v.status === 'erro') throw new Error(v.erro || 'Não consegui transformar a apresentação em slides.');
    const pdf = await fetch(v.pdf);
    if (!pdf.ok) throw new Error('Não consegui baixar os slides convertidos. Tente de novo.');
    return new File([await pdf.blob()], nome + '.pdf', { type: 'application/pdf' });
  }

  async function trazerSlidesDoModulo() {
    if (!doModulo || importando) return;
    const baixar = async (url, nome, tipo) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error('O link dos slides do módulo venceu. Abra a aula de novo pelo botão do módulo na plataforma.');
      return new File([await r.blob()], nome, { type: tipo });
    };
    try {
      desenharArquivo({ texto: 'Trazendo os slides do módulo da plataforma...', parte: 0.01 });
      const arquivos = [];
      if (doModulo.pptx) arquivos.push(await baixar(doModulo.pptx, doModulo.pptxnome, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'));
      if (doModulo.pdf) arquivos.push(await baixar(doModulo.pdf, doModulo.pdfnome, 'application/pdf'));
      moduloTrazido = true;
      if (!doModulo.pdf) pptxGuardado = arquivos[0];
      await importarArquivos(arquivos);
    } catch (e) { toast(e.message || 'Não consegui trazer os slides do módulo.', true); desenharArquivo(); }
  }

  /* ---------- Avaliação no fim da aula ---------- */
  function modoAvaliacao() {
    const a = painel.avaliacao;
    if (!a) return 'nenhuma';
    if (painel.modulo && /\/avaliar\.html\?m=/.test(a)) return 'auto';
    return 'link';
  }
  let timerAvaliacao = null;
  function desenharAvaliacao() {
    const box = $('blocoAvaliacao');
    if (!box) return;
    const modo = box._modo || modoAvaliacao();
    box._modo = modo;
    box.innerHTML = '<div class="campo"><label>Avaliação no fim da aula</label><select class="entrada" id="selAvaliacao">' +
      (painel.modulo ? '<option value="auto"' + (modo === 'auto' ? ' selected' : '') + '>A avaliação deste módulo da plataforma</option>' : '') +
      '<option value="link"' + (modo === 'link' ? ' selected' : '') + '>Um link de avaliação</option>' +
      '<option value="nenhuma"' + (modo === 'nenhuma' ? ' selected' : '') + '>Sem avaliação</option></select></div>' +
      (modo === 'link' ? '<div class="campo" style="flex:1;min-width:260px"><label>Link da avaliação</label><input class="entrada" id="campoAvaliacao" maxlength="500" placeholder="https://" value="' + esc(modo === modoAvaliacao() ? painel.avaliacao || '' : '') + '"></div>' : '') +
      '<p class="dica" style="flex-basis:100%">' + (modo === 'nenhuma' ? 'Ninguém recebe avaliação no fim.' : 'Quando você clicar em "Encerrar aula", o celular de cada aluno vibra e mostra o botão "Avaliar a aula", e o telão mostra o QR code da avaliação.') + '</p>';
    const enviar = async valor => {
      try { aceitarPainel(await rpc('aovivo_ajustes', { p_sessao: atual.id, p_chave: atual.chave, p_avaliacao: valor }), true); $('statusSalvar').textContent = 'Avaliação salva'; }
      catch (e) { toast(e.message, true); }
    };
    $('selAvaliacao').onchange = e => {
      box._modo = e.target.value;
      desenharAvaliacao();
      if (e.target.value === 'auto') enviar('');
      else if (e.target.value === 'nenhuma') enviar('-');
      else $('campoAvaliacao').focus();
    };
    const c = $('campoAvaliacao');
    if (c) c.addEventListener('input', () => {
      clearTimeout(timerAvaliacao);
      const v = c.value.trim();
      timerAvaliacao = setTimeout(() => { if (/^https:\/\/\S+$/.test(v)) enviar(v); else if (v) $('statusSalvar').textContent = 'O link da avaliação precisa começar com https://'; }, 900);
    });
  }

  /* ---------- Sala da aula (Zoom, Meet, Teams) ---------- */
  function nomeSala(url) {
    const u = String(url || '').toLowerCase();
    return /zoom\.us|zoom\.com/.test(u) ? 'Zoom' : /teams\.(microsoft|live)\.com/.test(u) ? 'Teams' : /meet\.google\.com/.test(u) ? 'Meet' : '';
  }
  let timerSala = null;
  function desenharSala() {
    const box = $('blocoSala');
    if (!box) return;
    const doModulo = painel.sala_modulo, escolhida = painel.sala_escolhida;
    const valor = escolhida && escolhida !== '-' ? escolhida : '';
    box.innerHTML = '<div class="campo" style="flex:1;min-width:260px"><label>Sala da aula (link do Zoom, do Meet ou do Teams)</label>' +
      '<input class="entrada" id="campoSala" maxlength="600" value="' + esc(valor) + '" placeholder="' + esc(doModulo || 'Cole aqui o link da sala: https://...') + '"></div>' +
      '<p class="dica" style="flex-basis:100%">' + (doModulo && !valor ? 'Já vem o link do módulo da plataforma. ' : '') +
      'No painel da aula aparece o botão "🎥 Entrar na sala": você abre a sala e projeta o telão sem sair do Ao Vivo.</p>';
    const be = $('btnSalaEd');
    if (be) { be.classList.toggle('oculto', !painel.sala); be.textContent = '🎥 Entrar na sala' + (nomeSala(painel.sala) ? ' do ' + nomeSala(painel.sala) : ''); }
    const c = $('campoSala');
    c.addEventListener('input', () => {
      clearTimeout(timerSala);
      const v = c.value.trim();
      timerSala = setTimeout(async () => {
        if (v && !/^https:\/\/\S+$/.test(v)) { $('statusSalvar').textContent = 'O link da sala precisa começar com https://'; return; }
        try {
          aceitarPainel(await rpc('aovivo_sala', { p_sessao: atual.id, p_chave: atual.chave, p_link: v }), true);
          $('statusSalvar').textContent = 'Sala salva';
          const be2 = $('btnSalaEd');
          if (be2) { be2.classList.toggle('oculto', !painel.sala); be2.textContent = '🎥 Entrar na sala' + (nomeSala(painel.sala) ? ' do ' + nomeSala(painel.sala) : ''); }
        }
        catch (e) { toast(e.message, true); }
      }, 900);
    });
  }

  /* ---------- Sugestões da IA ---------- */
  function slidesParaIA() {
    const itens = rascunho.itens, slides = [], roteiro = [];
    let n = 0;
    itens.forEach(it => {
      if (it.tipo === 'slide') { n++; slides.push({ titulo: it.pergunta || '', texto: (it.config && it.config.texto) || '', notas: it.notas || '' }); }
      else roteiro.push({ depois_do_slide: n, tipo: it.tipo, pergunta: it.pergunta });
    });
    return { slides, roteiro };
  }

  function descreverSugestao(x) {
    let d = '';
    if (x.tipo === 'quiz') d = '<ol class="ia-ops">' + x.opcoes.map((o, j) => '<li' + (j === x.correta ? ' class="certa"' : '') + '>' + esc(o) + (j === x.correta ? ' ✓' : '') + '</li>').join('') + '</ol>';
    else if (x.tipo === 'votacao') d = '<ul class="ia-ops">' + x.opcoes.map(o => '<li>' + esc(o) + '</li>').join('') + '</ul>';
    else if (x.tipo === 'escala') d = '<p class="dica">0 = ' + esc(x.config.rotulo_min) + ' · 10 = ' + esc(x.config.rotulo_max) + '</p>';
    else if (x.tipo === 'grupo') d = '<ol class="ia-ops">' + x.config.passos.map(o => '<li>' + esc(o) + '</li>').join('') + '</ol>' +
      (x.config.entrega ? '<p class="dica"><b>Leva de volta:</b> ' + esc(x.config.entrega) + '</p>' : '') +
      (x.slide_instrucao ? '<p class="dica">Usa as instruções que já estão no slide ' + x.slide_instrucao + '.</p>' : '<p class="dica">A IA escreveu as instruções (não havia slide com elas).</p>');
    return d;
  }

  async function sugerirComIA() {
    const { slides, roteiro } = slidesParaIA();
    if (!slides.length) return toast('Envie os slides primeiro: a IA lê o texto deles para sugerir as atividades.', true);
    if ((sujo || salvando) && !(await salvar(true))) return toast('Complete o roteiro antes de pedir à IA: ' + (validar() || ''), true);
    const fechar = modal('<h2>✨ Deixar do jeito Mentorei!</h2>' +
      '<div id="iaCorpo"><p class="dica" style="margin-bottom:12px">A IA lê o texto e as anotações dos ' + slides.length + ' slides e sugere onde entram nuvem de palavras, quiz, votação, escala e exercícios em grupo, já com as perguntas e as instruções. Você marca o que quer e elas entram no roteiro.</p>' +
      '<div class="campo"><label>Quer pedir algo especial? (opcional)</label><textarea class="entrada" id="iaPedido" maxlength="1500" placeholder="Ex.: a turma é de gerentes novos; quero 2 exercícios em grupo; a aula tem 2 horas"></textarea></div>' +
      '<div class="acoes"><button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-principal" id="iaIr">Pedir sugestões</button></div></div>', f => {
      f.querySelector('#iaIr').onclick = () => pedirIA(f, slides, roteiro, f.querySelector('#iaPedido').value.trim(), () => fechar());
    });
  }

  async function pedirIA(f, slides, roteiro, pedido, fechar, extra) {
    const corpo = f.querySelector('#iaCorpo');
    corpo.innerHTML = '<div class="ia-esperando"><span class="girando">✨</span><p><b>' + (extra && extra.ajuste ? 'A IA está ajustando as sugestões...' : 'A IA está lendo a aula...') + '</b></p><p class="dica">Leva de 1 a 3 minutos. Pode deixar esta janela aberta.</p></div>';
    try {
      const r = await rpc('aovivo_pedir_sugestao', { p_sessao: atual.id, p_chave: atual.chave });
      const resp = await fetch('/api/aovivo-sugerir', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ id: r.id, sessao: atual.id, chave: atual.chave, titulo: rascunho.titulo, slides, roteiro, pedido }, extra || {})) });
      if (!resp.ok && resp.status !== 202) throw new Error('Não consegui falar com a IA agora (' + resp.status + '). Tente de novo.');
      const t0 = Date.now();
      let g = null;
      while (Date.now() - t0 < 6 * 60 * 1000) {
        await espera(3000);
        if (!document.body.contains(corpo)) return;   // fechou a janela
        g = await rpc('aovivo_ver_sugestao', { p_sessao: atual.id, p_chave: atual.chave, p_id: r.id });
        if (g.status !== 'gerando') break;
      }
      if (!g || g.status === 'gerando') throw new Error('A IA demorou demais. Tente de novo.');
      if (g.status === 'erro') throw new Error(g.erro || 'A IA não conseguiu sugerir.');
      mostrarSugestoes(f, g.resultado, fechar, { slides, roteiro, pedido });
    } catch (e) {
      corpo.innerHTML = '<div class="aviso">' + esc(e.message) + '</div><div class="acoes"><button class="btn btn-secundario" data-sair>Fechar</button></div>';
      corpo.querySelector('[data-sair]').onclick = fechar;
    }
  }

  function mostrarSugestoes(f, res, fechar, ctx) {
    const corpo = f.querySelector('#iaCorpo');
    const lista = (res.sugestoes || []).map(x => JSON.parse(JSON.stringify(x)));
    const slides = rascunho.itens.filter(i => i.tipo === 'slide');
    const marcadas = new Set(lista.map((x, i) => i));
    let editando = -1;
    f.querySelector('.modal').classList.add('modal-largo');

    const campoTempo = (x, opcoes) => '<div class="campo"><label>Tempo</label><select class="entrada" data-ed-tempo>' + opcoesSelect(x.tempo, opcoes) + '</select></div>';
    function editorDe(x) {
      let h = '<div class="config-linha"><div class="campo" style="flex:1;min-width:200px"><label>' + (x.tipo === 'grupo' ? 'Título do exercício' : 'Pergunta') + '</label>' +
        '<input class="entrada" data-ed="pergunta" maxlength="200" value="' + esc(x.pergunta) + '"></div>' +
        '<div class="campo"><label>Entra</label><select class="entrada" data-ed-pos>' +
        opcoesSelect(x.depois_do_slide, [[0, 'Antes do 1º slide']].concat(slides.map((s, k) => [k + 1, 'Depois do slide ' + (k + 1)]))) + '</select></div></div>';
      if (x.tipo === 'quiz') {
        h += '<div class="campo"><label>Alternativas (marque a certa)</label>' + [0, 1, 2, 3].map(k =>
          '<div class="alternativa-editor"><input class="entrada" data-ed-op="' + k + '" maxlength="80" value="' + esc(x.opcoes[k] || '') + '" placeholder="Alternativa ' + 'ABCD'[k] + (k > 1 ? ' (opcional)' : '') + '">' +
          '<label class="certa"><input type="radio" name="edc" data-ed-certa="' + k + '"' + (x.correta === k ? ' checked' : '') + '>certa</label></div>').join('') + '</div>' +
          campoTempo(x, [[10, '10 segundos'], [20, '20 segundos'], [30, '30 segundos'], [45, '45 segundos'], [60, '1 minuto'], [90, '1 min e meio'], [120, '2 minutos']]);
      } else if (x.tipo === 'votacao') {
        h += '<div class="campo"><label>Opções (uma por linha, de 2 a 8)</label><textarea class="entrada" data-ed-linhas="opcoes" rows="4">' + esc(x.opcoes.join('\n')) + '</textarea></div>' +
          campoTempo(x, [[0, 'Sem limite (eu encerro)'], [30, '30 segundos'], [60, '1 minuto'], [90, '1 min e meio'], [120, '2 minutos']]);
      } else if (x.tipo === 'escala') {
        h += '<div class="config-linha"><div class="campo" style="flex:1"><label>O que significa o 0</label><input class="entrada" data-ed-cfg="rotulo_min" maxlength="40" value="' + esc(x.config.rotulo_min || '') + '"></div>' +
          '<div class="campo" style="flex:1"><label>O que significa o 10</label><input class="entrada" data-ed-cfg="rotulo_max" maxlength="40" value="' + esc(x.config.rotulo_max || '') + '"></div></div>' +
          campoTempo(x, [[0, 'Sem limite (eu encerro)'], [30, '30 segundos'], [60, '1 minuto'], [90, '1 min e meio']]);
      } else if (x.tipo === 'nuvem') {
        h += campoTempo(x, [[0, 'Sem limite (eu encerro)'], [30, '30 segundos'], [60, '1 minuto'], [90, '1 min e meio'], [120, '2 minutos']]);
      } else if (x.tipo === 'grupo') {
        const tempos = TEMPOS_GRUPO.slice();
        if (!tempos.some(t => t[0] === x.tempo)) tempos.push([x.tempo, Math.round(x.tempo / 60) + ' minutos']);
        h += '<div class="campo"><label>Passo a passo (um passo por linha, até 8)</label><textarea class="entrada" data-ed-linhas="passos" rows="5">' + esc((x.config.passos || []).join('\n')) + '</textarea></div>' +
          '<div class="campo"><label>O que cada grupo leva de volta</label><input class="entrada" data-ed-cfg="entrega" maxlength="300" value="' + esc(x.config.entrega || '') + '"></div>' +
          '<div class="config-linha"><div class="campo" style="flex:1;min-width:200px"><label>O que o grupo escreve no celular</label><input class="entrada" data-ed-resp maxlength="160" value="' + esc((x.config.resposta || {}).pergunta || '') + '"></div>' +
          campoTempo(x, tempos) + '</div>';
      }
      return h + '<div class="acoes"><button class="btn btn-principal btn-pequeno" data-ed-pronto>Pronto</button></div>';
    }

    function linha(x, i) {
      const sl = x.depois_do_slide > 0 ? slides[x.depois_do_slide - 1] : null;
      return '<div class="ia-bloco"><label class="ia-item"><input type="checkbox" data-ia="' + i + '"' + (marcadas.has(i) ? ' checked' : '') + '>' +
        (sl ? '<img src="' + esc(sl.config.imagem) + '" alt="">' : '<span class="ia-inicio">Início</span>') +
        '<div><span class="dica">' + (x.depois_do_slide > 0 ? 'Depois do slide ' + x.depois_do_slide : 'Antes do primeiro slide') + '</span>' +
        '<b><span class="tipo-selo tipo-' + x.tipo + '">' + TIPOS[x.tipo].icone + ' ' + TIPOS[x.tipo].nome + '</span> ' + esc(x.pergunta) + '</b>' +
        descreverSugestao(x) + (x.motivo ? '<p class="dica ia-motivo">💡 ' + esc(x.motivo) + '</p>' : '') +
        '<button type="button" class="btn btn-secundario btn-mini ia-ajustar" data-ajustar="' + i + '">' + (editando === i ? 'Fechar o ajuste' : '✎ Ajustar') + '</button></div></label>' +
        (editando === i ? '<div class="ia-editar">' + editorDe(x) + '</div>' : '') + '</div>';
    }

    function avisoNaJanela() {
      const tipos = rascunho.itens.map(i => i.tipo).concat(lista.filter((x, i) => marcadas.has(i)).map(x => x.tipo));
      const faltam = faltandoNasQuatro(tipos);
      const box = corpo.querySelector('#iaChato');
      if (box) box.innerHTML = faltam.length ? avisoChatoHTML(faltam, ' Peça embaixo, em "Quer que a IA ajuste?" (por exemplo: "inclua ' + listaE(faltam.map(t => 'uma ' + NOME_CURTO[t]).map(t => t.replace('uma quiz', 'um quiz'))) + '").') : '';
    }
    function desenhar() {
      const rolagem = corpo.querySelector('.ia-lista') ? corpo.querySelector('.ia-lista').scrollTop : 0;
      corpo.innerHTML = '<div id="iaChato"></div>' + (res.resumo ? '<p class="dica" style="margin-bottom:12px">' + esc(res.resumo) + '</p>' : '') +
        '<div class="linha" style="margin-bottom:10px"><span class="etiqueta">' + lista.length + ' sugestões · ' + marcadas.size + ' marcadas</span><span class="espaco"></span>' +
        '<button class="btn btn-secundario btn-mini" data-todas="1">Marcar todas</button><button class="btn btn-secundario btn-mini" data-todas="0">Desmarcar todas</button></div>' +
        '<p class="dica" style="margin-bottom:8px">Clique em "✎ Ajustar" para mudar uma sugestão aqui mesmo. Depois de colocar na aula, dá para mudar tudo de novo clicando no item do roteiro.</p>' +
        '<div class="ia-lista">' + lista.map(linha).join('') + '</div>' +
        '<div class="ia-refazer"><label for="iaAjuste"><b>Quer que a IA ajuste?</b> Escreva o que mudar e ela refaz a lista (o que você ajustou à mão vai junto).</label>' +
        '<div class="linha"><input class="entrada" id="iaAjuste" maxlength="1000" placeholder="Ex.: troque a votação por um quiz; o exercício em grupo com 15 minutos; perguntas mais curtas">' +
        '<button class="btn btn-ia btn-pequeno" id="iaRefazer">✨ Refazer</button></div></div>' +
        '<div class="acoes"><button class="btn btn-secundario" data-sair>Desistir</button><button class="btn btn-principal" id="iaAceitar">Colocar as marcadas na aula</button></div>';
      const L = corpo.querySelector('.ia-lista');
      L.scrollTop = rolagem;
      avisoNaJanela();
      corpo.querySelectorAll('[data-ia]').forEach(c => c.addEventListener('change', () => {
        if (c.checked) marcadas.add(Number(c.dataset.ia)); else marcadas.delete(Number(c.dataset.ia));
        corpo.querySelector('.etiqueta').textContent = lista.length + ' sugestões · ' + marcadas.size + ' marcadas';
        avisoNaJanela();
      }));
      corpo.querySelectorAll('[data-todas]').forEach(b => b.onclick = () => {
        marcadas.clear(); if (b.dataset.todas === '1') lista.forEach((x, i) => marcadas.add(i));
        desenhar();
      });
      corpo.querySelectorAll('[data-ajustar]').forEach(b => b.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        const i = Number(b.dataset.ajustar);
        editando = editando === i ? -1 : i;
        desenhar();
        const ed = corpo.querySelector('.ia-editar');
        if (ed) { ed.scrollIntoView({ block: 'nearest' }); const p = ed.querySelector('[data-ed="pergunta"]'); if (p) p.focus(); }
      }));
      const ed = corpo.querySelector('.ia-editar');
      if (ed) {
        const x = lista[editando];
        ed.querySelector('[data-ed="pergunta"]').addEventListener('input', e => { x.pergunta = e.target.value; });
        ed.querySelector('[data-ed-pos]').addEventListener('change', e => { x.depois_do_slide = Number(e.target.value); });
        ed.querySelectorAll('[data-ed-op]').forEach(el => el.addEventListener('input', () => { x.opcoes[Number(el.dataset.edOp)] = el.value; }));
        ed.querySelectorAll('[data-ed-certa]').forEach(el => el.addEventListener('change', () => { x.correta = Number(el.dataset.edCerta); }));
        ed.querySelectorAll('[data-ed-linhas]').forEach(el => el.addEventListener('input', () => {
          const v = el.value.split('\n').map(t => t.trim()).filter(Boolean).slice(0, 8);
          if (el.dataset.edLinhas === 'opcoes') x.opcoes = v; else x.config.passos = v;
        }));
        ed.querySelectorAll('[data-ed-cfg]').forEach(el => el.addEventListener('input', () => { x.config[el.dataset.edCfg] = el.value; }));
        const rp = ed.querySelector('[data-ed-resp]');
        if (rp) rp.addEventListener('input', () => { x.config.resposta = Object.assign({}, x.config.resposta, { pergunta: rp.value }); });
        const tp = ed.querySelector('[data-ed-tempo]');
        if (tp) tp.addEventListener('change', () => { x.tempo = Number(tp.value); });
        ed.querySelector('[data-ed-pronto]').onclick = () => {
          const erro = conferirSugestao(x);
          if (erro) return toast(erro, true);
          editando = -1; marcadas.add(lista.indexOf(x)); desenhar();
        };
      }
      corpo.querySelector('[data-sair]').onclick = fechar;
      corpo.querySelector('#iaRefazer').onclick = () => {
        const ajuste = corpo.querySelector('#iaAjuste').value.trim();
        if (!ajuste) return toast('Escreva o que a IA deve mudar.', true);
        if (editando >= 0) { const erro = conferirSugestao(lista[editando]); if (erro) return toast(erro, true); }
        pedirIA(f, ctx.slides, ctx.roteiro, ctx.pedido, fechar, { anterior: lista, ajuste });
      };
      corpo.querySelector('#iaAceitar').onclick = () => {
        if (editando >= 0) { const erro = conferirSugestao(lista[editando]); if (erro) return toast(erro, true); }
        const escolhidas = lista.filter((x, i) => marcadas.has(i));
        if (!escolhidas.length) return toast('Marque pelo menos uma sugestão.', true);
        const ruim = escolhidas.map(conferirSugestao).find(Boolean);
        if (ruim) return toast(ruim, true);
        colocarSugestoes(escolhidas);
        fechar();
      };
    }
    desenhar();
  }

  // a sugestão ajustada à mão continua valendo?
  function conferirSugestao(x) {
    if (!String(x.pergunta || '').trim()) return x.tipo === 'grupo' ? 'O exercício em grupo precisa de um título.' : 'A pergunta não pode ficar vazia.';
    if (x.tipo === 'quiz') {
      const ops = x.opcoes.map(o => String(o || '').trim());
      if (ops.filter(Boolean).length < 2) return 'O quiz precisa de pelo menos 2 alternativas.';
      if (x.correta == null || !ops[x.correta]) return 'Marque a alternativa certa do quiz (ela precisa ter texto).';
    }
    if (x.tipo === 'votacao' && x.opcoes.filter(o => String(o || '').trim()).length < 2) return 'A votação precisa de pelo menos 2 opções.';
    if (x.tipo === 'grupo' && !(x.config.passos || []).some(t => String(t).trim())) return 'Escreva o passo a passo do exercício em grupo.';
    return null;
  }

  function colocarSugestoes(lista) {
    const slides = rascunho.itens.filter(i => i.tipo === 'slide');
    const ultimoDe = new Map();   // slide → último item colocado depois dele (para manter a ordem das sugestões)
    // antes do QR code ninguém está no celular: nenhuma atividade entra antes dele
    const qr = rascunho.itens.find(i => i.tipo === 'entrada');
    const antesDoQR = qr ? rascunho.itens.slice(0, rascunho.itens.indexOf(qr)).filter(i => i.tipo === 'slide').length : 0;
    let primeiro = null;
    lista.slice().sort((a, b) => a.depois_do_slide - b.depois_do_slide).forEach(x => {
      const it = novoItem(x.tipo);
      it.pergunta = x.pergunta;
      if (x.tipo === 'quiz') {
        const ops = [], certa = x.opcoes[x.correta];
        x.opcoes.forEach(o => { if (String(o || '').trim()) ops.push(String(o).trim()); });
        it.opcoes = padOpcoes(ops, 4); it.correta = Math.max(0, ops.indexOf(String(certa || '').trim()));
      }
      if (x.tipo === 'votacao') it.opcoes = x.opcoes.map(o => String(o).trim()).filter(Boolean);
      it.tempo = x.tempo;
      it.config = Object.assign(it.config, JSON.parse(JSON.stringify(x.config || {})));
      it.notas = 'Sugestão da IA' + (x.motivo ? ': ' + x.motivo : '.');
      const d = Math.max(Number(x.depois_do_slide) || 0, antesDoQR);
      const ref = qr && d === antesDoQR ? qr : (d > 0 ? slides[d - 1] : null);
      const ancora = ultimoDe.get(ref || 'inicio') || ref;
      if (ancora) rascunho.itens.splice(rascunho.itens.indexOf(ancora) + 1, 0, it);
      else rascunho.itens.unshift(it);
      ultimoDe.set(ref || 'inicio', it);
      if (!primeiro) primeiro = it;
    });
    if (primeiro) selK = primeiro._k;
    desenharLista(); desenharItem(); mudou();
    toast(lista.length + (lista.length === 1 ? ' atividade entrou' : ' atividades entraram') + ' no roteiro. Confira e ajuste o que quiser.');
  }

  let pdfjs = null;
  async function carregarPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import(new URL('js/vendor/pdf.min.mjs', location.href).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('js/vendor/pdf.worker.min.mjs', location.href).href;
    return pdfjs;
  }
  function carregarScript(src) {
    return new Promise((ok, falha) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => falha(new Error('Não consegui carregar ' + src)); document.head.appendChild(s); });
  }
  async function carregarJSZip() { if (!window.JSZip) await carregarScript('js/vendor/jszip.min.js'); return window.JSZip; }

  const ehPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const ehApresentacao = f => /\.(pptx|ppsx|ppt|pps|odp)$/i.test(f.name);

  async function importarArquivos(arquivos) {
    if (importando) return toast('Espere terminar o envio que está em andamento.', true);
    const notasApenas = soNotas; soNotas = false;
    let pdf = arquivos.find(ehPdf);
    const pptx = arquivos.find(f => /\.(pptx|ppsx)$/i.test(f.name)) || (pptxGuardado && pdf ? pptxGuardado : null);
    const paraConverter = arquivos.find(ehApresentacao);
    if (!pdf && !paraConverter) {
      return toast(arquivos.some(f => /\.key$/i.test(f.name))
        ? 'Arquivo do Keynote: no Keynote, clique em Arquivo, Exportar para, PDF, e envie o PDF.'
        : 'Envie a apresentação em PowerPoint (.pptx) ou em PDF.', true);
    }
    importando = true;
    try {
      let notas = null;
      if (pptx) {
        desenharArquivo({ texto: 'Lendo as notas do PowerPoint...', parte: 0.02 });
        try { notas = await lerPptx(pptx); }
        catch (e) { toast('Não consegui ler as notas desse PowerPoint. Os slides vêm sem notas.', true); notas = null; }
      }
      if (!pdf && notasApenas && rascunho.itens.some(i => i.tipo === 'slide')) {
        const slides = rascunho.itens.filter(i => i.tipo === 'slide');
        if (!notas) throw new Error('Não encontrei notas nesse arquivo.');
        let n = 0;
        slides.forEach((s, j) => {
          const x = notas[j];
          if (x && x.notas) { s.notas = x.notas; n++; }
          if (x && x.titulo && !s.pergunta) s.pergunta = x.titulo;
          if (x && x.texto) s.config = Object.assign({}, s.config, { texto: x.texto.slice(0, 1500) });
        });
        lembrarAula({ id: atual.id, notasPptx: true });
        toast(n + (n === 1 ? ' slide recebeu notas.' : ' slides receberam notas.') + (notas.length !== slides.length ? ' Atenção: o PowerPoint tem ' + notas.length + ' slides visíveis e o roteiro tem ' + slides.length + '. Confira.' : ''), notas.length !== slides.length);
        desenharLista(); desenharItem(); mudou();
        return;
      }
      // PowerPoint (ou OpenOffice) sem PDF: a plataforma transforma em PDF sozinha
      if (!pdf) pdf = await converterParaPdf(paraConverter);
      await importarPdf(pdf, notas);
    } catch (e) {
      toast(e.message || 'Não deu certo enviar os slides.', true);
    } finally {
      importando = false;
      desenharArquivo();
    }
  }

  async function importarPdf(arquivo, notas) {
    desenharArquivo({ texto: 'Abrindo o PDF...', parte: 0.03 });
    const lib = await carregarPdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
    // páginas que entram: se o PDF veio com os slides escondidos do PowerPoint (a conversão às vezes traz), eles saem
    let paginas = Array.from({ length: doc.numPages }, (_, i) => i + 1);
    if (notas && notas.ocultos && notas.ocultos.length && doc.numPages === notas.total) {
      const fora = new Set(notas.ocultos);
      paginas = paginas.filter(p => !fora.has(p));
    }
    const n = paginas.length;
    if (n > 150) throw new Error('Esse PDF tem ' + n + ' páginas. O limite é 150.');
    const bilhete = await rpc('aovivo_bilhetes_upload', { p_sessao: atual.id, p_chave: atual.chave, p_quantidade: n });
    const titulos = [], textos = [];
    let enviados = 0;
    const emVoo = new Set();
    const prog = () => desenharArquivo({ texto: 'Preparando os slides: ' + enviados + ' de ' + n + ' prontos', parte: 0.05 + 0.95 * enviados / n });
    prog();
    for (let i = 1; i <= n; i++) {
      const pag = await doc.getPage(paginas[i - 1]);
      const vp1 = pag.getViewport({ scale: 1 });
      const escala = Math.min(1600 / vp1.width, 1600 / vp1.height);
      const vp = pag.getViewport({ scale: escala });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      // intent 'print' não depende de requestAnimationFrame: continua mesmo com a aba em segundo plano
      await pag.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
      titulos[i - 1] = await tituloPagina(pag);
      textos[i - 1] = await textoPagina(pag);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
      pag.cleanup();
      const pr = enviarImagem(bilhete.caminhos[i - 1], blob).then(() => { emVoo.delete(pr); enviados++; prog(); });
      emVoo.add(pr);
      if (emVoo.size >= 3) await Promise.race(emVoo);
    }
    await Promise.all(emVoo);
    doc.destroy();

    // junta com o roteiro: mesmo número de slide recebe a imagem nova; notas e atividades ficam
    const slides = rascunho.itens.filter(i => i.tipo === 'slide');
    const primeiraVez = !slides.length;
    const novos = [];
    for (let j = 0; j < n; j++) {
      const url = bilhete.base + bilhete.caminhos[j];
      const x = notas ? notas[j] : null;
      const titulo = (x && x.titulo) || titulos[j] || '';
      const texto = ((x && x.texto) || textos[j] || '').slice(0, 1500);
      if (j < slides.length) {
        const s = slides[j];
        s.config = Object.assign({}, s.config, { imagem: url, texto });
        if (titulo) s.pergunta = titulo.slice(0, 200);
        if (x && x.notas) s.notas = x.notas;
      } else {
        const s = { _k: ++contadorK, tipo: 'slide', pergunta: titulo.slice(0, 200), opcoes: [], correta: null, tempo: 0, config: { imagem: url, celular: true, texto }, notas: (x && x.notas) || '' };
        novos.push(s);
      }
    }
    let tirados = 0;
    if (slides.length > n) {
      const sobra = new Set(slides.slice(n));
      tirados = sobra.size;
      rascunho.itens = rascunho.itens.filter(i => !sobra.has(i));
    }
    if (primeiraVez) rascunho.itens = novos.concat(rascunho.itens);
    else rascunho.itens = rascunho.itens.concat(novos);
    if (!selK || !itemSel()) selK = rascunho.itens[0] && rascunho.itens[0]._k;
    lembrarAula({ id: atual.id, arquivo: arquivo.name, notasPptx: !!(notas && notas.some(x => x.notas)) || (!primeiraVez && infoAula().notasPptx) });
    desenharLista(); desenharItem();
    sujo = true;
    await salvar(true);
    let msg = n + (n === 1 ? ' slide pronto.' : ' slides prontos.');
    if (tirados) msg += ' ' + tirados + (tirados === 1 ? ' slide antigo saiu' : ' slides antigos saíram') + ' do roteiro porque o PDF novo é menor.';
    if (notas && notas.length !== n) msg += ' Atenção: o PowerPoint tem ' + notas.length + ' slides visíveis e o PDF tem ' + n + '. Confira as notas.';
    toast(msg, !!(notas && notas.length !== n));
  }

  async function enviarImagem(caminho, blob) {
    for (let t = 0; t < 3; t++) {
      const { error } = await A.sb.storage.from('aovivo-slides').upload(caminho, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (!error || /exist|duplicate/i.test(error.message || '')) return;
      if (t === 2) throw new Error('Não consegui enviar um dos slides (' + (error.message || 'erro') + '). Tente de novo.');
      await espera(900 * (t + 1));
    }
  }

  // material em PDF para os alunos: abre no celular, dentro do Ao Vivo (vários de uma vez; no exercício, para todos ou um grupo)
  function enviarMaterial(a) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.pdf,application/pdf'; inp.multiple = true;
    inp.onchange = () => enviarArquivosMaterial(a, Array.from(inp.files || []));
    inp.click();
  }

  async function enviarArquivosMaterial(a, arquivos) {
      if (!arquivos.length) return;
      const lista = a.config.materiais || (a.config.materiais = []);
      let ok = 0;
      for (const f of arquivos) {
        if (lista.length >= 12) { toast('Cabem até 12 materiais por item.', true); break; }
        if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { toast(f.name + ' não é PDF. No PowerPoint ou no Word: Arquivo, Salvar como, PDF.', true); continue; }
        if (f.size > 15 * 1024 * 1024) { toast(f.name + ' tem mais de 15 MB. Diminua o arquivo e tente de novo.', true); continue; }
        try {
          toast('Enviando ' + f.name + '...');
          const b = await rpc('aovivo_bilhete_pdf', { p_sessao: atual.id, p_chave: atual.chave });
          const { error } = await A.sb.storage.from('aovivo-slides').upload(b.caminho, f, { contentType: 'application/pdf', cacheControl: '31536000', upsert: false });
          if (error) throw new Error('Não consegui enviar ' + f.name + ' (' + (error.message || 'erro') + ').');
          // nome do arquivo com "grupo 2" (ou "G2") já vai para o grupo 2
          const g = a.tipo === 'grupo' ? (f.name.match(/(?:grupo|equipe|sala|\bg)\s*0?(\d{1,2})\b/i) || [])[1] : null;
          lista.push({ pdf: b.base + b.caminho, nome: f.name.replace(/\.pdf$/i, '').slice(0, 80), grupo: g ? Number(g) : null });
          ok++;
        } catch (e) { toast(e.message, true); }
      }
      if (ok) { desenharItem(); atualizarLinha(a); mudou(); toast(ok === 1 ? 'Material anexado.' : ok + ' materiais anexados.'); }
  }

  function opcoesGrupoMaterial(a) {
    const g = a.config.grupos || {}, modo = g.modo || 'escolher';
    if (a.tipo !== 'grupo' || modo === 'nenhum') return null;
    if (modo === 'equipes' && rascunho.modo_equipes) return rascunho.equipes.map((e, i) => [i + 1, 'Equipe ' + (e || i + 1)]);
    const n = modo === 'sortear' ? 20 : (g.quantos || 6);
    return Array.from({ length: n }, (_, i) => [i + 1, 'Grupo ' + (i + 1)]);
  }

  function blocoMateriais(a) {
    const lista = a.config.materiais || [], grupos = opcoesGrupoMaterial(a);
    return '<div class="campo ed-materiais"><label>' + (a.tipo === 'grupo' ? '📄 PDF para os grupos abrirem no celular (opcional)' : '📎 Material em PDF para os alunos (opcional)') + '</label>' +
      (lista.length ? '<div class="ed-mat-lista">' + lista.map((m, j) =>
        '<div class="ed-mat"><a class="ed-pdf" href="' + esc(m.pdf) + '" target="_blank" rel="noopener">📄 ' + esc(m.nome || 'material') + '</a>' +
        (grupos ? '<select class="entrada entrada-mini" data-mat-grupo="' + j + '" title="Quem vê este material"><option value="">Todos os grupos</option>' +
          grupos.map(([n, t]) => '<option value="' + n + '"' + (m.grupo === n ? ' selected' : '') + '>Só ' + esc(t) + '</option>').join('') + '</select>' : '') +
        '<button class="btn btn-secundario btn-icone" data-mat-tirar="' + j + '" title="Tirar este material">✕</button></div>').join('') + '</div>' : '') +
      '<div class="ed-soltar" data-mat-soltar><span class="ic" aria-hidden="true">📄</span><b>' + (lista.length ? 'Mais um PDF? Arraste aqui' : 'Arraste o PDF aqui') + '</b><span>ou</span>' +
        '<button class="btn btn-secundario btn-pequeno" type="button" data-mat-enviar>Escolher o PDF</button></div>' +
      '<span class="dica">' + (a.tipo === 'grupo'
        ? 'O aluno abre o PDF dentro do Ao Vivo, no celular, sem baixar nada. Cada grupo com um caso diferente? Anexe um PDF por grupo e escolha "Só Grupo 1", "Só Grupo 2"... (se o nome do arquivo tiver "grupo 2", ele já vai para o Grupo 2).'
        : 'Aparece no celular enquanto este slide estiver no telão: o aluno abre e lê dentro do Ao Vivo, sem baixar nada.') + '</span></div>';
  }

  // todo o texto da página (vai para a IA ler a aula e sugerir as atividades)
  async function textoPagina(pag) {
    try {
      const tc = await pag.getTextContent();
      return tc.items.map(x => x.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
    } catch (e) { return ''; }
  }

  async function tituloPagina(pag) {
    try {
      const tc = await pag.getTextContent();
      const itens = tc.items.filter(x => x.str && x.str.trim());
      if (!itens.length) return '';
      const alt = x => Math.hypot(x.transform[2], x.transform[3]);
      const max = Math.max(...itens.map(alt));
      const grandes = itens.filter(x => alt(x) >= max * 0.9);
      grandes.sort((a, b) => (b.transform[5] - a.transform[5]) || (a.transform[4] - b.transform[4]));
      return grandes.map(x => x.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    } catch (e) { return ''; }
  }

  async function lerPptx(arquivo) {
    const JSZip = await carregarJSZip();
    const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
    const xml = async caminho => {
      const f = zip.file(caminho);
      if (!f) return null;
      return new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    };
    const tags = (doc, nome) => Array.from(doc.getElementsByTagNameNS('*', nome));
    const pres = await xml('ppt/presentation.xml');
    const rels = await xml('ppt/_rels/presentation.xml.rels');
    if (!pres || !rels) throw new Error('Arquivo inválido');
    const mapa = {};
    tags(rels, 'Relationship').forEach(r => { mapa[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const lista = [], ocultos = [];
    let todos = 0;
    for (const s of tags(pres, 'sldId')) {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const alvo = mapa[rid];
      if (!alvo) continue;
      const caminho = alvo.charAt(0) === '/' ? alvo.slice(1) : resolver('ppt/presentation.xml', alvo);
      const sld = await xml(caminho);
      if (!sld) continue;
      todos++;
      if (sld.documentElement.getAttribute('show') === '0') { ocultos.push(todos); continue; } // slide escondido não vai para o PDF
      const titulo = textoDoMarcador(sld, ['title', 'ctrTitle']);
      let notas = '';
      const relsSlide = await xml(caminho.replace(/([^/]+)$/, '_rels/$1.rels'));
      if (relsSlide) {
        const r = tags(relsSlide, 'Relationship').find(x => /\/notesSlide$/.test(x.getAttribute('Type') || ''));
        if (r) {
          const nd = await xml(resolver(caminho, r.getAttribute('Target')));
          if (nd) notas = textoDoMarcador(nd, ['body']);
        }
      }
      const texto = Array.from(sld.getElementsByTagNameNS('*', 'p'))
        .map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(x => x.textContent).join('')).filter(t => t.trim()).join(' · ');
      lista.push({ titulo: titulo.replace(/\s+/g, ' ').trim(), notas: notas.slice(0, 4000), texto: texto.replace(/\s+/g, ' ').trim().slice(0, 1500) });
    }
    lista.total = todos; lista.ocultos = ocultos;   // números (1, 2, 3...) dos slides escondidos, na ordem do PowerPoint
    return lista;
  }

  function resolver(base, rel) {
    const partes = base.split('/'); partes.pop();
    rel.split('/').forEach(p => { if (p === '..') partes.pop(); else if (p && p !== '.') partes.push(p); });
    return partes.join('/');
  }

  function textoDoMarcador(doc, tipos) {
    const sps = doc.getElementsByTagNameNS('*', 'sp');
    for (const sp of Array.from(sps)) {
      const ph = sp.getElementsByTagNameNS('*', 'ph')[0];
      if (!ph || !tipos.includes(ph.getAttribute('type') || 'obj')) continue;
      return Array.from(sp.getElementsByTagNameNS('*', 'p'))
        .map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(x => x.textContent).join(''))
        .filter(t => t.trim()).join('\n').trim();
    }
    return '';
  }

  /* ---------- Lista do roteiro ---------- */
  let arrastandoK = null;

  function txtLinha(it, nSlide) {
    if (it.tipo === 'slide') {
      return '<b>Slide ' + nSlide + (it.pergunta ? ' · ' + esc(it.pergunta) : '') + '</b><span>' + (it.notas ? esc(it.notas.slice(0, 140)) : '<i>Sem notas</i>') + '</span>';
    }
    if (it.tipo === 'entrada') return '<b>QR code de novo</b><span>' + esc(it.pergunta.trim() || 'Pegue o celular e entre na aula!') + ' · o telão mostra o QR code e o código</span>';
    return '<b>' + TIPOS[it.tipo].nome + ' · ' + resumoTempo(it) + '</b><span>' + (it.pergunta.trim() ? esc(it.pergunta) : '<i>Sem pergunta ainda</i>') + '</span>';
  }

  // as quatro funções que deixam a aula do jeito Mentorei (nuvem, quiz, votação e escala)
  const QUATRO = ['nuvem', 'quiz', 'votacao', 'escala'];
  const NOME_CURTO = { nuvem: 'nuvem de palavras', quiz: 'quiz', votacao: 'votação', escala: 'escala' };
  function faltandoNasQuatro(tipos) { return QUATRO.filter(t => !tipos.includes(t)); }
  function listaE(nomes) { return nomes.length <= 1 ? nomes.join('') : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1]; }
  function avisoChatoHTML(faltam, extra) {
    return '<div class="aviso-chato"><span class="ac-icone">⚠️</span><div><b>Seu módulo está na zona de risco de ser bem chato!</b>' +
      '<p>Falta' + (faltam.length > 1 ? 'm' : '') + ' ' + listaE(faltam.map(t => NOME_CURTO[t])) + '. Numa aula de 3 horas, use as quatro funções (nuvem, quiz, votação e escala) pelo menos uma vez cada.' + (extra || '') + '</p></div></div>';
  }
  function desenharAvisoChato() {
    const box = $('avisoChato');
    if (!box) return;
    const temSlides = rascunho.itens.some(i => i.tipo === 'slide');
    const faltam = faltandoNasQuatro(rascunho.itens.map(i => i.tipo));
    if (!temSlides || !rascunho.itens.length) { box.innerHTML = ''; return; }
    // aula já encerrada (ensaio ou aula anterior): zerar para usar de novo, com a capa e o QR code no lugar certo
    const usada = painel && painel.fase === 'encerrada';
    const nPessoas = usada ? (painel.participantes || []).length : 0;
    box.innerHTML = (usada ? '<div class="aviso-qr"><span class="ac-icone">🔄</span><div><b>Esta aula já foi encerrada (ensaio ou aula anterior).</b>' +
        '<p>Para usar de novo do zero, clique em "Zerar para a próxima aula". Saem ' + (nPessoas === 1 ? 'a pessoa que entrou' : 'as ' + nPessoas + ' pessoas que entraram') +
        ', as respostas e os pontos. Os slides e as atividades ficam. Aí o telão volta para a tela de boas-vindas com o QR code.</p>' +
        '<button class="btn btn-secundario btn-mini" type="button" id="btnZerar">Zerar para a próxima aula</button></div></div>' : '') +
      (faltam.length
        ? avisoChatoHTML(faltam, ' <button class="btn btn-ia btn-mini" type="button" id="btnIA2">✨ Deixar do jeito Mentorei!</button>')
        : '<div class="aviso-mentorei">✓ Do jeito Mentorei: a aula tem nuvem, quiz, votação e escala.</div>');
    const b = $('btnIA2');
    if (b) b.onclick = sugerirComIA;
    const z = $('btnZerar');
    if (z) z.onclick = ev => popover(ev, 'Zerar a aula? Saem as pessoas, as respostas e os pontos (não dá para desfazer). Os slides e as atividades ficam.', 'Zerar', zerarAula);
  }

  async function zerarAula() {
    try {
      if (sujo && !(await salvar(false))) return;
      painel = await rpc('aovivo_reiniciar', { p_sessao: atual.id, p_chave: atual.chave, p_remover_participantes: true });
      ultVersao = -1; ultimaPos = -1;
      try { localStorage.removeItem('aovivo_pos_' + atual.id); } catch (e) {}
      const tirou = tirarQRAutomatico();
      desenharLista(); desenharItem();
      if (tirou) mudou();
      if (typeof atualizarBotaoAoVivo === 'function') atualizarBotaoAoVivo();
      toast('Pronto: a aula está zerada' + (painel.codigo ? ' (código ' + A.formatarCodigo(painel.codigo) + ')' : '') + '. O telão começa pela tela de boas-vindas com o QR code.');
    } catch (e) { toast(e.message, true); }
  }

  function desenharLista() {
    desenharAvisoChato();
    const l = $('listaRoteiro');
    if (!rascunho.itens.length) {
      l.innerHTML = '<div class="vazio"><p style="margin-bottom:14px">O roteiro está vazio. Envie a apresentação (PowerPoint ou PDF) lá em cima, escolha uma atividade abaixo ou comece com exemplos prontos para testar.</p>' +
        '<button class="btn btn-secundario" id="btnExemplos">Adicionar exemplos prontos</button></div>';
      $('btnExemplos').onclick = adicionarExemplos;
      return;
    }
    let nSlide = 0;
    l.innerHTML = rascunho.itens.map((it, i) => {
      const sel = it._k === selK ? ' selecionado' : '';
      if (it.tipo === 'slide') {
        nSlide++;
        return '<div class="ed-item' + sel + '" data-k="' + it._k + '" draggable="true"><span class="ed-pos">' + (i + 1) + '</span>' +
          '<img class="ed-mini" src="' + esc(it.config.imagem) + '" alt="" loading="lazy" draggable="false"><div class="ed-txt">' + txtLinha(it, nSlide) + '</div>' +
          (it.config.celular === false ? '<span class="ed-flag" title="Este slide não aparece no celular">📵</span>' : '') + '</div>';
      }
      const ti = it.tipo === 'entrada' ? null : tempoInfo(it.tipo);
      return '<div class="ed-item ed-ativ' + sel + '" data-k="' + it._k + '" draggable="true"><span class="ed-pos">' + (i + 1) + '</span>' +
        '<span class="ed-mini-ativ tipo-' + it.tipo + '">' + TIPOS[it.tipo].icone + '</span><div class="ed-txt">' + txtLinha(it, 0) + '</div>' +
        (ti ? '<label class="ed-tempo-linha" title="Tempo desta atividade (' + ti.unLonga + (ti.semLimite ? '; 0 = sem limite' : '') + ')"><span aria-hidden="true">⏱</span>' +
          '<input data-tempo-linha inputmode="decimal" maxlength="5" value="' + tempoParaCampo(it) + '" aria-label="Tempo em ' + ti.unLonga + '"><span>' + ti.un + '</span></label>' : '') + '</div>';
    }).join('');
    l.querySelectorAll('[data-tempo-linha]').forEach(inp => {
      const it = rascunho.itens.find(x => x._k === Number(inp.closest('.ed-item').dataset.k));
      ['click', 'mousedown', 'dragstart'].forEach(ev => inp.addEventListener(ev, e => e.stopPropagation()));
      inp.closest('.ed-item').addEventListener('dragstart', e => { if (document.activeElement === inp) e.preventDefault(); });
      inp.addEventListener('input', () => {
        if (!it || inp.value.trim() === '') return;
        it.tempo = tempoDoCampo(it.tipo, inp.value);
        const ed = document.querySelector('#editorItem [data-tempo-ed]');
        if (ed && it._k === selK) ed.value = tempoParaCampo(it);
        const txt = inp.closest('.ed-item').querySelector('.ed-txt');
        if (txt) txt.innerHTML = txtLinha(it, 0);
        mudou();
      });
      inp.addEventListener('blur', () => { if (it) inp.value = tempoParaCampo(it); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    });
    l.querySelectorAll('.ed-item').forEach(el => {
      const k = Number(el.dataset.k);
      el.addEventListener('click', () => { selK = k; marcarSelecao(); desenharItem(); });
      el.addEventListener('dragstart', ev => {
        arrastandoK = k; el.classList.add('arrastando');
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', String(k)); } catch (x) {}
      });
      el.addEventListener('dragend', () => { arrastandoK = null; el.classList.remove('arrastando'); limparMarcas(); });
      el.addEventListener('dragover', ev => {
        if (arrastandoK == null) return;
        ev.preventDefault();
        const r = el.getBoundingClientRect();
        limparMarcas();
        el.classList.add(ev.clientY > r.top + r.height / 2 ? 'marca-depois' : 'marca-antes');
      });
      el.addEventListener('drop', ev => {
        if (arrastandoK == null) return;
        ev.preventDefault();
        const r = el.getBoundingClientRect();
        moverPara(arrastandoK, k, ev.clientY > r.top + r.height / 2);
      });
    });
  }

  function limparMarcas() { document.querySelectorAll('.marca-antes,.marca-depois').forEach(x => x.classList.remove('marca-antes', 'marca-depois')); }
  function marcarSelecao() { document.querySelectorAll('.ed-item').forEach(el => el.classList.toggle('selecionado', Number(el.dataset.k) === selK)); }

  function moverPara(k, alvoK, depois) {
    limparMarcas();
    if (k === alvoK) return;
    const it = rascunho.itens.find(x => x._k === k);
    rascunho.itens.splice(rascunho.itens.indexOf(it), 1);
    const alvo = rascunho.itens.findIndex(x => x._k === alvoK);
    rascunho.itens.splice(alvo + (depois ? 1 : 0), 0, it);
    desenharLista(); desenharItem(); mudou();
  }

  function atualizarLinha(it) {
    const el = document.querySelector('.ed-item[data-k="' + it._k + '"] .ed-txt');
    if (el) el.innerHTML = txtLinha(it, it.tipo === 'slide' ? numeroSlideRascunho(it) : 0);
    const flag = document.querySelector('.ed-item[data-k="' + it._k + '"]');
    if (flag && it.tipo === 'slide') {
      let f = flag.querySelector('.ed-flag');
      if (it.config.celular === false && !f) flag.insertAdjacentHTML('beforeend', '<span class="ed-flag" title="Este slide não aparece no celular">📵</span>');
      if (it.config.celular !== false && f) f.remove();
    }
  }

  /* ---------- Editor do item selecionado ---------- */
  function opcoesSelect(atualV, lista) {
    return lista.map(([v, t]) => '<option value="' + v + '"' + (Number(atualV) === v ? ' selected' : '') + '>' + t + '</option>').join('');
  }

  function placeholderPergunta(tipo) {
    return {
      nuvem: 'Ex.: Em uma palavra, o que faz uma comunicação ser influente?',
      quiz: 'Ex.: Qual é o primeiro passo de um bom feedback?',
      votacao: 'Ex.: Qual desafio mais aparece na sua equipe?',
      escala: 'Ex.: Quanto você se sente preparado para dar um feedback difícil?',
      grupo: 'Ex.: Desafio do cliente difícil',
      ferramenta: 'Nome da ferramenta'
    }[tipo];
  }

  const TEMPOS_GRUPO = [[180, '3 minutos'], [300, '5 minutos'], [420, '7 minutos'], [600, '10 minutos'], [720, '12 minutos'], [900, '15 minutos'],
    [1200, '20 minutos'], [1500, '25 minutos'], [1800, '30 minutos'], [2700, '45 minutos'], [3600, '1 hora']];

  // Tempo digitado (pedido da Juliana, 16/11/2026): quiz em segundos; o resto em minutos (aceita 1,5). O servidor confere de novo.
  function tempoInfo(tipo) {
    if (tipo === 'quiz') return { mult: 1, un: 'seg', unLonga: 'segundos', padrao: 30, semLimite: false };
    if (tipo === 'grupo') return { mult: 60, un: 'min', unLonga: 'minutos', padrao: 600, semLimite: false };
    return { mult: 60, un: 'min', unLonga: 'minutos', padrao: 0, semLimite: true };
  }
  function tempoParaCampo(it) {
    const t = tempoInfo(it.tipo), s = it.tempo || t.padrao;
    if (t.mult === 1) return String(s);
    return s ? String(Math.round(s / 60 * 10) / 10).replace('.', ',') : '0';
  }
  function tempoDoCampo(tipo, valor) {
    const t = tempoInfo(tipo);
    let n = Number(String(valor || '').trim().replace(',', '.'));
    if (!isFinite(n) || n < 0) n = 0;
    let seg = Math.round(n * t.mult);
    if (tipo === 'quiz') return Math.min(180, Math.max(5, seg || 30));
    if (tipo === 'grupo') return Math.min(3600, Math.max(60, seg || 600));
    return Math.min(3600, Math.max(0, seg));
  }
  function campoTempo(a, rotulo) {
    const t = tempoInfo(a.tipo);
    return '<div class="campo campo-tempo"><label>' + rotulo + '</label><div class="tempo-dig"><input class="entrada" data-tempo-ed inputmode="decimal" maxlength="5" value="' + tempoParaCampo(a) + '" aria-label="' + rotulo + ' em ' + t.unLonga + '"><span>' + t.unLonga + '</span></div>' +
      (t.semLimite ? '<small class="dica">0 = sem limite (você encerra)</small>' : a.tipo === 'quiz' ? '<small class="dica">De 5 a 180 segundos</small>' : '<small class="dica">De 1 a 60 minutos. Dá para usar 1,5</small>') + '</div>';
  }

  function corpoGrupo(a) {
    const c = a.config, g = c.grupos || {}, r = c.resposta || {};
    const nums = (de, ate) => { const l = []; for (let n = de; n <= ate; n++) l.push([n, String(n)]); return l; };
    const radio = (v, txt, extra, desligado) => '<label class="ed-radio' + (desligado ? ' desligado' : '') + '"><input type="radio" name="modo' + a._k + '" value="' + v + '"' +
      ((g.modo || 'escolher') === v ? ' checked' : '') + (desligado ? ' disabled' : '') + '><span>' + txt + (extra && (g.modo || 'escolher') === v ? extra : '') + '</span></label>';
    return '<div class="campo"><label>Título do exercício</label><input class="entrada" data-campo="pergunta" maxlength="200" value="' + esc(a.pergunta) + '" placeholder="Ex.: Desafio do cliente difícil"></div>' +
      '<div class="campo"><label>Passo a passo (um passo por linha, até 8)</label><textarea class="entrada ed-passos" data-passos maxlength="2400" placeholder="Ex.: Leiam o caso em voz alta&#10;Cada pessoa conta como agiria&#10;Escolham juntos a melhor resposta">' + esc((c.passos || []).join('\n')) + '</textarea>' +
      '<span class="dica">Escreva de um jeito que ninguém precise voltar à sala principal para perguntar o que fazer. Aparece no telão e no celular de cada aluno, com o cronômetro.</span></div>' +
      '<div class="campo"><label>O que cada grupo leva de volta</label><input class="entrada" data-cfgtxt="entrega" maxlength="300" value="' + esc(c.entrega || '') + '" placeholder="Ex.: A resposta escolhida e um porta-voz para contar em 1 minuto"></div>' +
      blocoMateriais(a) +
      '<div class="config-linha">' + campoTempo(a, 'Tempo do exercício') +
      '<p class="dica" style="flex:1;min-width:200px">Na hora, dá para dar +1 minuto. Quando o tempo acaba, o celular de todos vibra e avisa para voltar.</p></div>' +
      '<div class="campo"><label>Como formar os grupos</label><div class="ed-radios">' +
      radio('escolher', 'Cada um marca no celular o número do seu grupo ou da sua sala do Zoom', ' · quantos grupos: <select class="entrada entrada-mini" data-grupos="quantos">' + opcoesSelect(g.quantos || 6, nums(2, 20)) + '</select>') +
      radio('sortear', 'O Ao Vivo sorteia os grupos na hora e mostra quem está com quem', ' · pessoas por grupo: <select class="entrada entrada-mini" data-grupos="tamanho">' + opcoesSelect(g.tamanho || 4, nums(2, 8)) + '</select>') +
      radio('equipes', 'Usar as equipes da aula' + (rascunho.modo_equipes ? '' : ' (ligue "Jogar em equipes" lá em cima)'), '', !rascunho.modo_equipes) +
      radio('nenhum', 'Sem grupos: cada um faz no seu ritmo', '') + '</div></div>' +
      '<label class="interruptor"><input type="checkbox" data-resp' + (r.ligada !== false ? ' checked' : '') + '><span class="trilho"></span>Um do grupo manda a resposta do grupo pelo celular</label>' +
      (r.ligada !== false ? '<div class="campo"><label>O que o grupo escreve</label><input class="entrada" data-resp-perg maxlength="160" value="' + esc(r.pergunta || '') + '" placeholder="Ex.: Qual foi a resposta escolhida pelo grupo?"></div>' +
        '<p class="dica">As respostas aparecem para você no painel durante o exercício e no telão quando você clicar em "Ver as respostas dos grupos".</p>' : '') +
      '';
  }

  function corpoFerramenta(a) {
    const c = a.config;
    const conhecida = A.FERRAMENTAS.find(f => f.url === c.url);
    const outra = !conhecida && (c.url || a._outra);
    return '<div class="campo"><label>Ferramenta</label><select class="entrada" data-ferr><option value="">Escolha a ferramenta</option>' +
      A.FERRAMENTAS.map(f => '<option value="' + f.codigo + '"' + (conhecida === f ? ' selected' : '') + '>' + esc(f.nome) + '</option>').join('') +
      '<option value="outra"' + (outra ? ' selected' : '') + '>Outro link</option></select></div>' +
      (outra ? '<div class="campo"><label>Nome que aparece para os alunos</label><input class="entrada" data-campo="pergunta" maxlength="200" value="' + esc(a.pergunta) + '" placeholder="Ex.: Teste de perfil"></div>' +
        '<div class="campo"><label>Link (começa com https://)</label><input class="entrada" data-cfgtxt="url" maxlength="500" value="' + esc(c.url || '') + '" placeholder="https://"></div>' : '') +
      '<div class="campo"><label>Recado para os alunos (opcional)</label><input class="entrada" data-cfgtxt="instrucao" maxlength="300" value="' + esc(c.instrucao || '') + '" placeholder="Ex.: Responda com calma. Quando terminar, volte aqui e toque em Terminei."></div>' +
      '<div class="config-linha">' + campoTempo(a, 'Tempo') + '</div>' +
      '<p class="dica">No celular, o aluno toca em "Abrir a ferramenta" e, quando termina, em "Terminei". O telão mostra o QR code da ferramenta para quem não está no Ao Vivo. Você vê no painel quantos já terminaram.</p>';
  }

  function corpoEntrada(a) {
    return '<div class="campo"><label>Frase no telão (opcional)</label><input class="entrada" data-campo="pergunta" maxlength="120" value="' + esc(a.pergunta) + '" placeholder="Pegue o celular e entre na aula!"></div>' +
      '<p class="dica">Quando você chega neste item, o telão mostra o QR code e o código da aula, e o nome de cada aluno aparece assim que ele entra. ' +
      'O telão já começa com o QR code na tela de boas-vindas. Use este item se quiser mostrar o QR code de novo no meio da aula (por exemplo, depois do intervalo).</p>';
  }

  function corpoAtividade(a) {
    if (a.tipo === 'entrada') return corpoEntrada(a);
    if (a.tipo === 'grupo') return corpoGrupo(a);
    if (a.tipo === 'ferramenta') return corpoFerramenta(a);
    let corpo = '<div class="campo"><label>Pergunta</label><input class="entrada" data-campo="pergunta" maxlength="200" value="' + esc(a.pergunta) + '" placeholder="' + placeholderPergunta(a.tipo) + '"></div>';
    if (a.tipo === 'quiz') {
      corpo += '<div class="campo"><label>Alternativas (marque a certa)</label>' + a.opcoes.map((o, j) =>
        '<div class="alternativa-editor"><span class="marca" style="background:' + ALTERNATIVAS[j].cor + '">' + formaSVG(ALTERNATIVAS[j].forma) + '</span>' +
        '<input class="entrada" data-opcao="' + j + '" maxlength="80" value="' + esc(o) + '" placeholder="Alternativa ' + ALTERNATIVAS[j].letra + (j > 1 ? ' (opcional)' : '') + '">' +
        '<label class="certa"><input type="radio" name="certa' + a._k + '" data-certa="' + j + '"' + (a.correta === j ? ' checked' : '') + '>certa</label></div>').join('') + '</div>';
      corpo += '<div class="config-linha">' + campoTempo(a, 'Tempo para responder') +
        '<p class="dica" style="flex:1;min-width:200px">Acertou rápido ganha até 1.000 pontos. Acertos seguidos dão bônus. Na hora, dá para dar +15 segundos.</p></div>';
    } else if (a.tipo === 'votacao') {
      const entre = !!(a.config && a.config.entre_equipes);
      corpo += '<label class="interruptor"' + (rascunho.modo_equipes ? '' : ' style="opacity:.5"') + '><input type="checkbox" data-entre' + (entre ? ' checked' : '') + (rascunho.modo_equipes ? '' : ' disabled') + '><span class="trilho"></span>Votação entre as equipes</label>' +
        (rascunho.modo_equipes ? '' : '<p class="dica">Para votar entre equipes, ligue "Jogar em equipes" lá em cima.</p>');
      if (entre && rascunho.modo_equipes) {
        corpo += '<p class="dica">As opções serão as equipes da aula. Ninguém vota na própria equipe, e a equipe mais votada ganha pontos extras para todos os membros.</p>' +
          '<div class="config-linha"><div class="campo"><label>Pontos extras para a vencedora</label><select class="entrada" data-cfg="bonus">' +
          opcoesSelect(a.config.bonus == null ? 300 : a.config.bonus, [[0, 'Sem pontos extras'], [100, '100 pontos'], [200, '200 pontos'], [300, '300 pontos'], [500, '500 pontos'], [1000, '1.000 pontos']]) + '</select></div></div>';
      } else {
        corpo += '<div class="campo"><label>Opções de voto</label>' + a.opcoes.map((o, j) =>
          '<div class="alternativa-editor"><span class="marca" style="background:' + A.CORES_EQUIPE[j % 8] + '">' + (j + 1) + '</span>' +
          '<input class="entrada" data-opcao="' + j + '" maxlength="80" value="' + esc(o) + '" placeholder="Opção ' + (j + 1) + '">' +
          (a.opcoes.length > 2 ? '<button class="btn btn-secundario btn-icone" data-tirar-opcao="' + j + '" title="Tirar opção">✕</button>' : '') + '</div>').join('') +
          (a.opcoes.length < 8 ? '<button class="btn btn-secundario btn-pequeno" data-mais-opcao style="align-self:flex-start">+ Opção</button>' : '') + '</div>';
      }
      corpo += '<div class="config-linha">' + campoTempo(a, 'Tempo') + '</div>';
    } else if (a.tipo === 'nuvem') {
      corpo += '<div class="config-linha"><div class="campo"><label>Palavras por pessoa</label><select class="entrada" data-cfg="max_respostas">' +
        opcoesSelect(a.config.max_respostas || 3, [[1, '1 palavra'], [2, '2 palavras'], [3, '3 palavras'], [4, '4 palavras'], [5, '5 palavras']]) + '</select></div>' +
        campoTempo(a, 'Tempo') + '</div>' +
        '<p class="dica">Durante a aula, dá para apagar uma palavra pelo painel, se precisar.</p>';
    } else {
      corpo += '<div class="config-linha"><div class="campo"><label>Escala</label><select class="entrada" data-cfg="max">' +
        opcoesSelect(a.config.max || 10, [[10, 'De 0 a 10'], [5, 'De 0 a 5']]) + '</select></div>' +
        campoTempo(a, 'Tempo') + '</div>' +
        '<div class="config-linha"><div class="campo" style="flex:1"><label>O que significa o 0</label><input class="entrada" data-cfgtxt="rotulo_min" maxlength="40" value="' + esc(a.config.rotulo_min || '') + '" placeholder="Ex.: Nada preparado"></div>' +
        '<div class="campo" style="flex:1"><label>O que significa a nota máxima</label><input class="entrada" data-cfgtxt="rotulo_max" maxlength="40" value="' + esc(a.config.rotulo_max || '') + '" placeholder="Ex.: Totalmente preparado"></div></div>';
    }
    return corpo;
  }

  function desenharItem() {
    const box = $('editorItem');
    const it = itemSel();
    if (!it) {
      box.innerHTML = '<div class="ed-vazio"><span class="etiqueta">Nenhum item selecionado</span><p class="dica">Clique num item do roteiro para editar o slide ou a atividade.</p></div>';
      return;
    }
    const i = rascunho.itens.indexOf(it), total = rascunho.itens.length;
    const titulo = it.tipo === 'slide' ? 'Slide ' + numeroSlideRascunho(it) + ' selecionado' : TIPOS[it.tipo].nome + ' selecionado';
    let html = '<div class="ed-item-cab"><span class="etiqueta">' + titulo + '</span><span class="dica">item ' + (i + 1) + ' de ' + total + '</span><span class="espaco"></span>' +
      '<button class="btn btn-secundario btn-icone" data-mover="-1" title="Subir"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="btn btn-secundario btn-icone" data-mover="1" title="Descer"' + (i === total - 1 ? ' disabled' : '') + '>↓</button>' +
      (it.tipo === 'entrada' ? '' : '<button class="btn btn-secundario btn-icone" data-copiar title="Duplicar">⧉</button>') +
      '<button class="btn btn-secundario btn-icone" data-apagar title="Tirar do roteiro">🗑</button></div>';
    if (it.tipo === 'slide') {
      html += '<img class="ed-grande" src="' + esc(it.config.imagem) + '" alt="Slide ' + numeroSlideRascunho(it) + '">' +
        '<div class="campo"><label>Nome no roteiro (só você vê)</label><input class="entrada" data-campo="pergunta" maxlength="200" value="' + esc(it.pergunta) + '" placeholder="Ex.: Os 3 níveis da escuta"></div>';
    } else {
      html += '<div class="ed-campos">' + corpoAtividade(it) + '</div>';
    }
    html += '<div class="campo"><label>Suas notas para ' + (it.tipo === 'slide' ? 'este slide' : 'esta atividade') + ' (só você vê durante a aula)</label>' +
      '<textarea class="entrada ed-notas" data-campo="notas" maxlength="4000" placeholder="Ex.: Abra com uma pergunta para a turma.">' + esc(it.notas) + '</textarea></div>';
    if (it.tipo === 'slide') {
      html += '<label class="interruptor"><input type="checkbox" data-celular' + (it.config.celular !== false ? ' checked' : '') + '><span class="trilho"></span>Mostrar este slide também no celular dos alunos</label>' +
        blocoMateriais(it);
    }
    html += '<div class="ed-inserir"><span class="dica">Inserir logo depois deste item:</span><div class="linha">' +
      ['nuvem', 'quiz', 'votacao', 'escala', 'grupo', 'ferramenta'].concat(rascunho.itens.some(x => x.tipo === 'entrada') ? [] : ['entrada']).map(t => '<button class="btn btn-secundario btn-pequeno" data-inserir="' + t + '">' + TIPOS[t].icone + ' ' + TIPOS[t].curto + '</button>').join('') + '</div></div>';
    box.innerHTML = html;
    ligarItem(box, it);
  }

  function ligarItem(c, a) {
    const tocou = () => { atualizarLinha(a); mudou(); };
    c.querySelectorAll('[data-campo]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      a[el.dataset.campo] = el.dataset.campo === 'tempo' ? Number(el.value) : el.value; tocou();
    }));
    const te = c.querySelector('[data-tempo-ed]');
    if (te) {
      te.addEventListener('input', () => {
        if (te.value.trim() === '') return;
        a.tempo = tempoDoCampo(a.tipo, te.value);
        const linha = document.querySelector('.ed-item[data-k="' + a._k + '"] [data-tempo-linha]');
        if (linha && document.activeElement !== linha) linha.value = tempoParaCampo(a);
        tocou();
      });
      te.addEventListener('blur', () => { te.value = tempoParaCampo(a); });
    }
    c.querySelectorAll('[data-opcao]').forEach(el => el.addEventListener('input', () => { a.opcoes[Number(el.dataset.opcao)] = el.value; tocou(); }));
    c.querySelectorAll('[data-certa]').forEach(el => el.addEventListener('change', () => { a.correta = Number(el.dataset.certa); tocou(); }));
    c.querySelectorAll('[data-cfg]').forEach(el => el.addEventListener('change', () => { a.config[el.dataset.cfg] = Number(el.value); tocou(); }));
    c.querySelectorAll('[data-cfgtxt]').forEach(el => el.addEventListener('input', () => { a.config[el.dataset.cfgtxt] = el.value; tocou(); }));
    const cel = c.querySelector('[data-celular]');
    if (cel) cel.addEventListener('change', () => { a.config.celular = cel.checked; tocou(); });
    const ent = c.querySelector('[data-entre]');
    if (ent) ent.addEventListener('change', () => {
      a.config.entre_equipes = ent.checked;
      if (ent.checked && a.config.bonus == null) a.config.bonus = 300;
      if (!ent.checked && a.opcoes.length < 2) a.opcoes = ['', ''];
      desenharItem(); tocou();
    });
    const passos = c.querySelector('[data-passos]');
    if (passos) passos.addEventListener('input', () => { a.config.passos = passos.value.split('\n').slice(0, 8); tocou(); });
    c.querySelectorAll('input[name="modo' + a._k + '"]').forEach(el => el.addEventListener('change', () => {
      a.config.grupos = Object.assign({}, a.config.grupos, { modo: el.value }); desenharItem(); tocou();
    }));
    c.querySelectorAll('[data-grupos]').forEach(el => el.addEventListener('change', () => {
      a.config.grupos = Object.assign({}, a.config.grupos); a.config.grupos[el.dataset.grupos] = Number(el.value); tocou();
    }));
    const resp = c.querySelector('[data-resp]');
    if (resp) resp.addEventListener('change', () => { a.config.resposta = Object.assign({}, a.config.resposta, { ligada: resp.checked }); desenharItem(); tocou(); });
    const respP = c.querySelector('[data-resp-perg]');
    if (respP) respP.addEventListener('input', () => { a.config.resposta = Object.assign({}, a.config.resposta, { pergunta: respP.value }); tocou(); });
    const envMat = c.querySelector('[data-mat-enviar]');
    if (envMat) envMat.onclick = () => enviarMaterial(a);
    const solta = c.querySelector('[data-mat-soltar]');
    if (solta) {
      ['dragenter', 'dragover'].forEach(ev => solta.addEventListener(ev, e => {
        if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault(); solta.classList.add('ativo');
      }));
      ['dragleave', 'drop'].forEach(ev => solta.addEventListener(ev, () => solta.classList.remove('ativo')));
      solta.addEventListener('drop', e => {
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
        e.preventDefault();
        enviarArquivosMaterial(a, Array.from(e.dataTransfer.files));
      });
    }
    c.querySelectorAll('[data-mat-tirar]').forEach(b => b.onclick = () => { a.config.materiais.splice(Number(b.dataset.matTirar), 1); desenharItem(); tocou(); });
    c.querySelectorAll('[data-mat-grupo]').forEach(el => el.addEventListener('change', () => {
      a.config.materiais[Number(el.dataset.matGrupo)].grupo = el.value ? Number(el.value) : null; tocou();
    }));
    const ferr = c.querySelector('[data-ferr]');
    if (ferr) ferr.addEventListener('change', () => {
      const f = A.FERRAMENTAS.find(x => x.codigo === ferr.value);
      if (f) { a._outra = false; a.pergunta = f.nome; a.config.url = f.url; a.config.codigo = f.codigo; }
      else if (ferr.value === 'outra') { a._outra = true; if (A.FERRAMENTAS.some(x => x.url === a.config.url)) { a.config.url = ''; a.pergunta = ''; } a.config.codigo = ''; }
      else { a._outra = false; a.pergunta = ''; a.config.url = ''; a.config.codigo = ''; }
      desenharItem(); tocou();
    });
    const mais = c.querySelector('[data-mais-opcao]');
    if (mais) mais.onclick = () => { a.opcoes.push(''); desenharItem(); tocou(); };
    c.querySelectorAll('[data-tirar-opcao]').forEach(b => b.onclick = () => { a.opcoes.splice(Number(b.dataset.tirarOpcao), 1); desenharItem(); tocou(); });
    c.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => {
      const i = rascunho.itens.indexOf(a), j = i + Number(b.dataset.mover);
      if (j < 0 || j >= rascunho.itens.length) return;
      rascunho.itens.splice(i, 1); rascunho.itens.splice(j, 0, a);
      desenharLista(); desenharItem(); mudou();
      const el = document.querySelector('.ed-item.selecionado'); if (el) el.scrollIntoView({ block: 'nearest' });
    });
    const btnCopiar = c.querySelector('[data-copiar]');
    if (btnCopiar) btnCopiar.onclick = () => {
      const copia = JSON.parse(JSON.stringify(a)); copia._k = ++contadorK; delete copia.id;
      rascunho.itens.splice(rascunho.itens.indexOf(a) + 1, 0, copia);
      selK = copia._k;
      desenharLista(); desenharItem(); mudou();
    };
    c.querySelector('[data-apagar]').onclick = ev => popover(ev, a.tipo === 'slide' ? 'Tirar este slide do roteiro?' : a.tipo === 'entrada' ? 'Tirar o QR code do roteiro? Aí o QR code só aparece pelo botão "QR code" do painel.' : 'Tirar esta atividade do roteiro?', 'Tirar', () => {
      const i = rascunho.itens.indexOf(a);
      rascunho.itens.splice(i, 1);
      const viz = rascunho.itens[i] || rascunho.itens[i - 1];
      selK = viz ? viz._k : null;
      desenharLista(); desenharItem(); desenharArquivo(); mudou();
    });
    c.querySelectorAll('[data-inserir]').forEach(b => b.onclick = () => inserirItem(b.dataset.inserir, a));
  }

  function adicionarExemplos() {
    const ex = [
      Object.assign(novoItem('nuvem'), { pergunta: 'Em uma palavra: o que faz uma comunicação ser influente?' }),
      Object.assign(novoItem('quiz'), { pergunta: 'Qual é o primeiro passo de um bom feedback?', opcoes: ['Dar a solução pronta', 'Descrever o fato observado', 'Falar da personalidade', 'Comparar com os colegas'], correta: 1, tempo: 30 }),
      Object.assign(novoItem('votacao'), { pergunta: 'Qual desafio mais aparece na sua equipe?', opcoes: ['Falta de clareza', 'Reuniões longas', 'Pouco feedback', 'Conflitos'] }),
      Object.assign(novoItem('escala'), { pergunta: 'Quanto você se sente preparado para dar um feedback difícil?', config: { max: 10, rotulo_min: 'Nada preparado', rotulo_max: 'Totalmente preparado' } })
    ];
    rascunho.itens.push(...ex);
    if (!rascunho.titulo) { rascunho.titulo = 'Aula de teste'; $('campoTitulo').value = rascunho.titulo; }
    selK = ex[0]._k;
    desenharLista(); desenharItem(); mudou();
  }

  function validar() {
    for (let i = 0; i < rascunho.itens.length; i++) {
      const a = rascunho.itens[i], n = 'O item ' + (i + 1) + ' (' + TIPOS[a.tipo].nome.toLowerCase() + ')';
      if (a.tipo === 'slide' || a.tipo === 'entrada') continue;
      if (a.tipo === 'grupo') {
        if (!a.pergunta.trim()) return n + ' está sem título.';
        if (!(a.config.passos || []).some(x => x.trim())) return n + ' está sem o passo a passo.';
        continue;
      }
      if (a.tipo === 'ferramenta') {
        if (!a.pergunta.trim()) return n + ': escolha a ferramenta.';
        if (!/^https:\/\/\S+$/.test((a.config.url || '').trim())) return n + ': o link precisa começar com https://';
        continue;
      }
      if (!a.pergunta.trim()) return n + ' está sem pergunta.';
      const ops = a.opcoes.filter(o => o.trim());
      if (a.tipo === 'quiz') {
        if (ops.length < 2) return n + ' precisa de pelo menos 2 alternativas.';
        if (a.correta == null || !(a.opcoes[a.correta] || '').trim()) return n + ': marque a alternativa certa (ela precisa ter texto).';
      }
      if (a.tipo === 'votacao' && !(a.config.entre_equipes && rascunho.modo_equipes) && ops.length < 2) return n + ' precisa de pelo menos 2 opções.';
    }
    if (rascunho.modo_equipes && rascunho.equipes.filter(e => e.trim()).length < 2) return 'Dê nome a pelo menos 2 equipes.';
    return null;
  }

  function paraEnviar() {
    return rascunho.itens.map(a => {
      const o = { id: a.id || null, tipo: a.tipo, pergunta: a.pergunta, tempo: a.tempo || 0, config: Object.assign({}, a.config), notas: a.notas || '' };
      if (a.tipo === 'slide') {
        o.opcoes = []; o.config = { imagem: a.config.imagem, celular: a.config.celular !== false, texto: a.config.texto || '', materiais: a.config.materiais || [] };
      } else if (a.tipo === 'grupo') {
        o.opcoes = [];
        o.config = Object.assign({}, a.config, { passos: (a.config.passos || []).map(x => x.trim()).filter(Boolean) });
      } else if (a.tipo === 'entrada') {
        o.opcoes = []; o.config = {}; o.tempo = 0;
      } else if (a.tipo === 'ferramenta') {
        o.opcoes = []; o.config = { url: (a.config.url || '').trim(), codigo: a.config.codigo || '', instrucao: a.config.instrucao || '' };
      } else if (a.tipo === 'quiz') {
        const lista = [];
        let certa = null;
        a.opcoes.forEach((t, j) => { if (t.trim()) { if (j === a.correta) certa = lista.length; lista.push(t); } });
        o.opcoes = lista; o.correta = certa;
      } else if (a.tipo === 'votacao') {
        if (a.config.entre_equipes && !rascunho.modo_equipes) o.config.entre_equipes = false;
        o.opcoes = a.opcoes.filter(t => t.trim());
      } else o.opcoes = [];
      return o;
    });
  }

  let salvando = null;
  async function salvar(silencioso) {
    if (salvando) { await salvando; if (!sujo) return true; }
    const erro = validar();
    if (erro) {
      if (!silencioso) toast(erro, true);
      $('statusSalvar').textContent = 'Falta completar: ' + erro;
      return false;
    }
    clearTimeout(timerAutoSalvar);
    $('btnSalvar').disabled = true;
    $('statusSalvar').textContent = 'Salvando...';
    const enviados = rascunho.itens.slice();
    const marca = Symbol();
    ultimaMarca = marca;
    salvando = (async () => {
      try {
        await rpc('aovivo_editar_sessao', {
          p_sessao: atual.id, p_chave: atual.chave,
          p_titulo: rascunho.titulo.trim() || 'Aula Mentorei',
          p_modo_equipes: rascunho.modo_equipes,
          p_equipes: rascunho.equipes.map(e => e.trim()).filter(Boolean)
        });
        const novo = await rpc('aovivo_salvar_roteiro', { p_sessao: atual.id, p_chave: atual.chave, p_lista: paraEnviar() });
        aceitarPainel(novo, true);
        lembrarAula({ id: atual.id, chave: atual.chave, codigo: painel.codigo, titulo: painel.titulo });
        // devolve os ids criados para o rascunho
        novo.atividades.forEach((a, i) => { if (enviados[i]) enviados[i].id = a.id; });
        if (ultimaMarca === marca) marcarSalvo();
        return true;
      } catch (e) {
        if (!silencioso) toast(e.message, true);
        $('statusSalvar').textContent = 'Não salvou: ' + e.message;
        return false;
      } finally {
        $('btnSalvar').disabled = false;
      }
    })();
    const ok = await salvando;
    salvando = null;
    return ok;
  }
  let ultimaMarca = null;

  $('btnSalvar').onclick = () => salvar(false);
  $('btnIA').onclick = sugerirComIA;
  $('btnAoVivo').onclick = async () => {
    if (window.MusicaEspera) MusicaEspera.preparar();
    if (!telaoVivo()) abrirJanelaTelao();
    if ((sujo || salvando) && !(await salvar(false))) return;
    abrirPainel();
  };
  // ← Plataforma: volta para o módulo da aula (avulsa: para Gestão › Aulas ao vivo)
  $('btnVoltarInicio').onclick = async () => {
    if (sujo && !(await salvar(false))) return;
    location.href = PLATAFORMA + (painel && painel.modulo_id ? '/app.html#/modulo/' + painel.modulo_id : '/app.html#/aulas-ao-vivo');
  };
  window.addEventListener('beforeunload', e => { if (sujo || importando) { e.preventDefault(); e.returnValue = ''; } });

  function atualizarBotaoAoVivo() {
    const rolando = painel && painel.comecou_em && painel.fase !== 'encerrada';
    $('btnAoVivo').textContent = rolando ? '▶ Voltar ao painel' : '▶ Projetar os slides';
  }

  $('btnLinks').onclick = () => {
    const aluno = A.enderecoAluno(painel.codigo);
    const ctrl = linkControle(atual);
    modal('<h2>Links da aula</h2>' +
      '<div class="campo"><label>Link para os alunos (já vai com o código)</label><div class="caixa-link"><input class="entrada" readonly value="' + esc(aluno) + '"><button class="btn btn-secundario btn-pequeno" data-copiar="' + esc(textoConvite()) + '">Copiar convite</button></div>' +
      '<p class="dica">O convite pronto para colar no chat do Zoom ou do Meet. O QR code aparece no telão.</p></div>' +
      '<div class="campo"><label>Abrir em outro computador (link de controle)</label><div class="caixa-link"><input class="entrada" readonly value="' + esc(ctrl) + '"><button class="btn btn-secundario btn-pequeno" data-copiar="' + esc(ctrl) + '">Copiar</button></div>' +
      '<p class="dica">Guarde este link só para você ou para quem vai conduzir a aula com você. Quem tem ele consegue controlar a aula.</p></div>' +
      '<div class="acoes"><button class="btn btn-principal" data-fechar>Fechar</button></div>', f => {
      f.querySelectorAll('[data-copiar]').forEach(b => b.onclick = () => copiar(b.dataset.copiar));
    });
  };

  /* =========================================================
     JANELA DO TELÃO
     ========================================================= */
  let bc = null, bcId = null, ultimoPing = 0, janelaTelao = null;

  function ligarCanalTelao() {
    if (bcId === atual.id) return;
    if (bc) try { bc.close(); } catch (e) {}
    bc = null; bcId = atual.id; ultimoPing = 0;
    try { bc = new BroadcastChannel('aovivo-' + atual.id); } catch (e) { return; }
    bc.onmessage = ev => {
      const d = ev.data || {};
      if (d.tipo === 'ping') {
        const novo = !telaoVivo();
        ultimoPing = Date.now();
        try { bc.postMessage({ tipo: 'pong' }); } catch (e) {}
        if (novo) { enviarAoTelao(); atualizarStatusTelao(); }
      } else if (d.tipo === 'tchau') {
        ultimoPing = 0; atualizarStatusTelao();
      } else if (d.tipo === 'tecla') {
        if (!$('vistaPainel').classList.contains('oculto')) tecla(d.tecla);
      }
    };
  }

  function telaoVivo() { return Date.now() - ultimoPing < 5000; }

  function abrirJanelaTelao() {
    const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'telao.html#s=' + atual.id;
    janelaTelao = window.open(url, 'aovivo-telao-' + atual.id, 'popup,width=1280,height=760');
    if (!janelaTelao) toast('O navegador bloqueou a janela do telão. Permita janelas deste site e clique em "Abrir telão".', true);
    else try { janelaTelao.focus(); } catch (e) {}
  }

  function enviarAoTelao() {
    if (!bc || !painel) return;
    try { bc.postMessage({ tipo: 'estado', estado: A.estadoParaTelao(painel) }); } catch (e) {}
  }

  function atualizarStatusTelao() {
    const b = $('pStatusTelao');
    const vivo = telaoVivo();
    b.classList.toggle('vivo', vivo);
    b.querySelector('span').textContent = vivo ? 'Telão aberto na outra janela' : 'Abrir telão';
    b.title = vivo ? 'O telão está aberto. Compartilhe só a janela dele no Zoom ou no Meet.' : 'Abre a janela do telão para compartilhar no Zoom ou no Meet';
  }
  $('pStatusTelao').onclick = () => {
    if (telaoVivo() && janelaTelao && !janelaTelao.closed) { try { janelaTelao.focus(); } catch (e) {} return; }
    abrirJanelaTelao();
  };

  /* =========================================================
     PAINEL AO VIVO
     ========================================================= */
  let timerPainel = null;
  let previa = null;
  let ultimaPos = -1;
  let ultVersao = -1, ultAgora = 0;
  let autoFeito = '';
  let tamNotas = 18;
  try { tamNotas = Number(localStorage.getItem('aovivo_tam_notas')) || 18; } catch (e) {}

  function abrirPainel() {
    vista('vistaPainel');
    if (!previa) previa = A.criarTelao($('pPrevia'), { previa: true });
    desenharPainel();
    clearInterval(timerPainel);
    timerPainel = setInterval(atualizarPainel, 1200);
    atualizarStatusTelao();
    history.replaceState(null, '', '#s=' + atual.id + '&k=' + atual.chave);
  }

  // aceita o estado só se for mais novo que o que já está na tela
  function aceitarPainel(novo, forcar) {
    const v = Number(novo.versao) || 0, ag = Date.parse(novo.agora) || 0;
    if (!forcar && (v < ultVersao || (v === ultVersao && ag < ultAgora))) return false;
    ultVersao = v; ultAgora = ag;
    painel = novo;
    return true;
  }

  let buscandoPainel = false;
  async function atualizarPainel() {
    if (buscandoPainel || !atual || ocupado) return;
    buscandoPainel = true;
    try {
      const novo = await rpc('aovivo_painel', { p_sessao: atual.id, p_chave: atual.chave });
      if (aceitarPainel(novo)) desenharPainel();
    } catch (e) { /* tenta de novo no próximo ciclo */ }
    finally { buscandoPainel = false; }
  }

  async function acao(nome, params, msgOk) {
    if (ocupado) return false;
    ocupado = true;
    try {
      const novo = await rpc(nome, Object.assign({ p_sessao: atual.id, p_chave: atual.chave }, params || {}));
      aceitarPainel(novo, true);
      desenharPainel();
      if (msgOk) toast(msgOk);
      return true;
    } catch (e) { toast(e.message, true); return false; }
    finally { ocupado = false; }
  }

  function itens() { return painel.atividades; }
  function idxAtual() {
    if (!painel.atividade) return -1;   // QR code pelo botão (sem item) = fora do roteiro
    return itens().findIndex(a => a.id === painel.atividade.id);
  }
  // antes de começar: o telão mostra a tela de boas-vindas (QR code, nome da aula, horário e contagem) com a música
  function emBoasVindas(p) { return !!p && p.fase === 'lobby' && !p.comecou_em; }
  function posBase() { const i = idxAtual(); return i >= 0 ? i : ultimaPos; }
  function numeroSlide(k) { let n = 0; const L = itens(); for (let j = 0; j <= k && j < L.length; j++) if (L[j].tipo === 'slide') n++; return n; }
  function totalSlides() { return itens().filter(x => x.tipo === 'slide').length; }
  function rotuloItem(k) {
    const it = itens()[k];
    if (!it) return '';
    return it.tipo === 'slide' ? 'Slide ' + numeroSlide(k) : TIPOS[it.tipo].nome;
  }

  function irPara(k) {
    const a = itens()[k];
    if (!a) return;
    if (a.tipo !== 'slide' && a.encerrada && a.respostas > 0) {
      modal('<h2>Essa atividade já foi feita</h2><p class="dica">Ela já tem ' + a.respostas + (a.respostas === 1 ? ' resposta' : ' respostas') + '. Quer repetir do zero ou só mostrar o resultado de novo?</p>' +
        '<div class="acoes"><button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-secundario" data-r="mostrar">Mostrar o resultado</button><button class="btn btn-principal" data-r="zero">Repetir do zero</button></div>', (f, fechar) => {
        f.querySelector('[data-r="zero"]').onclick = () => { fechar(); acao('aovivo_ir_para', { p_item: a.id, p_limpar: true }); };
        f.querySelector('[data-r="mostrar"]').onclick = async () => {
          fechar();
          if (await acao('aovivo_ir_para', { p_item: a.id, p_limpar: false })) acao('aovivo_mostrar_resultado');
        };
      });
      return;
    }
    acao('aovivo_ir_para', { p_item: a.id, p_limpar: false });
  }

  function encerrar() {
    const extra = (painel.avaliacao ? ' O celular de cada aluno vibra e mostra o botão "Avaliar a aula", e o telão mostra o QR code da avaliação.' : '') +
      (painel.modulo ? ' A presença de quem entrou pela plataforma (ou com o nome igual ao da lista de alunos) vai para o módulo.' : '') +
      ' Quem pediu os materiais pelo celular recebe o e-mail com os PDFs da aula e o que fez.';
    modal('<h2>Encerrar a aula?</h2><p class="dica">O telão mostra o resultado final e o celular dos alunos mostra a posição de cada um.' + extra + ' Dá para reabrir depois, se precisar.</p>' +
      '<div class="acoes"><button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-principal" data-ok>Encerrar e mostrar o resultado</button></div>', (f, fechar) => {
      f.querySelector('[data-ok]').onclick = async () => {
        fechar();
        if (await acao('aovivo_mudar_fase', { p_fase: 'encerrada' })) { mandarEmailsDosAlunos(); lembrarPercepcoes(); }
      };
    });
  }

  // Lembrete no fim da aula (pedido da Juliana, 15/11/2026): o mentor coloca as percepções no módulo, na plataforma
  function lembrarPercepcoes() {
    if (!painel || !painel.modulo_id) return;
    const url = PLATAFORMA + '/app.html#/modulo/' + painel.modulo_id + '/percepcoes';
    const ja = !!painel.percepcoes_em;
    modal('<div class="lembrete-percepcoes"><div class="emoji-grande">📝</div><h2>' + (ja ? 'Quer completar as percepções?' : 'Aula encerrada! Agora, as percepções') + '</h2>' +
      '<p class="dica">' + (ja ? 'As percepções deste módulo já estão na plataforma. Se quiser, acrescente o que aconteceu hoje.'
        : 'Enquanto está fresquinho, conte como foi a aula: engajamento da turma, o que funcionou, pontos de atenção e sugestões para os próximos módulos. Leva 2 minutos e dá para falar em vez de digitar (botão 🎤 Falar).') + '</p>' +
      '<div class="acoes"><button class="btn btn-secundario" data-fechar>Faço depois</button>' +
      '<a class="btn btn-principal" href="' + esc(url) + '" target="_blank" rel="noopener" data-ir>' + (ja ? 'Abrir as percepções' : 'Escrever as percepções agora') + '</a></div></div>', (f, fechar) => {
      f.querySelector('[data-ir]').addEventListener('click', () => setTimeout(fechar, 300));
    });
  }

  // e-mail com os materiais para quem não está na plataforma e pediu pelo celular (a plataforma manda; cada um recebe uma vez)
  function mandarEmailsDosAlunos() {
    fetch('/api/aovivo-email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessao: atual.id, chave: atual.chave }) }).catch(() => {});
  }

  function proximoPasso() {
    const p = painel, L = itens(), tipo = p.atividade && p.atividade.tipo;
    const i = posBase();
    const temAtividades = L.some(x => x.tipo !== 'slide' && x.tipo !== 'entrada');
    const irK = k => ({ rotulo: 'Próximo: ' + rotuloItem(k), fn: () => irPara(k), k });
    const fim = () => temAtividades && p.fase !== 'ranking'
      ? { rotulo: 'Ranking final 🏆', fn: () => acao('aovivo_mostrar_ranking') }
      : { rotulo: 'Encerrar a aula', fn: encerrar };
    switch (p.fase) {
      case 'lobby':
        if (tipo === 'entrada' && i >= 0) return L[i + 1] ? irK(i + 1) : fim();
        if (!L.length) return { rotulo: 'Montar a aula', fn: voltarEditor };
        if (i < 0) return { rotulo: p.comecou_em ? 'Voltar para o 1º slide ▶' : 'Começar a aula: ir para a capa ▶', fn: () => irPara(0), k: 0 };
        return { rotulo: 'Voltar para: ' + rotuloItem(i), fn: () => irPara(i), k: i };
      case 'slide':
        return L[i + 1] ? irK(i + 1) : fim();
      case 'atividade':
        if (tipo === 'grupo') {
          const comResp = !(p.atividade.config && p.atividade.config.resposta && p.atividade.config.resposta.ligada === false);
          return { rotulo: comResp ? 'Ver as respostas dos grupos' : 'Encerrar o exercício', fn: () => acao('aovivo_mostrar_resultado') };
        }
        if (tipo === 'ferramenta') return { rotulo: 'Encerrar a ferramenta', fn: () => acao('aovivo_mostrar_resultado') };
        return { rotulo: 'Mostrar resultado', fn: () => acao('aovivo_mostrar_resultado') };
      case 'resultado':
        if (tipo === 'quiz') return { rotulo: 'Ver ranking 🏆', fn: () => acao('aovivo_mostrar_ranking') };
        return L[i + 1] ? irK(i + 1) : fim();
      case 'ranking':
      case 'sorteio':
        if (L[i + 1]) return irK(i + 1);
        if (p.fase === 'sorteio') return { rotulo: 'Ver ranking 🏆', fn: () => acao('aovivo_mostrar_ranking') };
        return { rotulo: 'Encerrar a aula', fn: encerrar };
      case 'encerrada':
        return { rotulo: 'Reabrir a aula', fn: () => acao('aovivo_mudar_fase', { p_fase: 'lobby' }) };
    }
    return { rotulo: 'Começar', fn: () => {} };
  }

  function voltarEditor() { abrirEditor(false); }

  /* ---------- Botões ---------- */
  $('pProximo').onclick = () => proximoPasso().fn();
  $('pAnterior').onclick = () => { const i = posBase(); if (i > 0) irPara(i - 1); };
  $('pMaisTempo').onclick = () => {
    const longo = painel.atividade && painel.atividade.tipo !== 'quiz';
    acao('aovivo_mais_tempo', { p_segundos: longo ? 60 : 15 }, longo ? '+1 minuto para todo mundo' : '+15 segundos para todo mundo');
  };
  $('pRanking').onclick = () => acao('aovivo_mostrar_ranking');
  $('pSorteio').onclick = abrirSorteio;
  $('pQR').onclick = () => acao('aovivo_mudar_fase', { p_fase: 'lobby' });
  $('pPreta').onclick = () => acao('aovivo_tela_preta', { p_ligar: !painel.tela_preta });
  $('pEditar').onclick = voltarEditor;
  $('pEncerrar').onclick = encerrar;
  $('pConvite').onclick = () => copiar(textoConvite(), 'Convite copiado. Cole no chat do Zoom ou do Meet.');
  $('pCodigo').onclick = () => copiar(textoConvite(), 'Convite copiado. Cole no chat do Zoom ou do Meet.');
  let salaAberta = false;
  $('btnSalaEd').onclick = () => $('pSala').onclick();
  $('pSala').onclick = () => {
    if (!painel || !painel.sala) return;
    window.open(painel.sala, '_blank', 'noopener');
    salaAberta = true; $('pSala').classList.remove('chamando');
    toast('A sala abriu numa aba nova. Na sala, compartilhe a janela "Telão" (Compartilhar tela, depois Janela).');
  };
  document.querySelectorAll('#vistaPainel button').forEach(b => b.addEventListener('click', () => b.blur()));

  /* ---------- Teclado e passador de slides ---------- */
  function tecla(k) {
    if (document.querySelector('.fundo-modal')) return;
    if (k === ' ' || k === 'arrowright' || k === 'pagedown' || k === 'enter' || k === 'arrowdown') proximoPasso().fn();
    else if (k === 'arrowleft' || k === 'pageup' || k === 'arrowup') $('pAnterior').click();
    else if (k === 'b' || k === '.') $('pPreta').click();
    else if (k === 'r') acao('aovivo_mostrar_ranking');
    else if (k === 's') abrirSorteio();
    else if (k === 'q') acao('aovivo_mudar_fase', { p_fase: 'lobby' });
    else if (k === 'm') alternarMusica();
  }
  document.addEventListener('keydown', e => {
    if ($('vistaPainel').classList.contains('oculto')) return;
    if (document.querySelector('.fundo-modal')) { if (e.key === 'Escape') document.querySelector('.fundo-modal').remove(); return; }
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (window.MusicaEspera) MusicaEspera.preparar();   // qualquer tecla libera o som no navegador
    if ([' ', 'arrowright', 'arrowleft', 'arrowdown', 'arrowup', 'pagedown', 'pageup', 'enter', 'b', '.', 'r', 's', 'q', 'm'].includes(k)) {
      e.preventDefault();
      if (document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
      tecla(k);
    }
  });

  /* ---------- Sorteio ---------- */
  function abrirSorteio() {
    if (document.querySelector('.fundo-modal')) return;
    const temEquipes = painel.modo_equipes && painel.equipes.length >= 2;
    const cfg = { modo: 'pessoa', filtro: 'todos', quantidade: 1, nao_repetir: true };
    const temQuiz = painel.atividades.some(a => a.tipo === 'quiz' && a.encerrada);
    const temUltima = painel.atividades.some(a => a.tipo !== 'slide' && a.respostas > 0);
    modal('<h2>🎲 Sorteio</h2>' +
      (temEquipes ? '<div class="campo"><label>Sortear</label><div class="segmentado" data-grupo="modo"><button data-v="pessoa" class="ativo">Uma pessoa</button><button data-v="equipe">Uma equipe</button></div></div>' : '') +
      '<div class="campo" data-so-pessoa><label>Entre quem?</label><div class="segmentado" data-grupo="filtro">' +
      '<button data-v="todos" class="ativo">Todos</button>' +
      '<button data-v="acertaram"' + (temQuiz ? '' : ' disabled title="Ainda não teve quiz"') + '>Quem acertou o último quiz</button>' +
      '<button data-v="participaram"' + (temUltima ? '' : ' disabled') + '>Quem respondeu a última atividade</button></div></div>' +
      '<div class="campo"><label>Quantos?</label><div class="segmentado" data-grupo="quantidade">' + [1, 2, 3, 5].map(n => '<button data-v="' + n + '"' + (n === 1 ? ' class="ativo"' : '') + '>' + n + '</button>').join('') + '</div></div>' +
      '<label class="interruptor" data-so-pessoa><input type="checkbox" id="chkNaoRepetir" checked><span class="trilho"></span>Não repetir quem já foi sorteado</label>' +
      '<div class="acoes"><button class="btn btn-secundario" data-fechar>Cancelar</button><button class="btn btn-principal" id="btnSortear">Sortear!</button></div>', (f, fechar) => {
      f.querySelectorAll('[data-grupo]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
        g.querySelectorAll('button').forEach(x => x.classList.remove('ativo')); b.classList.add('ativo');
        const v = b.dataset.v; cfg[g.dataset.grupo] = g.dataset.grupo === 'quantidade' ? Number(v) : v;
        if (g.dataset.grupo === 'modo') f.querySelectorAll('[data-so-pessoa]').forEach(el => el.classList.toggle('oculto', v === 'equipe'));
      }));
      f.querySelector('#btnSortear').onclick = () => {
        cfg.nao_repetir = f.querySelector('#chkNaoRepetir').checked;
        fechar();
        acao('aovivo_sortear', { p_config: cfg });
      };
    });
  }

  /* ---------- Desenho do painel ---------- */
  function desenharPainel() {
    if (!painel || $('vistaPainel').classList.contains('oculto')) { enviarAoTelao(); return; }
    const p = painel, L = itens();
    const i = idxAtual();
    if (i >= 0 && i !== ultimaPos) { ultimaPos = i; try { localStorage.setItem('aovivo_pos_' + atual.id, String(i)); } catch (e) {} }

    previa.render(A.estadoParaTelao(p));
    enviarAoTelao();
    precarregarProximos();

    $('pTitulo').textContent = p.titulo;
    $('pCodigo').querySelector('b').textContent = A.formatarCodigo(p.codigo);
    $('pPessoas').textContent = '👤 ' + p.participantes.length + ' na sala';
    const ps = $('pSala');
    ps.classList.toggle('oculto', !p.sala);
    if (p.sala) {
      const nome = nomeSala(p.sala);
      ps.textContent = '🎥 Entrar na sala' + (nome ? ' do ' + nome : '');
      ps.classList.toggle('chamando', !p.comecou_em && !salaAberta);
    }

    // rótulo de cima da prévia
    const it = i >= 0 ? L[i] : null;
    let rot = 'Agora no telão';
    if (p.tela_preta) rot += ' · tela preta';
    else if (p.fase === 'slide' && it) rot += ' · Slide ' + numeroSlide(i) + ' de ' + totalSlides();
    else if (p.fase === 'atividade' && it) rot += ' · ' + TIPOS[it.tipo].nome + ' ao vivo';
    else if (p.fase === 'resultado' && it) rot += ' · resultado ' + ({ quiz: 'do quiz', nuvem: 'da nuvem de palavras', votacao: 'da votação', escala: 'da escala', grupo: 'dos grupos', ferramenta: 'da ferramenta' }[it.tipo] || '');
    else if (emBoasVindas(p)) rot += ' · boas-vindas com o QR code';
    else rot += ' · ' + ({ lobby: 'QR code para entrar', ranking: 'ranking', sorteio: 'sorteio', encerrada: 'aula encerrada' }[p.fase] || '');
    $('pAgoraRotulo').textContent = rot;
    $('pAgoraPos').textContent = i >= 0 ? 'Item ' + (i + 1) + ' de ' + L.length : '';

    const passo = proximoPasso();
    $('pProximo').textContent = passo.rotulo;
    $('pAnterior').disabled = posBase() <= 0;
    const comTempo = p.fase === 'atividade' && p.atividade && p.atividade.tempo > 0;
    $('pMaisTempo').classList.toggle('oculto', !comTempo);
    $('pMaisTempo').textContent = comTempo && p.atividade.tipo !== 'quiz' ? '+1 min' : '+15 s';
    tempoEsgotado();
    const enc = p.fase === 'encerrada';
    $('pEncerrar').textContent = enc ? '✓ Aula encerrada' : 'Encerrar aula';
    $('pEncerrar').disabled = enc;
    $('pEncerrar').classList.toggle('btn-perigo', !enc);
    $('pEncerrar').classList.toggle('btn-encerrada', enc);
    $('pPreta').classList.toggle('ligado', !!p.tela_preta);
    $('pPreta').textContent = p.tela_preta ? '◻ Voltar a mostrar' : '◼ Tela preta';

    $('pDica').textContent = dicaDaFase(it);
    desenharLateral(i, passo);
    desenharTrilha(i);
    verificarAuto();
  }

  function dicaDaFase(it) {
    const p = painel;
    if (p.tela_preta) return 'A tela preta está ligada. Os alunos só veem preto até você clicar em "Voltar a mostrar" (ou apertar B).';
    switch (p.fase) {
      case 'lobby': {
        const antes = p.sala && !p.comecou_em ? 'Para começar: clique em "🎥 Entrar na sala" e, na sala, compartilhe a janela "Telão". ' : '';
        if (emBoasVindas(p))
          return antes + 'O telão mostra as boas-vindas com o QR code, o horário e a contagem até começar, com música (no Zoom, marque "Compartilhar som" ao compartilhar o telão; no Teams, "Incluir som"). Na hora, aperte Enter (ou "Começar a aula") e o telão vai para a capa dos seus slides.';
        return antes + 'O telão mostra o QR code e o código, e o nome de cada aluno aparece quando ele entra. Cole o convite no chat para quem está só no celular.';
      }
      case 'slide': return 'Avance com a seta do teclado, com o passador de slides ou com as setas que aparecem nas laterais do telão quando o mouse chega perto. Quando chega numa atividade, o celular dos alunos vibra e apita sozinho.';
      case 'atividade':
        if (p.atividade.tipo === 'grupo') return 'O telão e o celular mostram as instruções e o cronômetro. Quando o tempo acaba, o celular de todos vibra para voltar. Dê +1 min se precisar e clique em "Ver as respostas dos grupos" quando todos voltarem.';
        if (p.atividade.tipo === 'ferramenta') return 'O celular mostra o botão "Abrir a ferramenta" e o telão mostra o QR code dela. Acompanhe ao lado quantos já terminaram.';
        if (p.atividade.tipo === 'quiz') return 'Quando todo mundo responde ou o tempo acaba, o resultado aparece sozinho no telão.';
        if (p.atividade.tempo > 0) return 'Quando o tempo acabar, quem ainda não respondeu continua conseguindo responder. Aí você escolhe: dar mais tempo, mostrar o resultado ou seguir para o próximo slide.';
        return 'Sem limite de tempo. Clique em "Mostrar resultado" quando quiser fechar.';
      case 'resultado': return it && it.tipo === 'quiz' ? 'Comente o resultado e depois mostre o ranking.' : 'Comente o resultado com a turma e siga para o próximo item.';
      case 'ranking': return 'Ranking no telão. Os alunos veem a própria posição no celular.';
      case 'sorteio': return 'O nome aparece no telão em 4 segundos.';
      case 'encerrada': return 'Aula encerrada. O telão mostra o resultado final.';
    }
    return '';
  }

  function setHTML(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; return true; } return false; }

  function miniItem(k) {
    const it = itens()[k];
    if (!it) return '';
    if (it.tipo === 'slide') {
      return '<div class="pn-seguir-slide"><img src="' + esc(it.config.imagem) + '" alt=""><span>Slide ' + numeroSlide(k) + (it.pergunta ? ' · ' + esc(it.pergunta) : '') + '</span></div>';
    }
    if (it.tipo === 'entrada') return '<div class="pn-seguir-ativ"><span class="tipo-selo tipo-entrada">📱 QR code para entrar</span><p>' + esc(it.pergunta || 'Pegue o celular e entre na aula!') + '</p><span class="dica">o telão mostra o QR code e o código</span></div>';
    return '<div class="pn-seguir-ativ"><span class="tipo-selo tipo-' + it.tipo + '">' + TIPOS[it.tipo].icone + ' ' + TIPOS[it.tipo].nome + '</span><p>' + esc(it.pergunta) + '</p>' +
      '<span class="dica">' + resumoTempo(it) + (it.tipo === 'nuvem' ? ' · até ' + (it.config.max_respostas || 3) + ' palavras por pessoa' : '') +
      (it.tipo === 'grupo' ? ' · ' + (it.config.passos || []).length + ' passos' : '') + '</span></div>';
  }

  function desenharLateral(i, passo) {
    const p = painel, L = itens();
    const it = i >= 0 ? L[i] : null;
    let html = '';
    if (p.fase === 'lobby') html += cardSala();
    if ((p.fase === 'atividade' || p.fase === 'resultado') && it && it.tipo !== 'slide') html += cardRespostas(it);
    if (p.fase === 'sorteio') html += cardSorteado();
    if (it && (p.fase !== 'lobby' || it.tipo === 'entrada')) {
      const nome = it.tipo === 'slide' ? 'Slide ' + numeroSlide(i) : TIPOS[it.tipo].nome;
      html += '<div class="pn-card pn-notas"><div class="pn-card-cab"><span class="etiqueta">Suas notas · ' + nome + '</span><span class="espaco"></span>' +
        '<button class="btn btn-secundario btn-mini" data-tam="-2" title="Diminuir letra">A−</button><button class="btn btn-secundario btn-mini" data-tam="2" title="Aumentar letra">A+</button></div>' +
        (it.notas ? '<div class="pn-notas-txt" style="font-size:' + tamNotas + 'px">' + esc(it.notas) + '</div>' : '<p class="dica">Sem notas para este item. Dá para escrever em "Editar aula".</p>') + '</div>';
    }
    // a seguir
    let seguir = '';
    if (passo.k != null) seguir = miniItem(passo.k);
    else if (p.fase !== 'encerrada') {
      const depois = L[posBase() + 1];
      seguir = '<p class="pn-seguir-txt">' + esc(passo.rotulo.replace(/ 🏆| ▶/g, '')) + '</p>' + (depois ? '<span class="dica">depois vem</span>' + miniItem(posBase() + 1) : '');
    }
    if (seguir) html += '<div class="pn-card"><div class="pn-card-cab"><span class="etiqueta">A seguir</span></div>' + seguir + '</div>';
    if (p.modo_equipes && p.ranking && (p.ranking.equipes || []).length) {
      html += '<div class="pn-card"><div class="pn-card-cab"><span class="etiqueta">Turma agora</span></div><div class="pn-turma">' +
        p.ranking.equipes.map(e => '<div><i style="background:' + corEquipe(p.equipes, e.equipe) + '"></i><span>' + esc(e.equipe) + '</span><b>' + e.pontos.toLocaleString('pt-BR') + '</b></div>').join('') +
        '</div><p class="dica">Pontos médios por pessoa. Só você vê.</p></div>';
    }
    const lat = $('pLateral');
    const mudouLateral = setHTML(lat, html);
    atualizarRelogioGrupo();
    if (mudouLateral) {
      lat.querySelectorAll('[data-tam]').forEach(b => b.onclick = () => {
        tamNotas = Math.max(12, Math.min(34, tamNotas + Number(b.dataset.tam)));
        try { localStorage.setItem('aovivo_tam_notas', String(tamNotas)); } catch (e) {}
        lat.querySelectorAll('.pn-notas-txt').forEach(x => x.style.fontSize = tamNotas + 'px');
        lat._html = '';
      });
      lat.querySelectorAll('[data-remover]').forEach(b => b.onclick = ev => {
        const x = p.participantes.find(z => z.id === b.dataset.remover);
        if (x) popover(ev, 'Tirar ' + esc(x.nome) + ' da aula?', 'Tirar', () => acao('aovivo_remover_participante', { p_participante: x.id }));
      });
      lat.querySelectorAll('[data-palavra]').forEach(b => b.onclick = ev => {
        const t = b.dataset.palavra;
        popover(ev, 'Apagar "' + esc(t) + '" da nuvem?', 'Apagar', () => acao('aovivo_remover_palavra', { p_atividade: painel.atividade.id, p_palavra: t }, 'Palavra apagada.'));
      });
      lat.querySelectorAll('[data-convite]').forEach(b => b.onclick = () => copiar(textoConvite(), 'Convite copiado. Cole no chat do Zoom ou do Meet.'));
      lat.querySelectorAll('[data-sortear-grupos]').forEach(b => b.onclick = ev => popover(ev, 'Sortear os grupos de novo? Os alunos veem os grupos novos no celular.', 'Sortear', () => acao('aovivo_sortear_grupos', {}, 'Grupos sorteados de novo.')));
      lat.querySelectorAll('[data-copiar-grupos]').forEach(b => b.onclick = () => copiar(textoGrupos(painel.atividade.grupos || []), 'Lista dos grupos copiada. Cole no chat ou use para montar as salas do Zoom.'));
    }
  }

  function cardSala() {
    const gente = painel.participantes;
    return '<div class="pn-card"><div class="pn-card-cab"><span class="etiqueta">Na sala agora · ' + gente.length + '</span></div>' +
      (gente.length ? '<div class="pn-nomes">' + gente.slice().reverse().map(x =>
        '<button class="pn-nome" data-remover="' + x.id + '" title="Clique para tirar da aula">' + (x.equipe ? '<i style="background:' + corEquipe(painel.equipes, x.equipe) + '"></i>' : '') + esc(x.nome) + '</button>').join('') + '</div>'
        : '<p class="dica">Ninguém entrou ainda. O QR code está no telão.</p>') +
      '<button class="btn btn-secundario btn-pequeno btn-bloco" data-convite style="margin-top:12px">Copiar convite para o chat</button></div>';
  }

  function cardSorteado() {
    const x = painel.extra || {};
    const nomes = (x.ganhadores || []).map(g => esc(g.nome)).join(', ');
    return '<div class="pn-card"><div class="pn-card-cab"><span class="etiqueta">Sorteio</span></div><p class="pn-grande">' + (nomes || 'Ninguém para sortear') + '</p>' +
      '<p class="dica">Só você vê antes da revelação no telão.</p></div>';
  }

  function textoGrupos(grupos) {
    return grupos.map(g => (g.nome || 'Grupo ' + g.n) + ': ' + (g.membros || []).map(x => x.nome).join(', ')).join('\n');
  }

  function cardGrupo(it) {
    const p = painel, a = p.atividade || {}, r = p.ao_vivo || {}, aoVivo = p.fase === 'atividade';
    const cfg = a.config || it.config || {}, modo = (cfg.grupos || {}).modo || 'escolher';
    const comResp = !(cfg.resposta && cfg.resposta.ligada === false);
    const grupos = a.grupos || null, resp = r.grupos || [];
    const qtd = grupos ? grupos.length : (modo === 'escolher' ? (cfg.grupos || {}).quantos || 6 : 0);
    let h = '<div class="pn-card"><div class="pn-card-cab"><span class="etiqueta">' + (aoVivo ? 'Exercício em grupo agora' : 'Exercício em grupo') + '</span></div>';
    if (aoVivo && a.tempo > 0) h += '<p class="pn-grande"><b id="pnRelogioGrupo">…</b> <span id="pnRelogioTxt"></span></p>';
    if (grupos && grupos.length) {
      h += '<div class="pn-grupos">' + grupos.map(g => '<div><b>' + esc(g.nome || 'Grupo ' + g.n) + '</b><span>' + ((g.membros || []).map(x => esc(x.nome)).join(', ') || '<i>ninguém</i>') + '</span></div>').join('') + '</div>' +
        '<div class="linha" style="margin-top:8px">' + (aoVivo && modo === 'sortear' ? '<button class="btn btn-secundario btn-mini" data-sortear-grupos>Sortear de novo</button>' : '') +
        '<button class="btn btn-secundario btn-mini" data-copiar-grupos>Copiar a lista dos grupos</button></div>' +
        (modo === 'sortear' ? '<p class="dica">Quem entrar depois do sorteio escolhe o grupo no celular.</p>' : '');
    } else if (modo === 'escolher') {
      h += '<p class="dica">Cada aluno marca no celular o número do grupo ou da sala (de 1 a ' + qtd + ').</p>';
    }
    if (comResp) {
      h += '<p class="pn-grande" style="margin-top:10px"><b>' + resp.length + '</b>' + (qtd ? ' de ' + qtd : '') + (resp.length === 1 ? ' grupo mandou' : ' grupos mandaram') + ' a resposta</p>' +
        (resp.length ? '<div class="pn-resp-grupos">' + resp.map(g => '<div><b>' + esc(nomeGrupo(grupos, g.grupo)) + '</b><p>' + esc(g.texto) + '</p><span class="dica">por ' + esc(g.nome) + '</span></div>').join('') + '</div>'
          : '<p class="dica">As respostas aparecem aqui assim que os grupos mandarem.</p>');
    }
    return h + '</div>';
  }

  function nomeGrupo(grupos, n) {
    const g = (grupos || []).find(x => x.n === n);
    return g ? g.nome || 'Grupo ' + n : 'Grupo ' + n;
  }

  function cardFerramenta(it) {
    const p = painel, r = p.ao_vivo || {}, n = p.participantes.length, aoVivo = p.fase === 'atividade';
    const ja = new Set(p.responderam || []);
    const faltam = p.participantes.filter(x => !ja.has(x.id));
    return '<div class="pn-card"><div class="pn-card-cab"><span class="etiqueta">' + esc(it.pergunta) + '</span></div>' +
      (aoVivo && p.atividade.tempo > 0 ? '<p class="pn-grande"><b id="pnRelogioGrupo">…</b> <span id="pnRelogioTxt"></span></p>' : '') +
      '<p class="pn-grande"><b>' + (r.total || 0) + '</b> de ' + n + ' terminaram</p><p class="dica">' + (r.abriram || 0) + (r.abriram === 1 ? ' pessoa abriu' : ' pessoas abriram') + ' a ferramenta.</p>' +
      (aoVivo && faltam.length && (r.abriram || 0) > 0 ? '<div class="pn-faltam"><span class="dica">Ainda não abriram</span><div class="pn-nomes">' + faltam.slice(0, 40).map(x => '<span class="pn-nome">' + esc(x.nome) + '</span>').join('') + '</div></div>' : '') + '</div>';
  }

  function atualizarRelogioGrupo() {
    const el = $('pnRelogioGrupo');
    if (!el || !painel || !painel.atividade || !painel.atividade.tempo) return;
    const a = painel.atividade;
    const resta = Math.max(0, Math.ceil((Date.parse(a.iniciada_em) + a.tempo * 1000 - agoraServidor()) / 1000));
    el.textContent = A.mmss(resta);
    el.classList.toggle('acabou', resta === 0);
    $('pnRelogioTxt').textContent = resta > 0 ? 'para acabar' : 'tempo esgotado: chame a turma de volta';
  }

  function cardRespostas(it) {
    if (it.tipo === 'grupo') return cardGrupo(it);
    if (it.tipo === 'ferramenta') return cardFerramenta(it);
    const p = painel, r = p.ao_vivo || {};
    const total = r.total || 0, n = p.participantes.length;
    const aoVivo = p.fase === 'atividade';
    let corpo = '';
    if (it.tipo === 'quiz' || it.tipo === 'votacao') {
      const cont = r.contagem || [], max = Math.max(1, ...cont);
      const ops = (p.atividade && p.atividade.opcoes) || it.opcoes;
      corpo = '<div class="pn-dist">' + ops.map((o, j) => {
        const cor = it.tipo === 'quiz' ? ALTERNATIVAS[j].cor : (it.config && it.config.entre_equipes ? corEquipe(p.equipes, o) : A.CORES_EQUIPE[j % 8]);
        const certa = it.tipo === 'quiz' && j === it.correta;
        return '<div class="pn-dist-linha' + (certa ? ' certa' : '') + '"><span class="pn-dist-cor" style="background:' + cor + '">' + (it.tipo === 'quiz' ? formaSVG(ALTERNATIVAS[j].forma) : '') + '</span>' +
          '<span class="pn-dist-txt">' + esc(o) + '</span><span class="pn-dist-barra"><i style="width:' + ((cont[j] || 0) / max * 100) + '%;background:' + cor + '"></i></span><b>' + (cont[j] || 0) + (certa ? ' ✓' : '') + '</b></div>';
      }).join('') + '</div>';
    } else if (it.tipo === 'escala') {
      const d = r.distribuicao || [], max = Math.max(1, ...d);
      corpo = '<div class="pn-escala"><div class="pn-escala-media"><b>' + (r.media == null ? '…' : String(r.media).replace('.', ',')) + '</b><span>média</span></div><div class="pn-escala-cols">' +
        d.map((x, j) => '<span title="' + j + ': ' + x + '"><i style="height:' + (x / max * 100) + '%"></i><small>' + j + '</small></span>').join('') + '</div></div>';
    } else if (it.tipo === 'nuvem') {
      const pal = r.palavras || [];
      corpo = pal.length ? '<div class="pn-palavras">' + pal.slice(0, 60).map(w => '<button class="pn-palavra" data-palavra="' + esc(w.t) + '" title="Clique para apagar da nuvem">' + esc(w.t) + ' <small>' + w.n + '</small></button>').join('') + '</div>' +
        '<p class="dica">Clique numa palavra para apagar da nuvem.</p>' : '<p class="dica">Ainda sem palavras.</p>';
    }
    const ja = new Set(p.responderam || []);
    const faltam = p.participantes.filter(x => !ja.has(x.id));
    const lista = aoVivo && faltam.length && total > 0
      ? '<div class="pn-faltam"><span class="dica">Ainda não responderam</span><div class="pn-nomes">' + faltam.slice(0, 40).map(x => '<span class="pn-nome">' + esc(x.nome) + '</span>').join('') +
        (faltam.length > 40 ? '<span class="pn-nome">e mais ' + (faltam.length - 40) + '</span>' : '') + '</div></div>' : '';
    return '<div class="pn-card"><div class="pn-card-cab"><span class="etiqueta">' + (aoVivo ? 'Respostas ao vivo' : 'Resultado') + '</span>' +
      (aoVivo && it.tipo === 'quiz' ? '<span class="dica">o telão ainda não mostra</span>' : '') + '</div>' +
      '<p class="pn-grande"><b>' + total + '</b> de ' + n + (n === 1 ? ' respondeu' : ' responderam') + '</p>' + corpo + lista + '</div>';
  }

  function desenharTrilha(i) {
    const L = itens(), base = posBase();
    let n = 0;
    const html = L.map((it, k) => {
      const est = k === i ? ' atual' : (k <= base ? ' feito' : '');
      if (it.tipo === 'slide') {
        n++;
        return '<button class="pn-mini' + est + '" data-k="' + k + '" title="Slide ' + n + (it.pergunta ? ': ' + esc(it.pergunta) : '') + '"><img src="' + esc(it.config.imagem) + '" alt="" loading="lazy" draggable="false"><span>' + n + '</span></button>';
      }
      return '<button class="pn-mini pn-mini-ativ tipo-' + it.tipo + est + '" data-k="' + k + '" title="' + TIPOS[it.tipo].nome + ': ' + esc(it.pergunta) + '"><b>' + TIPOS[it.tipo].icone + '</b><span>' + TIPOS[it.tipo].curto + '</span></button>';
    }).join('');
    const t = $('pTrilha');
    if (setHTML(t, html || '<p class="dica">O roteiro está vazio. Clique em "Editar aula" para montar.</p>')) {
      t.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { b.blur(); irPara(Number(b.dataset.k)); });
      const at = t.querySelector('.atual');
      if (at) at.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  function precarregarProximos() {
    const L = itens(), i = posBase(), urls = [];
    for (let k = i + 1; k < L.length && urls.length < 2; k++) if (L[k].tipo === 'slide') urls.push(L[k].config.imagem);
    const chave = urls.join('|');
    if (chave && chave !== precarregarProximos._ult) {
      precarregarProximos._ult = chave;
      previa.precarregar(urls);
      if (bc) try { bc.postMessage({ tipo: 'precarregar', urls }); } catch (e) {}
    }
  }

  /* ---------- Relógio e resultado automático ---------- */
  function verificarAuto() {
    const p = painel;
    if (!p || p.fase !== 'atividade' || !p.atividade) return;
    const a = p.atividade;
    if (a.tipo === 'grupo' || a.tipo === 'ferramenta') return;   // aqui quem encerra é a apresentadora
    const total = (p.ao_vivo || {}).total || 0;
    if (a.tipo === 'quiz' && p.participantes.length > 0 && total >= p.participantes.length) autoResultado(a, 900);
    // só o quiz fecha sozinho quando o tempo acaba; nas outras, quem atrasou ainda responde (pedido da Juliana, 16/11/2026)
    if (a.tipo === 'quiz' && a.tempo > 0) {
      const fim = Date.parse(a.iniciada_em) + a.tempo * 1000;
      if (agoraServidor() >= fim) autoResultado(a, 1200);
    }
  }

  function autoResultado(a, atraso) {
    const k = a.id + a.iniciada_em + a.tempo;
    if (autoFeito === k) return;
    autoFeito = k;
    setTimeout(() => {
      const b = painel.atividade;
      if (painel.fase === 'atividade' && b && b.id + b.iniciada_em + b.tempo === k) acao('aovivo_mostrar_resultado');
    }, atraso);
  }

  function relogio() {
    if (!painel || $('vistaPainel').classList.contains('oculto')) return;
    const c = painel.comecou_em;
    if (painel.fase === 'encerrada') { $('pRelogio').textContent = '⏱ aula encerrada'; }
    else if (!c) {
      const ini = painel.inicio ? Date.parse(painel.inicio) : NaN, falta = Math.ceil((ini - agoraServidor()) / 1000);
      $('pRelogio').textContent = isFinite(falta) && falta > 0 && falta < 86400 ? '⏱ começa em ' + A.mmss(falta) : '⏱ ainda não começou';
    }
    else {
      const s = Math.max(0, Math.floor((agoraServidor() - Date.parse(c)) / 1000));
      const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
      $('pRelogio').textContent = '⏱ ' + [h, m, ss].map(x => String(x).padStart(2, '0')).join(':') + ' de aula';
    }
    atualizarStatusTelao();
    atualizarRelogioGrupo();
    verificarAuto();
    tempoEsgotado();
    musicaAutomatica();
  }
  setInterval(relogio, 500);

  /* ---------- O tempo acabou: ainda dá para responder; a professora escolhe ---------- */
  function tempoEsgotado() {
    const p = painel, b = $('pSeguir');
    if (!b) return;
    const a = p && p.fase === 'atividade' && p.atividade;
    const acabou = !!a && a.tipo !== 'quiz' && a.tempo > 0 && agoraServidor() >= Date.parse(a.iniciada_em) + a.tempo * 1000;
    b.classList.toggle('oculto', !acabou);
    if (acabou && !p.tela_preta) {
      $('pDica').textContent = '⏰ O tempo acabou, mas quem ainda não terminou continua conseguindo responder. Dê +1 min, ' +
        (a.tipo === 'grupo' ? 'veja as respostas dos grupos' : a.tipo === 'ferramenta' ? 'encerre a ferramenta' : 'mostre o resultado') + ' ou siga para o próximo slide.';
    }
  }
  $('pSeguir').onclick = () => {
    const L = itens(), i = posBase();
    if (L[i + 1]) irPara(i + 1); else proximoPasso().fn();
  };

  /* ---------- Música da sala de espera ---------- */
  let musicaDesligada = false, musicaAuto = false;
  function desenharMusica() {
    const b = $('pMusica'), M = window.MusicaEspera;
    if (!b || !M) return;
    b.textContent = M.tocando ? '🔇 Parar a música' : '🎵 Música';
    b.classList.toggle('ligado', M.tocando);
    b.classList.toggle('chamando', !M.tocando && !musicaDesligada && emBoasVindas(painel));
  }
  function musicaAutomatica() {
    const M = window.MusicaEspera;
    if (!M || !painel || $('vistaPainel').classList.contains('oculto')) return;
    if (emBoasVindas(painel)) {
      if (!M.tocando && !musicaDesligada && M.liberada) { musicaAuto = true; M.tocar(); }
    } else if (M.tocando && musicaAuto) { musicaAuto = false; M.parar(); }
    desenharMusica();
  }
  function alternarMusica() {
    const M = window.MusicaEspera;
    if (!M) return;
    if (M.tocando) { musicaDesligada = true; musicaAuto = false; M.parar(true); }
    else { musicaDesligada = false; musicaAuto = emBoasVindas(painel); M.preparar(); M.tocar().then(ok => { if (!ok) toast('Clique de novo em "Música" para o navegador liberar o som.', true); }); }
    desenharMusica();
  }
  if (window.MusicaEspera) MusicaEspera.aoMudar(desenharMusica);
  $('pMusica').onclick = alternarMusica;

  /* =========================================================
     Início
     ========================================================= */
  const m = location.hash.match(/s=([0-9a-f-]{36}).*?k=([0-9a-f]{64})/i);
  if (m) abrirAula({ id: m[1], chave: m[2] });
  else abrirInicio();
})();
