/* Mentorei Ao Vivo · tutorial guiado (pedido da Juliana, 16/11/2026, no estilo do HeyGen):
   um balão por passo apontando a parte da tela, "1 DE 7", bolinhas de progresso, Voltar / Próximo, 🔊 que lê o passo em voz alta
   e "Posso fazer sozinho(a)", que desliga o tutorial automático. Ele abre sozinho toda vez que a pessoa entra, até ela desligar;
   o botão "❓ Tutorial" abre de novo quando quiser. A escolha fica neste navegador (localStorage). */
(function () {
  const CHAVE = 'aovivo_tutorial_v1';
  let aberto = null;        // { nome, passos, i, el: {...} }
  let falando = false;

  function lerPrefs() { try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { return {}; } }
  function gravarPrefs(p) { try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch (e) {} }
  function desligado(nome) { return lerPrefs()[nome] === 'sozinho'; }
  function marcar(nome, sozinho) { const p = lerPrefs(); if (sozinho) p[nome] = 'sozinho'; else delete p[nome]; gravarPrefs(p); }
  function narracaoLigada() { return lerPrefs().narracao === true; }
  function ligarNarracao(v) { const p = lerPrefs(); p.narracao = !!v; gravarPrefs(p); }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------- voz (a do próprio navegador, em português) ---------- */
  function vozPt() {
    const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const pt = vs.filter(v => /^pt(-|_)?BR/i.test(v.lang) || /portugu[eê]s.*brasil/i.test(v.name));
    return pt.find(v => /natural|online|francisca|thalita|luciana/i.test(v.name)) || pt.find(v => /google/i.test(v.name)) || pt[0] || null;
  }
  function falar(texto) {
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      const v = vozPt(); if (v) u.voice = v;
      u.lang = 'pt-BR'; u.rate = 1.05;
      u.onend = () => { falando = false; desenharSom(); };
      falando = true;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function calar() { falando = false; try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} }
  if (window.speechSynthesis) try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) {}

  /* ---------- montar ---------- */
  function visivel(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.oculto');
  }
  function alvoDe(p) { return p.alvo ? document.querySelector(p.alvo) : null; }

  function abrir(nome, passos, opcoes) {
    opcoes = opcoes || {};
    fechar(true);
    const lista = passos.filter(p => !p.alvo || visivel(alvoDe(p)));   // o que não está na tela agora não entra (a conta "1 DE N" fica certa)
    if (!lista.length) return;
    const raiz = document.createElement('div');
    raiz.className = 'tour';
    raiz.innerHTML = '<div class="tour-bloqueio"></div><div class="tour-furo"></div>' +
      '<div class="tour-balao" role="dialog" aria-live="polite"><span class="tour-seta"></span>' +
      '<div class="tour-cab"><span class="tour-num"><i></i><b></b></span><span class="tour-esp"></span>' +
      '<button type="button" class="tour-icone" data-t="som" title="Ouvir este passo"></button>' +
      '<button type="button" class="tour-icone" data-t="fechar" title="Fechar (aparece de novo na próxima vez)">✕</button></div>' +
      '<h3 class="tour-tit"></h3><p class="tour-txt"></p><div class="tour-fim"></div>' +
      '<div class="tour-rodape"><span class="tour-pontos"></span><span class="tour-esp"></span>' +
      '<button type="button" class="tour-btn tour-btn-leve" data-t="voltar">Voltar</button>' +
      '<button type="button" class="tour-btn" data-t="proximo">Próximo</button></div>' +
      '<button type="button" class="tour-sozinho" data-t="sozinho">Já sei, posso fazer sozinho(a)</button></div>';
    document.body.appendChild(raiz);
    aberto = { nome, passos: lista, i: 0, raiz, opcoes,
      furo: raiz.querySelector('.tour-furo'), balao: raiz.querySelector('.tour-balao'), seta: raiz.querySelector('.tour-seta') };
    raiz.addEventListener('click', ev => {
      const b = ev.target.closest('[data-t]');
      if (!b) return;
      const t = b.dataset.t;
      if (t === 'fechar') fechar();
      else if (t === 'proximo') ir(aberto.i + 1);
      else if (t === 'voltar') ir(aberto.i - 1);
      else if (t === 'som') { const ligar = !narracaoLigada(); ligarNarracao(ligar); if (ligar) lerPasso(); else calar(); desenharSom(); }
      else if (t === 'sozinho') {
        marcar(nome, true);
        const aviso = opcoes.aoDesligar;
        fechar();
        if (aviso) aviso();
      }
    });
    raiz.querySelector('.tour-pontos').addEventListener('click', ev => {
      const p = ev.target.closest('[data-p]');
      if (p) ir(Number(p.dataset.p));
    });
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    document.addEventListener('keydown', teclas, true);
    ir(0);
  }

  function teclas(ev) {
    if (!aberto) return;
    const k = ev.key;
    if (['Escape', 'ArrowRight', 'ArrowLeft', 'Enter', ' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp'].includes(k)) {
      // com o tutorial aberto, as teclas mexem no tutorial (e não passam o slide nem a aula); num campo, só o Esc
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName) && k !== 'Escape') return;
      ev.preventDefault(); ev.stopPropagation();
      if (k === 'Escape') fechar();
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') ir(aberto.i - 1);
      else if (k === 'Enter' && document.activeElement && document.activeElement.closest && document.activeElement.closest('.tour-balao button')) document.activeElement.click();
      else ir(aberto.i + 1);
    }
  }

  function ir(i) {
    if (!aberto) return;
    const L = aberto.passos;
    if (i < 0) return;
    if (i >= L.length) { concluir(); return; }
    const p = L[i];   // se o alvo sumiu da tela no meio do caminho, o balão aparece no centro
    aberto.i = i;
    if (p.antes) try { p.antes(); } catch (e) {}
    const el = alvoDe(p);
    if (el && visivel(el)) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const b = aberto.balao;
    b.querySelector('.tour-num b').textContent = (i + 1) + ' DE ' + L.length;
    b.querySelector('.tour-tit').textContent = p.titulo || '';
    b.querySelector('.tour-tit').classList.toggle('oculto', !p.titulo);
    b.querySelector('.tour-txt').innerHTML = p.texto;
    b.querySelector('.tour-pontos').innerHTML = L.map((x, k) => '<i data-p="' + k + '" class="' + (k === i ? 'atual' : k < i ? 'feito' : '') + '"></i>').join('');
    b.querySelector('[data-t="voltar"]').classList.toggle('oculto', i === 0);
    const ultimo = i === L.length - 1;
    b.querySelector('[data-t="proximo"]').textContent = ultimo ? 'Concluir' : (i === 0 ? 'Começar' : 'Próximo');
    b.querySelector('.tour-fim').innerHTML = ultimo ? '<label class="tour-sempre"><input type="checkbox" data-sempre' + (desligado(aberto.nome) ? '' : ' checked') + '> Mostrar este tutorial sempre que eu entrar</label>' : '';
    b.querySelector('.tour-sozinho').classList.toggle('oculto', ultimo);
    b.classList.toggle('sem-alvo', !el);
    desenharSom();
    setTimeout(posicionar, el ? 260 : 0);
    posicionar();
    if (narracaoLigada()) lerPasso(); else calar();
    setTimeout(() => { const pr = b.querySelector('[data-t="proximo"]'); if (pr && aberto) pr.focus({ preventScroll: true }); }, 30);
  }

  function lerPasso() {
    if (!aberto) return;
    const p = aberto.passos[aberto.i];
    const tmp = document.createElement('div'); tmp.innerHTML = p.texto;
    falar((p.titulo ? p.titulo + '. ' : '') + tmp.textContent);
  }
  function desenharSom() {
    if (!aberto) return;
    const b = aberto.balao.querySelector('[data-t="som"]');
    if (!window.speechSynthesis) { b.classList.add('oculto'); return; }
    const on = narracaoLigada();
    b.textContent = on ? '🔊' : '🔈';
    b.classList.toggle('ligado', on);
    b.title = on ? 'Narração ligada: clique para desligar' : 'Ouvir os passos em voz alta';
  }

  function posicionar() {
    if (!aberto) return;
    const p = aberto.passos[aberto.i], el = alvoDe(p), b = aberto.balao, f = aberto.furo, s = aberto.seta;
    const W = window.innerWidth, H = window.innerHeight, M = 12;
    const bw = Math.min(360, W - 2 * M);
    b.style.width = bw + 'px';
    if (!el || !visivel(el)) {
      f.style.cssText = 'left:50%;top:50%;width:0;height:0;';
      b.style.left = Math.round((W - bw) / 2) + 'px';
      b.style.top = Math.max(M, Math.round((H - b.offsetHeight) / 2)) + 'px';
      s.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect(), pad = p.folga == null ? 6 : p.folga;
    const fx = Math.max(4, r.left - pad), fy = Math.max(4, r.top - pad);
    const fw = Math.min(W - 8, r.right + pad) - fx, fh = Math.min(H - 8, r.bottom + pad) - fy;
    f.style.cssText = 'left:' + fx + 'px;top:' + fy + 'px;width:' + fw + 'px;height:' + fh + 'px;';
    const bh = b.offsetHeight, gap = 16;
    let lado = p.lado;
    if (!lado) {
      if (H - (fy + fh) >= bh + gap + M) lado = 'baixo';
      else if (fy >= bh + gap + M) lado = 'cima';
      else if (W - (fx + fw) >= bw + gap + M) lado = 'direita';
      else if (fx >= bw + gap + M) lado = 'esquerda';
      else lado = 'dentro';
    }
    let x, y;
    if (lado === 'baixo') { x = fx + fw / 2 - bw / 2; y = fy + fh + gap; }
    else if (lado === 'cima') { x = fx + fw / 2 - bw / 2; y = fy - bh - gap; }
    else if (lado === 'direita') { x = fx + fw + gap; y = fy + fh / 2 - bh / 2; }
    else if (lado === 'esquerda') { x = fx - bw - gap; y = fy + fh / 2 - bh / 2; }
    else { x = fx + fw / 2 - bw / 2; y = Math.min(fy + 24, H - bh - M); }
    x = Math.max(M, Math.min(W - bw - M, x));
    y = Math.max(M, Math.min(H - bh - M, y));
    b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px';
    s.style.display = lado === 'dentro' ? 'none' : 'block';
    s.className = 'tour-seta ' + lado;
    if (lado === 'baixo' || lado === 'cima') s.style.left = Math.max(18, Math.min(bw - 18, fx + fw / 2 - x)) + 'px', s.style.top = '';
    else s.style.top = Math.max(18, Math.min(bh - 18, fy + fh / 2 - y)) + 'px', s.style.left = '';
  }

  function concluir() {
    if (!aberto) return;
    const c = aberto.balao.querySelector('[data-sempre]');
    if (c) marcar(aberto.nome, !c.checked);
    const fim = aberto.opcoes.aoConcluir;
    fechar();
    if (fim) fim();
  }

  function fechar(silencioso) {
    calar();
    if (!aberto) return;
    aberto.raiz.remove();
    window.removeEventListener('resize', posicionar);
    window.removeEventListener('scroll', posicionar, true);
    document.removeEventListener('keydown', teclas, true);
    const fc = aberto.opcoes.aoFechar;
    aberto = null;
    if (!silencioso && fc) fc();
  }

  window.Tutorial = {
    abrir,                                      // abrir(nome, passos, { aoDesligar, aoConcluir, aoFechar })
    automatico(nome, passos, opcoes) { if (!desligado(nome)) abrir(nome, passos, opcoes); },
    desligado, marcar, aberto: () => !!aberto, fechar: () => fechar(true)
  };
})();
