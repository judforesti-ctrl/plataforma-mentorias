/* Mentorei Ao Vivo: funções compartilhadas entre a tela da apresentadora e a do aluno */
(function () {
  const cfg = window.AOVIVO_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.chave, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } }
  });

  let deslocamentoRelogio = 0; // diferença entre o relógio do servidor e o do aparelho

  async function rpc(nome, params) {
    const t0 = Date.now();
    const { data, error } = await sb.rpc(nome, params || {});
    const t1 = Date.now();
    if (error) {
      const msg = error.message || 'Algo deu errado.';
      const e = new Error(traduzErro(msg));
      e.original = error;
      throw e;
    }
    if (data && data.agora) {
      const servidor = Date.parse(data.agora);
      if (!isNaN(servidor)) deslocamentoRelogio = servidor - (t0 + t1) / 2;
    }
    return data;
  }

  function traduzErro(msg) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com a internet. Tente de novo.';
    if (/invalid input syntax/i.test(msg)) return 'Dados inválidos.';
    return msg;
  }

  function agoraServidor() { return Date.now() + deslocamentoRelogio; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const CORES_EQUIPE = ['#6FE3B8', '#FF7A59', '#4FA3FF', '#F2C14E', '#B79CFF', '#FF8FC7', '#C8F04A', '#5ED6E8'];
  function corEquipe(equipes, nome) {
    const i = (equipes || []).indexOf(nome);
    return CORES_EQUIPE[(i < 0 ? 0 : i) % CORES_EQUIPE.length];
  }

  const ALTERNATIVAS = [
    { cor: '#FF7A59', forma: 'triangulo', letra: 'A' },
    { cor: '#4FA3FF', forma: 'losango', letra: 'B' },
    { cor: '#F2C14E', forma: 'circulo', letra: 'C' },
    { cor: '#6FE3B8', forma: 'quadrado', letra: 'D' }
  ];
  function formaSVG(forma) {
    const p = {
      triangulo: '<polygon points="12,3 22,21 2,21"/>',
      losango: '<polygon points="12,2 22,12 12,22 2,12"/>',
      circulo: '<circle cx="12" cy="12" r="10"/>',
      quadrado: '<rect x="3" y="3" width="18" height="18" rx="2"/>'
    }[forma];
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="forma">' + p + '</svg>';
  }

  /* ---------- Nuvem de palavras ---------- */
  const CORES_NUVEM = ['#6FE3B8', '#FFFFFF', '#F2C14E', '#9FE8FF', '#FF9C80', '#CFF7E8', '#B79CFF'];
  const medidor = document.createElement('canvas').getContext('2d');

  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  function desenharNuvem(caixa, palavras, opcoes) {
    opcoes = opcoes || {};
    const W = caixa.clientWidth, H = caixa.clientHeight;
    if (!W || !H) return;
    const lista = (palavras || []).slice(0, 70);
    const existentes = new Map();
    caixa.querySelectorAll('.palavra').forEach(el => existentes.set(el.dataset.t, el));

    if (!lista.length) {
      existentes.forEach(el => el.remove());
      return;
    }
    const nMax = lista[0].n, nMin = lista[lista.length - 1].n;
    const fator = lista.length > 40 ? 0.75 : lista.length > 20 ? 0.88 : 1;
    const fMax = Math.min(H * 0.2, W * 0.12) * fator, fMin = Math.max(14, H * 0.045 * fator);
    const colocados = [];
    const cx = W / 2, cy = H / 2;
    const usados = new Set();

    lista.forEach((p, i) => {
      const rel = nMax === nMin ? (lista.length === 1 ? 1 : 0.6) : (p.n - nMin) / (nMax - nMin);
      let tam = fMin + (fMax - fMin) * Math.sqrt(rel);
      let pos = null;
      for (let tentativa = 0; tentativa < 4 && !pos; tentativa++) {
        medidor.font = '800 ' + tam + 'px Manrope, sans-serif';
        const w = medidor.measureText(p.t).width + tam * 0.3;
        const h = tam * 1.1;
        const passo = 0.32, inicio = (hash(p.t) % 628) / 100;
        for (let k = 0; k < 1600; k++) {
          const ang = inicio + k * passo;
          const r = 2.2 * k * passo;
          const x = cx + r * Math.cos(ang) * (W / H) * 0.9 - w / 2;
          const y = cy + r * Math.sin(ang) - h / 2;
          if (x < 4 || y < 4 || x + w > W - 4 || y + h > H - 4) continue;
          let bate = false;
          for (const c of colocados) {
            if (x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y) { bate = true; break; }
          }
          if (!bate) { pos = { x, y, w, h }; break; }
        }
        if (!pos) tam *= 0.8;
      }
      if (!pos) return;
      colocados.push(pos);
      usados.add(p.t);
      let el = existentes.get(p.t);
      if (!el) {
        el = document.createElement('span');
        el.className = 'palavra nova';
        el.dataset.t = p.t;
        el.textContent = p.t;
        el.style.left = (cx - 10) + 'px';
        el.style.top = (cy - 10) + 'px';
        el.style.fontSize = '1px';
        caixa.appendChild(el);
        if (opcoes.aoClicar) el.addEventListener('click', ev => opcoes.aoClicar(p.t, ev));
        setTimeout(() => el.classList.remove('nova'), 30);
      }
      el.title = p.n + (p.n === 1 ? ' resposta' : ' respostas');
      el.style.color = i === 0 ? '#6FE3B8' : CORES_NUVEM[hash(p.t) % CORES_NUVEM.length];
      el.style.fontSize = tam + 'px';
      el.style.left = (pos.x + tam * 0.15) + 'px';
      el.style.top = pos.y + 'px';
    });
    existentes.forEach((el, t) => { if (!usados.has(t)) el.remove(); });
  }

  /* ---------- Confete ---------- */
  function confete(duracao) {
    duracao = duracao || 3500;
    const c = document.createElement('canvas');
    c.className = 'confete';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const cores = ['#6FE3B8', '#F2C14E', '#FF7A59', '#4FA3FF', '#FFFFFF', '#B79CFF'];
    const ps = Array.from({ length: 180 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 16 - 4,
      r: Math.random() * 6 + 4,
      g: Math.random() * 0.3 + 0.25,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.3,
      cor: cores[(Math.random() * cores.length) | 0]
    }));
    const t0 = performance.now();
    (function quadro(t) {
      const dt = t - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach(p => {
        p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.globalAlpha = Math.max(0, 1 - dt / duracao);
        ctx.fillStyle = p.cor; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      });
      if (dt < duracao) requestAnimationFrame(quadro); else c.remove();
    })(t0);
  }

  /* ---------- QR code ---------- */
  function qrSVG(texto, cor) {
    const q = window.qrcode(0, 'M');
    q.addData(texto); q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges" class="qr">' +
      '<rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff" rx="2"/>' +
      '<path d="' + d + '" fill="' + (cor || '#071F1A') + '"/></svg>';
  }

  function enderecoAluno(codigo) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return base + (codigo ? '?c=' + codigo : '');
  }

  function formatarCodigo(c) { c = String(c || ''); return c.slice(0, 3) + ' ' + c.slice(3); }

  function ordinal(n) { return n + 'º'; }

  const TIPOS = {
    slide: { nome: 'Slide', icone: '🖼️' },
    nuvem: { nome: 'Nuvem de palavras', icone: '☁️', curto: 'Nuvem' },
    quiz: { nome: 'Quiz', icone: '⚡', curto: 'Quiz' },
    votacao: { nome: 'Votação', icone: '🗳️', curto: 'Votação' },
    escala: { nome: 'Escala', icone: '📊', curto: 'Escala' },
    grupo: { nome: 'Exercício em grupo', icone: '👥', curto: 'Grupo' },
    ferramenta: { nome: 'Ferramenta', icone: '🧭', curto: 'Ferramenta' },
    entrada: { nome: 'QR code de novo', icone: '📱', curto: 'QR code' }
  };

  /* Ferramentas on-line da plataforma Mentorei que abrem no celular do aluno */
  const PLATAFORMA = 'https://plataforma.mentorei.com.br';
  const FERRAMENTAS = [
    { codigo: 'MNT-COM-07', nome: 'Você é Assertivo?', url: PLATAFORMA + '/ferramentas/voce-e-assertivo/' },
    { codigo: 'MNT-COM-12', nome: 'Qual é o seu canal?', url: PLATAFORMA + '/ferramentas/qual-e-o-seu-canal/' },
    { codigo: 'MNT-COM-06', nome: 'Roda do Comunicador Influente', url: PLATAFORMA + '/ferramentas/roda-do-comunicador/' },
    { codigo: 'MNT-COM-08', nome: 'Roda da Diplomacia', url: PLATAFORMA + '/ferramentas/roda-da-diplomacia/' },
    { codigo: 'MNT-AUT-10', nome: 'Roda da Vida', url: PLATAFORMA + '/ferramentas/roda-da-vida/' },
    { codigo: 'MNT-AUT-01', nome: 'Gatilho, Reação, Escolha', url: PLATAFORMA + '/ferramentas/gatilho-reacao-escolha/' },
    { codigo: 'MNT-LID-04', nome: 'Escada da Delegação', url: PLATAFORMA + '/ferramentas/escada-da-delegacao/' },
    { codigo: 'MNT-LID-10', nome: 'Plano de Ação: Meu Próximo Passo', url: PLATAFORMA + '/ferramentas/meu-proximo-passo/' },
    { codigo: 'MNT-PES-08', nome: 'SWOT do Time', url: PLATAFORMA + '/ferramentas/swot-do-time/' },
    { codigo: 'MNT-AUT-11', nome: 'Roda do Profissional do Futuro', url: PLATAFORMA + '/ferramentas/roda-profissional-futuro/' },
    { codigo: 'MNT-JOR-06', nome: 'Radar da Liderança', url: 'https://radardalideranca.netlify.app/radar/' }
  ];

  // hora de início da aula, em Brasília: "às 14h" / "às 14h30" (outro dia: "no dia 18/11, às 14h")
  function quandoComeca(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const fuso = { timeZone: 'America/Sao_Paulo' };
    const [h, m] = d.toLocaleTimeString('pt-BR', Object.assign({ hour: '2-digit', minute: '2-digit', hour12: false }, fuso)).split(':');
    const hora = 'às ' + Number(h) + 'h' + (m === '00' ? '' : m);
    const dia = x => x.toLocaleDateString('pt-BR', Object.assign({ day: '2-digit', month: '2-digit' }, fuso));
    return dia(d) === dia(new Date(agoraServidor())) ? hora : 'no dia ' + dia(d) + ', ' + hora;
  }

  function mmss(s) {
    s = Math.max(0, Math.round(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  window.AoVivo = {
    sb, rpc, agoraServidor, esc, corEquipe, CORES_EQUIPE, ALTERNATIVAS, formaSVG,
    desenharNuvem, confete, qrSVG, enderecoAluno, formatarCodigo, ordinal, TIPOS, FERRAMENTAS, mmss, quandoComeca
  };
})();
