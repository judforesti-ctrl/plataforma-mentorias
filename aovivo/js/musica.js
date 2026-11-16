/* Mentorei Ao Vivo · música da sala de espera
   Pedido da Juliana (16/11/2026): música tocando enquanto os alunos entram.
   A música é composta aqui mesmo (sem arquivo e sem direito autoral): uma batida calma, de uns 50 segundos,
   montada uma vez com o OfflineAudioContext e tocada em laço. Toca no painel da professora; no Zoom, ela marca
   "Compartilhar som" ao compartilhar a janela do telão (no Teams, "Incluir som"). */
(function () {
  const BPM = 80;
  const BATIDA = 60 / BPM;           // 1 tempo
  const SEMI = BATIDA / 4;           // semicolcheia
  const COMPASSO = BATIDA * 4;
  const COMPASSOS = 16;              // 4 voltas da sequência de acordes
  const CAUDA = 3;                   // segundos de eco que voltam para o começo do laço

  // Fmaj9, Em7, Dm9, Cmaj9 (notas MIDI)
  const ACORDES = [
    [53, 57, 60, 64, 67],
    [52, 55, 59, 62, 67],
    [50, 53, 57, 60, 64],
    [48, 52, 55, 59, 62]
  ];
  const BAIXO = [41, 40, 38, 36];
  // melodia (passo de semicolcheia no compasso → nota); só nas voltas 2 e 4
  const MELODIA = [
    { 4: 76, 6: 79, 10: 81, 12: 79 },
    { 2: 79, 4: 76, 8: 74, 12: 76 },
    { 0: 77, 4: 76, 6: 74, 10: 72 },
    { 4: 74, 8: 76, 14: 79 }
  ];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  let ctx = null, saida = null, fonte = null, buffer = null, preparando = null;
  let tocando = false, volume = 0.6;
  const ouvintes = [];

  function avisar() { ouvintes.forEach(f => { try { f(tocando); } catch (e) {} }); }

  async function compor(sr) {
    const dur = COMPASSO * COMPASSOS;
    const oc = new OfflineAudioContext(2, Math.ceil((dur + CAUDA) * sr), sr);

    const mestre = oc.createDynamicsCompressor();
    mestre.threshold.value = -18; mestre.ratio.value = 3;
    const fim = oc.createGain(); fim.gain.value = 0.9;
    mestre.connect(fim); fim.connect(oc.destination);

    // eco de sala (resposta ao impulso feita de ruído que se apaga)
    const rev = oc.createConvolver();
    const ir = oc.createBuffer(2, Math.floor(sr * 2.6), sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    rev.buffer = ir;
    const revG = oc.createGain(); revG.gain.value = 0.32;
    rev.connect(revG); revG.connect(mestre);

    // ruído para a bateria e o chiado de vinil
    const ruido = oc.createBuffer(1, sr, sr);
    { const d = ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

    const filtroEP = oc.createBiquadFilter(); filtroEP.type = 'lowpass'; filtroEP.frequency.value = 2200;
    const ep = oc.createGain(); ep.gain.value = 1;
    ep.connect(filtroEP); filtroEP.connect(mestre); filtroEP.connect(rev);

    // piano elétrico (FM suave)
    function tecla(nota, t, dur, vel, pan) {
      const car = oc.createOscillator(), mod = oc.createOscillator(), modG = oc.createGain(), g = oc.createGain(), p = oc.createStereoPanner();
      car.type = 'sine'; mod.type = 'sine';
      car.frequency.value = hz(nota); mod.frequency.value = hz(nota);
      modG.gain.setValueAtTime(hz(nota) * 1.1, t);
      modG.gain.exponentialRampToValueAtTime(hz(nota) * 0.05, t + 0.5);
      mod.connect(modG); modG.connect(car.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      p.pan.value = pan;
      car.connect(g); g.connect(p); p.connect(ep);
      car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
    }
    function baixo(nota, t, dur) {
      const o = oc.createOscillator(), o2 = oc.createOscillator(), g = oc.createGain(), f = oc.createBiquadFilter();
      o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = hz(nota); o2.frequency.value = hz(nota);
      f.type = 'lowpass'; f.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(mestre);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    }
    function melodia(nota, t, dur) {
      const o = oc.createOscillator(), vib = oc.createOscillator(), vibG = oc.createGain(), g = oc.createGain();
      o.type = 'triangle'; o.frequency.value = hz(nota);
      vib.frequency.value = 5; vibG.gain.value = hz(nota) * 0.006;
      vib.connect(vibG); vibG.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(filtroEP);
      o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    }
    function bumbo(t) {
      const o = oc.createOscillator(), g = oc.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g); g.connect(mestre); o.start(t); o.stop(t + 0.35);
    }
    function caixa(t) {
      const n = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain();
      n.buffer = ruido; f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8;
      g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      n.connect(f); f.connect(g); g.connect(mestre); g.connect(rev); n.start(t); n.stop(t + 0.2);
    }
    function chimbal(t, forte) {
      const n = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain();
      n.buffer = ruido; f.type = 'highpass'; f.frequency.value = 7000;
      g.gain.setValueAtTime(forte ? 0.05 : 0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      n.connect(f); f.connect(g); g.connect(mestre); n.start(t, Math.random() * 0.5); n.stop(t + 0.06);
    }

    // chiado de vinil bem baixinho
    {
      const n = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain();
      n.buffer = ruido; n.loop = true; f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.4; g.gain.value = 0.006;
      n.connect(f); f.connect(g); g.connect(fim); n.start(0); n.stop(dur + CAUDA);
    }

    for (let c = 0; c < COMPASSOS; c++) {
      const t0 = c * COMPASSO, k = c % 4, volta = Math.floor(c / 4);
      const ac = ACORDES[k];
      ac.forEach((n, j) => tecla(n, t0 + j * 0.012, COMPASSO * 0.62, 0.05, (j - 2) * 0.18));
      ac.slice(1).forEach((n, j) => tecla(n, t0 + SEMI * 10 + j * 0.01, COMPASSO * 0.36, 0.03, (j - 1.5) * 0.2));
      baixo(BAIXO[k], t0, BATIDA * 1.8);
      baixo(BAIXO[k], t0 + SEMI * 10, BATIDA * 1.2);
      if (volta > 0) {
        for (let s = 0; s < 16; s++) {
          const sw = s % 2 ? SEMI * 0.3 : 0;          // balanço (swing)
          const t = t0 + s * SEMI + sw;
          if (s === 0 || s === 10) bumbo(t);
          if (s === 4 || s === 12) caixa(t);
          if (s % 2 === 0) chimbal(t, s % 4 === 2);
          else if (s === 7 || s === 15) chimbal(t, false);
        }
      }
      if (volta === 1 || volta === 3) {
        const m = MELODIA[k];
        Object.keys(m).forEach(s => melodia(m[s] + (volta === 3 ? 0 : -12), t0 + Number(s) * SEMI, BATIDA * 0.9));
      }
    }

    const r = await oc.startRendering();
    // laço sem emenda: o eco que passa do fim volta para o começo
    const n = Math.round(dur * sr), c = Math.round(CAUDA * sr);
    const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
    for (let ch = 0; ch < 2; ch++) {
      const d = r.getChannelData(ch), o = out.getChannelData(ch);
      o.set(d.subarray(0, n));
      for (let i = 0; i < c && n + i < d.length; i++) o[i] += d[n + i];
    }
    return out;
  }

  function garantirContexto() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      saida = ctx.createGain();
      saida.gain.value = 0;
      saida.connect(ctx.destination);
    }
    return ctx;
  }

  // chamar dentro de um clique: libera o som no navegador
  function preparar() {
    const c = garantirContexto();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    if (!buffer && !preparando && c) {
      // 24 kHz basta para esse som (filtrado em 2,2 kHz) e monta na metade do tempo
      preparando = compor(24000).then(b => { buffer = b; return b; })
        .catch(() => null).finally(() => { preparando = null; });
    }
    return preparando || Promise.resolve(buffer);
  }

  async function tocar() {
    const c = garantirContexto();
    if (!c) return false;
    if (tocando) return true;
    try { await c.resume(); } catch (e) {}
    if (c.state !== 'running') return false;   // o navegador ainda não deixou (precisa de um clique)
    const b = buffer || await preparar();
    if (!b || tocando) return tocando;
    fonte = c.createBufferSource();
    fonte.buffer = b; fonte.loop = true;
    fonte.connect(saida);
    const t = c.currentTime;
    saida.gain.cancelScheduledValues(t);
    saida.gain.setValueAtTime(0.0001, t);
    saida.gain.linearRampToValueAtTime(volume, t + 2.5);
    fonte.start(t);
    tocando = true; avisar();
    return true;
  }

  function parar(rapido) {
    if (!tocando || !ctx) return;
    const f = fonte, t = ctx.currentTime, d = rapido ? 0.3 : 2;
    saida.gain.cancelScheduledValues(t);
    saida.gain.setValueAtTime(saida.gain.value, t);
    saida.gain.linearRampToValueAtTime(0.0001, t + d);
    setTimeout(() => { try { f.stop(); } catch (e) {} }, d * 1000 + 100);
    fonte = null; tocando = false; avisar();
  }

  function mudarVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (tocando && ctx) { const t = ctx.currentTime; saida.gain.cancelScheduledValues(t); saida.gain.linearRampToValueAtTime(volume, t + 0.2); }
  }

  window.MusicaEspera = {
    preparar, tocar, parar, mudarVolume,
    get tocando() { return tocando; },
    get liberada() { return !!ctx && ctx.state === 'running'; },
    get volume() { return volume; },
    get _buffer() { return buffer; },
    aoMudar(f) { ouvintes.push(f); }
  };
})();
