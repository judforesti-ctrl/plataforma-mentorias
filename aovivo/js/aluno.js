/* Mentorei Ao Vivo · tela do aluno (celular) */
(function () {
  const { sb, rpc, agoraServidor, esc, corEquipe, ALTERNATIVAS, formaSVG, confete, ordinal, mmss } = window.AoVivo;
  const $ = id => document.getElementById(id);
  const CHAVE = 'aovivo_aluno_v1';

  let eu = carregar();           // { sessao_id, participante_id, token, nome, equipe, codigo }
  let estado = null;             // último estado recebido
  let infoAula = null;           // { titulo, modo_equipes, equipes } antes de entrar
  let equipeEscolhida = null;
  let canal = null, canalOk = false;
  let ultimaChave = '';
  let timerPoll = null, timerRelogio = null;
  let buscando = false, pendente = false;
  let enviando = false;
  let confeteMostrado = '';
  let ultimaAtividadeVibrada = '';
  let ultimoAvisoSeguir = '';
  let fimAvisado = '';
  let avaliacaoAvisada = '';
  let emailCobrado = '';
  let textoGrupo = '';           // o que o aluno está escrevendo na resposta do grupo (não some quando a tela redesenha)

  /* ---------- Aviso de atividade: vibração, som e flash ---------- */
  let somLigado = true;
  try { somLigado = localStorage.getItem('aovivo_som') !== '0'; } catch (e) {}
  let audio = null;
  function prepararAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().then(desenharRodape, () => {});
    } catch (e) {}
  }
  document.addEventListener('pointerdown', prepararAudio, { passive: true });
  document.addEventListener('keydown', prepararAudio);
  function somPronto() { return !!(audio && audio.state === 'running'); }
  function bip(notas) {
    if (!somLigado || !somPronto()) return;
    const t0 = audio.currentTime + 0.02;
    notas.forEach(([f, ini, dur]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + ini);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + ini + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ini + dur);
      o.connect(g); g.connect(audio.destination);
      o.start(t0 + ini); o.stop(t0 + ini + dur + 0.05);
    });
  }
  function vibrar(padrao) { if (navigator.vibrate) try { navigator.vibrate(padrao); } catch (e) {} }
  function piscar() {
    const f = document.createElement('div');
    f.className = 'flash-atividade';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
  function alertaAtividade() { vibrar([200, 80, 200]); bip([[880, 0, 0.16], [1320, 0.19, 0.3]]); piscar(); }
  function avisoLeve() { vibrar(50); bip([[660, 0, 0.14]]); }

  function carregar() { try { return JSON.parse(localStorage.getItem(CHAVE)) || null; } catch (e) { return null; } }
  function salvar(v) { try { v ? localStorage.setItem(CHAVE, JSON.stringify(v)) : localStorage.removeItem(CHAVE); } catch (e) {} }

  function mostrar(tela) {
    ['telaEntrada', 'telaEquipe', 'telaJogo'].forEach(t => $(t).classList.toggle('oculto', t !== tela));
  }

  function toast(msg, erro) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle('erro', !!erro);
    requestAnimationFrame(() => t.classList.add('visivel'));
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('visivel'), 2600);
  }

  /* ---------- Entrada ---------- */
  const params = new URLSearchParams(location.search);
  const codigoUrl = (params.get('c') || '').replace(/\D/g, '');
  const conviteUrl = /^[0-9a-f-]{36}$/i.test(params.get('k') || '') ? params.get('k') : '';

  // veio da área do aluno na plataforma: entra já com o nome do cadastro, sem digitar nada
  async function entrarPeloConvite() {
    mostrar('telaJogo');
    $('telaJogo').innerHTML = aguardando('📲', 'Entrando na aula...', 'Só um instante.');
    try {
      const r = await rpc('aovivo_entrar_convite', { p_codigo: codigoUrl, p_convite: conviteUrl, p_equipe: null });
      eu = { sessao_id: r.sessao_id, participante_id: r.participante_id, token: r.token, nome: r.nome, equipe: r.equipe, codigo: codigoUrl };
      salvar(eu);
      history.replaceState(null, '', '?c=' + codigoUrl);
      conectar();
    } catch (err) {
      eu = null; salvar(null);
      history.replaceState(null, '', '?c=' + codigoUrl);
      mostrar('telaEntrada');
      $('campoCodigo').value = codigoUrl;
      falhar($('erroEntrada'), err.message + ' Você também pode entrar digitando o seu nome.');
    }
  }

  function iniciar() {
    if (conviteUrl && codigoUrl.length === 6) { entrarPeloConvite(); return; }
    if (eu && (!codigoUrl || codigoUrl === eu.codigo)) {
      mostrar('telaJogo');
      conectar();
      return;
    }
    if (eu && codigoUrl && codigoUrl !== eu.codigo) { eu = null; salvar(null); }
    mostrar('telaEntrada');
    if (codigoUrl) $('campoCodigo').value = codigoUrl;
    try { const n = localStorage.getItem('aovivo_nome'); if (n) $('campoNome').value = n; } catch (e) {}
    setTimeout(() => (codigoUrl ? $('campoNome') : $('campoCodigo')).focus(), 200);
  }

  $('campoCodigo').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });

  $('formEntrada').addEventListener('submit', async e => {
    e.preventDefault();
    const codigo = $('campoCodigo').value.replace(/\D/g, '');
    const nome = $('campoNome').value.trim();
    const erro = $('erroEntrada');
    erro.classList.add('oculto');
    if (codigo.length !== 6) return falhar(erro, 'O código tem 6 números.');
    if (!nome) return falhar(erro, 'Digite seu nome para entrar.');
    $('btnEntrar').disabled = true;
    try {
      infoAula = await rpc('aovivo_info', { p_codigo: codigo });
      try { localStorage.setItem('aovivo_nome', nome); } catch (e2) {}
      if (infoAula.modo_equipes && (infoAula.equipes || []).length >= 2) {
        montarEquipes(codigo, nome);
      } else {
        await entrar(codigo, nome, null);
      }
    } catch (err) {
      falhar(erro, err.message);
    } finally {
      $('btnEntrar').disabled = false;
    }
  });

  function falhar(caixa, msg) { caixa.textContent = msg; caixa.classList.remove('oculto'); }

  function montarEquipes(codigo, nome) {
    equipeEscolhida = null;
    $('tituloAulaEquipe').textContent = infoAula.titulo;
    $('btnConfirmarEquipe').disabled = true;
    const lista = $('listaEquipes');
    lista.innerHTML = infoAula.equipes.map(eq =>
      '<button class="opcao-equipe" type="button" data-eq="' + esc(eq) + '"><i style="background:' + corEquipe(infoAula.equipes, eq) + '"></i>' + esc(eq) + '</button>'
    ).join('');
    lista.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      lista.querySelectorAll('button').forEach(x => x.classList.remove('marcada'));
      b.classList.add('marcada');
      equipeEscolhida = b.dataset.eq;
      $('btnConfirmarEquipe').disabled = false;
    }));
    $('btnConfirmarEquipe').onclick = async () => {
      $('btnConfirmarEquipe').disabled = true;
      try { await entrar(codigo, nome, equipeEscolhida); }
      catch (err) { falhar($('erroEquipe'), err.message); $('btnConfirmarEquipe').disabled = false; }
    };
    $('btnVoltarCodigo').onclick = () => mostrar('telaEntrada');
    mostrar('telaEquipe');
  }

  async function entrar(codigo, nome, equipe) {
    const r = await rpc('aovivo_entrar', { p_codigo: codigo, p_nome: nome, p_equipe: equipe });
    eu = { sessao_id: r.sessao_id, participante_id: r.participante_id, token: r.token, nome: r.nome, equipe: r.equipe, codigo };
    salvar(eu);
    if (codigoUrl !== codigo) history.replaceState(null, '', '?c=' + codigo);
    mostrar('telaJogo');
    conectar();
  }

  function sair() {
    fecharAmpliado();
    salvar(null); eu = null; estado = null; ultimaChave = '';
    if (canal) { sb.removeChannel(canal); canal = null; }
    clearInterval(timerPoll); clearInterval(timerRelogio);
    $('chipPontos').classList.add('oculto');
    $('rodape').innerHTML = '';
    mostrar('telaEntrada');
  }

  /* ---------- Conexão ao vivo ---------- */
  function conectar() {
    if (canal) sb.removeChannel(canal);
    canal = sb.channel('aovivo-' + eu.sessao_id)
      .on('broadcast', { event: 'estado' }, msg => { aplicarAviso(msg && msg.payload); buscar(true); })
      .subscribe(status => { canalOk = status === 'SUBSCRIBED'; });
    buscar();
    clearInterval(timerPoll);
    let ciclo = 0;
    timerPoll = setInterval(() => {
      ciclo++;
      if (!canalOk || ciclo % 4 === 0) buscar();
    }, 2500);
    clearInterval(timerRelogio);
    timerRelogio = setInterval(atualizarRelogio, 250);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && eu) buscar(); });

  // slide novo direto do aviso: troca na hora, sem esperar a consulta (a consulta vem logo depois, para os pontos)
  function aplicarAviso(p) {
    if (!p || !estado || p.fase !== 'slide' || !p.atividade) return;
    if (Number(p.versao) <= Number(estado.versao || 0)) return;
    estado = Object.assign({}, estado, { fase: 'slide', atividade: p.atividade, extra: null, versao: p.versao,
      tela_preta: !!p.tela_preta, grupo_respostas: null });
    desenhar();
  }

  async function buscar(espalhar) {
    if (!eu) return;
    if (buscando) { pendente = true; return; }
    buscando = true;
    try {
      if (espalhar) await new Promise(r => setTimeout(r, Math.random() * 500));
      const e = await rpc('aovivo_estado', { p_sessao: eu.sessao_id, p_participante: eu.participante_id, p_token: eu.token });
      if (!e.eu) { toast('Você saiu da sala. Entre de novo.', true); sair(); return; }
      // resposta atrasada (de antes de uma troca rápida de slide) não volta a tela para trás
      if (estado && Number(e.versao) < Number(estado.versao || 0)) return;
      estado = e;
      desenhar();
    } catch (err) {
      if (/Sessão não encontrada/.test(err.message)) { sair(); return; }
    } finally {
      buscando = false;
      if (pendente) { pendente = false; buscar(); }
    }
  }

  /* ---------- Desenho ---------- */
  function desenharRodape() {
    if (!estado || !estado.eu) return;
    const e = estado, me = e.eu;
    const som = !somLigado ? '<button class="btn-som" id="btnSom" type="button">🔕 Som desligado</button>'
      : somPronto() ? '<button class="btn-som" id="btnSom" type="button">🔔 Som ligado</button>'
      : '<button class="btn-som atencao" id="btnSom" type="button">🔔 Toque para ativar o som</button>';
    const mail = me.identificado ? '' : '<button class="btn-som' + (me.email ? ' ok' : '') + '" id="btnEmail" type="button">📩 ' + (me.email ? 'E-mail ✓' : 'Materiais por e-mail') + '</button>';
    const html = '<span>' + esc(me.nome) + '</span>' + (me.equipe
      ? '<span class="selo-equipe"><i style="background:' + corEquipe(e.equipes, me.equipe) + '"></i>' + esc(me.equipe) + '</span>' : '') + som + mail;
    if ($('rodape')._html !== html) { $('rodape').innerHTML = html; $('rodape')._html = html; }
  }

  $('rodape').addEventListener('click', ev => {
    if (ev.target.closest('#btnEmail')) return abrirEmail();
    if (!ev.target.closest('#btnSom')) return;
    prepararAudio();
    if (somLigado && !somPronto()) { setTimeout(() => { desenharRodape(); bip([[880, 0, 0.12]]); }, 60); return; }
    somLigado = !somLigado;
    try { localStorage.setItem('aovivo_som', somLigado ? '1' : '0'); } catch (e) {}
    setTimeout(() => { desenharRodape(); if (somLigado) bip([[880, 0, 0.12]]); }, 60);
  });

  // imagens dos slides: carrega antes (os próximos) e só troca a tela quando a nova já chegou
  const imagens = new Map();   // url → 'ok' | Promise
  function carregarImagem(url) {
    if (!url) return Promise.resolve();
    const j = imagens.get(url);
    if (j === 'ok') return Promise.resolve();
    if (j) return j;
    const pr = new Promise(ok => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { imagens.set(url, 'ok'); ok(); }); };
      im.onerror = () => { imagens.delete(url); ok(); };
      im.src = url;
    });
    imagens.set(url, pr);
    if (imagens.size > 80) imagens.delete(imagens.keys().next().value);
    return pr;
  }
  function precarregar(lista) { (lista || []).forEach(u => carregarImagem(u)); }
  let esperandoImagem = null;

  function desenhar() {
    const e = estado, me = e.eu, a = e.atividade;
    if (a && a.proximas) setTimeout(() => precarregar(a.proximas), 50);
    // slide novo ainda carregando: segura a tela anterior por até 1,5 s (sem tela em branco)
    if (e.fase === 'slide' && a && a.imagem && a.celular !== false && imagens.get(a.imagem) !== 'ok') {
      const url = a.imagem;
      if (esperandoImagem !== url) {
        esperandoImagem = url;
        const pronto = () => { if (esperandoImagem === url) { esperandoImagem = null; imagens.set(url, 'ok'); if (estado && estado.atividade && estado.atividade.imagem === url) desenhar(); } };
        carregarImagem(url).then(pronto);
        setTimeout(pronto, 1500);
      }
      if (ultimaChave) return;   // na primeira vez desenha logo
    }
    $('chipPontos').textContent = me.pontos.toLocaleString('pt-BR') + ' pts';
    $('chipPontos').classList.remove('oculto');
    desenharRodape();

    if (e.fase !== 'slide') fecharAmpliado();
    else if (a && a.imagem) { const im = document.querySelector('.slide-ampliado img'); if (im && im.getAttribute('src') !== a.imagem) im.src = a.imagem; }

    const longo = a && (a.tipo === 'grupo' || a.tipo === 'ferramenta');
    const chave = [e.fase, a && a.id, a && a.iniciada_em, longo ? '' : a && a.tempo, me.respostas, e.extra && e.extra.em, dicaVisivel(),
      a && a.tipo === 'grupo' ? assinaturaGrupo() : '', e.fase === 'encerrada' ? e.avaliacao : '', me.email, me.email_enviado, me.identificado].join('|');
    if (chave === ultimaChave) { atualizarRelogio(); return; }
    ultimaChave = chave;

    if (e.fase === 'atividade' && a && ultimaAtividadeVibrada !== a.id + a.iniciada_em) {
      ultimaAtividadeVibrada = a.id + a.iniciada_em;
      if (a.tipo !== 'grupo') fecharMaterial();
      alertaAtividade();
    }
    // a mentora encerrou: a plataforma já manda os e-mails; se em 20 s ainda não foi, o próprio celular pede de novo (nunca repete)
    if (e.fase === 'encerrada' && me.email && !me.email_enviado && !me.identificado && emailCobrado !== e.id) {
      emailCobrado = e.id;
      setTimeout(() => { if (estado && estado.fase === 'encerrada' && estado.eu && !estado.eu.email_enviado) pedirEnvioEmail(); }, 20000);
    }
    if (e.fase === 'encerrada' && e.avaliacao && avaliacaoAvisada !== e.id) {
      avaliacaoAvisada = e.id;
      alertaAtividade();
    }
    if (e.fase === 'slide' && a && a.a_seguir && ultimoAvisoSeguir !== a.id) {
      ultimoAvisoSeguir = a.id;
      avisoLeve();
    }

    const tela = $('telaJogo');
    const focoGrupo = document.activeElement && document.activeElement.id === 'campoGrupo';
    const html = {
      lobby: telaEspera,
      slide: telaSlide,
      atividade: telaAtividade,
      resultado: telaResultado,
      ranking: telaRanking,
      sorteio: telaSorteio,
      encerrada: telaFinal
    }[e.fase];
    tela.innerHTML = (dicaVisivel() ? dicaHTML() : '') + (html ? html() : '');
    ligarEventos();
    const cg = $('campoGrupo');
    if (cg) { cg.value = textoGrupo; if (focoGrupo) cg.focus(); }
    atualizarRelogio();

    if (e.fase === 'sorteio' && e.extra && confeteMostrado !== e.extra.em && sorteioRevelado() && souGanhador()) {
      confeteMostrado = e.extra.em;
      setTimeout(() => confete(4000), 300);
    }
    if (e.fase === 'resultado' && me.correta === true && confeteMostrado !== 'q' + a.id) {
      confeteMostrado = 'q' + a.id;
      confete(1800);
    }
  }

  /* Dica que aparece uma vez só, no celular */
  function dicaVisivel() {
    try { if (localStorage.getItem('aovivo_dica_v1')) return false; } catch (e) { return false; }
    return window.matchMedia && matchMedia('(pointer: coarse)').matches;
  }
  function dicaHTML() {
    const iphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return '<div class="dica-celular"><b>📌 Dica rápida</b><p>Deixe esta página aberta. Quando começar uma atividade, o celular ' + (iphone ? 'apita e a tela pisca (o iPhone não deixa sites vibrarem)' : 'vibra e apita') + '.</p>' +
      '<p>Está assistindo a aula pelo celular também? Deixe esta página aberta numa aba e volte para ela quando a professora chamar uma atividade. O slide da aula também aparece aqui.</p>' +
      '<button class="btn btn-secundario btn-pequeno" id="btnDicaOk" type="button">Entendi</button></div>';
  }

  function nomeTipo(t) { return ({ nuvem: 'Nuvem de palavras', quiz: 'Quiz', votacao: 'Votação', escala: 'Escala', grupo: 'Exercício em grupo', ferramenta: 'Ferramenta' })[t] || 'Atividade'; }

  /* ---------- Exercício em grupo ---------- */
  function chaveGrupo(a) { return 'aovivo_grupo_' + a.id; }
  function meuGrupo(a) {
    const me = estado.eu, c = a.config || {}, modo = (c.grupos || {}).modo || 'escolher';
    if (modo === 'nenhum') return null;
    const lista = a.grupos || [];
    let g = lista.find(x => (x.membros || []).some(m => m.id === me.id));
    if (!g && modo === 'equipes' && me.equipe) g = lista.find(x => x.nome === me.equipe);
    if (g) return { n: g.n, nome: g.nome || 'Grupo ' + g.n, membros: (g.membros || []).filter(m => m.id !== me.id), fixo: true };
    let salvo = 0;
    try { salvo = Number(localStorage.getItem(chaveGrupo(a))) || 0; } catch (e) {}
    if (salvo) { const x = lista.find(z => z.n === salvo); return { n: salvo, nome: x ? x.nome || 'Grupo ' + salvo : 'Grupo ' + salvo, membros: [], fixo: false }; }
    return null;
  }
  function respostaDoGrupo(n) { return (estado.grupo_respostas || []).find(x => x.grupo === n) || null; }
  function assinaturaGrupo() {
    const a = estado.atividade;
    if (!a || a.tipo !== 'grupo') return '';
    const g = meuGrupo(a);
    const r = g ? respostaDoGrupo(g.n) : null;
    return (g ? g.n + ':' + g.membros.map(m => m.id).join(',') : '-') + '|' + (r ? r.em : '');
  }

  function telaGrupo() {
    const a = estado.atividade, c = a.config || {}, modo = (c.grupos || {}).modo || 'escolher';
    const comResp = !(c.resposta && c.resposta.ligada === false) && modo !== 'nenhum';
    const g = meuGrupo(a);
    let html = '<div class="cabecalho-atividade"><span class="etiqueta">👥 Exercício em grupo · ' + a.numero + ' de ' + a.total + '</span>' +
      (a.tempo > 0 ? '<span class="relogio-aluno longo" id="relogio"></span>' : '') + '</div>' +
      '<p class="pergunta-aluno">' + esc(a.pergunta) + '</p>' +
      '<div class="aviso-tempo oculto" id="avisoTempo">⏰ Tempo! Voltem para a sala principal.</div>';
    if (modo !== 'nenhum') {
      if (g) {
        html += '<div class="meu-grupo"><span>Seu grupo</span><b>' + esc(g.nome) + '</b>' +
          (g.membros.length ? '<small>com ' + g.membros.map(m => esc(m.nome)).join(', ') + '</small>' : '') +
          (!g.fixo ? '<button class="link-trocar" type="button" id="btnTrocarGrupo">trocar</button>' : '') + '</div>';
      } else {
        const lista = a.grupos && a.grupos.length ? a.grupos.map(x => [x.n, x.nome || 'Grupo ' + x.n])
          : Array.from({ length: (c.grupos || {}).quantos || 6 }, (_, i) => [i + 1, String(i + 1)]);
        html += '<div class="escolher-grupo"><p><b>' + (a.grupos && a.grupos.length ? 'Você chegou depois do sorteio. Em qual grupo você está?' : 'Qual é o número do seu grupo ou da sua sala?') + '</b></p>' +
          '<div class="grade-grupos' + (a.grupos && a.grupos.length ? ' com-nomes' : '') + '">' + lista.map(([n, t]) => '<button type="button" class="btn-grupo" data-grupo="' + n + '">' + esc(t) + '</button>').join('') + '</div></div>';
      }
    }
    html += '<ol class="passos-aluno">' + (c.passos || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>';
    if (c.entrega) html += '<div class="entrega-aluno"><b>O que o grupo leva de volta</b><span>' + esc(c.entrega) + '</span></div>';
    html += botoesMateriais(materiaisDe(a, g), modo !== 'nenhum' && !g && (c.materiais || []).some(m => m.grupo));
    if (comResp && g) {
      const r = respostaDoGrupo(g.n);
      html += (r ? '<div class="resp-enviada"><span class="etiqueta">✅ Resposta do grupo enviada</span><p>' + esc(r.texto) + '</p><small>por ' + esc(r.nome) + '</small></div>' : '') +
        '<form class="form-grupo" id="formGrupo"><label for="campoGrupo">' + esc((c.resposta && c.resposta.pergunta) || (r ? 'Quer mudar a resposta do grupo?' : 'Resposta do grupo')) + '</label>' +
        '<textarea class="entrada" id="campoGrupo" maxlength="600" rows="4" placeholder="' + (r ? 'Escreva de novo para trocar a resposta' : 'Um de vocês escreve aqui o que o grupo combinou') + '"></textarea>' +
        '<button class="btn btn-principal btn-bloco" type="submit">' + (r ? 'Trocar a resposta do grupo' : 'Enviar a resposta do grupo') + '</button>' +
        '<p class="dica">Só uma pessoa do grupo precisa mandar. A resposta aparece no telão quando a professora mostrar.</p></form>';
    } else if (comResp) {
      html += '<p class="dica centro">Escolha o seu grupo para mandar a resposta do grupo.</p>';
    }
    return html;
  }

  /* ---------- Ferramenta da plataforma ---------- */
  function telaFerramenta() {
    const a = estado.atividade, c = a.config || {}, me = estado.eu;
    const vals = (me.valores || []).map(String);
    const abriu = vals.includes('abriu'), terminou = vals.includes('terminou');
    return '<div class="cabecalho-atividade"><span class="etiqueta">🧭 Ferramenta · ' + a.numero + ' de ' + a.total + '</span>' +
      (a.tempo > 0 ? '<span class="relogio-aluno longo" id="relogio"></span>' : '') + '</div>' +
      '<div class="aviso-tempo oculto" id="avisoTempo">⏰ O tempo acabou. Se ainda não terminou, termine com calma e toque em "Terminei".</div>' +
      '<div class="ferr-aluno"><div class="ferr-icone">🧭</div><h2>' + esc(a.pergunta) + '</h2>' +
      '<p>' + (c.instrucao ? esc(c.instrucao) : 'Toque no botão para abrir a ferramenta. Quando terminar, volte para esta página e toque em "Terminei".') + '</p>' +
      (terminou ? '<div class="feedback certo" style="padding:18px"><div class="emoji">✅</div><h2>Valeu!</h2><p>Você terminou a ferramenta. O seu resultado fica com você.</p></div>'
        : '<a class="btn btn-principal btn-bloco" id="btnAbrirFerr" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + (abriu ? 'Abrir de novo' : 'Abrir a ferramenta') + '</a>' +
          (abriu ? '<button class="btn btn-secundario btn-bloco" id="btnTerminei" type="button" style="margin-top:10px">Terminei ✓</button>' : '')) + '</div>';
  }

  function telaSlide() {
    const a = estado.atividade;
    const topo = '<span class="etiqueta">Na tela agora · Slide ' + a.numero + '</span>';
    const mostrar = a.celular !== false && a.imagem;
    const corpo = mostrar
      ? '<button class="slide-aluno" id="btnSlide" type="button" aria-label="Ampliar o slide"><img src="' + esc(a.imagem) + '" alt="Slide ' + a.numero + ' da aula"></button>' +
        '<p class="dica centro">Toque no slide para ampliar. Gire o celular para ver maior.</p>'
      : '<div class="espera"><div class="pulso"><span>🖥️</span></div><h2>Acompanhe pela tela da aula</h2><p>Quando tiver atividade, ela aparece aqui sozinha.</p></div>';
    const aviso = a.a_seguir
      ? '<div class="aviso-seguir"><span>🔔</span><p><b>Daqui a pouco: ' + nomeTipo(a.a_seguir.tipo).toLowerCase() + '.</b> Deixe o celular por perto.</p></div>'
      : (mostrar ? '<p class="dica centro">Quando tiver atividade, ela aparece aqui sozinha.</p>' : '');
    return '<div class="tela-slide">' + topo + corpo + botoesMateriais(materiaisDe(a, null), false) + aviso + '</div>';
  }

  /* ---------- Material em PDF: abre aqui dentro, sem baixar ---------- */
  function materiaisDe(a, g) {
    const c = a.config || {};
    const lista = (a.materiais || c.materiais || []).slice();
    if (c.pdf && !lista.some(m => m.pdf === c.pdf)) lista.unshift({ pdf: c.pdf, nome: c.nome_pdf || 'Instruções', grupo: null });
    return lista.filter(m => m && m.pdf && (!m.grupo || (g && Number(m.grupo) === Number(g.n))));
  }
  function botoesMateriais(lista, faltaGrupo) {
    let h = '';
    if (lista.length) h += '<div class="materiais-aluno">' + lista.map(m =>
      '<button class="btn btn-secundario btn-bloco btn-material" type="button" data-material="' + esc(m.pdf) + '" data-nome="' + esc(m.nome || 'Material') + '"><span>📄 ' + esc(m.nome || 'Material') + '</span><small>Abrir ›</small></button>').join('') + '</div>';
    if (faltaGrupo) h += '<p class="dica centro">Escolha o seu grupo para ver o material do seu grupo.</p>';
    return h;
  }

  let pdfjs = null;
  async function carregarPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import(new URL('js/vendor/pdf.min.mjs', location.href).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('js/vendor/pdf.worker.min.mjs', location.href).href;
    return pdfjs;
  }
  let leitura = null;   // { url, doc, zoom }
  function fecharMaterial() {
    document.querySelectorAll('.leitor-pdf').forEach(x => x.remove());
    document.body.classList.remove('lendo');
    if (leitura && leitura.doc) try { leitura.doc.destroy(); } catch (e) {}
    leitura = null;
  }
  async function abrirMaterial(url, nome) {
    fecharMaterial();
    const o = document.createElement('div');
    o.className = 'leitor-pdf';
    o.innerHTML = '<div class="leitor-topo"><b>' + esc(nome) + '</b><span class="espaco"></span>' +
      '<button type="button" class="leitor-btn" data-zoom="-1" aria-label="Diminuir">A−</button><button type="button" class="leitor-btn" data-zoom="1" aria-label="Aumentar">A+</button>' +
      '<button type="button" class="leitor-btn leitor-fechar" data-fechar-leitor>✕ Fechar</button></div>' +
      '<div class="leitor-corpo"><div class="leitor-paginas"><p class="leitor-msg">Abrindo o material...</p></div></div>';
    document.body.appendChild(o);
    document.body.classList.add('lendo');
    const minha = leitura = { url, doc: null, zoom: 1 };
    const pags = o.querySelector('.leitor-paginas');
    o.querySelector('[data-fechar-leitor]').addEventListener('click', fecharMaterial);
    o.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      minha.zoom = Math.max(1, Math.min(2.5, minha.zoom + Number(b.dataset.zoom) * 0.5));
      pags.style.width = (minha.zoom * 100) + '%';
    }));
    try {
      const lib = await carregarPdfjs();
      const doc = await lib.getDocument({ url, isEvalSupported: false }).promise;
      if (leitura !== minha) { doc.destroy(); return; }
      minha.doc = doc;
      pags.innerHTML = '';
      const largura = Math.min(1500, Math.round(Math.min(window.innerWidth, 900) * Math.min(window.devicePixelRatio || 1, 2) * 1.5));
      for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
        if (leitura !== minha) return;
        const pag = await doc.getPage(i);
        const vp1 = pag.getViewport({ scale: 1 });
        const vp = pag.getViewport({ scale: largura / vp1.width });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        c.className = 'leitor-pagina';
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        pags.appendChild(c);
        await pag.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
        pag.cleanup();
      }
      if (doc.numPages > 40) pags.insertAdjacentHTML('beforeend', '<p class="leitor-msg">O material tem ' + doc.numPages + ' páginas: aqui aparecem as 40 primeiras.</p>');
    } catch (e) {
      try { console.error('Material não abriu:', e && e.message); } catch (x) {}
      if (leitura === minha) pags.innerHTML = '<p class="leitor-msg">Não consegui abrir o material agora. Toque em ✕ Fechar e tente de novo.</p>';
    }
  }

  function abrirAmpliado(src) {
    fecharAmpliado();
    const o = document.createElement('div');
    o.className = 'slide-ampliado';
    o.innerHTML = '<img alt="Slide ampliado"><span class="fechar-ampliado">Toque para fechar</span>';
    o.querySelector('img').src = src;
    o.addEventListener('click', fecharAmpliado);
    document.body.appendChild(o);
  }
  function fecharAmpliado() { document.querySelectorAll('.slide-ampliado').forEach(x => x.remove()); }

  function telaEspera() {
    return '<div class="espera"><div class="pulso"><span>👀</span></div>' +
      '<h2>Você está dentro, ' + esc(primeiroNome(estado.eu.nome)) + '!</h2>' +
      '<p>Olhe para a tela da aula.<br>A próxima atividade aparece aqui sozinha.</p></div>' + caixaEmail(false);
  }

  /* ---------- Materiais da aula por e-mail (para quem não entrou pela plataforma) ---------- */
  function caixaEmail(fim) {
    const me = estado && estado.eu;
    if (!me || me.identificado) return '';
    if (me.email) {
      const txt = me.email_enviado ? 'Os materiais foram para <b>' + esc(me.email) + '</b>. Não chegou? Olhe também o spam e a aba Promoções.'
        : fim ? 'Mandando os materiais para <b>' + esc(me.email) + '</b>. Chega em alguns minutos.'
        : 'Combinado! Quando a aula terminar, os materiais vão para <b>' + esc(me.email) + '</b>.';
      return '<div class="caixa-email feito"><span class="etiqueta">📩 Materiais da aula</span><p>' + txt + '</p>' +
        '<button class="btn-link" type="button" data-email>Trocar o e-mail</button></div>';
    }
    return '<div class="caixa-email"><span class="etiqueta">📩 Materiais da aula</span><h2>' + (fim ? 'Quer os materiais no seu e-mail?' : 'Quer receber os materiais desta aula?') + '</h2>' +
      '<p>Os PDFs da aula e o que você fez aqui (palavras, acertos, a resposta do seu grupo) chegam no seu e-mail' + (fim ? '.' : ' quando a aula terminar.') + '</p>' +
      '<button class="btn btn-principal btn-bloco" type="button" data-email>Quero receber por e-mail</button></div>';
  }
  function fecharEmail() { document.querySelectorAll('.janela-email').forEach(x => x.remove()); }
  function abrirEmail() {
    if (!estado || !estado.eu || estado.eu.identificado) return;
    fecharEmail();
    const me = estado.eu, fim = estado.fase === 'encerrada';
    const o = document.createElement('div');
    o.className = 'janela-email';
    o.innerHTML = '<form class="janela-email-caixa" novalidate>' +
      '<h2>📩 Materiais da aula no seu e&#8209;mail</h2>' +
      '<p class="dica">' + (fim ? 'Mandamos agora:' : 'Quando a aula terminar, mandamos:') + ' os PDFs da aula, o que você fez aqui (palavras, acertos, a resposta do seu grupo) e os links das ferramentas usadas.</p>' +
      '<div class="campo"><label for="campoEmail">Seu e-mail</label>' +
      '<input id="campoEmail" class="entrada" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="160" placeholder="nome@exemplo.com.br" value="' + esc(me.email || '') + '"></div>' +
      '<label class="marcar-email"><input type="checkbox" id="campoConteudos"' + (me.quer_conteudos ? ' checked' : '') + '>' +
      '<span>Quero receber também conteúdos e ferramentas práticas da Mentorei. Dá para sair quando quiser.</span></label>' +
      '<div class="aviso oculto" id="erroEmail"></div>' +
      '<button class="btn btn-principal btn-bloco" type="submit" id="btnMandarEmail">' + (fim ? 'Mandar para o meu e-mail' : 'Combinado, quero receber') + '</button>' +
      '<button class="btn btn-secundario btn-bloco" type="button" data-fechar-email>Agora não</button>' +
      '<p class="dica centro peq">A Mentorei usa o seu e-mail só para mandar os materiais desta aula' + ' e, se você marcar a caixinha, os conteúdos.</p></form>';
    document.body.appendChild(o);
    const f = o.querySelector('form'), erro = o.querySelector('#erroEmail'), btn = o.querySelector('#btnMandarEmail');
    o.addEventListener('click', ev => { if (ev.target === o || ev.target.closest('[data-fechar-email]')) fecharEmail(); });
    setTimeout(() => { const c = o.querySelector('#campoEmail'); if (c && !c.value) c.focus(); }, 80);
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const email = o.querySelector('#campoEmail').value.trim().toLowerCase();
      const conteudos = o.querySelector('#campoConteudos').checked;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { erro.textContent = 'Confira o e-mail: falta algum pedaço (exemplo: nome@empresa.com.br).'; erro.classList.remove('oculto'); return; }
      btn.disabled = true; erro.classList.add('oculto');
      try {
        const r = await rpc('aovivo_pedir_email', { p_sessao: eu.sessao_id, p_participante: eu.participante_id, p_token: eu.token, p_email: email, p_conteudos: conteudos });
        if (estado.eu.email !== email) estado.eu.email_enviado = false;
        estado.eu.email = email; estado.eu.quer_conteudos = conteudos;
        fecharEmail();
        if (r && r.encerrada) {
          pedirEnvioEmail();
          toast('Pronto! Os materiais estão a caminho do seu e-mail.');
        } else toast('Combinado! Quando a aula terminar, os materiais vão para o seu e-mail.');
        ultimaChave = ''; desenhar();
      } catch (e) {
        btn.disabled = false;
        erro.textContent = e.message || 'Não deu certo agora. Tente de novo.'; erro.classList.remove('oculto');
      }
    });
  }
  // com a aula encerrada, pede para a plataforma mandar já (e confere depois se foi)
  function pedirEnvioEmail() {
    fetch('/api/aovivo-email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessao: eu.sessao_id, participante: eu.participante_id, token: eu.token }) }).catch(() => {});
    [10000, 25000, 60000].forEach(t => setTimeout(() => { if (estado && estado.fase === 'encerrada' && estado.eu && !estado.eu.email_enviado) buscar(); }, t));
  }

  function cabecalho(tipoTxt) {
    const a = estado.atividade;
    return '<div class="cabecalho-atividade"><span class="etiqueta">' + tipoTxt + ' · ' + a.numero + ' de ' + a.total + '</span>' +
      (a.tempo > 0 ? '<span class="relogio-aluno" id="relogio"></span>' : '') + '</div>' +
      '<p class="pergunta-aluno">' + esc(a.pergunta) + '</p>';
  }

  function tempoRestante() {
    const a = estado && estado.atividade;
    if (!a || !a.tempo) return null;
    const fim = Date.parse(a.iniciada_em) + a.tempo * 1000;
    return Math.max(0, Math.ceil((fim - agoraServidor()) / 1000));
  }

  function telaAtividade() {
    const a = estado.atividade, me = estado.eu;
    if (a.tipo === 'grupo') return telaGrupo();
    if (a.tipo === 'ferramenta') return telaFerramenta();
    const acabou = a.tempo > 0 && tempoRestante() === 0;
    if (a.tipo === 'quiz') {
      if (me.respostas > 0) return aguardando('⚡', 'Resposta enviada!', 'Quanto mais rápido, mais pontos. Aguarde o resultado.');
      if (acabou) return aguardando('⏰', 'O tempo acabou', 'Fique de olho na próxima pergunta.');
      return cabecalho('Quiz') + '<div class="grade-quiz">' + a.opcoes.map((o, i) =>
        '<button class="btn-alternativa" data-i="' + i + '" style="background:' + ALTERNATIVAS[i].cor + '">' +
        formaSVG(ALTERNATIVAS[i].forma) + '<span>' + esc(o) + '</span></button>').join('') + '</div>';
    }
    if (a.tipo === 'votacao') {
      if (me.respostas > 0) {
        const v = me.valores[0];
        return aguardando('🗳️', 'Voto registrado!', 'Você votou em <b>' + esc(a.opcoes[v]) + '</b>. Aguarde o resultado.');
      }
      if (acabou) return aguardando('⏰', 'A votação encerrou', 'Fique de olho na tela da aula.');
      const entreEquipes = a.config && a.config.entre_equipes;
      return cabecalho('Votação') + '<div class="lista-opcoes">' + a.opcoes.map((o, i) => {
        const propria = entreEquipes && o === me.equipe;
        return '<button class="btn-opcao" data-i="' + i + '"' + (propria ? ' disabled' : '') + '>' +
          (entreEquipes ? '<i style="background:' + corEquipe(estado.equipes, o) + '"></i>' : '') + esc(o) +
          (propria ? '<small>sua equipe</small>' : '') + '</button>';
      }).join('') + '</div>' + (entreEquipes ? '<p class="dica" style="text-align:center">Não vale votar na própria equipe 😉</p>' : '');
    }
    if (a.tipo === 'escala') {
      if (me.respostas > 0) return aguardando('✅', 'Resposta enviada!', 'Você marcou <b>' + esc(me.valores[0]) + '</b>. Aguarde o resultado.');
      if (acabou) return aguardando('⏰', 'O tempo acabou', 'Fique de olho na tela da aula.');
      const c = a.config || {}, max = c.max || 10;
      let b = '';
      for (let n = 0; n <= max; n++) b += '<button class="btn-nota" data-v="' + n + '">' + n + '</button>';
      return cabecalho('Escala') + '<div class="grade-escala">' + b + '</div>' +
        ((c.rotulo_min || c.rotulo_max) ? '<div class="rotulos-escala"><span>0 = ' + esc(c.rotulo_min) + '</span><span>' + max + ' = ' + esc(c.rotulo_max) + '</span></div>' : '');
    }
    // nuvem
    const max = (a.config && a.config.max_respostas) || 3;
    const minhas = (me.valores || []).map(v => '<span>' + esc(v) + '</span>').join('');
    if (me.respostas >= max) return aguardando('☁️', 'Palavras enviadas!', '<div class="minhas-palavras" style="justify-content:center;margin-top:12px">' + minhas + '</div>');
    if (acabou) return aguardando('⏰', 'O tempo acabou', 'Veja a nuvem na tela da aula.');
    const faltam = max - me.respostas;
    return cabecalho('Nuvem de palavras') +
      '<form class="envio-nuvem" id="formNuvem"><input class="entrada" id="campoPalavra" maxlength="30" autocomplete="off" placeholder="Sua palavra" enterkeyhint="send">' +
      '<button class="btn btn-principal" type="submit">Enviar</button></form>' +
      '<p class="dica">Você pode mandar mais ' + faltam + (faltam === 1 ? ' palavra.' : ' palavras.') + ' Respostas curtas aparecem melhor.</p>' +
      (minhas ? '<div class="minhas-palavras">' + minhas + '</div>' : '');
  }

  function aguardando(emoji, titulo, texto) {
    return '<div class="espera"><div class="pulso"><span>' + emoji + '</span></div><h2>' + titulo + '</h2><p>' + texto + '</p></div>';
  }

  function telaResultado() {
    const a = estado.atividade, me = estado.eu, x = estado.extra || {};
    if (a.tipo === 'grupo') {
      const g = meuGrupo(a);
      const r = g ? (x.grupos || []).find(z => z.grupo === g.n) : null;
      return feedback('neutro', '👥', 'Exercício encerrado', r ? 'A resposta do seu grupo:<br><b>' + esc(r.texto) + '</b>' : 'Olhe as respostas dos grupos na tela da aula.', null, '');
    }
    if (a.tipo === 'ferramenta') {
      const terminou = (me.valores || []).map(String).includes('terminou');
      return terminou ? feedback('certo', '✅', 'Valeu por fazer a ferramenta!', 'O seu resultado fica com você.', me.ganhou ? '+' + me.ganhou : null, '')
        : feedback('neutro', '🧭', 'A ferramenta foi encerrada', 'Se não deu tempo, faça depois com calma: <a href="' + esc((a.config || {}).url) + '" target="_blank" rel="noopener">abrir a ferramenta</a>.', null, '');
    }
    if (a.tipo === 'quiz') {
      const certaTxt = a.opcoes[a.correta];
      const seq = me.sequencia >= 2 ? '<p class="sequencia">🔥 ' + me.sequencia + ' acertos seguidos!</p>' : '';
      if (me.correta === true) return feedback('certo', '🎯', 'Acertou!', 'Mandou bem, ' + esc(primeiroNome(me.nome)) + '.', '+' + me.ganhou, seq);
      if (me.correta === false) return feedback('errado', '💪', 'Não foi dessa vez', 'A resposta certa era <b>' + esc(certaTxt) + '</b>.', null, '');
      return feedback('neutro', '⏰', 'Não deu tempo', 'A resposta certa era <b>' + esc(certaTxt) + '</b>.', null, '');
    }
    if (a.tipo === 'votacao' && a.config && a.config.entre_equipes && x.bonus && (x.bonus.equipes || []).includes(me.equipe)) {
      return feedback('premio', '🏆', 'Sua equipe venceu!', 'Todo mundo da ' + esc(me.equipe) + ' ganhou pontos extras.', '+' + x.bonus.pontos, '');
    }
    if (me.respostas > 0) return feedback('neutro', '🙌', 'Valeu pela participação!', 'Olhe o resultado na tela da aula.', me.ganhou ? '+' + me.ganhou : null, '');
    return feedback('neutro', '👀', 'Resultado na tela', 'Olhe o resultado na tela da aula.', null, '');
  }

  function feedback(tipo, emoji, titulo, texto, ganho, extra) {
    return '<div class="feedback ' + tipo + '"><div class="emoji">' + emoji + '</div><h2>' + titulo + '</h2><p>' + texto + '</p>' +
      (ganho ? '<span class="ganho">' + ganho + ' pts</span>' : '') + (extra || '') + '</div>';
  }

  function telaRanking() {
    const me = estado.eu;
    const eq = me.equipe && me.equipe_posicao ? '<p style="margin-top:14px">Sua equipe está em <b>' + ordinal(me.equipe_posicao) + ' lugar</b>.</p>' : '';
    return '<div class="feedback neutro"><span class="etiqueta">Ranking</span><p style="margin-top:14px">Você está em</p>' +
      '<div class="posicao-grande">' + ordinal(me.posicao) + '</div><p>de ' + me.total + (me.total === 1 ? ' pessoa' : ' pessoas') + '</p>' +
      '<span class="ganho">' + me.pontos.toLocaleString('pt-BR') + ' pts</span>' + eq + '</div>';
  }

  function souGanhador() {
    const x = estado.extra || {}, me = estado.eu;
    return (x.ganhadores || []).some(g => (x.modo === 'equipe' ? g.nome === me.equipe : g.id === me.id));
  }

  function sorteioRevelado() {
    const x = estado.extra || {};
    return !x.em || agoraServidor() >= Date.parse(x.em) + 3800;
  }

  function telaSorteio() {
    const x = estado.extra || {};
    if (!sorteioRevelado()) {
      const falta = Date.parse(x.em) + 3800 - agoraServidor();
      setTimeout(() => { ultimaChave = ''; if (estado && estado.fase === 'sorteio') desenhar(); }, Math.max(200, falta));
      return aguardando('🎲', 'Sorteando...', 'Olhe para a tela da aula!');
    }
    const nomes = (x.ganhadores || []).map(g => esc(g.nome)).join(', ');
    if (souGanhador()) {
      return x.modo === 'equipe'
        ? feedback('premio', '🎉', 'Sua equipe foi sorteada!', 'Parabéns, ' + esc(estado.eu.equipe) + '!', null, '')
        : feedback('premio', '🎉', 'Você foi sorteado!', 'Parabéns, ' + esc(primeiroNome(estado.eu.nome)) + '! Olhe a tela da aula.', null, '');
    }
    return feedback('neutro', '🎲', 'Sorteio', (x.ganhadores || []).length > 1 ? 'Sorteados: <b>' + nomes + '</b>' : 'Sorteado: <b>' + nomes + '</b>', null, '');
  }

  function telaFinal() {
    const me = estado.eu;
    const aval = estado.avaliacao ? '<div class="caixa-avaliar"><span class="etiqueta">⭐ Antes de sair</span><h2>Como foi a aula para você?</h2>' +
      '<a class="btn btn-principal btn-bloco btn-avaliar" href="' + esc(estado.avaliacao) + '" target="_blank" rel="noopener">Avaliar a aula</a>' +
      '<p class="dica centro">Leva 1 minuto e é anônimo.</p></div>' : '';
    return aval + caixaEmail(true) + '<div class="feedback neutro"><div class="emoji">💚</div><h2>Aula encerrada</h2><p>Obrigado por participar, ' + esc(primeiroNome(me.nome)) + '!</p>' +
      '<p style="margin-top:14px">Você terminou em <b>' + ordinal(me.posicao) + ' lugar</b> com <b>' + me.pontos.toLocaleString('pt-BR') + ' pontos</b>.</p></div>' +
      '<button class="btn btn-secundario btn-bloco" id="btnSair" style="margin-top:16px">Entrar em outra aula</button>';
  }

  function primeiroNome(n) { return String(n || '').split(' ')[0]; }

  /* ---------- Respostas ---------- */
  function ligarEventos() {
    const tela = $('telaJogo');
    tela.querySelectorAll('.btn-alternativa').forEach(b => b.addEventListener('click', () => {
      tela.querySelectorAll('.btn-alternativa').forEach(x => x.classList.toggle('apagada', x !== b));
      b.classList.add('escolhida');
      responder(Number(b.dataset.i));
    }));
    tela.querySelectorAll('.btn-opcao').forEach(b => b.addEventListener('click', () => {
      b.classList.add('escolhida'); responder(Number(b.dataset.i));
    }));
    tela.querySelectorAll('.btn-nota').forEach(b => b.addEventListener('click', () => {
      b.classList.add('escolhida'); responder(Number(b.dataset.v));
    }));
    const f = $('formNuvem');
    if (f) {
      f.addEventListener('submit', ev => {
        ev.preventDefault();
        const v = $('campoPalavra').value.trim();
        if (!v) return;
        responder(v);
      });
      setTimeout(() => { const c = $('campoPalavra'); if (c) c.focus(); }, 100);
    }
    tela.querySelectorAll('[data-grupo]').forEach(b => b.addEventListener('click', () => {
      try { localStorage.setItem(chaveGrupo(estado.atividade), b.dataset.grupo); } catch (e) {}
      ultimaChave = ''; desenhar();
    }));
    const tg = $('btnTrocarGrupo');
    if (tg) tg.addEventListener('click', () => {
      try { localStorage.removeItem(chaveGrupo(estado.atividade)); } catch (e) {}
      ultimaChave = ''; desenhar();
    });
    const cg = $('campoGrupo');
    if (cg) cg.addEventListener('input', () => { textoGrupo = cg.value; });
    const fg = $('formGrupo');
    if (fg) fg.addEventListener('submit', ev => {
      ev.preventDefault();
      const t = $('campoGrupo').value.trim();
      const g = meuGrupo(estado.atividade);
      if (!t) return toast('Escreva a resposta do grupo.', true);
      if (!g) return toast('Escolha o seu grupo primeiro.', true);
      responder({ grupo: g.n, texto: t }).then(ok => { if (ok) { textoGrupo = ''; toast('Resposta do grupo enviada!'); } });
    });
    const af = $('btnAbrirFerr');
    if (af) af.addEventListener('click', () => { if (!(estado.eu.valores || []).map(String).includes('abriu')) responder('abriu'); });
    const tm = $('btnTerminei');
    if (tm) tm.addEventListener('click', () => responder('terminou'));
    const s = $('btnSair');
    if (s) s.addEventListener('click', sair);
    const sl = $('btnSlide');
    if (sl) sl.addEventListener('click', () => abrirAmpliado(estado.atividade.imagem));
    tela.querySelectorAll('[data-material]').forEach(b => b.addEventListener('click', () => abrirMaterial(b.dataset.material, b.dataset.nome)));
    tela.querySelectorAll('[data-email]').forEach(b => b.addEventListener('click', abrirEmail));
    const d = $('btnDicaOk');
    if (d) d.addEventListener('click', () => {
      try { localStorage.setItem('aovivo_dica_v1', '1'); } catch (e) {}
      prepararAudio();
      ultimaChave = ''; desenhar();
    });
  }

  async function responder(valor) {
    if (enviando || !estado || !estado.atividade) return false;
    enviando = true;
    document.querySelectorAll('#telaJogo button').forEach(b => b.disabled = true);
    try {
      await rpc('aovivo_responder', { p_participante: eu.participante_id, p_token: eu.token, p_atividade: estado.atividade.id, p_valor: valor });
      if (navigator.vibrate) try { navigator.vibrate(30); } catch (x) {}
      return true;
    } catch (err) {
      toast(err.message, true);
      return false;
    } finally {
      enviando = false;
      ultimaChave = '';
      buscar();
    }
  }

  function atualizarRelogio() {
    const r = $('relogio');
    if (!r || !estado || estado.fase !== 'atividade') return;
    const s = tempoRestante();
    if (s == null) return;
    const a = estado.atividade, longo = a.tipo === 'grupo' || a.tipo === 'ferramenta';
    if (longo) {
      r.textContent = mmss(s);
      r.classList.toggle('acabando', s > 0 && s <= 60);
      r.classList.toggle('acabou', s === 0);
      const av = $('avisoTempo');
      if (av) av.classList.toggle('oculto', s > 0);
      const k = a.id + a.iniciada_em + a.tempo;
      if (s === 0 && fimAvisado !== k) { fimAvisado = k; if (a.tipo === 'grupo') alertaAtividade(); }
      return;
    }
    r.textContent = s + 's';
    r.classList.toggle('acabando', s <= 5);
    if (s === 0 && estado.eu.respostas === 0 && !r.dataset.fim) {
      r.dataset.fim = '1';
      ultimaChave = '';
      desenhar();
    }
  }

  iniciar();
})();
