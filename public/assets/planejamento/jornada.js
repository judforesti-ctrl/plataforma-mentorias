/* Jornada do planejamento 2027 (pedido da Juliana, 11/11/2026).
   Cada pessoa percorre o plano em partes (vertentes, decisões, metas, temas), clica nas suas escolhas e pode parar e
   voltar quando quiser: tudo fica em planejamento_docs, coleção "jornada", um documento por pessoa (id = login).
   Antes de cada parte: o que escolher, por que importa e o tempo estimado. No fim, o relatório pessoal; a administração
   vê o relatório geral com os pontos de convergência e de divergência (RLS: cada participante lê só a própria jornada).
   Participa quem é editora (administração) ou colaboradora; leitora só lê. A parte "Pessoas, gestão e finanças" é só da
   administração. */

export function criarJornada(ctx) {
  const { S, esc, toast, agendarRender, dataBR, decInfo, D, V, chipV } = ctx;
  const P = window.PLANEJAMENTO || {};
  const perfil = P.perfil || {};
  const nivel = P.nivel || null;
  const uid = P.uid || null;
  const ehEditora = nivel === "editora";
  const participa = nivel === "editora" || nivel === "colaboradora";
  const papel = perfil.papel === "admin" ? (perfil.tambem_mentor ? "socia" : "coordenacao") : "mentor";
  const primeiro = String(perfil.nome || "").trim().split(/\s+/)[0] || "";

  const J = { minha: null, carregada: false, erro: null, jornadas: {}, pendente: false, salvando: false, estado: "ok", timer: null, erros: 0, abertos: new Set(), pessoas: null, pessoasEm: 0 };
  const agora = () => new Date().toISOString();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const slug = (s) => String(s).replace(/[^a-zA-Z0-9]+/g, "-");

  /* ---------- as partes da jornada ---------- */
  const SEG = { prio: 15, dir: 45, ok: 25, dec: 60, meta: 25, outro: 20, texto: 60 };
  const OP = {
    prio: [["max", "Prioridade máxima"], ["imp", "Importante"], ["espera", "Pode esperar"]],
    dir: [["sim", "Concordo"], ["ajuste", "Concordo com ajustes"], ["nao", "Discordo"]],
    ok: [["sim", "Concordo"], ["ressalva", "Tenho ressalvas"]],
    meta: [["sim", "Essencial"], ["pode", "Pode entrar"], ["nao", "Não precisa"]],
    outro: [["alta", "Pesa muito"], ["media", "Pesa um pouco"], ["baixa", "Pode esperar"]]
  };
  const PEDE_TEXTO = {
    dir: { ajuste: "O que você ajustaria?", nao: "Por que você discorda? O que colocaria no lugar?" },
    ok: { ressalva: "Qual é a sua ressalva?" },
    dec: { outra: "Qual é a sua ideia?" }
  };
  const PESO = { prio: { max: 3, imp: 2, espera: 1 }, outro: { alta: 3, media: 2, baixa: 1 }, meta: { sim: 3, pode: 2, nao: 1 } };

  function opcoesDe(it) {
    if (it.kind === "dec") return [...it.d.op.map(([id, rot, desc]) => [id, rot, desc]), ["outra", "Outra ideia", "Escreva a sua proposta."], ["naosei", "Não sei opinar", ""]];
    return OP[it.kind] || [];
  }

  const PARTES = (() => {
    const lista = [];
    const parte = (id, titulo, layout, oque, porque, itens, extra) => lista.push(Object.assign({ id, titulo, layout, oque, porque, itens }, extra || {}));
    parte("energia", "Onde pôr energia em 2027", "lista",
      "Para cada uma das seis vertentes da Mentorei, você diz quanta energia ela merece no ano: prioridade máxima, importante ou pode esperar.",
      "Ninguém faz tudo ao mesmo tempo. A prioridade decide para onde vão as primeiras contratações, o dinheiro do marketing e a agenda das sócias. Se cada pessoa puxar para um lado, o ano se espalha.",
      VERT.map((v) => ({ kind: "prio", chave: `prio:${v.id}`, titulo: v.nome, v })),
      { dica: "Tente marcar no máximo duas ou três como prioridade máxima." });
    parte("direcao", "A direção de cada vertente", "cartao",
      "Cada vertente tem uma frase, um público e uma promessa. Você diz se concorda, se concorda com ajustes ou se discorda, e conta o que mudaria.",
      "A direção é o que a Mentorei inteira vai repetir para clientes, mercado e novos mentores. Se não convence quem está dentro, não convence quem está fora.",
      VERT.filter((v) => CONT[v.id] && CONT[v.id].direcao).map((v) => ({ kind: "dir", chave: `dir:${v.id}`, titulo: v.nome, v, dir: CONT[v.id].direcao })));
    const tomadas = DEC.filter((d) => d.padrao && d.padrao.status === "decidida");
    parte("tomadas", "As decisões já tomadas", "lista",
      `${tomadas.length} decisões sobre o segundo segmento (formação e plataforma para mentores) já foram tomadas. Você confirma se concorda ou conta a sua ressalva.`,
      "Decisão que só uma pessoa apoia não se sustenta quando aperta. Confirmar agora evita voltar ao assunto no meio do ano. Ressalva não desfaz nada: vira conversa.",
      tomadas.map((d) => ({ kind: "ok", chave: `ok:${d.id}`, titulo: `${d.id}: ${d.titulo}`, d })));
    const GRUPOS = [
      ["formacao", "Formação e plataforma para mentores", ["P13", "P14", "P15", "P16", "P17", "P28", "P29", "P30"],
        "Preço, formato e detalhes da formação de mentores e da plataforma que eles vão assinar. Em cada pergunta você escolhe uma opção, propõe outra ideia ou diz que não sabe opinar.",
        "É o produto novo de 2027. Essas escolhas definem quanto entra de receita, quando o primeiro mentor é formado e o que precisa estar pronto antes da primeira turma."],
      ["rede", "Rede de mentores e T&D para cooperativas", ["P18", "P19", "P20", "P21", "P22", "P23", "P24", "P31"],
        "Como a rede de mentores funciona (selo, percentuais, eventos, programas padrão) e como vender mais para as cooperativas (contrato anual, relatório de resultado, foco da prospecção).",
        "T&D é o que paga as contas hoje, e a rede é quem entrega. Escolher bem aqui protege o caixa enquanto o segundo segmento cresce."],
      ["pfdigital", "Pessoa física e produtos digitais", ["P25", "P26", "P27"],
        "Se e como a Mentorei atende pessoa física, com que formato e preço, e qual é o papel dos produtos digitais.",
        "São frentes que podem trazer receita e público, mas também podem roubar tempo do que é prioridade. Aqui se decide o tamanho de cada uma."],
      ["vendas", "Vendas e marketing", ["P32", "P33", "P34", "P35", "P36", "P37"],
        "Quem prospecta as cooperativas, como as sócias viajam, onde fica o funil de vendas, quem conduz as conversas de venda da formação, o time de marketing e como captar alunos.",
        "Sem quem venda e sem marketing, a melhor estratégia fica no papel. Estas escolhas viram contratação, rotina e orçamento."],
      ["gestao", "Pessoas, gestão e finanças", ["P38", "P39", "P40", "P41", "P42", "P43"],
        "Primeira contratação, formato das contratações, quanto investir antes de a receita chegar, regime tributário, rituais de gestão e quem cuida de cada vertente.",
        "É o que sustenta todo o resto: dinheiro, gente e acompanhamento. Como envolve investimento e a gestão da sociedade, esta parte é só da administração.", "editora"]
    ];
    const usadas = new Set(tomadas.map((d) => d.id));
    const decItens = (ids) => ids.map((id) => D[id]).filter((d) => d && !usadas.has(d.id) && usadas.add(d.id)).map((d) => ({ kind: "dec", chave: `dec:${d.id}`, titulo: d.titulo, d }));
    GRUPOS.forEach(([id, titulo, ids, oque, porque, so]) => {
      const itens = decItens(ids);
      if (itens.length) parte(id, titulo, "cartao", oque, porque, itens, so ? { so } : null);
    });
    const sobras = decItens(DEC.map((d) => d.id));
    if (sobras.length) parte("outras", "Outras decisões", "cartao", "Decisões que ainda não entraram em nenhuma das partes anteriores.", "Cada uma delas muda o plano de 2027; vale a sua opinião.", sobras);
    parte("metas", "Como vamos medir 2027", "lista",
      "Para cada indicador, você diz se ele deve entrar no painel de 2027 e, se quiser, sugere a meta que a gente deve buscar.",
      "Foi para isso que o plano veio para a plataforma: o que for aprovado vai ser acompanhado ao longo de 2027, e a gente vai saber se está cumprindo o que combinou.",
      VERT.flatMap((v) => ((CONT[v.id] && CONT[v.id].metas) || []).map(([id, ind, base, como]) => ({ kind: "meta", chave: `meta:${id}`, titulo: ind, v, metaId: id, base, como }))));
    parte("temas", "O que mais pensar", "lista",
      `${OUTROS.length} temas que costumam ficar de fora do planejamento e depois cobram a conta, como caixa, contratos, capacidade de entrega e riscos. Você diz quanto cada um pesa em 2027.`,
      "Os temas que pesam mais viram ação com responsável e data. Os outros ficam para depois, de propósito e não por esquecimento.",
      OUTROS.map((o) => ({ kind: "outro", chave: `outro:${o.id}`, titulo: o.titulo, o })));
    parte("fechar", "Para fechar", "lista",
      "Três perguntas abertas, para você responder com as suas palavras.",
      "O que não cabe nas opções costuma ser o mais importante. É aqui que aparecem as ideias novas e os riscos que ninguém tinha visto.",
      [["fora", "O que ficou de fora deste plano e precisa entrar?"], ["preocupa", "Qual é a sua maior preocupação para 2027?"], ["orgulho", "Daqui a um ano, o que precisa ter acontecido para você sentir orgulho de 2027?"]]
        .map(([id, t]) => ({ kind: "texto", chave: `texto:${id}`, titulo: t })));
    lista.forEach((p) => {
      p.itens.forEach((it, i) => { it.parte = p.id; it.n = i + 1; });
      p.min = Math.max(1, Math.round(p.itens.reduce((s, it) => s + SEG[it.kind], 0) / 60));
    });
    return lista;
  })();
  const PT = Object.fromEntries(PARTES.map((p) => [p.id, p]));
  const ITEM = Object.fromEntries(PARTES.flatMap((p) => p.itens.map((it) => [it.chave, it])));
  const vale = (p, quem) => !p.so || p.so === (quem || nivel);
  const minhasPartes = () => PARTES.filter((p) => vale(p));
  const numParte = (p) => minhasPartes().indexOf(p) + 1;

  /* ---------- respostas ---------- */
  const resp = (chave, doc) => ((doc || J.minha || {}).respostas || {})[chave] || null;
  function respondido(it, doc) {
    const r = resp(it.chave, doc);
    if (!r) return false;
    return it.kind === "texto" ? !!(r.texto && r.texto.trim()) : !!r.escolha;
  }
  function progresso(doc, quem) {
    const partes = PARTES.filter((p) => vale(p, quem));
    const itens = partes.flatMap((p) => p.itens);
    const feitos = itens.filter((it) => respondido(it, doc)).length;
    const faltaSeg = itens.filter((it) => !respondido(it, doc)).reduce((s, it) => s + SEG[it.kind], 0);
    return { feitos, total: itens.length, pct: itens.length ? Math.round((100 * feitos) / itens.length) : 0, faltaMin: Math.ceil(faltaSeg / 60) };
  }
  const feitosDaParte = (p, doc) => p.itens.filter((it) => respondido(it, doc)).length;
  const totalMin = () => minhasPartes().reduce((s, p) => s + p.min, 0);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function responder(chave, mud, ja) {
    if (!J.minha) return;
    const m = J.minha;
    m.respostas = m.respostas || {};
    const r = Object.assign({}, m.respostas[chave] || {}, mud, { em: agora() });
    ["escolha", "texto", "meta"].forEach((k) => { if (r[k] == null || r[k] === "") delete r[k]; });
    if (!r.escolha && !r.texto && !r.meta) delete m.respostas[chave]; else m.respostas[chave] = r;
    m.atualizadaEm = agora();
    salvar(ja);
  }

  /* ---------- gravação (cada clique fica salvo) ---------- */
  const ROT_ESTADO = { ok: "✓ Tudo salvo", salvando: "Salvando…", erro: "Sem conexão agora: tento de novo em instantes", proibido: "Não consegui salvar: seu acesso não permite. Fale com a administração." };
  function marcarEstado(e) {
    J.estado = e;
    document.querySelectorAll("[data-jsalvo]").forEach((el) => { el.textContent = ROT_ESTADO[e]; el.className = `jsalvo ${e}`; });
  }
  function salvar(ja) {
    if (!J.minha || J.estado === "proibido") return;
    J.pendente = true;
    marcarEstado("salvando");
    clearTimeout(J.timer);
    J.timer = setTimeout(gravarAgora, ja ? 0 : 900);
  }
  async function gravarAgora() {
    clearTimeout(J.timer);
    J.timer = null;
    if (!J.pendente || !J.minha || !S.db) return;
    if (J.salvando) return;
    J.salvando = true;
    J.pendente = false;
    try {
      await S.db.doc(`jornada/${uid}`).set(clone(J.minha));
      J.erros = 0;
      marcarEstado(J.pendente ? "salvando" : "ok");
    } catch (e) {
      J.pendente = true;
      if (e && e.code === "invalid_argument") { marcarEstado("proibido"); J.salvando = false; return; }
      J.erros++;
      marcarEstado("erro");
      J.timer = setTimeout(gravarAgora, Math.min(30000, 3000 * J.erros));
    }
    J.salvando = false;
    if (J.pendente && !J.timer) J.timer = setTimeout(gravarAgora, 300);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && J.pendente) gravarAgora(); });
  window.addEventListener("pagehide", () => { if (J.pendente) gravarAgora(); });

  function receber(lista) {
    J.jornadas = Object.fromEntries(lista.map((d) => { const o = Object.assign({}, d); delete o.id; return [d.id, o]; }));
    const remota = J.jornadas[uid];
    if (!J.carregada) { J.minha = remota ? clone(remota) : null; J.carregada = true; }
    else if (remota && !J.pendente && !J.salvando && (!J.minha || String(remota.atualizadaEm || "") > String(J.minha.atualizadaEm || ""))) J.minha = clone(remota);
    agendarRender();
  }
  function iniciar() {
    if (!S.db || !participa) { J.carregada = true; return; }
    S.db.collection("jornada").onSnapshot((snap) => receber(snap.docs.filter((d) => d.exists).map((d) => Object.assign({ id: d.id }, d.data()))),
      (e) => { J.erro = (e && e.message) || "sem acesso"; J.carregada = true; agendarRender(); });
  }
  function todas() {
    const t = Object.assign({}, J.jornadas);
    if (J.minha) t[uid] = J.minha;
    return t;
  }

  /* ---------- rotas ---------- */
  function rota(h) {
    if (h === "") return participa ? { tipo: "jornada", parte: null, item: null } : null;
    if (h === "jornada") return { tipo: "jornada", parte: null, item: null };
    let m;
    if ((m = h.match(/^jornada\/([a-z]+)(?:\/(\d+|lista))?$/))) {
      if (m[1] === "fim") return { tipo: "jornada", parte: "fim", item: null };
      if (PT[m[1]] && vale(PT[m[1]])) return { tipo: "jornada", parte: m[1], item: m[2] ? (m[2] === "lista" ? "lista" : Math.max(1, Math.min(PT[m[1]].itens.length, Number(m[2])))) : null };
      return { tipo: "jornada", parte: null, item: null };
    }
    if (h === "meu-relatorio") return { tipo: "meu-relatorio" };
    if ((m = h.match(/^relatorio-geral(?:\/(.+))?$/)) && ehEditora) return { tipo: "relatorio-geral", foco: m[1] || null };
    return null;
  }
  const hrefItem = (p, n) => (p.layout === "lista" ? `#jornada/${p.id}/lista` : `#jornada/${p.id}/${n}`);
  const primeiroAberto = (p, doc) => p.itens.find((it) => !respondido(it, doc || J.minha));
  function hrefContinuar() {
    const m = J.minha;
    const pos = m && m.posicao;
    if (pos && PT[pos.parte] && vale(PT[pos.parte])) {
      const p = PT[pos.parte];
      if (pos.item === "lista") return hrefItem(p, 1);
      if (pos.item) return `#jornada/${p.id}/${pos.item}`;
      return `#jornada/${p.id}`;
    }
    if (pos && pos.parte === "fim") return "#jornada/fim";
    return `#jornada/${minhasPartes()[0].id}`;
  }
  // chamado a cada navegação: guarda onde a pessoa está e, nas listas, rola até o primeiro item sem resposta
  function aoNavegar(r) {
    if (r && r.tipo === "relatorio-geral" && r.foco) { J.foco = r.foco; return true; }
    if (!r || r.tipo !== "jornada" || !J.minha || !r.parte) return false;
    const pos = { parte: r.parte, item: r.item == null ? null : r.item };
    const atual = J.minha.posicao || {};
    if (atual.parte !== pos.parte || atual.item !== pos.item) { J.minha.posicao = pos; J.minha.atualizadaEm = agora(); salvar(); }
    if (r.item === "lista") {
      const it = primeiroAberto(PT[r.parte]);
      if (it && it.n > 1) { S.rolarPara = `ji-${slug(it.chave)}`; return true; }
    }
    return false;
  }

  /* ---------- peças ---------- */
  const barra = (pct) => `<div class="jbarra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
  const salvoHtml = () => `<span class="jsalvo ${J.estado}" data-jsalvo role="status" aria-live="polite">${ROT_ESTADO[J.estado]}</span>`;
  function opcoesHtml(it, r, grande) {
    return `<div class="jops${grande ? " grandes" : ""}" role="group" aria-label="Sua escolha para ${esc(it.titulo)}">${opcoesDe(it).map(([id, rot, desc]) => {
      const on = !!(r && r.escolha === id);
      return `<button type="button" class="jop${on ? " on" : ""}${id === "naosei" ? " fraca" : ""}" data-acao="j-escolher" data-chave="${esc(it.chave)}" data-op="${esc(id)}" aria-pressed="${on}"><b>${on ? "✓ " : ""}${esc(rot)}</b>${grande && desc ? `<span>${esc(desc)}</span>` : ""}</button>`;
    }).join("")}</div>`;
  }
  function textoHtml(it, r) {
    const pede = it.kind !== "texto" && r && PEDE_TEXTO[it.kind] && PEDE_TEXTO[it.kind][r.escolha];
    const aberto = it.kind === "texto" || pede || (r && r.texto) || J.abertos.has(it.chave);
    if (!aberto) return `<button type="button" class="jlink" data-acao="j-comentar" data-chave="${esc(it.chave)}">+ Escrever um comentário</button>`;
    const rot = it.kind === "texto" ? "Sua resposta" : pede || "Seu comentário (se quiser)";
    return `<label class="rot jtexto">${esc(rot)}<textarea data-jtexto="${esc(it.chave)}" maxlength="4000" id="jt-${slug(it.chave)}">${esc((r && r.texto) || "")}</textarea></label>`;
  }
  function corpoItem(it, r, emLista) {
    if (it.kind === "prio") return `<div class="jcab">${chipV(it.v.id)}<b>${esc(it.v.nome)}</b></div><p class="jsub">${esc(it.v.papel)}</p>${opcoesHtml(it, r)}${textoHtml(it, r)}`;
    if (it.kind === "ok") {
      const info = decInfo(it.d);
      const esc0 = it.d.op.find((o) => o[0] === (info.status === "decidida" ? info.escolha : it.d.padrao.escolha)) || ["", "", ""];
      return `<div class="jcab"><b>${esc(it.titulo)}</b></div><p class="jsub">${esc(it.d.contexto)}</p>
        <p class="jdecidido"><span>${info.status === "decidida" ? "Decidido:" : "Estava decidido (as sócias reabriram para conversa):"}</span> <b>${esc(esc0[1])}</b>. ${esc(esc0[2])}</p>${opcoesHtml(it, r)}${textoHtml(it, r)}`;
    }
    if (it.kind === "meta") {
      const proposta = S.metas && S.metas[it.metaId] && S.metas[it.metaId].meta2027;
      return `<div class="jcab"><b>${esc(it.titulo)}</b></div>
        <p class="jsub">Hoje (2026): <b>${esc(it.base || "a medir")}</b>. Como medir: ${esc(it.como || "")}.${proposta ? ` Meta já proposta: <b>${esc(proposta)}</b>.` : ""}</p>
        <div class="jmeta"><label class="rot">Meta que você sugere para 2027 (se quiser)<input type="text" data-jmeta="${esc(it.chave)}" value="${esc((r && r.meta) || "")}" maxlength="200" placeholder="Ex.: 3 turmas"></label></div>
        ${opcoesHtml(it, r)}${textoHtml(it, r)}`;
    }
    if (it.kind === "outro") return `<div class="jcab"><b>${esc(it.titulo)}</b></div><p class="jsub">${esc(it.o.texto)}</p>${opcoesHtml(it, r)}${textoHtml(it, r)}`;
    if (it.kind === "texto") return `<div class="jcab"><b>${esc(it.titulo)}</b></div>${textoHtml(it, r)}`;
    if (it.kind === "dir") {
      return `<div class="jvert" style="--vc:${it.v.cor}"><span class="olho">Vertente</span><h2>${esc(it.v.nome)}</h2></div>
        <div class="direcao" style="margin:4px 0 14px">
          <div class="frase"><small>Frase</small><b>${esc(it.dir.frase)}</b></div>
          <div class="item"><small>Para quem</small><span>${esc(it.dir.publico)}</span></div>
          <div class="item"><small>O que prometemos</small><span>${esc(it.dir.promessa)}</span></div>
        </div>
        <div class="h4">Você concorda com essa direção?</div>${opcoesHtml(it, r)}${textoHtml(it, r)}`;
    }
    // dec
    const d = it.d, info = decInfo(d);
    const recOp = d.op.find((o) => o[0] === d.rec[0]) || ["", ""];
    const ja = info.status === "decidida" ? (d.op.find((o) => o[0] === info.escolha) || [])[1] : null;
    return `<div class="chips" style="margin-bottom:8px">${d.v.map((v) => chipV(v)).join("")}</div>
      <h2 class="jtit">${esc(d.titulo)}</h2><p class="jsub">${esc(d.contexto)}</p>
      ${ja ? `<p class="jdecidido"><span>As sócias já decidiram:</span> <b>${esc(ja)}</b>. A sua opinião continua valendo para a conversa.</p>` : ""}
      <div class="h4" style="margin-top:6px">Qual caminho você escolheria?</div>
      ${opcoesHtml(it, r, true)}
      <details class="jrec"><summary>Ver o que o estudo recomenda</summary><p><b>${esc(recOp[1])}.</b> ${esc(d.rec[1])}</p></details>
      ${textoHtml(it, r)}`;
  }

  /* ---------- páginas ---------- */
  function agradecimento() {
    const msg = {
      socia: "Você é sócia e dona deste futuro. O que você escolher aqui vira prioridade, meta e plano de ação da Mentorei em 2027.",
      coordenacao: "Você conhece a operação da Mentorei por dentro como ninguém. O seu olhar sobre o que é possível fazer, e como fazer, é o que deixa este plano de pé.",
      mentor: "Você está com a gente nas turmas e nas mentorias, perto de quem a Mentorei atende. O seu olhar de quem entrega é parte essencial deste plano."
    }[papel];
    return `<section class="jobrigada">
      <span class="olho">Planejamento estratégico 2027</span>
      <h1>Obrigada${primeiro ? `, ${esc(primeiro)}` : ""}, por fazer parte da construção do futuro da Mentorei!</h1>
      <p>${msg}</p>
      <p>Esta jornada percorre as vertentes, as decisões, as metas e os temas do planejamento em ${minhasPartes().length} partes. Antes de cada parte você vê o que vai escolher, por que isso importa e quanto tempo leva. No total, cerca de ${totalMin()} minutos.</p>
      <p class="jdestaque"><b>Pode parar quando quiser.</b> Cada clique fica salvo na hora, e quando você voltar eu te levo direto para onde parou. Dá para fazer em vários dias, no computador ou no celular.</p>
      <p class="jpeq">Suas escolhas ficam no seu nome. No fim você recebe o seu relatório; quando todas as pessoas terminarem, a administração junta tudo num relatório geral com os pontos em que a equipe concorda e os que pedem conversa.</p>
      <div class="btns"><button type="button" class="btn grande claro-esc" data-acao="j-comecar">Começar a jornada</button></div>
    </section>`;
  }
  function listaPartes() {
    return `<div class="jpartes">${minhasPartes().map((p, i) => {
      const f = J.minha ? feitosDaParte(p) : 0, t = p.itens.length;
      const st = f === t ? `<span class="jst feita">✓ Respondida</span>` : f ? `<span class="jst meio">${f} de ${t}</span>` : `<span class="jst">Não começou</span>`;
      const tag = J.minha ? "a" : "div";
      return `<${tag} class="jparte"${J.minha ? ` href="#jornada/${p.id}"` : ""}><span class="jn">${i + 1}</span><span class="jpt"><b>${esc(p.titulo)}</b><small>Cerca de ${plural(p.min, "minuto", "minutos")} · ${plural(t, "item", "itens")}${p.so ? " · só da administração" : ""}</small></span>${J.minha ? st : ""}</${tag}>`;
    }).join("")}</div>`;
  }
  function pagSemAcesso() {
    return `<header class="cab"><span class="olho">Minha jornada</span><h1>Seu acesso é só de leitura</h1>
      <p>Você pode ler todo o planejamento pelo menu. Para fazer a jornada e deixar as suas escolhas, peça à administração para mudar o seu acesso para "Participa".</p></header>
      <div class="btns"><a class="btn" href="#inicio">Ir para o planejamento</a></div>`;
  }
  function pagHome() {
    if (!participa) return pagSemAcesso();
    if (!J.carregada) return `<header class="cab"><span class="olho">Minha jornada</span><h1>Carregando a sua jornada…</h1></header>`;
    if (J.erro) return `<header class="cab"><span class="olho">Minha jornada</span><h1>Não consegui abrir a sua jornada</h1><p>Recarregue a página daqui a pouco. Se continuar, avise a Juliana.</p></header>`;
    if (!J.minha) return `${agradecimento()}<section class="bloco"><h2>As partes da jornada</h2><p class="sub">Você pode fazer na ordem ou escolher por onde começar.</p>${listaPartes()}</section>`;
    const pg = progresso(J.minha);
    const m = J.minha;
    let topo;
    if (m.concluidaEm) {
      topo = `<section class="jobrigada"><span class="olho">Minha jornada</span><h1>Jornada concluída. Obrigada${primeiro ? `, ${esc(primeiro)}` : ""}!</h1>
        <p>Você concluiu em ${dataBR(m.concluidaEm)} e respondeu ${pg.feitos} de ${pg.total} itens. Pode voltar e mudar qualquer resposta: o relatório se atualiza sozinho.</p>
        <div class="btns"><a class="btn grande claro-esc" href="#meu-relatorio">Ver o meu relatório</a>${ehEditora ? `<a class="btn grande contorno" href="#relatorio-geral">Ver o relatório geral</a>` : ""}</div></section>`;
    } else {
      const pos = m.posicao && PT[m.posicao.parte];
      const onde = pos ? `Parte ${numParte(pos)}, ${pos.titulo}${typeof m.posicao.item === "number" ? `, item ${m.posicao.item} de ${pos.itens.length}` : ""}` : "o começo";
      topo = `<section class="jobrigada"><span class="olho">Minha jornada</span>
        <h1>${pg.feitos ? `Que bom ter você de volta${primeiro ? `, ${esc(primeiro)}` : ""}!` : `Vamos lá${primeiro ? `, ${esc(primeiro)}` : ""}!`}</h1>
        <p>${pg.feitos ? `Você parou em: <b>${esc(onde)}</b>.` : "Tudo pronto para começar."} Você já respondeu ${pg.feitos} de ${pg.total} itens${pg.feitos < pg.total ? `; faltam cerca de ${plural(pg.faltaMin, "minuto", "minutos")}` : ""}.</p>
        ${barra(pg.pct)}
        <div class="btns"><a class="btn grande claro-esc" href="${hrefContinuar()}">${pg.feitos ? "Continuar de onde parei" : "Começar pela primeira parte"}</a>${pg.feitos ? `<a class="btn grande contorno" href="#meu-relatorio">Ver o meu relatório até agora</a>` : ""}</div>
        <p class="jpeq">Lembrete: pode parar quando quiser. Cada clique fica salvo.</p></section>`;
    }
    return `${topo}<section class="bloco"><h2>As partes da jornada</h2><p class="sub">Clique em qualquer parte para ir até ela.${pg.feitos === pg.total ? "" : " Quando terminar todas, conclua a jornada no fim."}</p>${listaPartes()}
      ${!m.concluidaEm ? `<div class="btns" style="margin-top:14px"><a class="btn claro" href="#jornada/fim">Ir para o fim da jornada</a></div>` : ""}</section>`;
  }
  function cabParte(p, extra) {
    const f = feitosDaParte(p), t = p.itens.length;
    return `<div class="jtopo"><a href="#jornada">← Minha jornada</a><span>Parte ${numParte(p)} de ${minhasPartes().length}</span>${salvoHtml()}</div>
      <header class="cab"><span class="olho">Parte ${numParte(p)}${extra ? ` · ${extra}` : ""}</span><h1>${esc(p.titulo)}</h1></header>
      <div class="jprog"><span>${f} de ${t} respondidos nesta parte</span>${barra(Math.round((100 * f) / t))}</div>`;
  }
  function proximaParte(p) {
    const ps = minhasPartes(), i = ps.indexOf(p);
    return ps[i + 1] || null;
  }
  function pagIntro(p) {
    const f = feitosDaParte(p), t = p.itens.length;
    const prox = proximaParte(p);
    const alvo = primeiroAberto(p);
    const comecar = p.layout === "lista" ? hrefItem(p, 1) : `#jornada/${p.id}/${alvo ? alvo.n : 1}`;
    return `<div class="jtopo"><a href="#jornada">← Minha jornada</a><span>Parte ${numParte(p)} de ${minhasPartes().length}</span>${salvoHtml()}</div>
      <section class="jintro">
        <span class="olho">Parte ${numParte(p)} de ${minhasPartes().length}</span>
        <h1>${esc(p.titulo)}</h1>
        <div class="jtempo"><b>Cerca de ${plural(p.min, "minuto", "minutos")}</b><span>${plural(t, "item", "itens")}${f ? ` · você já respondeu ${f}` : ""}</span></div>
        <div class="jexp"><div><div class="h4">O que você vai escolher</div><p>${esc(p.oque)}</p></div>
          <div><div class="h4">Por que isso importa</div><p>${esc(p.porque)}</p></div></div>
        ${p.dica ? `<p class="jdica">${esc(p.dica)}</p>` : ""}
        <div class="btns"><a class="btn grande claro-esc" href="${comecar}">${f === t ? "Rever esta parte" : f ? "Continuar esta parte" : "Começar esta parte"}</a>
          ${prox ? `<a class="btn grande contorno" href="#jornada/${prox.id}">Pular por agora</a>` : ""}</div>
      </section>`;
  }
  function pagItem(p, n) {
    const it = p.itens[n - 1], r = resp(it.chave);
    const prox = n < p.itens.length ? `#jornada/${p.id}/${n + 1}` : null;
    const proxParte = proximaParte(p);
    const depois = prox || (proxParte ? `#jornada/${proxParte.id}` : "#jornada/fim");
    const antes = n > 1 ? `#jornada/${p.id}/${n - 1}` : `#jornada/${p.id}`;
    return `${cabParte(p, `item ${n} de ${p.itens.length}`)}
      <article class="jitem cartao" id="ji-${slug(it.chave)}">${corpoItem(it, r)}</article>
      <div class="jnav">
        <a class="btn grande contorno" href="${antes}">← Anterior</a>
        <span class="jnav-meio">${respondido(it) ? "" : `<a class="jlink" href="${depois}">Pular por agora</a>`}<a class="jlink" href="#jornada">Parar por aqui</a></span>
        <a class="btn grande" href="${depois}">${prox ? "Próximo →" : "Concluir esta parte →"}</a>
      </div>`;
  }
  function pagLista(p) {
    const proxParte = proximaParte(p);
    const nMax = p.id === "energia" ? p.itens.filter((it) => (resp(it.chave) || {}).escolha === "max").length : 0;
    let grupo = null;
    const itens = p.itens.map((it) => {
      let cab = "";
      if (it.kind === "meta" && it.v.id !== grupo) { grupo = it.v.id; cab = `<h2 class="jgrupo" style="--vc:${it.v.cor}">${esc(it.v.nome)}</h2>`; }
      return `${cab}<article class="jitem cartao${respondido(it) ? " feito" : ""}" id="ji-${slug(it.chave)}">${corpoItem(it, resp(it.chave), true)}</article>`;
    }).join("");
    return `${cabParte(p)}
      <details class="jexp-mini"><summary>O que escolher aqui e por que importa</summary><p><b>O que você vai escolher:</b> ${esc(p.oque)}</p><p><b>Por que importa:</b> ${esc(p.porque)}</p></details>
      ${nMax > 3 ? `<p class="jdica">Você marcou ${nMax} vertentes como prioridade máxima. Se tudo é prioridade, nada é: tente deixar no máximo duas ou três.</p>` : ""}
      <div class="jlista">${itens}</div>
      <div class="jnav">
        <a class="btn grande contorno" href="#jornada/${p.id}">← Voltar</a>
        <span class="jnav-meio"><a class="jlink" href="#jornada">Parar por aqui</a></span>
        <a class="btn grande" href="${proxParte ? `#jornada/${proxParte.id}` : "#jornada/fim"}">Concluir esta parte →</a>
      </div>`;
  }
  function pagFim() {
    const pg = progresso(J.minha), m = J.minha;
    const faltam = minhasPartes().map((p) => [p, p.itens.filter((it) => !respondido(it))]).filter(([, l]) => l.length);
    return `<div class="jtopo"><a href="#jornada">← Minha jornada</a><span>Fim da jornada</span>${salvoHtml()}</div>
      <section class="jobrigada"><span class="olho">Fim da jornada</span>
        <h1>${pg.feitos === pg.total ? "Você respondeu tudo!" : "Quase lá!"}</h1>
        <p>Você respondeu ${pg.feitos} de ${pg.total} itens.${faltam.length ? " Pode concluir assim mesmo ou voltar para responder o que ficou faltando." : ""}</p>
        ${barra(pg.pct)}
        ${m.concluidaEm ? `<p>Jornada concluída em ${dataBR(m.concluidaEm)}. O que você mudar daqui para frente já entra no relatório.</p><div class="btns"><a class="btn grande claro-esc" href="#meu-relatorio">Ver o meu relatório</a></div>`
          : `<div class="btns"><button type="button" class="btn grande claro-esc" data-acao="j-concluir">Concluir minha jornada</button></div>`}
      </section>
      ${faltam.length ? `<section class="bloco"><h2>Ficou sem resposta</h2><div class="jpartes">${faltam.map(([p, l]) => `<a class="jparte" href="${p.layout === "lista" ? hrefItem(p, 1) : `#jornada/${p.id}/${l[0].n}`}"><span class="jn">${numParte(p)}</span><span class="jpt"><b>${esc(p.titulo)}</b><small>${l.map((it) => esc(it.titulo)).slice(0, 4).join("; ")}${l.length > 4 ? "…" : ""}</small></span><span class="jst meio">${plural(l.length, "falta", "faltam")}</span></a>`).join("")}</div></section>` : ""}`;
  }

  /* ---------- relatórios ---------- */
  const rotOp = (it, id) => { const o = opcoesDe(it).find((x) => x[0] === id); return o ? o[1] : id; };
  function linhaMinha(it, r) {
    if (!r) return `<span class="sem">Sem resposta</span>`;
    const partes = [];
    if (r.escolha) partes.push(`<b>${esc(rotOp(it, r.escolha))}</b>${it.kind === "dec" && r.escolha === it.d.rec[0] ? ' <span class="selo rec">igual à recomendação do estudo</span>' : ""}`);
    if (r.meta) partes.push(`Meta sugerida: <b>${esc(r.meta)}</b>`);
    if (r.texto) partes.push(`<span class="jcita">${esc(r.texto)}</span>`);
    return partes.join("<br>");
  }
  function pagMeuRelatorio() {
    if (!participa) return pagSemAcesso();
    if (!J.carregada) return `<header class="cab"><span class="olho">Meu relatório</span><h1>Carregando…</h1></header>`;
    if (!J.minha) return `<header class="cab"><span class="olho">Meu relatório</span><h1>Você ainda não começou a jornada</h1><p>O relatório mostra as suas escolhas para 2027. Comece pela jornada; dá para parar e voltar quando quiser.</p></header><div class="btns"><a class="btn grande" href="#jornada">Ir para a jornada</a></div>`;
    const m = J.minha, pg = progresso(m);
    const secoes = minhasPartes().map((p) => {
      let corpo;
      if (p.id === "energia" || p.id === "temas") {
        const ops = OP[p.itens[0].kind];
        corpo = ops.map(([id, rot]) => { const l = p.itens.filter((it) => (resp(it.chave) || {}).escolha === id); return l.length ? `<p><b>${esc(rot)}:</b> ${l.map((it) => esc(it.titulo)).join(", ")}</p>` : ""; }).join("")
          + p.itens.filter((it) => (resp(it.chave) || {}).texto).map((it) => `<p class="jcom"><b>${esc(it.titulo)}:</b> <span class="jcita">${esc(resp(it.chave).texto)}</span></p>`).join("");
        const sem = p.itens.filter((it) => !respondido(it)).length;
        if (sem) corpo += `<p class="sem">${plural(sem, "item ficou", "itens ficaram")} sem resposta.</p>`;
      } else {
        corpo = `<div class="tabela-caixa"><table class="tab jtab"><tbody>${p.itens.map((it) => `<tr><td>${esc(it.kind === "dec" ? `${it.d.id}: ${it.titulo}` : it.titulo)}</td><td>${linhaMinha(it, resp(it.chave))}</td></tr>`).join("")}</tbody></table></div>`;
      }
      return `<section class="bloco jrel"><h2>${numParte(p)}. ${esc(p.titulo)}</h2>${corpo || '<p class="sem">Sem respostas nesta parte.</p>'}</section>`;
    }).join("");
    return `<header class="cab"><span class="olho">Meu relatório</span><h1>Minhas escolhas para 2027</h1>
        <p>${esc(perfil.nome || "")} · ${m.concluidaEm ? `jornada concluída em ${dataBR(m.concluidaEm)}` : `jornada em andamento: ${pg.feitos} de ${pg.total} itens`} · atualizado em ${dataBR(m.atualizadaEm)}</p></header>
      <div class="btns jsem-print" style="margin-bottom:6px"><button type="button" class="btn" data-acao="j-imprimir">Baixar em PDF (imprimir)</button><a class="btn claro" href="${m.concluidaEm ? "#jornada" : hrefContinuar()}">${m.concluidaEm ? "Mudar alguma resposta" : "Continuar a jornada"}</a></div>
      <p class="sub jpeq">Este é o seu relatório. A administração junta as escolhas de todas as pessoas no relatório geral, para ver onde a equipe concorda e onde precisa conversar.</p>
      ${secoes}`;
  }

  async function lerPessoas() {
    if (J.lendoPessoas || (J.pessoas && Date.now() - J.pessoasEm < 60000)) return;
    J.lendoPessoas = true;
    J.pessoasEm = Date.now();
    try {
      const { data, error } = await P.sb.rpc("planejamento_pessoas");
      if (error) throw error;
      J.pessoas = (data || []).filter((p) => p.nivel === "editora" || p.nivel === "colaboradora");
    } catch (e) { J.pessoas = J.pessoas || []; }
    J.lendoPessoas = false;
    agendarRender();
  }
  function participantes() {
    const docs = todas();
    const lista = (J.pessoas || []).map((p) => ({ id: p.id, nome: p.nome, foto: p.foto_url, nivel: p.nivel, doc: docs[p.id] || null }));
    Object.entries(docs).forEach(([id, d]) => { if (!lista.some((x) => x.id === id)) lista.push({ id, nome: d.nome || "Alguém", nivel: d.nivel || "colaboradora", doc: d, saiu: true }); });
    return lista;
  }
  const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "Alguém";
  function contar(it, quem) {
    const ops = opcoesDe(it);
    const cont = Object.fromEntries(ops.map(([id]) => [id, []]));
    const textos = [], metas = [];
    quem.forEach((q) => {
      const r = resp(it.chave, q.doc);
      if (!r) return;
      if (r.escolha && cont[r.escolha]) cont[r.escolha].push(q);
      if (r.texto) textos.push({ q, texto: r.texto, escolha: r.escolha });
      if (r.meta) metas.push({ q, meta: r.meta });
    });
    const validos = Object.entries(cont).filter(([id]) => id !== "naosei").reduce((s, [, l]) => s + l.length, 0);
    const todosN = Object.values(cont).reduce((s, l) => s + l.length, 0);
    let topoN = 0;
    Object.entries(cont).forEach(([id, l]) => { if (id !== "naosei" && l.length > topoN) topoN = l.length; });
    const topos = Object.entries(cont).filter(([id, l]) => id !== "naosei" && topoN > 0 && l.length === topoN).map(([id]) => id);
    const parte = validos ? topoN / validos : 0;
    let sinal = "pouco";
    if (it.kind !== "texto" && validos >= 2) sinal = parte >= 0.75 && topos.length === 1 ? "converge" : parte <= 0.5 ? "diverge" : "maioria";
    return { cont, validos, todosN, topos, topoN, parte, sinal, textos, metas };
  }
  function barrasHtml(it, c) {
    const base = Math.max(1, c.todosN);
    return `<div class="jdist">${opcoesDe(it).map(([id, rot]) => {
      const l = c.cont[id] || [];
      if (!l.length && (id === "naosei" || id === "outra")) return "";
      return `<div class="jlinha${c.topos.includes(id) ? " topo" : ""}"><span class="jrot">${esc(rot)}${it.kind === "dec" && id === it.d.rec[0] ? ' <span class="selo rec">recomendação</span>' : ""}</span>
        <span class="jbar"><i style="width:${Math.round((100 * l.length) / base)}%"></i></span><b>${l.length}</b>
        <small>${l.map((q) => esc(primeiroNome(q.nome))).join(", ")}</small></div>`;
    }).join("")}</div>`;
  }
  function resumoSinal(it, c) {
    const nomes = (ids) => ids.map((id) => esc(rotOp(it, id))).join(" ou ");
    if (c.sinal === "converge") return `${c.topoN} de ${c.validos} escolheram <b>${nomes(c.topos)}</b>`;
    return Object.entries(c.cont).filter(([id, l]) => l.length && id !== "naosei").sort((a, b) => b[1].length - a[1].length).map(([id, l]) => `${esc(rotOp(it, id))} (${l.length})`).join(", ");
  }
  function pagGeral(foco) {
    if (!ehEditora) return pagHome();
    if (!J.pessoas) { lerPessoas(); return `<header class="cab"><span class="olho">Relatório geral</span><h1>Carregando as respostas da equipe…</h1></header>`; }
    lerPessoas();
    const ps = participantes();
    const conc = ps.filter((p) => p.doc && p.doc.concluidaEm), anda = ps.filter((p) => p.doc && !p.doc.concluidaEm), nada = ps.filter((p) => !p.doc);
    const rosto = (p) => `<span class="rosto">${p.foto ? `<img src="${esc(p.foto)}" alt="">` : esc((String(p.nome || "?").trim()[0] || "?").toUpperCase())}</span>`;
    const chipP = (p) => {
      const pg = p.doc ? progresso(p.doc, p.nivel) : null;
      const st = !p.doc ? "Não começou" : p.doc.concluidaEm ? `Concluiu em ${dataBR(p.doc.concluidaEm)}` : `${pg.pct}% respondido`;
      return `<div class="pessoa jpess">${rosto(p)}<span><b>${esc(p.nome)}</b><small class="${!p.doc ? "nada" : p.doc.concluidaEm ? "ok" : "meio"}">${st}${p.saiu ? " (sem acesso agora)" : ""}</small></span></div>`;
    };
    const comResposta = ps.filter((p) => p.doc);
    const quemDaParte = (p) => comResposta.filter((q) => vale(p, q.nivel));
    const analise = PARTES.map((p) => ({ p, itens: p.itens.map((it) => ({ it, c: contar(it, quemDaParte(p)) })) }));
    const todos = analise.flatMap((a) => a.itens);
    const conv = todos.filter((x) => x.c.sinal === "converge"), div = todos.filter((x) => x.c.sinal === "diverge");
    const poucos = todos.filter((x) => x.c.sinal === "pouco" && x.it.kind !== "texto").length;
    const linkItem = (x) => `<a href="#relatorio-geral/${slug(x.it.chave)}">${esc(x.it.kind === "dec" || x.it.kind === "ok" ? `${(x.it.d || {}).id}: ${x.it.d.titulo}` : x.it.titulo)}</a> <span class="sem">(${esc(PT[x.it.parte].titulo)})</span>`;
    const listaSinal = (l, vazio) => l.length ? `<ul class="lista">${l.map((x) => `<li>${linkItem(x)}<br><span class="jpeq">${resumoSinal(x.it, x.c)}</span></li>`).join("")}</ul>` : `<p class="sem">${vazio}</p>`;
    // prioridade das vertentes pela equipe
    const ranking = (pid) => {
      const a = analise.find((x) => x.p.id === pid);
      if (!a) return "";
      const linhas = a.itens.map(({ it, c }) => {
        const pesos = PESO[it.kind];
        const n = Object.entries(c.cont).reduce((s, [, l]) => s + l.length, 0);
        const media = n ? Object.entries(c.cont).reduce((s, [id, l]) => s + (pesos[id] || 0) * l.length, 0) / n : 0;
        return { it, n, media };
      }).sort((x, y) => y.media - x.media);
      return `<div class="jdist">${linhas.map((l) => `<div class="jlinha"><span class="jrot">${esc(l.it.titulo)}</span><span class="jbar"><i style="width:${Math.round((l.media / 3) * 100)}%"></i></span><b>${l.n ? l.media.toFixed(1).replace(".", ",") : ""}</b><small>${plural(l.n, "resposta", "respostas")}</small></div>`).join("")}</div>`;
    };
    const detalhe = analise.map(({ p, itens }) => {
      const blocos = itens.map(({ it, c }) => {
        let ctx = "";
        if (it.kind === "dec") {
          const info = decInfo(it.d);
          const esc1 = info.status === "decidida" ? (it.d.op.find((o) => o[0] === info.escolha) || [])[1] : null;
          ctx = `<p class="jpeq">Recomendação do estudo: <b>${esc(rotOp(it, it.d.rec[0]))}</b>. Situação: ${esc(esc1 ? `decidida (${esc1})` : info.status === "em-discussao" ? "em discussão" : "pendente")}. <a href="#d-${it.d.id}">Abrir a decisão</a></p>`;
        } else if (it.kind === "ok") {
          ctx = `<p class="jpeq">Decidido: <b>${esc((it.d.op.find((o) => o[0] === it.d.padrao.escolha) || [])[1] || "")}</b></p>`;
        }
        const sinal = c.sinal === "converge" ? '<span class="jsinal conv">Convergência</span>' : c.sinal === "diverge" ? '<span class="jsinal div">Divergência</span>' : c.sinal === "maioria" ? '<span class="jsinal mai">Maioria</span>' : "";
        const textos = c.textos.length ? `<div class="jtextos">${c.textos.map((t) => `<div class="com"><span style="white-space:pre-wrap">${esc(t.texto)}</span><small><span>${esc(t.q.nome)}${t.escolha ? `, escolheu ${esc(rotOp(it, t.escolha))}` : ""}</span></small></div>`).join("")}</div>` : "";
        const metas = c.metas.length ? `<p class="jpeq"><b>Metas sugeridas:</b> ${c.metas.map((x) => `${esc(x.meta)} (${esc(primeiroNome(x.q.nome))})`).join("; ")}</p>` : "";
        const corpo = it.kind === "texto" ? (textos || '<p class="sem">Ninguém respondeu ainda.</p>') : `${barrasHtml(it, c)}${metas}${textos}`;
        return `<article class="cartao jrg" id="rg-${slug(it.chave)}"><div class="jrg-cab"><b>${esc(it.kind === "dec" || it.kind === "ok" ? `${it.d.id}: ${it.d.titulo}` : it.titulo)}</b>${sinal}</div>${ctx}${corpo}</article>`;
      }).join("");
      return `<section class="bloco"><h2>${esc(p.titulo)}${p.so ? ' <span class="selo rec">só da administração</span>' : ""}</h2><div class="jlista">${blocos}</div></section>`;
    }).join("");
    if (J.foco) { S.rolarPara = `rg-${J.foco}`; J.foco = null; }
    return `<header class="cab"><span class="olho">Relatório geral</span><h1>O que a equipe escolheu para 2027</h1>
        <p>${plural(conc.length, "pessoa concluiu", "pessoas concluíram")}, ${anda.length} em andamento e ${plural(nada.length, "ainda não começou", "ainda não começaram")}. As respostas entram aqui na hora, com o nome de cada pessoa.</p></header>
      ${nada.length || anda.length ? `<p class="jdica">Ainda faltam ${plural(nada.length + anda.length, "pessoa", "pessoas")} terminarem. O relatório já mostra tudo o que chegou; os pontos de convergência e de divergência mudam conforme as respostas entram.</p>` : `<p class="jdica ok">Todas as pessoas concluíram. Este é o retrato final da equipe.</p>`}
      <div class="btns jsem-print" style="margin:10px 0"><button type="button" class="btn" data-acao="j-imprimir">Baixar em PDF (imprimir)</button></div>
      <div class="cartao"><div class="h4">Quem participa</div><div class="pessoas jpessoas">${ps.map(chipP).join("") || '<p class="sem">Ninguém ainda.</p>'}</div></div>
      <div class="grade g2 bloco">
        <section class="cartao"><div class="h4">Onde a equipe concorda (${conv.length})</div><p class="jpeq">Três em cada quatro pessoas ou mais escolheram a mesma opção.</p>${listaSinal(conv, "Ainda não há pontos de convergência.")}</section>
        <section class="cartao"><div class="h4">Onde a equipe pensa diferente (${div.length})</div><p class="jpeq">Nenhuma opção passou da metade das respostas: vale conversar.</p>${listaSinal(div, "Ainda não há pontos de divergência.")}</section>
      </div>
      ${poucos ? `<p class="sem">${plural(poucos, "item ainda tem", "itens ainda têm")} menos de duas respostas e não entram nessa conta.</p>` : ""}
      <div class="grade g2 bloco">
        <section class="cartao"><div class="h4">Prioridade das vertentes pela equipe</div><p class="jpeq">Média de 1 (pode esperar) a 3 (prioridade máxima).</p>${ranking("energia")}</section>
        <section class="cartao"><div class="h4">Quanto pesa cada tema</div><p class="jpeq">Média de 1 (pode esperar) a 3 (pesa muito).</p>${ranking("temas")}</section>
      </div>
      ${detalhe}`;
  }

  /* ---------- peças para o resto do site ---------- */
  function pagina(r) {
    if (r.tipo === "meu-relatorio") return pagMeuRelatorio();
    if (r.tipo === "relatorio-geral") return pagGeral(r.foco);
    if (!participa) return pagSemAcesso();
    if (!J.carregada || J.erro || !J.minha || !r.parte) return pagHome();
    if (r.parte === "fim") return pagFim();
    const p = PT[r.parte];
    if (r.item === "lista") return p.layout === "lista" ? pagLista(p) : pagItem(p, 1);
    if (typeof r.item === "number") return p.layout === "lista" ? pagLista(p) : pagItem(p, r.item);
    return pagIntro(p);
  }
  function nav(r) {
    if (!participa) return "";
    const on = (c) => (c ? ' class="on" aria-current="page"' : "");
    const pg = J.minha ? progresso(J.minha) : null;
    return `<div class="grupo"><div class="grupo-tit">Jornada 2027</div>
      <a href="#jornada"${on(r.tipo === "jornada")}>Minha jornada${pg ? `<span class="jpct">${J.minha.concluidaEm ? "✓" : `${pg.pct}%`}</span>` : ""}</a>
      <a href="#meu-relatorio"${on(r.tipo === "meu-relatorio")}>Meu relatório</a>
      ${ehEditora ? `<a href="#relatorio-geral"${on(r.tipo === "relatorio-geral")}>Relatório geral</a>` : ""}</div>`;
  }
  function faixaInicio() {
    if (!participa || !J.carregada || J.erro) return "";
    if (J.minha && J.minha.concluidaEm) return "";
    const pg = J.minha ? progresso(J.minha) : null;
    return `<a class="jfaixa" href="${J.minha ? hrefContinuar() : "#jornada"}"><span><b>${J.minha ? `Sua jornada: ${pg.pct}% respondida` : "Faça a sua jornada do planejamento"}</b>
      <small>${J.minha ? `Faltam cerca de ${plural(pg.faltaMin, "minuto", "minutos")}. Continue de onde parou.` : `Cerca de ${totalMin()} minutos, em partes. Dá para parar e voltar quando quiser.`}</small></span><span class="btn">${J.minha ? "Continuar" : "Começar"}</span></a>`;
  }
  function resumoDec(id) {
    if (!ehEditora) return "";
    lerPessoas();
    const it = ITEM[`dec:${id}`] || ITEM[`ok:${id}`];
    if (!it) return "";
    const ps = participantes().filter((p) => p.doc && vale(PT[it.parte], p.nivel));
    const c = contar(it, ps);
    const n = Object.values(c.cont).reduce((s, l) => s + l.length, 0);
    if (!n && !c.textos.length) return `<p class="porque"><b>Na jornada da equipe:</b> ninguém respondeu ainda.</p>`;
    const partes = Object.entries(c.cont).filter(([, l]) => l.length).sort((a, b) => b[1].length - a[1].length).map(([op, l]) => `${esc(rotOp(it, op))} (${l.map((q) => esc(primeiroNome(q.nome))).join(", ")})`);
    return `<p class="porque"><b>Na jornada da equipe:</b> ${partes.join("; ")}${c.textos.length ? `; ${plural(c.textos.length, "comentário", "comentários")}` : ""}. <a href="#relatorio-geral/${slug(it.chave)}">Ver no relatório geral</a></p>`;
  }

  /* ---------- eventos (devolvem true quando cuidaram do evento) ---------- */
  async function clique(b) {
    const a = b.dataset.acao;
    if (a === "j-comecar") {
      if (!S.db) { toast("Os dados ainda não carregaram. Tente de novo em instantes."); return true; }
      const p1 = minhasPartes()[0];
      J.minha = { nome: perfil.nome || "", papel, nivel, iniciadaEm: agora(), atualizadaEm: agora(), respostas: {}, posicao: { parte: p1.id, item: null } };
      salvar(true);
      toast("Obrigada! A partir de agora cada clique fica salvo.");
      location.hash = `#jornada/${p1.id}`;
      return true;
    }
    if (a === "j-escolher") {
      const chave = b.dataset.chave, op = b.dataset.op, it = ITEM[chave];
      if (!it || !J.minha) return true;
      responder(chave, { escolha: op }, true);
      const pede = PEDE_TEXTO[it.kind] && PEDE_TEXTO[it.kind][op];
      if (pede) J.abertos.add(chave);
      agendarRender();
      if (pede) requestAnimationFrame(() => requestAnimationFrame(() => { const t = document.getElementById(`jt-${slug(chave)}`); if (t && !t.value) t.focus(); }));
      return true;
    }
    if (a === "j-comentar") {
      J.abertos.add(b.dataset.chave);
      agendarRender();
      requestAnimationFrame(() => requestAnimationFrame(() => { const t = document.getElementById(`jt-${slug(b.dataset.chave)}`); if (t) t.focus(); }));
      return true;
    }
    if (a === "j-concluir") {
      if (!J.minha) return true;
      J.minha.concluidaEm = agora();
      J.minha.atualizadaEm = agora();
      J.minha.posicao = { parte: "fim", item: null };
      salvar(true);
      toast(`Jornada concluída. Obrigada${primeiro ? `, ${primeiro}` : ""}!`);
      location.hash = "#meu-relatorio";
      return true;
    }
    if (a === "j-imprimir") { window.print(); return true; }
    return false;
  }
  function digitou(t) {
    if (t.dataset.jtexto) { responder(t.dataset.jtexto, { texto: t.value }); return true; }
    if (t.dataset.jmeta) { responder(t.dataset.jmeta, { meta: t.value.trim() }); return true; }
    return false;
  }

  return { rota, pagina, nav, faixaInicio, resumoDec, clique, digitou, iniciar, aoNavegar };
}
