/* Mentorei Ao Vivo · janela do telão (a única que vai para o Zoom ou o Meet) */
(function () {
  const A = window.AoVivo;
  const raiz = document.getElementById('telao');
  const m = location.hash.match(/s=([0-9a-f-]{36})/i);
  if (!m) {
    raiz.className = 'telao-aviso';
    raiz.textContent = 'Abra o telão pelo painel da aula, no botão "Abrir telão".';
    return;
  }
  const id = m[1].toLowerCase();
  const telao = A.criarTelao(raiz, {});
  let ultVersao = -1, ultAgora = 0, ultimoDoPainel = 0;
  let buscando = false;

  function aplicar(est) {
    if (!est || String(est.id).toLowerCase() !== id) return;
    const v = Number(est.versao) || 0, ag = Date.parse(est.agora) || 0;
    // ignora respostas que chegaram atrasadas
    if (v < ultVersao || (v === ultVersao && ag && ag < ultAgora)) return;
    ultVersao = v; ultAgora = ag || ultAgora;
    telao.render(est);
    document.title = (est.titulo || 'Aula') + ' · Telão';
  }

  async function buscar() {
    if (buscando) return;
    buscando = true;
    try { aplicar(await A.rpc('aovivo_telao', { p_sessao: id })); }
    catch (e) {
      if (/não encontrada/i.test(e.message)) { raiz.className = 'telao-aviso'; raiz.textContent = 'Essa aula não existe mais.'; }
    } finally { buscando = false; }
  }

  // conversa com o painel aberto no mesmo computador
  let bc = null;
  try { bc = new BroadcastChannel('aovivo-' + id); } catch (e) {}
  if (bc) {
    bc.onmessage = ev => {
      const d = ev.data || {};
      if (d.tipo === 'estado') { ultimoDoPainel = Date.now(); aplicar(d.estado); }
      else if (d.tipo === 'pong') ultimoDoPainel = Date.now();
      else if (d.tipo === 'precarregar') telao.precarregar(d.urls);
    };
    const ping = () => { try { bc.postMessage({ tipo: 'ping' }); } catch (e) {} };
    ping(); setInterval(ping, 2000);
    window.addEventListener('pagehide', () => { try { bc.postMessage({ tipo: 'tchau' }); } catch (e) {} });
  }

  // tempo real direto do servidor (funciona mesmo se o painel estiver em outro computador)
  let canalOk = false;
  A.sb.channel('aovivo-' + id).on('broadcast', { event: 'estado' }, () => buscar()).subscribe(s => { canalOk = s === 'SUBSCRIBED'; });
  buscar();
  let ciclo = 0;
  setInterval(() => {
    ciclo++;
    const painelVivo = Date.now() - ultimoDoPainel < 3000;
    if (!painelVivo || !canalOk || ciclo % 4 === 0) buscar();
  }, 1500);

  // teclado: F e clique duplo para tela cheia, o resto vai para o painel
  function telaCheia() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  }
  document.addEventListener('dblclick', telaCheia);
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'f') { telaCheia(); return; }
    if ([' ', 'arrowright', 'arrowleft', 'arrowdown', 'arrowup', 'pagedown', 'pageup', 'enter', 'b', '.', 'r', 's', 'q', 'm', 'i'].includes(k)) {
      e.preventDefault();
      if (bc) bc.postMessage({ tipo: 'tecla', tecla: k });
    }
  });

  // setas nas laterais: passar os slides com o mouse (aparecem quando o mouse chega perto da borda)
  const setaAnt = document.getElementById('setaAnt'), setaProx = document.getElementById('setaProx');
  function setaClicada(ev, k) {
    ev.preventDefault(); ev.stopPropagation();
    if (!bc || Date.now() - ultimoDoPainel > 4000) {
      mostrarAviso('Para passar os slides, deixe o painel da aula aberto neste computador.');
      return;
    }
    bc.postMessage({ tipo: 'tecla', tecla: k });
  }
  [[setaAnt, 'arrowleft'], [setaProx, 'arrowright']].forEach(([b, k]) => {
    b.addEventListener('click', ev => setaClicada(ev, k));
    b.addEventListener('dblclick', ev => { ev.preventDefault(); ev.stopPropagation(); });
  });
  let tAviso = null, avisoAte = 0;
  const AJUDA = 'Clique duas vezes para tela cheia · Compartilhe esta janela no Zoom, no Meet ou no Teams';
  function mostrarAviso(t) {
    const a = document.getElementById('ajuda');
    a.textContent = t; a.classList.remove('oculto');
    avisoAte = Date.now() + 3500;
    clearTimeout(tAviso);
    tAviso = setTimeout(() => { a.classList.add('oculto'); a.textContent = AJUDA; }, 3500);
  }

  // esconde o cursor parado e mostra a dica e as setas só quando o mouse mexe
  let tCursor = null;
  document.addEventListener('mousemove', ev => {
    document.body.classList.remove('sem-cursor');
    if (Date.now() > avisoAte) document.getElementById('ajuda').classList.toggle('oculto', !!document.fullscreenElement);
    const w = window.innerWidth, perto = Math.max(110, w * 0.16);
    setaAnt.classList.toggle('oculto', ev.clientX > perto);
    setaProx.classList.toggle('oculto', ev.clientX < w - perto);
    clearTimeout(tCursor);
    tCursor = setTimeout(() => {
      if (setaAnt.matches(':hover') || setaProx.matches(':hover')) return;
      document.body.classList.add('sem-cursor');
      if (Date.now() > avisoAte) document.getElementById('ajuda').classList.add('oculto');
      setaAnt.classList.add('oculto'); setaProx.classList.add('oculto');
    }, 2200);
  });
  document.addEventListener('mouseleave', () => { setaAnt.classList.add('oculto'); setaProx.classList.add('oculto'); });
})();
