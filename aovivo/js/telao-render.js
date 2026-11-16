/* Mentorei Ao Vivo · desenho do telão
   O mesmo código desenha a janela do telão (compartilhada no Zoom/Meet)
   e a prévia "Agora no telão" do painel da apresentadora. */
(function () {
  const A = window.AoVivo;
  const { esc, corEquipe, ALTERNATIVAS, formaSVG, agoraServidor, REACOES, HUMORES } = A;
  const CORES_POSTIT = ['#FFE08A', '#9FE8C8', '#A9D1FF', '#FFC2A8', '#D5C7FF', '#FFB3D9'];

  const SVG_PESSOA = '<svg viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></svg>';

  function dominio() { return location.host + location.pathname.replace(/[^/]*$/, '').replace(/\/$/, ''); }

  function criarTelao(raiz, op) {
    op = op || {};
    raiz.classList.add('tela-telao');
    if (op.previa) raiz.classList.add('previa');
    raiz.innerHTML =
      '<header class="tt-topo"><img src="img/logo-branco.png" alt="Mentorei"><span class="tt-titulo"></span><span class="espaco"></span>' +
      '<div class="selo-entrada"></div><div class="contador-pessoas" title="Pessoas na aula">' + SVG_PESSOA + '<span class="tt-pessoas">0</span></div></header>' +
      '<section class="tt-palco"></section>' +
      '<div class="tt-slide oculto"><img alt="" draggable="false"></div>' +
      '<div class="tt-cod oculto"></div>' +
      '<div class="tt-preta oculto"></div>';

    const q = s => raiz.querySelector(s);
    const palco = q('.tt-palco');
    const imgSlide = q('.tt-slide img');
    let e = null;
    let chave = '';
    let srcPedido = '';
    const timer = setInterval(tique, 250);

    function render(est) {
      if (!est) return;
      e = est;
      q('.tt-titulo').textContent = e.titulo || '';
      q('.tt-pessoas').textContent = (e.participantes || []).length;
      const selo = q('.selo-entrada');
      if (selo._cod !== e.codigo) {
        selo.innerHTML = '<div class="txt">Entre em <b>' + esc(dominio()) + '</b><br>e use o código</div><span class="cod">' + A.formatarCodigo(e.codigo) + '</span>' + A.qrSVG(A.enderecoAluno(e.codigo));
        selo._cod = e.codigo;
        q('.tt-cod').innerHTML = '<span>Entre em ' + esc(dominio()) + '</span><b>' + A.formatarCodigo(e.codigo) + '</b>';
      }
      selo.classList.toggle('oculto', e.fase === 'lobby');
      q('.tt-preta').classList.toggle('oculto', !e.tela_preta);

      const ehSlide = e.fase === 'slide' && e.atividade && e.atividade.imagem;
      raiz.classList.toggle('modo-slide', !!ehSlide);
      q('.tt-slide').classList.toggle('oculto', !ehSlide);
      q('.tt-cod').classList.toggle('oculto', !ehSlide);
      if (ehSlide) {
        trocarImagem(e.atividade.imagem);
        chave = 'slide|' + e.atividade.id;
        palco.innerHTML = '';
        return;
      }

      const a = e.atividade;
      const k = [e.fase, a && a.id, a && a.iniciada_em, e.extra && e.extra.em, e.fase === 'ranking' || e.fase === 'encerrada' ? e.versao : '',
        a && a.grupos ? JSON.stringify(a.grupos) : '', e.fase === 'encerrada' ? e.avaliacao : '', a && a.etapa || '',
        e.fase === 'lobby' ? [e.comecou_em ? 1 : 0, e.titulo, e.inicio, e.empresa, e.turma].join('~') : ''].join('|');
      if (k !== chave) {
        chave = k;
        palco.className = 'tt-palco';
        palco.innerHTML = '';
        const montar = { lobby: montarLobby, atividade: montarAtividade, resultado: montarResultado, ranking: montarRanking, sorteio: montarSorteio, encerrada: montarFinal, intervalo: montarIntervalo }[e.fase];
        if (montar) montar();
      }
      const atualizar = { lobby: atualizarLobby, atividade: atualizarAtividade, resultado: atualizarResultado }[e.fase];
      if (atualizar) atualizar();
    }

    function trocarImagem(src) {
      if (srcPedido === src) return;
      srcPedido = src;
      // só troca quando a nova imagem já carregou, para não piscar
      const im = new Image();
      const aplicar = () => { if (srcPedido === src) imgSlide.src = src; };
      im.onload = aplicar; im.onerror = aplicar;
      im.src = src;
      setTimeout(aplicar, 2500);
    }

    function precarregar(lista) {
      (lista || []).forEach(u => { if (u) { const im = new Image(); im.src = u; } });
    }

    /* ---------- Boas-vindas (antes de começar; pedido da Juliana, 16/11/2026) ---------- */
    function bolhasHTML(p) {
      return p.modo_equipes ? '<div class="equipes-lobby" style="grid-template-columns:repeat(' + Math.min(p.equipes.length, 4) + ',1fr)">' +
          p.equipes.map(eq => '<div class="equipe-col" style="border-color:' + corEquipe(p.equipes, eq) + '"><h3><span>' + esc(eq) + '</span><span data-qtd></span></h3><div class="bolhas" data-eq="' + esc(eq) + '"></div></div>').join('') + '</div>'
        : '<div class="bolhas" data-todos></div>';
    }
    function montarBoasVindas() {
      const p = e, quando = p.inicio ? A.quandoComeca(p.inicio) : '';
      const quem = [p.empresa, p.turma].filter(Boolean).join(' · ');
      palco.innerHTML = '<div class="boas-vindas">' +
        '<div class="bv-qr"><div class="qr-grande">' + A.qrSVG(A.enderecoAluno(p.codigo)) + '</div>' +
          '<p class="bv-cod">ou acesse <b>' + esc(dominio()) + '</b><br>e digite o código <b class="cod">' + A.formatarCodigo(p.codigo) + '</b></p></div>' +
        '<div class="bv-txt">' + (quem ? '<span class="etiqueta">' + esc(quem) + '</span>' : '') +
          '<h1>Seja bem-vindo(a)!</h1><h2>' + esc(p.titulo || '') + '</h2>' +
          (quando ? '<p class="bv-hora"><span aria-hidden="true">🕑</span> A aula começa ' + esc(quando) + '</p>' : '') +
          '<p class="bv-recado">Esta aula tem materiais de apoio que você vai acompanhar pelo celular. <b>Escaneie o QR code</b> e fique pronto para entrar na aula.</p>' +
          bolhasHTML(p) + '</div>' +
        '<div class="bv-contagem oculto"><span data-bv="txt">Começa em</span><b data-bv="num"></b></div></div>';
      contagem();
    }
    function contagem() {
      const box = palco.querySelector('.bv-contagem');
      if (!box || !e) return;
      const ini = e.inicio ? Date.parse(e.inicio) : NaN;
      const falta = Math.ceil((ini - agoraServidor()) / 1000);
      if (!isFinite(falta) || falta > 86400 || falta < -1800) { box.classList.add('oculto'); return; }
      box.classList.remove('oculto');
      box.classList.toggle('agora', falta <= 0);
      box.classList.toggle('acabando', falta > 0 && falta <= 60);
      box.querySelector('[data-bv="txt"]').textContent = falta > 0 ? 'Começa em' : 'Está na hora!';
      box.querySelector('[data-bv="num"]').textContent = falta > 0
        ? (falta >= 3600 ? Math.floor(falta / 3600) + 'h' + String(Math.floor(falta / 60) % 60).padStart(2, '0') : A.mmss(falta))
        : 'Já vamos começar';
    }

    /* ---------- Intervalo (com a contagem para voltar) ---------- */
    function montarIntervalo() {
      const x = e.extra || {};
      palco.innerHTML = '<div class="intervalo-telao"><div class="it-emoji">☕</div><span class="etiqueta">Intervalo</span>' +
        '<h1>Voltamos às ' + esc(A.horaDe(x.fim)) + '</h1><div class="it-tempo" data-it="tempo"></div>' +
        '<p>Aproveite para pegar um café, alongar e beber água. Deixe o celular por perto: ele avisa quando for hora de voltar.</p></div>';
      contagemIntervalo();
    }
    function contagemIntervalo() {
      const t = palco.querySelector('[data-it="tempo"]');
      if (!t || !e || !e.extra) return;
      const resta = Math.ceil((Date.parse(e.extra.fim) - agoraServidor()) / 1000);
      t.textContent = resta > 0 ? A.mmss(resta) : 'Hora de voltar! 🚀';
      t.classList.toggle('acabou', resta <= 0);
      t.classList.toggle('acabando', resta > 0 && resta <= 60);
    }

    /* ---------- Sala de espera ---------- */
    function montarLobby() {
      const p = e;
      if (!p.comecou_em) return montarBoasVindas();
      palco.innerHTML = '<div class="lobby"><div class="qr-grande">' + A.qrSVG(A.enderecoAluno(p.codigo)) + '</div>' +
        '<div style="min-width:0"><h1>' + esc((p.atividade && p.atividade.tipo === 'entrada' && p.atividade.pergunta) || 'Pegue o celular e entre na aula!') + '</h1>' +
        '<p class="passos">Aponte a câmera para o QR code<br>ou acesse <b>' + esc(dominio()) + '</b> e digite o código:</p>' +
        '<div class="codigo-gigante">' + A.formatarCodigo(p.codigo) + '</div>' + bolhasHTML(p) +
        '</div></div>';
    }

    function atualizarLobby() {
      const p = e, gente = p.participantes || [];
      const alvos = p.modo_equipes
        ? Array.from(palco.querySelectorAll('.bolhas[data-eq]')).map(b => [b, gente.filter(x => x.equipe === b.dataset.eq)])
        : [[palco.querySelector('[data-todos]'), gente]];
      alvos.forEach(([caixa, lista]) => {
        if (!caixa) return;
        const ids = new Set(lista.map(x => x.id));
        caixa.querySelectorAll('.bolha').forEach(b => { if (!ids.has(b.dataset.id)) b.remove(); });
        const ja = new Set(Array.from(caixa.querySelectorAll('.bolha')).map(b => b.dataset.id));
        lista.slice().reverse().forEach(x => {
          if (ja.has(x.id)) return;
          const b = document.createElement('span');
          b.className = 'bolha'; b.dataset.id = x.id; b.textContent = x.nome;
          caixa.appendChild(b);
        });
        const h = caixa.parentElement.querySelector('[data-qtd]');
        if (h) h.textContent = lista.length;
      });
    }

    /* ---------- Atividade ---------- */
    function cabecalho(a, comResp, sub) {
      const tipo = A.TIPOS[a.tipo];
      return '<div class="cab-telao">' + (a.tempo > 0 ? anelHTML() : '') +
        '<div class="esq"><span class="etiqueta">' + tipo.icone + ' ' + tipo.nome + ' · ' + a.numero + ' de ' + a.total + '</span><h1>' + esc(a.pergunta) + '</h1>' +
        (sub ? '<p class="cab-sub">' + sub + '</p>' : '') + '</div>' +
        (comResp ? '<div class="respostas"><b data-r="qtd">0</b><span data-r="txt">respostas</span></div>' : '') + '</div>';
    }
    function anelHTML() {
      return '<div class="anel"><svg viewBox="0 0 100 100"><circle class="base" cx="50" cy="50" r="44"/><circle class="prog" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="0"/></svg><span class="num"></span></div>';
    }

    /* ---------- Exercício em grupo ---------- */
    function tamanhoPassos(c) {
      const letras = (c.passos || []).join(' ').length + (c.entrega || '').length;
      return letras > 520 ? 'p-mini' : letras > 340 ? 'p-menor' : letras > 200 ? 'p-medio' : '';
    }
    function montarGrupo() {
      const a = e.atividade, c = a.config || {}, g = c.grupos || {};
      const comResp = !(c.resposta && c.resposta.ligada === false);
      const grupos = a.grupos && a.grupos.length ? a.grupos : null;
      palco.innerHTML = '<div class="grupo-telao' + (grupos ? ' com-grupos' : '') + '">' +
        '<div class="gt-esq"><span class="etiqueta">👥 Exercício em grupo · ' + a.numero + ' de ' + a.total + '</span><h1>' + esc(a.pergunta) + '</h1>' +
        '<ol class="gt-passos ' + tamanhoPassos(c) + '">' + (c.passos || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>' +
        (c.entrega ? '<div class="gt-entrega"><b>O que cada grupo leva de volta</b><span>' + esc(c.entrega) + '</span></div>' : '') + '</div>' +
        '<div class="gt-dir"><div class="gt-relogio"><span class="gt-tempo">' + A.mmss(a.tempo) + '</span><span class="gt-legenda">para acabar</span></div>' +
        (grupos ? '<div class="gt-grupos' + (grupos.length > 6 ? ' muitos' : '') + '">' + grupos.map(x => '<div><b>' + esc(x.nome || 'Grupo ' + x.n) + '</b><span>' +
            ((x.membros || []).map(m => esc(m.nome.split(' ')[0])).join(', ') || '—') + '</span></div>').join('') + '</div>'
          : (g.modo === 'escolher' ? '<p class="gt-dica">No celular, marque o número do seu grupo ou da sua sala.</p>' : '')) +
        (comResp ? '<div class="gt-contagem"><b data-r="grp">0</b><span data-r="grptxt">grupos mandaram a resposta</span></div>' : '') +
        '<p class="gt-dica">📱 As instruções e o cronômetro também estão no seu celular.' +
          ((c.materiais || []).length || c.pdf ? '<br>📄 ' + ((c.materiais || []).some(m => m.grupo) ? 'O material de cada grupo' : 'O material') + ' abre no celular, no Ao Vivo.' : '') + '</p></div></div>';
      tique();
    }

    /* ---------- Ferramenta da plataforma ---------- */
    function montarFerramenta() {
      const a = e.atividade, c = a.config || {};
      palco.innerHTML = cabecalho(a, false) + '<div class="ferr-telao"><div class="qr-grande">' + A.qrSVG(c.url || '') + '</div>' +
        '<div class="ferr-texto"><h2>Abra no seu celular</h2><p>No Mentorei Ao Vivo, toque em <b>Abrir a ferramenta</b>. Quem não está no Ao Vivo aponta a câmera para o QR code.</p>' +
        (c.instrucao ? '<p class="ferr-recado">' + esc(c.instrucao) + '</p>' : '') +
        '<div class="ferr-numeros"><div><b data-r="abriram">0</b><span>abriram</span></div><div><b data-r="terminaram">0</b><span>terminaram</span></div></div></div></div>';
      tique();
    }

    /* ---------- Atividades novas (16/11/2026) ---------- */
    function reacoesHTML() {
      return '<div class="reacoes-telao">' + REACOES.map((x, i) => '<div class="reacao-col" data-i="' + i + '"><span class="em">' + x + '</span><b>0</b></div>').join('') + '</div>';
    }
    function atualizarReacao(r, voar) {
      const cont = r.contagem || [], max = Math.max(1, ...cont);
      palco.querySelectorAll('.reacao-col').forEach(el => {
        const n = cont[Number(el.dataset.i)] || 0;
        el.querySelector('b').textContent = n;
        el.classList.toggle('topo', n > 0 && n === max);
      });
      const antes = palco._reac;
      if (voar && antes && !op.previa) cont.forEach((n, i) => {
        const d = Math.min(14, n - (antes[i] || 0));
        for (let k = 0; k < d; k++) setTimeout(() => soltarEmoji(i), Math.random() * 1200);
      });
      if (voar && antes && op.previa) cont.forEach((n, i) => { if (n > (antes[i] || 0)) soltarEmoji(i); });
      palco._reac = cont.slice();
    }
    function soltarEmoji(i) {
      const voo = palco.querySelector('.reacoes-voo');
      if (!voo) return;
      const el = document.createElement('span');
      el.className = 'voa'; el.textContent = REACOES[i];
      el.style.left = (6 + Math.random() * 88) + '%';
      el.style.setProperty('--dx', ((Math.random() - .5) * 14).toFixed(1) + 'cqw');
      el.style.animationDuration = (2.6 + Math.random() * 1.6).toFixed(2) + 's';
      el.style.fontSize = (5 + Math.random() * 4).toFixed(1) + 'cqh';
      voo.appendChild(el);
      setTimeout(() => el.remove(), 4600);
    }

    function humorHTML() {
      return '<div class="humor-telao">' + HUMORES.map((h, i) => '<div class="humor-col" data-i="' + i + '"><span class="qtd">0</span><div class="pilar"></div>' +
        '<span class="em">' + h.e + '</span><span class="rot">' + esc(h.t) + '</span></div>').join('') + '</div>';
    }
    function atualizarHumor(r) {
      const cont = r.contagem || [], max = Math.max(1, ...cont);
      palco.querySelectorAll('.humor-col').forEach(el => {
        const n = cont[Number(el.dataset.i)] || 0;
        el.querySelector('.qtd').textContent = n;
        el.querySelector('.pilar').style.height = (n / max * 52) + '%';
        el.classList.toggle('topo', n > 0 && n === max);
      });
    }

    function atualizarFrases(lista, max) {
      const box = palco.querySelector('.frases-telao');
      if (!box) return;
      const fr = (lista || []).slice(0, max || 15);
      const sig = fr.map(x => x.id).join(',');
      if (box._sig === sig) return;
      const vistos = box._vistos || new Set();
      box.innerHTML = fr.length ? fr.map((x, k) => '<div class="frase' + (box._sig != null && !vistos.has(x.id) ? ' nova' : '') + '" style="--c:' + CORES_POSTIT[x.id % CORES_POSTIT.length] + '">' + esc(x.texto) + '</div>').join('')
        : '<div class="vazio-telao grande">As frases vão aparecendo aqui ✨</div>';
      fr.forEach(x => vistos.add(x.id));
      box._vistos = vistos; box._sig = sig;
      box.classList.toggle('muitas', fr.length > 8);
    }

    function atualizarPerguntas(r) {
      const box = palco.querySelector('.perguntas-telao');
      if (!box) return;
      const L = r.itens || [];
      const sig = L.map(x => x.id + ':' + x.n + ':' + (x.respondida ? 1 : 0)).join(',');
      if (box._sig === sig) return;
      box._sig = sig;
      const mostra = L.slice(0, 7);
      box.innerHTML = L.length ? mostra.map((x, k) => '<div class="pergunta-t' + (x.respondida ? ' respondida' : '') + (k === 0 && !x.respondida && x.n > 0 ? ' topo' : '') + '">' +
          '<span class="coracao">' + (x.respondida ? '✓' : '♥ ' + x.n) + '</span><p>' + esc(x.texto) + '</p></div>').join('') +
          (L.length > mostra.length ? '<p class="mais-perg">e mais ' + (L.length - mostra.length) + (L.length - mostra.length === 1 ? ' pergunta' : ' perguntas') + ' no celular</p>' : '')
        : '<div class="vazio-telao grande">🙋 Mande a sua pergunta pelo celular.<br><span>Ninguém vê o seu nome.</span></div>';
    }

    function atualizarMural(r, final) {
      const box = palco.querySelector('.postits');
      if (!box) return;
      let L = (r.itens || []).slice();
      const votar = final || r.etapa === 'votar';
      L = final ? L.sort((x, y) => y.n - x.n || x.id - y.id) : L.sort((x, y) => x.id - y.id);
      const sig = L.map(x => x.id + ':' + (votar ? x.n : '')).join(',') + (final ? 'f' : '');
      if (box._sig === sig) return;
      const vistos = box._vistos || new Set(), primeira = box._sig == null;
      box._sig = sig;
      const medalha = ['🥇', '🥈', '🥉'];
      box.innerHTML = L.length ? L.slice(0, 30).map((x, k) => '<div class="postit' + (!primeira && !vistos.has(x.id) ? ' nova' : '') + (final && k < 3 && x.n > 0 ? ' campea' : '') +
          '" style="--c:' + CORES_POSTIT[x.id % CORES_POSTIT.length] + ';--r:' + (((x.id * 37) % 7) - 3) + 'deg">' +
          (final && k < 3 && x.n > 0 ? '<span class="medalha">' + medalha[k] + '</span>' : '') + '<p>' + esc(x.texto) + '</p>' +
          (votar ? '<span class="votos">★ ' + x.n + '</span>' : '') + '</div>').join('')
        : '<div class="vazio-telao grande">💡 Escreva a sua ideia pelo celular.</div>';
      L.forEach(x => vistos.add(x.id));
      box._vistos = vistos;
      box.classList.toggle('muitos', L.length > 12);
    }

    // Rodada relâmpago: o telão troca de pergunta sozinho, pelo relógio (o servidor faz a mesma conta)
    function tiqueRelampago(forcar) {
      const box = palco.querySelector('.relampago-telao');
      if (!box || !e || !e.atividade) return;
      const a = e.atividade, c = a.config || {}, f = A.faseRelampago(a, agoraServidor());
      const r = e.ao_vivo || {}, qs = r.questoes || [], qd = qs[f.q] || {};
      const pl = (r.placar || []).slice(0, 5);
      const k = f.q + '|' + f.fase + (f.fase === 'pergunta' ? '' : '|' + JSON.stringify(qd) + '|' + JSON.stringify(pl));
      if (forcar || box._k !== k) {
        box._k = k;
        const q = (c.perguntas || [])[f.q] || { pergunta: '', opcoes: [] };
        const placar = '<div class="rl-placar"><span class="etiqueta">🏆 Placar</span>' + (pl.length ? pl.map((x, i) =>
          '<div><span>' + (i + 1) + 'º</span><b>' + esc(x.nome) + '</b><em>' + Number(x.pontos).toLocaleString('pt-BR') + '</em></div>').join('') : '<p class="dica">Ninguém pontuou ainda.</p>') + '</div>';
        if (f.fase === 'fim') {
          box.innerHTML = '<div class="rl-fim"><span class="etiqueta">🏁 ' + esc(a.pergunta || 'Rodada relâmpago') + '</span><h1>Fim da rodada!</h1>' + placar + '</div>';
        } else {
          const revela = f.fase === 'revela', cont = qd.contagem || [], certa = qd.correta;
          box.innerHTML = '<div class="rl-cab"><span class="etiqueta">🏁 ' + esc(a.pergunta || 'Rodada relâmpago') + ' · Pergunta ' + (f.q + 1) + ' de ' + f.n + '</span>' +
            '<div class="rl-barra"><i></i></div></div><div class="rl-corpo' + (revela ? ' revela' : '') + '"><div class="rl-esq"><h1>' + esc(q.pergunta) + '</h1>' +
            '<div class="grade-telao-quiz rl-alts">' + (q.opcoes || []).map((o, i) => '<div class="alt-telao' + (revela && certa != null ? (i === certa ? ' certa' : ' errada') : '') +
              '" style="background:' + ALTERNATIVAS[i].cor + '">' + formaSVG(ALTERNATIVAS[i].forma) + '<span class="texto">' + esc(o) + '</span>' +
              (revela ? '<span class="qtd">' + (cont[i] || 0) + '</span>' : '') + (revela && i === certa ? '<span class="check">✓</span>' : '') + '</div>').join('') + '</div></div>' +
            (revela ? placar : '') + '</div>';
        }
      }
      const barra = box.querySelector('.rl-barra i');
      if (barra) {
        const total = f.fase === 'pergunta' ? f.seg : 4;
        barra.style.width = Math.max(0, Math.min(100, f.resta / total * 100)) + '%';
        barra.parentElement.classList.toggle('revela', f.fase === 'revela');
      }
    }

    function montarAtividade() {
      const a = e.atividade;
      if (a.tipo === 'grupo') return montarGrupo();
      if (a.tipo === 'ferramenta') return montarFerramenta();
      if (a.tipo === 'reacao') { palco.innerHTML = cabecalho(a, true, 'Toque nos emojis no celular, quantas vezes quiser!') + reacoesHTML() + '<div class="reacoes-voo"></div>'; palco._reac = null; return tique(); }
      if (a.tipo === 'checkin') { palco.innerHTML = cabecalho(a, true, 'Escolha a sua carinha no celular.') + humorHTML(); return tique(); }
      if (a.tipo === 'checkout') { palco.innerHTML = cabecalho(a, true, 'Escreva no celular, numa frase. Ninguém vê o seu nome.') + '<div class="frases-telao"></div>'; return tique(); }
      if (a.tipo === 'perguntas') { palco.innerHTML = cabecalho(a, true, 'Mande pelo celular e curta as perguntas que você também quer saber.') + '<div class="perguntas-telao"></div>'; return tique(); }
      if (a.tipo === 'mural') {
        const votar = a.etapa === 'votar', c = a.config || {};
        palco.innerHTML = cabecalho(a, true, votar ? '⭐ Votação aberta: vote no celular nas ' + (c.votos || 3) + ' melhores ideias dos colegas.'
          : '✍️ Escreva no celular até ' + (c.ideias || 2) + ((c.ideias || 2) === 1 ? ' ideia.' : ' ideias.') + ' Depois a turma vota nas melhores.') + '<div class="postits"></div>';
        return tique();
      }
      if (a.tipo === 'relampago') { palco.innerHTML = '<div class="relampago-telao"></div>'; return tiqueRelampago(true); }
      let corpo = '';
      if (a.tipo === 'quiz') {
        corpo = '<div class="grade-telao-quiz">' + a.opcoes.map((o, i) =>
          '<div class="alt-telao" style="background:' + ALTERNATIVAS[i].cor + '">' + formaSVG(ALTERNATIVAS[i].forma) + '<span class="texto">' + esc(o) + '</span></div>').join('') + '</div>';
      } else if (a.tipo === 'nuvem') {
        corpo = '<div class="nuvem"><div class="nuvem-vazia">As palavras vão aparecendo aqui ✨</div></div>';
      } else if (a.tipo === 'votacao') {
        corpo = barrasHTML(a);
      } else {
        corpo = escalaHTML(a);
      }
      palco.innerHTML = cabecalho(a, true) + corpo;
      tique();
    }

    function barrasHTML(a) {
      const entre = a.config && a.config.entre_equipes;
      return '<div class="barras">' + a.opcoes.map((o, i) => {
        const cor = entre ? corEquipe(e.equipes, o) : A.CORES_EQUIPE[i % 8];
        return '<div class="barra-item" data-i="' + i + '"><span class="rot"><i style="background:' + cor + '"></i>' + esc(o) + '</span>' +
          '<div class="trilho"><div class="cheio" style="background:' + cor + '"></div></div><span class="val">0<small>0%</small></span></div>';
      }).join('') + '</div>';
    }

    function escalaHTML(a) {
      const c = a.config || {}, max = c.max || 10;
      let cols = '';
      for (let n = 0; n <= max; n++) cols += '<div class="coluna" data-v="' + n + '"><span class="qtd">0</span><div class="pilar" style="height:0%"></div><span class="rot">' + n + '</span></div>';
      return '<div class="escala-telao"><div class="escala-esq"><div class="histograma">' + cols + '</div>' +
        ((c.rotulo_min || c.rotulo_max) ? '<div class="rotulos-telao"><span>0 = ' + esc(c.rotulo_min) + '</span><span>' + max + ' = ' + esc(c.rotulo_max) + '</span></div>' : '') +
        '</div><div class="media-box"><span class="etiqueta">Média da turma</span><b data-r="media">…</b><span data-r="mediaTotal">0 respostas</span>' +
        '<div class="antes-depois oculto" data-r="antes"></div></div></div>';
    }

    function atualizarAtividade() {
      const a = e.atividade, r = e.ao_vivo || {};
      const total = r.total || 0;
      const qtd = palco.querySelector('[data-r="qtd"]');
      if (qtd) {
        qtd.textContent = total;
        palco.querySelector('[data-r="txt"]').textContent = (total === 1 ? 'resposta' : 'respostas') + ' de ' + (e.participantes || []).length;
      }
      if (a.tipo === 'grupo') {
        const g = palco.querySelector('[data-r="grp"]');
        if (g) { g.textContent = r.total || 0; palco.querySelector('[data-r="grptxt"]').textContent = (r.total === 1 ? 'grupo mandou' : 'grupos mandaram') + ' a resposta'; }
      }
      if (a.tipo === 'ferramenta') {
        const ab = palco.querySelector('[data-r="abriram"]');
        if (ab) { ab.textContent = r.abriram || 0; palco.querySelector('[data-r="terminaram"]').textContent = r.total || 0; }
      }
      if (a.tipo === 'nuvem') atualizarNuvem(r);
      if (a.tipo === 'votacao') atualizarBarras(r, false);
      if (a.tipo === 'escala') atualizarEscala(r);
      if (a.tipo === 'reacao') atualizarReacao(r, true);
      if (a.tipo === 'checkin') atualizarHumor(r);
      if (a.tipo === 'checkout') atualizarFrases(r.frases);
      if (a.tipo === 'perguntas') atualizarPerguntas(r);
      if (a.tipo === 'mural') atualizarMural(r, false);
      if (a.tipo === 'relampago') tiqueRelampago();
    }

    function atualizarNuvem(r) {
      const n = palco.querySelector('.nuvem');
      if (!n) return;
      const pal = r.palavras || [];
      const vazio = n.querySelector('.nuvem-vazia');
      if (vazio) vazio.classList.toggle('oculto', pal.length > 0);
      A.desenharNuvem(n, pal, {});
    }

    function atualizarBarras(r, final) {
      const cont = r.contagem || [];
      const soma = cont.reduce((s, n) => s + n, 0);
      const max = Math.max(1, ...cont);
      palco.querySelectorAll('.barra-item').forEach(el => {
        const n = cont[Number(el.dataset.i)] || 0;
        el.querySelector('.cheio').style.width = (soma ? (n / max) * 100 : 0) + '%';
        el.querySelector('.val').innerHTML = n + '<small>' + (soma ? Math.round(n / soma * 100) : 0) + '%</small>';
        el.classList.toggle('vencedora', final && n === max && n > 0);
      });
    }

    function atualizarEscala(r) {
      const d = r.distribuicao || [];
      const max = Math.max(1, ...d);
      palco.querySelectorAll('.coluna').forEach(el => {
        const n = d[Number(el.dataset.v)] || 0;
        el.querySelector('.pilar').style.height = (n / max * 85) + '%';
        el.querySelector('.qtd').textContent = n;
      });
      const m = palco.querySelector('[data-r="media"]');
      if (m) {
        m.textContent = r.media == null ? '…' : String(r.media).replace('.', ',');
        palco.querySelector('[data-r="mediaTotal"]').textContent = (r.total || 0) + ((r.total || 0) === 1 ? ' resposta' : ' respostas');
      }
      // antes e depois: a média da mesma escala no começo da aula
      const ad = palco.querySelector('[data-r="antes"]');
      if (ad) {
        const an = r.antes && r.antes.media != null ? Number(r.antes.media) : null;
        ad.classList.toggle('oculto', an == null);
        if (an != null) {
          const agora = r.media == null ? null : Number(r.media), dif = agora == null ? null : Math.round((agora - an) * 10) / 10;
          const fmt = v => String(v).replace('.', ',');
          ad.innerHTML = '<span>No começo da aula: <b>' + fmt(an) + '</b></span>' +
            (dif != null ? '<span class="dif ' + (dif > 0 ? 'subiu' : dif < 0 ? 'desceu' : '') + '">' + (dif > 0 ? '▲ +' : dif < 0 ? '▼ ' : '= ') + fmt(dif) + '</span>' : '');
        }
      }
    }

    function tique() {
      if (e && e.fase === 'lobby') { contagem(); return; }
      if (e && e.fase === 'intervalo') { contagemIntervalo(); return; }
      if (!e || e.fase !== 'atividade') return;
      const a = e.atividade;
      if (a && a.tipo === 'relampago') { tiqueRelampago(); return; }
      if (!a || !a.tempo) return;
      const fim = Date.parse(a.iniciada_em) + a.tempo * 1000;
      const restam = Math.max(0, (fim - agoraServidor()) / 1000);
      const rel = palco.querySelector('.gt-relogio');
      if (rel) {
        rel.querySelector('.gt-tempo').textContent = A.mmss(Math.ceil(restam));
        rel.classList.toggle('acabando', restam > 0 && restam <= 60);
        rel.classList.toggle('acabou', restam <= 0);
        rel.querySelector('.gt-legenda').textContent = restam > 0 ? 'para acabar' : 'Tempo! Voltem para a sala principal';
        return;
      }
      const anel = palco.querySelector('.anel');
      if (!anel) return;
      anel.querySelector('.prog').style.strokeDashoffset = String(276.5 * (1 - Math.min(1, restam / a.tempo)));
      anel.querySelector('.num').textContent = a.tempo >= 100 ? A.mmss(Math.ceil(restam)) : Math.ceil(restam);
      anel.classList.toggle('longo', a.tempo >= 100);
      anel.classList.toggle('acabando', restam <= 5);
    }

    /* ---------- Resultado ---------- */
    function montarResultado() {
      const a = e.atividade, x = e.extra || {};
      if (a.tipo === 'grupo') {
        const lista = x.grupos || [];
        const grupos = a.grupos || [];
        const nome = n => { const g = grupos.find(z => z.n === n); return g ? g.nome || 'Grupo ' + n : 'Grupo ' + n; };
        const letras = lista.reduce((t, g) => t + (g.texto || '').length, 0);
        palco.innerHTML = cabecalhoResultado(a, lista.length ? lista.length + (lista.length === 1 ? ' grupo mandou a resposta' : ' grupos mandaram a resposta') : 'exercício em grupo') +
          (lista.length ? '<div class="resp-grupos q' + Math.min(lista.length, 9) + (letras > 900 ? ' longas' : '') + '">' + lista.slice(0, 12).map(g =>
            '<div class="resp-grupo"><b>' + esc(nome(g.grupo)) + '</b><p>' + esc(g.texto) + '</p></div>').join('') + '</div>'
            : '<div class="vazio-telao grande">👏 Exercício concluído!<br><span>Agora cada grupo conta o que descobriu.</span></div>');
        return;
      }
      if (a.tipo === 'ferramenta') {
        palco.innerHTML = cabecalhoResultado(a, 'ferramenta') + '<div class="ferr-final"><b>' + (x.total || 0) + '</b><span>' + ((x.total || 0) === 1 ? 'pessoa terminou' : 'pessoas terminaram') + ' a ferramenta</span>' +
          '<small>' + (x.abriram || 0) + ' abriram</small></div>';
        return;
      }
      if (a.tipo === 'reacao') {
        palco.innerHTML = cabecalhoResultado(a, (x.toques || 0) + ' reações de ' + (x.total || 0) + ((x.total || 0) === 1 ? ' pessoa' : ' pessoas')) + reacoesHTML();
        palco._reac = null; atualizarReacao(x, false);
        return;
      }
      if (a.tipo === 'checkin') {
        palco.innerHTML = cabecalhoResultado(a, (x.total || 0) + ((x.total || 0) === 1 ? ' pessoa respondeu' : ' pessoas responderam')) + humorHTML();
        setTimeout(() => atualizarHumor(x), 80);
        return;
      }
      if (a.tipo === 'checkout') {
        palco.innerHTML = cabecalhoResultado(a, (x.total || 0) + ((x.total || 0) === 1 ? ' frase' : ' frases')) + '<div class="frases-telao"></div>';
        atualizarFrases(x.frases, 18);
        return;
      }
      if (a.tipo === 'perguntas') {
        palco.innerHTML = cabecalhoResultado(a, ((x.itens || []).length) + ((x.itens || []).length === 1 ? ' pergunta' : ' perguntas')) + '<div class="perguntas-telao"></div>';
        atualizarPerguntas(x);
        return;
      }
      if (a.tipo === 'mural') {
        palco.innerHTML = cabecalhoResultado(a, 'as ideias mais votadas') + '<div class="postits"></div>';
        atualizarMural(x, true);
        return;
      }
      if (a.tipo === 'relampago') {
        const membros = {};
        (e.participantes || []).forEach(p => { if (p.equipe) membros[p.equipe] = (membros[p.equipe] || 0) + 1; });
        const eqs = (x.equipes || []).map(q => ({ equipe: q.equipe, membros: membros[q.equipe] || 1, pontos: Math.round(q.pontos / (membros[q.equipe] || 1)) }))
          .sort((p, q) => q.pontos - p.pontos);
        palco.innerHTML = rankingHTML({ top: x.placar || [], equipes: eqs }, true, true);
        const h = palco.querySelector('.rank-col h2');
        if (h) h.textContent = '🏁 Placar da ' + (a.pergunta && a.pergunta !== 'Rodada relâmpago' ? a.pergunta : 'rodada relâmpago');
        if (!op.previa) A.confete(2500);
        return;
      }
      if (a.tipo === 'quiz') {
        const cont = x.contagem || [], soma = cont.reduce((s, n) => s + n, 0), max = Math.max(1, ...cont);
        const corpo = '<div class="grade-telao-quiz">' + a.opcoes.map((o, i) => {
          const certa = i === a.correta, n = cont[i] || 0;
          return '<div class="alt-telao ' + (certa ? 'certa' : 'errada') + '" style="background:' + ALTERNATIVAS[i].cor + '"><span class="enchimento" data-w="' + (soma ? n / max * 100 : 0) + '" style="width:0"></span>' +
            formaSVG(ALTERNATIVAS[i].forma) + '<span class="texto">' + esc(o) + '</span><span class="qtd">' + n + '</span>' + (certa ? '<span class="check">✓</span>' : '') + '</div>';
        }).join('') + '</div>';
        const acertos = cont[a.correta] || 0;
        palco.innerHTML = cabecalhoResultado(a, acertos + ' de ' + soma + (soma === 1 ? ' pessoa acertou' : ' pessoas acertaram')) + corpo;
        setTimeout(() => palco.querySelectorAll('.enchimento').forEach(el => el.style.width = el.dataset.w + '%'), 80);
        return;
      }
      if (a.tipo === 'nuvem') {
        palco.innerHTML = cabecalhoResultado(a, (x.total || 0) + (x.total === 1 ? ' pessoa participou' : ' pessoas participaram')) + '<div class="nuvem"><div class="nuvem-vazia oculto">Ninguém respondeu</div></div>';
        return;
      }
      if (a.tipo === 'votacao') {
        const bonus = x.bonus && x.bonus.equipes && x.bonus.equipes.length
          ? '<div class="faixa-bonus">🏆 ' + x.bonus.equipes.map(esc).join(' e ') + ' ' + (x.bonus.equipes.length > 1 ? 'ganham' : 'ganha') + ' +' + x.bonus.pontos + ' pontos para cada membro!</div>' : '';
        palco.innerHTML = cabecalhoResultado(a, (x.total || 0) + (x.total === 1 ? ' voto' : ' votos')) + barrasHTML(a) + bonus;
        setTimeout(() => atualizarBarras(x, true), 80);
        return;
      }
      palco.innerHTML = cabecalhoResultado(a, (x.total || 0) + (x.total === 1 ? ' resposta' : ' respostas')) + escalaHTML(a);
      setTimeout(() => atualizarEscala(x), 80);
    }

    function cabecalhoResultado(a, resumo) {
      const tipo = A.TIPOS[a.tipo];
      return '<div class="cab-telao"><div class="esq"><span class="etiqueta">' + tipo.icone + ' Resultado · ' + esc(resumo) + '</span><h1>' + esc(a.pergunta) + '</h1></div></div>';
    }

    function atualizarResultado() {
      const t = e.atividade && e.atividade.tipo, x = e.extra || {};
      if (t === 'checkout') atualizarFrases(x.frases, 18);
      if (t === 'perguntas') atualizarPerguntas(x);
      if (t === 'mural') atualizarMural(x, true);
      if (e.atividade && e.atividade.tipo === 'nuvem') {
        const n = palco.querySelector('.nuvem');
        const pal = (e.extra || {}).palavras || [];
        if (n) { n.querySelector('.nuvem-vazia').classList.toggle('oculto', pal.length > 0); A.desenharNuvem(n, pal, {}); }
      }
    }

    /* ---------- Ranking ---------- */
    function montarRanking() { palco.innerHTML = rankingHTML(e.extra || {}, false); }

    function rankingHTML(r, final, curto) {
      const top = r.top || [], eqs = r.equipes || [];
      const comEquipes = e.modo_equipes && eqs.length > 0;
      const degrau = (x, pos) => x ? '<div class="degrau p' + pos + '"><span class="nome">' + esc(x.nome) + '</span><span class="pts">' + x.pontos.toLocaleString('pt-BR') + ' pts</span><div class="bloco">' + pos + '</div></div>' : '<div class="degrau"></div>';
      const resto = top.slice(3, comEquipes || curto ? 7 : 10).map((x, i) =>
        '<div class="item"><span class="pos">' + (i + 4) + 'º</span><span>' + (x.equipe ? '<i style="background:' + corEquipe(e.equipes, x.equipe) + '"></i>' : '') + esc(x.nome) + '</span><span class="pts">' + x.pontos.toLocaleString('pt-BR') + '</span></div>').join('');
      const indiv = '<div class="rank-col"><h2>' + (final ? '🏁 Resultado final' : '🏆 Ranking') + '</h2>' +
        (top.length ? '<div class="podio">' + degrau(top[1], 2) + degrau(top[0], 1) + degrau(top[2], 3) + '</div><div class="lista-rank">' + resto + '</div>'
          : '<p class="vazio-telao">Ninguém pontuou ainda.</p>') + '</div>';
      const equipes = comEquipes ? '<div class="rank-col"><h2>👥 Equipes</h2><div class="lista-rank rank-equipes">' + eqs.map((x, i) =>
        '<div class="item' + (i === 0 ? ' primeira' : '') + '" style="border-left-color:' + corEquipe(e.equipes, x.equipe) + '"><span class="pos">' + (i + 1) + 'º</span><span>' + esc(x.equipe) +
        '<small>' + x.membros + (x.membros === 1 ? ' pessoa' : ' pessoas') + ' · média por pessoa</small></span><span class="pts">' + x.pontos.toLocaleString('pt-BR') + '</span></div>').join('') + '</div></div>' : '';
      return '<div class="ranking-telao' + (comEquipes ? ' com-equipes' : '') + '">' + indiv + equipes + '</div>';
    }

    /* ---------- Sorteio ---------- */
    function montarSorteio() {
      const x = e.extra || {};
      const ganh = x.ganhadores || [];
      const cand = (x.candidatos && x.candidatos.length ? x.candidatos : ganh.map(g => g.nome));
      const filtro = { todos: 'entre todos', acertaram: 'entre quem acertou o último quiz', participaram: 'entre quem respondeu a última atividade' }[x.filtro] || '';
      palco.innerHTML = '<div class="sorteio-telao"><span class="etiqueta">🎲 Sorteio ' + (x.modo === 'equipe' ? 'de equipe' : filtro) + ' · ' + (x.total || 0) + (x.modo === 'equipe' ? ' equipes' : ' participantes') + '</span>' +
        '<div class="roleta girando"><span class="nome-roleta">...</span></div><p class="detalhe">Sorteando...</p></div>';
      const roleta = palco.querySelector('.roleta'), nome = palco.querySelector('.nome-roleta');
      const minhaChave = chave;
      const dur = 3600;
      const inicio = Date.parse(x.em) || agoraServidor();
      let ultimo = 0, idx = 0;
      // usa setTimeout (e não requestAnimationFrame) para o sorteio andar mesmo com a janela em segundo plano
      (function girar() {
        if (chave !== minhaChave) return;
        const passou = agoraServidor() - inicio;
        const prog = passou / dur;
        if (prog < 1 && cand.length) {
          const t = performance.now();
          const intervalo = 50 + 350 * Math.pow(Math.max(0, prog), 3);
          if (t - ultimo > intervalo) { ultimo = t; idx = (idx + 1) % cand.length; nome.textContent = cand[idx]; }
          setTimeout(girar, 30);
          return;
        }
        roleta.classList.remove('girando');
        roleta.classList.add('revelado');
        if (ganh.length > 1) {
          roleta.innerHTML = '<div class="ganhadores-lista">' + ganh.map(g => '<span class="nome-roleta">' + esc(g.nome) + '</span>').join('') + '</div>';
        } else {
          nome.textContent = ganh[0] ? ganh[0].nome : 'Ninguém para sortear';
        }
        const det = ganh.length && ganh[0].equipe && x.modo !== 'equipe' ? (ganh.length > 1 ? 'Parabéns!' : 'da equipe ' + ganh[0].equipe) : 'Parabéns!';
        palco.querySelector('.detalhe').textContent = det;
        if (!op.previa && passou < dur + 6000) A.confete(4500);
      })();
    }

    /* ---------- Encerramento ---------- */
    function montarFinal() {
      const aval = e.avaliacao ? '<div class="final-aval"><span class="etiqueta">⭐ Avalie a aula</span><div class="qr-grande">' + A.qrSVG(e.avaliacao) + '</div>' +
        '<p>Leva 1 minuto e é anônimo. Use o botão <b>Avaliar a aula</b> no celular ou aponte a câmera.</p></div>' : '';
      palco.innerHTML = '<div class="final-col' + (aval ? ' com-aval' : '') + '"><div class="cab-telao"><div class="esq"><span class="etiqueta">Aula encerrada</span><h1>Obrigado pela participação! 💚</h1></div></div>' +
        (aval ? '<div class="final-grade">' + rankingHTML(e.extra || {}, true, true) + aval + '</div>' : rankingHTML(e.extra || {}, true)) + '</div>';
      if (!op.previa) A.confete(3000);
    }

    function redimensionou() {
      if (!e) return;
      const a = e.atividade;
      if (a && a.tipo === 'nuvem' && (e.fase === 'atividade' || e.fase === 'resultado')) {
        const n = palco.querySelector('.nuvem');
        if (n) A.desenharNuvem(n, (e.fase === 'atividade' ? (e.ao_vivo || {}) : (e.extra || {})).palavras || [], {});
      }
    }
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(() => redimensionou()); ro.observe(raiz); }

    return {
      render,
      precarregar,
      estado: () => e,
      destruir() { clearInterval(timer); if (ro) ro.disconnect(); raiz.innerHTML = ''; }
    };
  }

  /* Deixa o estado do painel com o mesmo formato que o telão recebe do servidor:
     durante o quiz, o telão só sabe quantas pessoas responderam. */
  function estadoParaTelao(p) {
    if (!p) return null;
    const ao = p.fase === 'atividade' && p.atividade && p.atividade.tipo === 'quiz'
      ? { tipo: 'quiz', total: (p.ao_vivo || {}).total || 0 } : p.ao_vivo;
    return {
      id: p.id, codigo: p.codigo, titulo: p.titulo, modo_equipes: p.modo_equipes, equipes: p.equipes,
      fase: p.fase, atividade: p.atividade, extra: p.extra, versao: p.versao, tela_preta: p.tela_preta,
      comecou_em: p.comecou_em, agora: p.agora, ao_vivo: ao, avaliacao: p.avaliacao, modulo: p.modulo,
      inicio: p.inicio, empresa: p.empresa, turma: p.turma,
      participantes: (p.participantes || []).map(x => ({ id: x.id, nome: x.nome, equipe: x.equipe }))
    };
  }

  A.criarTelao = criarTelao;
  A.estadoParaTelao = estadoParaTelao;
  A.dominio = dominio;
})();
