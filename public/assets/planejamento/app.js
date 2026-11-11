/* Planejamento estratégico 2027 da Mentorei (página /planejamento.html da plataforma).
   Nasceu como artifact do Claude: a lógica usa claude.use("db") e claude.use("user"), que aqui são feitos por
   conexao.js em cima do Supabase da plataforma (tabela planejamento_docs, script 72). O conteúdo do plano (VERT, CONT,
   DEC, CONC...) vem do banco (conteudo/base) e conexao.js o põe no escopo global antes de importar este arquivo.
   Valores em reais só nas coleções fin e finpremissas, que só a administração lê. */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const V = Object.fromEntries(VERT.map((v) => [v.id, v]));
  const E = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));
  const C = Object.fromEntries(CONC.map((c) => [c.id, c]));
  const D = Object.fromEntries(DEC.map((d) => [d.id, d]));
  const AUTO = ["escolhas", "metas", "acoes"];
  const ROT_CASA = { vazia: "Não começou", andamento: "Em andamento", pronta: "Pronta" };
  const ROT_DEC = { decidida: "Decidida", "em-discussao": "Em discussão", pendente: "Pendente" };
  const ROT_ACAO = { "a-fazer": "A fazer", andamento: "Em andamento", feito: "Feito" };
  const PROX_ACAO = { "a-fazer": "andamento", andamento: "feito", feito: "a-fazer" };

  const S = {
    db: null, user: null, meId: null, canEdit: false, podeComentar: false,
    conexao: "conectando", rota: { tipo: "inicio" },
    decisoes: {}, comentarios: [], acoes: {}, metas: {}, casas: {}, fin: {},
    nomes: {}, nomesPedidos: new Set(),
    abertas: new Set(), comAbertos: new Set(), rasc: {}, gravando: new Set(),
    filtroDec: { v: "todas", st: "abertas" }, filtroConc: "todas",
    rolarPara: null, renderPendente: false
  };

  /* ---------- utilidades ---------- */
  function dataBR(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function brl(n) {
    return typeof n === "number" && isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "";
  }
  function lerValor(s) {
    s = String(s || "").replace(/R\$|\s/g, "");
    if (!s) return null;
    s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return isFinite(n) ? Math.round(n) : NaN;
  }
  function limpo(o) { return JSON.parse(JSON.stringify(o)); }
  function nome(id) {
    if (!id) return "Alguém";
    if (id === S.meId) return "Você";
    return S.nomes[id] || "Alguém";
  }
  function fonte(id, rotulo) {
    const f = FONTES[id];
    if (!f) return "";
    if (!f.u) return `<span class="fonte" title="${esc(f.t)}">(${esc(rotulo || "conta nossa")})</span>`;
    return `<span class="fonte">(<a href="${esc(f.u)}" target="_blank" rel="noopener" title="${esc(f.t)}">${esc(rotulo || "fonte")}</a>)</span>`;
  }
  function chipV(vid, link) {
    const v = V[vid];
    if (!v) return "";
    const tag = link ? "a" : "span";
    return `<${tag} class="chip"${link ? ` href="#v-${v.id}"` : ""}><i class="pt" style="background:${v.cor}"></i>${esc(v.curto)}</${tag}>`;
  }
  let toastTimer = null;
  function toast(msg, acao) {
    const t = $("#toast");
    t.innerHTML = esc(msg) + (acao ? ` <button type="button" class="btn mini claro" id="toastAcao">${esc(acao.rotulo)}</button>` : "");
    t.hidden = false;
    if (acao) $("#toastAcao").onclick = () => { t.hidden = true; acao.fazer(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, acao ? 7000 : 4500);
  }

  /* ---------- estado derivado ---------- */
  function decInfo(d) {
    const live = S.decisoes[d.id];
    if (live) return { status: ROT_DEC[live.status] ? live.status : "pendente", escolha: live.escolha || null, nota: live.nota || "", por: live.por || null, em: live.em || null, origem: live.origem || null };
    if (d.padrao) return { status: d.padrao.status, escolha: d.padrao.escolha, nota: "", por: null, em: null, origem: ORIGEM_CONVERSA };
    return { status: "pendente", escolha: null, nota: "", por: null, em: null, origem: null };
  }
  function decsDe(vid, eid) { return DEC.filter((d) => (!vid || d.v.includes(vid)) && (!eid || d.e === eid)); }
  function metasDe(vid) {
    return CONT[vid].metas.map(([id, ind, base, como]) => {
      const m = S.metas[id] || {};
      return { id, ind, base: m.base || base, meta: m.meta2027 || "", como, resp: m.resp || "" };
    });
  }
  function acoesDe(vid) {
    const lista = CONT[vid].acoes.map(([id, titulo, tri]) => Object.assign({ id, titulo, tri, resp: "", status: "a-fazer" }, S.acoes[id] || {}));
    Object.entries(S.acoes).forEach(([id, a]) => { if (a.custom && a.v === vid) lista.push(Object.assign({ id, resp: "", status: "a-fazer", tri: 4 }, a)); });
    return lista.filter((a) => !a.removida).sort((x, y) => (x.tri ?? 4) - (y.tri ?? 4));
  }
  function casaStatus(vid, eid) {
    if (eid === "escolhas") {
      const ds = decsDe(vid, null);
      if (!ds.length) return "vazia";
      const st = ds.map((d) => decInfo(d).status);
      if (st.every((s) => s === "decidida")) return "pronta";
      return st.some((s) => s !== "pendente") ? "andamento" : "vazia";
    }
    if (eid === "metas") {
      const ms = metasDe(vid), n = ms.filter((m) => m.meta).length;
      return n === 0 ? "vazia" : n === ms.length ? "pronta" : "andamento";
    }
    if (eid === "acoes") {
      const as = acoesDe(vid), n = as.filter((a) => a.resp).length;
      return !as.length || n === 0 ? "vazia" : n === as.length ? "pronta" : "andamento";
    }
    const c = S.casas[`${vid}-${eid}`];
    return (c && ROT_CASA[c.status] && c.status) || CASA_PADRAO[eid][vid] || "vazia";
  }
  function comsDe(alvo) { return S.comentarios.filter((c) => c.alvo === alvo).sort((a, b) => String(a.em).localeCompare(String(b.em))); }
  function rotuloAlvo(alvo) {
    if (alvo.startsWith("d-")) { const d = D[alvo.slice(2)]; return d ? `${d.id}: ${d.titulo}` : alvo; }
    if (alvo.startsWith("a-")) { const a = AREAS.find((x) => x.id === alvo.slice(2)); return a ? a.nome : alvo; }
    if (alvo.startsWith("o-")) { const o = OUTROS.find((x) => x.id === alvo.slice(2)); return o ? `O que mais pensar: ${o.titulo}` : alvo; }
    const p = alvo.split("-");
    if (p[0] === "s" && V[p[1]] && E[p[2]]) return `${V[p[1]].curto}, ${E[p[2]].nome}`;
    return alvo;
  }
  function hrefAlvo(alvo) {
    if (alvo.startsWith("d-")) return `#d-${alvo.slice(2)}`;
    if (alvo.startsWith("a-") && AREAS.some((x) => x.id === alvo.slice(2))) return `#${alvo.slice(2)}`;
    if (alvo.startsWith("o-")) return "#outros";
    const p = alvo.split("-");
    return p[0] === "s" ? `#v-${p[1]}-${p[2]}` : "#inicio";
  }

  /* ---------- gravação ---------- */
  async function gravar(caminho, dados, tipo) {
    if (!S.db) { toast("Os dados ainda não carregaram. Tente de novo em instantes."); return false; }
    if (S.gravando.has(caminho)) { toast("Ainda salvando a alteração anterior, um instante."); return false; }
    S.gravando.add(caminho);
    try {
      if (dados === null) await S.db.doc(caminho).delete();
      else await S.db.doc(caminho).set(limpo(dados));
      return true;
    } catch (e) {
      const code = e && e.code;
      if (code === "invalid_argument") {
        if (tipo === "comentario") { S.podeComentar = false; toast("Seu acesso é só de leitura. Para comentar, peça à administração."); }
        else { S.canEdit = false; toast("Só a administração (sócias e Cintia) pode mudar isso."); }
        agendarRender();
      } else if (code === "quota_exceeded") toast("O espaço de dados do site encheu. Avise a Juliana.");
      else toast("Não consegui salvar agora. Tente de novo em instantes.");
      return false;
    } finally { S.gravando.delete(caminho); }
  }
  const carimbo = () => ({ por: S.meId, em: new Date().toISOString() });

  async function salvarDec(id, mud) {
    const d = D[id], cur = decInfo(d);
    const novo = Object.assign({ status: cur.status, escolha: cur.escolha, nota: cur.nota, origem: cur.origem }, mud, carimbo());
    if (mud.status || mud.escolha !== undefined) delete novo.origem;
    if (novo.status !== "decidida" && mud.status) novo.escolha = null;
    Object.keys(novo).forEach((k) => { if (novo[k] === null || novo[k] === "") delete novo[k]; });
    const ok = await gravar(`decisoes/${id}`, novo);
    if (ok && mud.status === "decidida") toast(`${id} decidida.`);
  }

  /* ---------- menu ---------- */
  function renderNav() {
    const r = S.rota;
    const on = (cond) => (cond ? ' class="on" aria-current="page"' : "");
    const papel = !S.db ? "Só leitura neste momento" : S.canEdit ? "Decide e vê os valores" : S.podeComentar ? "Lê e comenta" : "Só lê";
    const quem = S.user ? `<div class="quem"><b>${esc(S.meNome || "Você")}</b><span>${papel}</span></div>` : "";
    const conex = {
      conectando: ["", "Carregando as decisões salvas"],
      ok: ["ok", "Tudo salvo; atualiza a cada 30 segundos"],
      lento: ["lento", "Os dados estão demorando; pode estar desatualizado"],
      offline: ["", "Sem dados salvos: mostrando o conteúdo base"]
    }[S.conexao];
    $("#menu").innerHTML = `
      <a class="voltar-plat" href="/app.html">← Voltar para a plataforma</a>
      <div class="marca"><span>Mentorei</span><b>Planejamento 2027</b></div>
      ${quem}
      <div class="grupo">
        <a href="#inicio"${on(r.tipo === "inicio")}>Início</a>
        ${S.canEdit ? `<a href="#participantes"${on(r.tipo === "participantes")}>Quem participa</a>` : ""}
        <a href="#decisoes"${on(r.tipo === "decisoes")}>Decisões</a>
        <a href="#mercado"${on(r.tipo === "mercado")}>Mercado e concorrentes</a>
      </div>
      <div class="grupo"><div class="grupo-tit">Vertentes</div>
        ${VERT.map((v) => `<a href="#v-${v.id}"${on(r.tipo === "vertente" && r.id === v.id)}><i class="pt" style="background:${v.cor}"></i>${esc(v.nome)}</a>`).join("")}
      </div>
      <div class="grupo"><div class="grupo-tit">Etapas</div>
        ${ETAPAS.map((e) => `<a href="#e-${e.id}"${on(r.tipo === "etapa" && r.id === e.id)}><span class="num">${e.n}</span>${esc(e.nome)}</a>`).join("")}
      </div>
      <div class="grupo"><div class="grupo-tit">Áreas de apoio</div>
        ${AREAS.map((a) => `<a href="#${a.id}"${on(r.tipo === "area" && r.id === a.id)}><i class="pt" style="background:${a.cor};border-radius:2px"></i>${esc(a.nome)}</a>`).join("")}
      </div>
      <div class="grupo"><a href="#fontes"${on(r.tipo === "fontes")}>Fontes</a></div>
      <div class="conexao ${conex[0]}"><i></i>${esc(conex[1])}</div>`;
  }

  /* ---------- peças ---------- */
  function badgeCasa(st) { return `<span class="casa ${st}"><i></i>${ROT_CASA[st]}</span>`; }
  function controleCasa(vid, eid) {
    const st = casaStatus(vid, eid);
    if (AUTO.includes(eid)) return `<span class="estado-casa" title="Calculada pelas decisões, metas e responsáveis">${badgeCasa(st)}</span>`;
    if (S.canEdit) {
      return `<label class="estado-casa">Situação
        <select data-acao="casa" data-v="${vid}" data-e="${eid}">
          ${Object.entries(ROT_CASA).map(([k, l]) => `<option value="${k}"${k === st ? " selected" : ""}>${l}</option>`).join("")}
        </select></label>`;
    }
    return `<span class="estado-casa">${badgeCasa(st)}</span>`;
  }
  function lista(itens) { return `<ul class="lista">${itens.map((i) => `<li>${i}</li>`).join("")}</ul>`; }

  function blocoComentarios(alvo, emDetalhes) {
    const cs = comsDe(alvo);
    const itens = cs.map((c) => {
      const podeApagar = S.db && (c.autor === S.meId || S.canEdit);
      return `<div class="com"><span style="white-space:pre-wrap">${esc(c.texto)}</span>
        <small><span>${esc(nome(c.autor) === "Alguém" && c.autorNome ? c.autorNome : nome(c.autor))}, ${dataBR(c.em)}</span>${podeApagar ? `<button type="button" data-acao="apagar-com" data-id="${esc(c.id)}">Apagar</button>` : ""}</small></div>`;
    }).join("");
    let novo;
    if (!S.db) novo = `<p class="sem">Os comentários aparecem quando os dados carregam.</p>`;
    else if (!S.podeComentar) novo = `<p class="sem">Seu acesso é só de leitura. Para comentar, peça à administração.</p>`;
    else novo = `<div class="novo-com"><textarea data-com="${alvo}" placeholder="Escreva um comentário, uma dúvida ou uma sugestão" aria-label="Novo comentário">${esc(S.rasc[alvo] || "")}</textarea>
      <div class="btns"><button type="button" class="btn mini" data-acao="comentar" data-alvo="${alvo}">Comentar</button></div></div>`;
    const corpo = `${itens || `<p class="sem">Nenhum comentário ainda.</p>`}${novo}`;
    if (!emDetalhes) return `<div class="coms"><div class="h4">Comentários (${cs.length})</div>${corpo}</div>`;
    const aberto = S.comAbertos.has(alvo) ? " open" : "";
    return `<details class="coms" data-alvo="${alvo}"${aberto}><summary class="h4" style="cursor:pointer">Comentários (${cs.length})</summary><div style="display:grid;gap:8px;margin-top:8px">${corpo}</div></details>`;
  }

  function cartaoDec(d) {
    const info = decInfo(d), st = info.status;
    const aberta = S.abertas.has(d.id);
    const rotOp = (id) => { const o = d.op.find((x) => x[0] === id); return o ? o[1] : ""; };
    const linha = st === "decidida"
      ? `Escolha: <b>${esc(rotOp(info.escolha))}</b>`
      : `Recomendação: <b>${esc(rotOp(d.rec[0]))}</b>`;
    const ncom = comsDe(`d-${d.id}`).length;
    let corpo = "";
    if (aberta) {
      const opcoes = d.op.map(([id, rot, desc]) => {
        const escolhida = st === "decidida" && info.escolha === id;
        const rec = d.rec[0] === id;
        const botao = S.canEdit && !escolhida ? `<div class="acoes-op"><button type="button" class="btn mini${rec ? "" : " claro"}" data-acao="escolher" data-id="${d.id}" data-op="${id}">Escolher esta</button></div>` : "";
        return `<div class="opcao${escolhida ? " escolhida" : ""}"><b>${esc(rot)}</b>${botao}<p>${esc(desc)}</p>
          ${rec || escolhida ? `<div class="marcas">${rec ? '<span class="selo rec">Recomendação</span>' : ""}${escolhida ? '<span class="selo esc">Escolhida</span>' : ""}</div>` : ""}</div>`;
      }).join("");
      let quem = "";
      if (info.em && st !== "pendente") quem = `${st === "decidida" ? "Decidida" : "Marcada em discussão"} por ${esc(nome(info.por))} em ${dataBR(info.em)}.`;
      else if (info.origem && st === "decidida") quem = esc(info.origem) + ".";
      const nota = S.rasc[`nota-${d.id}`] != null ? S.rasc[`nota-${d.id}`] : info.nota;
      const admin = S.canEdit ? `
        <label class="rot">Nota da decisão (por que, condições, prazos)
          <textarea data-nota="${d.id}">${esc(nota)}</textarea></label>
        <div class="btns">
          <button type="button" class="btn mini claro" data-acao="salvar-nota" data-id="${d.id}">Salvar nota</button>
          ${st !== "em-discussao" ? `<button type="button" class="btn mini claro" data-acao="discussao" data-id="${d.id}">Marcar em discussão</button>` : ""}
          ${st !== "pendente" ? `<button type="button" class="btn mini claro" data-acao="reabrir" data-id="${d.id}">Reabrir</button>` : ""}
        </div>` : (info.nota ? `<p class="nota-dec">${esc(info.nota)}</p>` : "");
      corpo = `<div class="dec-corpo" id="corpo-${d.id}">
        <p class="contexto">${esc(d.contexto)}</p>
        <div class="opcoes">${opcoes}</div>
        <p class="porque"><b>Por que recomendamos ${esc(rotOp(d.rec[0]))}:</b> ${esc(d.rec[1])}</p>
        ${quem ? `<p class="decidido-por">${quem}</p>` : ""}
        ${admin}
        ${blocoComentarios(`d-${d.id}`, false)}
      </div>`;
    }
    return `<article class="dec ${st}" id="dec-${d.id}">
      <button type="button" class="dec-cab" data-acao="abrir-dec" data-id="${d.id}" aria-expanded="${aberta}" aria-controls="corpo-${d.id}">
        <span class="dec-tit">${d.id}: ${esc(d.titulo)}</span>
        <span class="dir"><span class="st ${st}">${ROT_DEC[st]}</span><span class="seta">${aberta ? "Fechar" : "Abrir"}</span></span>
        <span class="linha2">${linha}${ncom ? `, ${ncom} comentário${ncom > 1 ? "s" : ""}` : ""} <span class="chips" style="display:inline-flex;margin-left:6px">${d.area ? `<span class="chip chip-area">${esc(ROT_AREA[d.area] || d.area)}</span>` : ""}${d.v.map((v) => chipV(v)).join("")}</span></span>
      </button>${corpo}</article>`;
  }
  function blocoDecs(ds, titulo) {
    if (!ds.length) return "";
    return `<div class="bloco" style="margin-top:18px"><div class="h4">${esc(titulo)}</div><div class="decs">${ds.map(cartaoDec).join("")}</div></div>`;
  }

  /* ---------- conteúdo por etapa ---------- */
  function conteudo(vid, eid, modoEtapa) {
    const c = CONT[vid];
    const decsAqui = modoEtapa ? "" : blocoDecs(decsDe(vid, eid), eid === "escolhas" ? "Decisões desta vertente" : "Decisões ligadas a esta etapa");
    if (eid === "diagnostico") {
      return `<div class="grade">
        <div class="cartao"><div class="h4">O que já temos</div>${lista(c.fatos.map(([t, f]) => `${esc(t)} ${f ? fonte(f) : ""}`))}</div>
        <div class="grade g2">
          <div class="cartao"><div class="h4">Forças</div>${lista(c.forcas.map(esc))}</div>
          <div class="cartao fraco"><div class="h4">Pontos fracos</div>${lista(c.fragilidades.map(esc))}</div>
        </div>${finDiag(vid)}</div>${decsAqui}`;
    }
    if (eid === "mercado") {
      const nums = `<div class="numeros">${c.numeros.map(([n, t, f]) => `<div class="numero"><b>${esc(n)}</b><span>${esc(t)}</span>${fonte(f)}</div>`).join("")}</div>`;
      const concs = modoEtapa
        ? `<div class="cartao"><div class="h4">Concorrentes e referências</div><div class="chips">${c.concorrentes.map((id) => `<a class="chip" href="#mercado">${esc(C[id].nome)}</a>`).join("")}</div></div>`
        : `<div><div class="h4">Concorrentes e referências</div><div class="concs">${c.concorrentes.map((id) => cartaoConc(C[id])).join("")}</div></div>`;
      return `<div class="grade">${nums}${concs}<div class="cartao"><div class="h4">O que vale modelar</div>${lista(c.modelar.map(esc))}</div></div>${decsAqui}`;
    }
    if (eid === "direcao") {
      const d = c.direcao;
      return `<div class="direcao">
        <div class="frase"><small>Frase proposta</small><b>${esc(d.frase)}</b></div>
        <div class="item"><small>Para quem</small><span>${esc(d.publico)}</span></div>
        <div class="item"><small>Promessa</small><span>${esc(d.promessa)}</span></div>
        <div class="item" style="grid-column:1/-1"><small>Como queremos ser lembradas</small><span>${esc(d.lembrar)}</span></div>
      </div><p class="aviso-proposta">É uma proposta de partida, montada a partir do que já existe. Ajustem nos comentários.</p>${decsAqui}`;
    }
    if (eid === "escolhas") {
      if (modoEtapa) {
        const ds = decsDe(vid, null), cont = { decidida: 0, "em-discussao": 0, pendente: 0 };
        ds.forEach((d) => { cont[decInfo(d).status]++; });
        return `<div class="chips">${Object.entries(cont).map(([k, n]) => `<span class="st ${k}">${n} ${ROT_DEC[k].toLowerCase()}${n === 1 ? "" : "s"}</span>`).join("")}</div>
          <ul class="lista" style="margin-top:10px">${ds.map((d) => `<li><a href="#d-${d.id}">${d.id}: ${esc(d.titulo)}</a> <span class="st ${decInfo(d).status}">${ROT_DEC[decInfo(d).status]}</span></li>`).join("")}</ul>`;
      }
      const todas = decsDe(vid, null).length;
      const aqui = decsDe(vid, "escolhas");
      const fora = todas - aqui.length;
      return `${aqui.length ? "" : `<p class="sem">Nenhuma decisão de escolha nesta vertente.</p>`}${decsAqui}
        ${fora ? `<p class="sem" style="margin-top:10px">Esta vertente tem mais ${fora} ${fora > 1 ? "decisões" : "decisão"} nas etapas Direção, Plano de ação ou Orçamento.</p>` : ""}`;
    }
    if (eid === "metas") {
      const ms = metasDe(vid);
      const linhas = ms.map((m) => `<tr><td>${esc(m.ind)}</td>
        <td>${S.canEdit ? `<input type="text" data-acao="meta" data-id="${m.id}" data-campo="base" value="${esc(m.base)}" aria-label="Base 2026: ${esc(m.ind)}">` : esc(m.base)}</td>
        <td>${S.canEdit ? `<input type="text" data-acao="meta" data-id="${m.id}" data-campo="meta2027" value="${esc(m.meta)}" placeholder="Definir" aria-label="Meta 2027: ${esc(m.ind)}">` : (m.meta ? `<b>${esc(m.meta)}</b>` : '<span class="sem">a definir</span>')}</td>
        <td>${esc(m.como)}</td></tr>`).join("");
      return `<div class="tabela-caixa"><table class="tab"><thead><tr><th>Indicador</th><th>Partida 2026</th><th>Meta 2027</th><th>Como medir</th></tr></thead><tbody>${linhas}</tbody></table></div>
        ${S.canEdit ? `<p class="aviso-proposta">Digite e clique fora do campo para salvar.</p>` : ""}${decsAqui}`;
    }
    if (eid === "acoes") {
      const as = acoesDe(vid);
      const linhas = as.map((a) => {
        const st = ROT_ACAO[a.status] ? a.status : "a-fazer";
        if (!S.canEdit) return `<tr><td>${esc(a.titulo)}</td><td class="tri">${esc(TRIMESTRES[a.tri ?? 4])}</td><td>${a.resp ? esc(a.resp) : '<span class="sem">a definir</span>'}</td><td><span class="estado-acao ${st}">${ROT_ACAO[st]}</span></td></tr>`;
        return `<tr><td>${esc(a.titulo)}</td>
          <td><select data-acao="acao-tri" data-id="${esc(a.id)}" data-v="${vid}" aria-label="Quando">${TRIMESTRES.map((t, i) => `<option value="${i}"${i === (a.tri ?? 4) ? " selected" : ""}>${t}</option>`).join("")}</select></td>
          <td><input type="text" data-acao="acao-resp" data-id="${esc(a.id)}" data-v="${vid}" value="${esc(a.resp || "")}" placeholder="Quem cuida" aria-label="Responsável"></td>
          <td><button type="button" class="estado-acao ${st}" data-acao="acao-status" data-id="${esc(a.id)}" data-v="${vid}" title="Clique para mudar">${ROT_ACAO[st]}</button></td>
          <td><button type="button" class="btn mini claro" data-acao="acao-remover" data-id="${esc(a.id)}" data-v="${vid}">Remover</button></td></tr>`;
      }).join("");
      const add = S.canEdit ? `<div class="add-acao">
          <label class="rot">Nova ação<input type="text" id="nova-titulo-${vid}" placeholder="O que precisa ser feito"></label>
          <label class="rot">Quando<select class="campo" id="nova-tri-${vid}">${TRIMESTRES.map((t, i) => `<option value="${i}">${t}</option>`).join("")}</select></label>
          <label class="rot">Responsável<input type="text" id="nova-resp-${vid}" placeholder="Quem cuida"></label>
          <button type="button" class="btn" data-acao="acao-add" data-v="${vid}">Adicionar</button></div>` : "";
      return `<div class="tabela-caixa"><table class="tab"><thead><tr><th>Ação</th><th>Quando</th><th>Responsável</th><th>Situação</th>${S.canEdit ? "<th></th>" : ""}</tr></thead>
        <tbody>${linhas || `<tr><td colspan="5" class="sem">Nenhuma ação ainda.</td></tr>`}</tbody></table></div>${add}${decsAqui}`;
    }
    if (eid === "orcamento") {
      return `<div class="grade">${finOrc(vid, modoEtapa)}<div class="cartao fraco"><div class="h4">Riscos e como reduzir</div>${lista(c.riscos.map(esc))}</div></div>${decsAqui}`;
    }
    return "";
  }

  /* Financeiro: só aparece para editoras; valores vêm só do banco (leitura restrita a admin). */
  function campoFin(vid, campo, rotulo, ex) {
    const f = S.fin[vid] || {};
    const val = typeof f[campo] === "number" ? f[campo].toLocaleString("pt-BR") : "";
    return `<label class="rot">${rotulo}<input type="text" inputmode="decimal" data-acao="fin" data-v="${vid}" data-campo="${campo}" value="${esc(val)}" placeholder="${ex || "Ex.: 350.000"}"></label>`;
  }
  function finDiag(vid) {
    if (!S.canEdit) return "";
    return `<div class="cartao financeiro"><div class="h4">Números financeiros (só editoras veem)</div>
      <div class="fin-campos">${campoFin(vid, "fat2026", "Faturamento 2026 (R$)")}${campoFin(vid, "custo2026", "Custos diretos 2026 (R$)")}${campoFin(vid, "horas2026", "Horas das sócias por mês", "Ex.: 40")}</div>
      <p class="aviso-proposta">Use o Financeiro da plataforma ou o backup semanal em Excel. Digite e clique fora do campo para salvar.</p></div>`;
  }
  function finOrc(vid, modoEtapa) {
    if (!S.canEdit && modoEtapa) return "";
    if (!S.canEdit) return `<div class="cartao"><div class="h4">Orçamento</div><p class="sem">Os números de orçamento ficam visíveis só para as sócias e a Cintia.</p></div>`;
    const f = S.fin[vid] || {};
    return `<div class="cartao financeiro"><div class="h4">Orçamento 2027 (só editoras veem)</div>
      <div class="fin-campos">${campoFin(vid, "meta2027", "Meta de faturamento 2027 (R$)")}${campoFin(vid, "invest2027", "Investimento previsto 2027 (R$)")}${campoFin(vid, "fat2026", "Faturamento 2026 (R$)")}</div>
      <label class="rot" style="margin-top:10px">Observações<textarea data-acao="fin-obs" data-v="${vid}">${esc(S.rasc[`fin-${vid}`] != null ? S.rasc[`fin-${vid}`] : f.obs || "")}</textarea></label>
      <div class="btns" style="margin-top:8px"><button type="button" class="btn mini claro" data-acao="fin-obs-salvar" data-v="${vid}">Salvar observações</button></div></div>`;
  }

  function cartaoConc(c) {
    return `<div class="conc"><span class="tipo">${esc(c.tipo)}</span><h3>${esc(c.nome)}</h3><p>${esc(c.oque)}</p>
      <dl><div><dt>Preço</dt><dd>${esc(c.preco)}</dd></div><div><dt>O que tem de melhor</dt><dd>${esc(c.melhor)}</dd></div><div><dt>Onde para</dt><dd>${esc(c.para)}</dd></div></dl>
      <div class="chips">${c.v.map((v) => chipV(v, true)).join("")}</div>${c.f ? fonte(c.f) : ""}</div>`;
  }

  function secaoVertente(vid, e) {
    return `<section class="secao" id="s-${e.id}" aria-labelledby="t-${e.id}">
      <div class="secao-cab"><div><h2 id="t-${e.id}"><small>Etapa ${e.n}</small>${esc(e.nome)}</h2><p class="pergunta">${esc(e.pergunta)}</p></div>${controleCasa(vid, e.id)}</div>
      ${conteudo(vid, e.id, false)}
      <div style="margin-top:14px">${blocoComentarios(`s-${vid}-${e.id}`, true)}</div>
    </section>`;
  }

  /* ---------- páginas ---------- */
  function pagInicio() {
    const decs = DEC.map(decInfo);
    const nDec = decs.filter((d) => d.status === "decidida").length;
    let prontas = 0;
    VERT.forEach((v) => ETAPAS.forEach((e) => { if (casaStatus(v.id, e.id) === "pronta") prontas++; }));
    const todasAcoes = VERT.flatMap((v) => acoesDe(v.id));
    const comResp = todasAcoes.filter((a) => a.resp).length;
    const seg = (n, titulo, texto) => `<div class="seg"><b>Segmento ${n}: ${titulo}</b><span>${texto}</span>
      <div class="chips">${VERT.filter((v) => v.seg === n).map((v) => `<a class="chip" href="#v-${v.id}"><i class="pt" style="background:${v.cor}"></i>${esc(v.nome)}</a>`).join("")}</div></div>`;
    const matriz = `<div class="matriz-caixa"><table class="matriz"><thead><tr><th>Vertente</th>${ETAPAS.map((e) => `<th><a href="#e-${e.id}" style="text-decoration:none">${e.n}. ${esc(e.nome)}</a></th>`).join("")}</tr></thead>
      <tbody>${VERT.map((v) => `<tr><td><a href="#v-${v.id}"><i class="pt" style="width:10px;height:10px;border-radius:50%;background:${v.cor};display:inline-block"></i>${esc(v.nome)}</a></td>
        ${ETAPAS.map((e) => { const st = casaStatus(v.id, e.id); return `<td><a class="casa ${st}" href="#v-${v.id}-${e.id}" aria-label="${esc(v.curto)}, ${esc(e.nome)}: ${ROT_CASA[st]}"><i></i>${ROT_CASA[st]}</a></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="legenda">${badgeCasa("vazia")}${badgeCasa("andamento")}${badgeCasa("pronta")}<span>Escolhas, Metas e Plano de ação se atualizam sozinhos; as outras etapas as editoras marcam.</span></div>`;
    const prox = PRIORIDADE.map((id) => D[id]).filter((d) => d && decInfo(d).status !== "decidida").slice(0, 6);
    const proxHtml = prox.length ? `<div class="decs">${prox.map((d) => `<a class="cartao" href="#d-${d.id}" style="text-decoration:none;display:grid;gap:4px;padding:12px 16px">
        <span style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>${d.id}: ${esc(d.titulo)}</b><span class="st ${decInfo(d).status}">${ROT_DEC[decInfo(d).status]}</span></span>
        <span class="sem">Recomendação: ${esc(d.op.find((o) => o[0] === d.rec[0])[1])}</span></a>`).join("")}</div>` : `<p class="sem">Todas as decisões foram tomadas.</p>`;
    const ev = [];
    Object.entries(S.decisoes).forEach(([id, d]) => { if (d.em && D[id]) ev.push({ em: d.em, quem: d.por, txt: `${d.status === "decidida" ? "decidiu" : d.status === "em-discussao" ? "colocou em discussão" : "reabriu"} ${id}: ${D[id].titulo}`, href: `#d-${id}` }); });
    S.comentarios.forEach((c) => ev.push({ em: c.em, quem: c.autor, txt: `comentou em ${rotuloAlvo(c.alvo)}`, href: hrefAlvo(c.alvo) }));
    Object.entries(S.acoes).forEach(([id, a]) => { if (a.em) ev.push({ em: a.em, quem: a.por, txt: `atualizou a ação ${a.titulo || ""}`.trim(), href: `#v-${a.v || id.split("-")[0]}-acoes` }); });
    Object.entries(S.metas).forEach(([id, m]) => { if (m.em) ev.push({ em: m.em, quem: m.por, txt: "atualizou uma meta", href: `#v-${id.split("-")[0]}-metas` }); });
    ev.sort((a, b) => String(b.em).localeCompare(String(a.em)));
    const movHtml = ev.length ? `<div class="mov">${ev.slice(0, 8).map((x) => `<div><small>${dataBR(x.em)}</small><span><b>${esc(nome(x.quem))}</b> <a href="${esc(x.href)}">${esc(x.txt)}</a></span></div>`).join("")}</div>`
      : `<p class="sem">${S.db ? "Ainda não há movimentos. As decisões e comentários aparecem aqui." : "Os movimentos aparecem quando os dados carregam."}</p>`;
    return `<div class="heroi">
        <span class="olho">Mentorei, planejamento estratégico</span>
        <h1>2027: dois segmentos, seis vertentes, sete etapas</h1>
        <p>Aqui a gente percorre cada vertente da Mentorei, olha o mercado e os concorrentes, toma as decisões e transforma tudo em metas e plano de ação. O que for decidido fica salvo para todas.</p>
        <div class="segmentos">${seg(1, "empresas", "Desenvolvimento de líderes e equipes, com a rede de mentores entregando junto.")}${seg(2, "mentores e pessoas", "Formação e plataforma para quem quer ser mentor, mais produtos digitais e mentoria para pessoa física.")}</div>
        <p class="caminho"><b>Como usar:</b> escolha uma vertente e desça pelas sete etapas, ou siga uma etapa olhando todas as vertentes lado a lado. As decisões ficam em Decisões; comente em qualquer bloco.</p>
      </div>
      <div class="kpis">
        <div class="kpi"><b>${nDec} de ${DEC.length}</b><span>decisões tomadas</span></div>
        <div class="kpi"><b>${prontas} de ${VERT.length * ETAPAS.length}</b><span>etapas prontas</span></div>
        <div class="kpi"><b>${comResp} de ${todasAcoes.length}</b><span>ações com responsável</span></div>
        <div class="kpi"><b>${S.comentarios.length}</b><span>comentários</span></div>
      </div>
      <section class="bloco"><h2>Onde estamos em cada vertente</h2><p class="sub">Clique em uma casa para ir direto ao bloco.</p>${matriz}</section>
      <section class="bloco"><h2>Áreas de apoio</h2><p class="sub">Vendas, marketing, operação, pessoas e os temas que atravessam todas as vertentes.</p>
        <div class="areas">${AREAS.map((a) => { const c = S.casas[`ar-${a.id}`]; const st = c && ROT_CASA[c.status] ? c.status : "vazia"; return `<a class="area-card" href="#${a.id}" style="--vc:${a.cor}"><b>${esc(a.nome)}</b><span>${esc(a.resumo)}</span>${badgeCasa(st)}</a>`; }).join("")}</div></section>
      <div class="grade g2 bloco">
        <section><h2 style="font-size:20px;margin-bottom:12px">Próximas decisões</h2>${proxHtml}<p style="margin-top:10px"><a href="#decisoes">Ver todas as decisões</a></p></section>
        <section><h2 style="font-size:20px;margin-bottom:12px">Últimos movimentos</h2><div class="cartao">${movHtml}</div>
          <div class="cartao" style="margin-top:14px"><div class="h4">Estudos de apoio (abrem no Claude da Juliana)</div>${lista([`<a href="${FONTES.benchmark.u}" target="_blank" rel="noopener">${esc(FONTES.benchmark.t)}</a>`, `<a href="${FONTES.mls.u}" target="_blank" rel="noopener">${esc(FONTES.mls.t)}</a>`])}</div></section>
      </div>`;
  }

  function pagVertente(vid) {
    const v = V[vid], i = VERT.indexOf(v);
    const ant = VERT[(i + VERT.length - 1) % VERT.length], prox = VERT[(i + 1) % VERT.length];
    const abas = ETAPAS.map((e) => `<button type="button" class="aba" data-acao="ir-secao" data-alvo="s-${e.id}">${e.n}. ${esc(e.nome)} ${badgeCasa(casaStatus(vid, e.id)).replace(/>[^<]*<\/span>$/, "></span>")}</button>`).join("");
    return `<header class="cab vcab" style="--vc:${v.cor}"><span class="olho">Segmento ${v.seg}, vertente</span><h1>${esc(v.nome)}</h1><p>${esc(v.papel)}</p></header>
      <nav class="abas" aria-label="Etapas desta vertente">${abas}</nav>
      ${ETAPAS.map((e) => secaoVertente(vid, e)).join("")}
      <div class="btns bloco" style="justify-content:space-between"><a class="btn claro" href="#v-${ant.id}">Anterior: ${esc(ant.nome)}</a><a class="btn claro" href="#v-${prox.id}">Próxima: ${esc(prox.nome)}</a></div>`;
  }

  function pagEtapa(eid) {
    const e = E[eid], i = ETAPAS.indexOf(e);
    const ant = ETAPAS[i - 1], prox = ETAPAS[i + 1];
    const ds = eid === "escolhas" ? DEC.filter((d) => d.e === "escolhas") : decsDe(null, eid);
    const blocos = VERT.map((v) => `<section class="cartao etapa-v bloco" style="--vc:${v.cor};margin-top:16px">
        <h3><a href="#v-${v.id}-${eid}" style="font-size:17px;font-family:var(--display);font-weight:800;text-decoration:none">${esc(v.nome)}</a>${controleCasa(v.id, eid)}</h3>
        ${conteudo(v.id, eid, true)}
        <div style="margin-top:14px">${blocoComentarios(`s-${v.id}-${eid}`, true)}</div></section>`).join("");
    const totalFin = eid !== "orcamento" ? "" : S.canEdit ? tabelaFin() : `<div class="cartao bloco" style="margin-top:16px"><p class="sem">Os números de orçamento ficam visíveis só para as sócias e a Cintia.</p></div>`;
    return `<header class="cab"><span class="olho">Etapa ${e.n} de ${ETAPAS.length}</span><h1>${esc(e.nome)}: ${esc(e.pergunta)}</h1></header>
      <div class="guia"><div class="h4">Perguntas que esta etapa responde</div>${lista(e.guia.map(esc))}
        ${ds.length ? `<p><a href="#decs-etapa" data-acao="ir-secao" data-alvo="decs-etapa">Ir para as ${ds.length} decisões desta etapa</a></p>` : ""}</div>
      ${totalFin}${blocos}
      ${ds.length ? `<section class="bloco" id="decs-etapa"><h2>Decisões desta etapa</h2><p class="sub">Abra uma decisão para ver as opções, a recomendação e os comentários.</p><div class="decs">${ds.map(cartaoDec).join("")}</div></section>` : ""}
      <div class="btns bloco" style="justify-content:space-between">${ant ? `<a class="btn claro" href="#e-${ant.id}">Anterior: ${esc(ant.nome)}</a>` : "<span></span>"}${prox ? `<a class="btn claro" href="#e-${prox.id}">Próxima: ${esc(prox.nome)}</a>` : ""}</div>`;
  }

  function tabelaFin() {
    let t = { fat2026: 0, meta2027: 0, invest2027: 0 };
    const linhas = VERT.map((v) => {
      const f = S.fin[v.id] || {};
      ["fat2026", "meta2027", "invest2027"].forEach((k) => { if (typeof f[k] === "number") t[k] += f[k]; });
      return `<tr><td>${esc(v.nome)}</td><td class="v">${brl(f.fat2026) || "a preencher"}</td><td class="v">${brl(f.meta2027) || "a preencher"}</td><td class="v">${brl(f.invest2027) || "a preencher"}</td></tr>`;
    }).join("");
    return `<div class="cartao financeiro bloco" style="margin-top:16px"><div class="h4">Consolidado financeiro (só editoras veem)</div>
      <div class="tabela-caixa" style="border:0"><table class="tab fin-tab"><thead><tr><th>Vertente</th><th style="text-align:right">Faturamento 2026</th><th style="text-align:right">Meta 2027</th><th style="text-align:right">Investimento 2027</th></tr></thead>
      <tbody>${linhas}<tr><td><b>Total</b></td><td class="v"><b>${brl(t.fat2026)}</b></td><td class="v"><b>${brl(t.meta2027)}</b></td><td class="v"><b>${brl(t.invest2027)}</b></td></tr></tbody></table></div></div>`;
  }

  function pagDecisoes() {
    const f = S.filtroDec;
    let ds = DEC.filter((d) => f.v === "todas" || (f.v.startsWith("a:") ? d.area === f.v.slice(2) : d.v.includes(f.v)));
    ds = ds.filter((d) => { const st = decInfo(d).status; return f.st === "todas" || (f.st === "abertas" ? st !== "decidida" : st === f.st); });
    const ordem = (d) => { const p = PRIORIDADE.indexOf(d.id); return decInfo(d).status === "decidida" ? 1000 + DEC.indexOf(d) : p < 0 ? 500 : p; };
    ds.sort((a, b) => ordem(a) - ordem(b));
    const fv = [["todas", "Todas as vertentes", null]].concat(VERT.map((v) => [v.id, v.curto, v.cor]));
    const fs = [["abertas", "A decidir"], ["em-discussao", "Em discussão"], ["decidida", "Decididas"], ["todas", "Todas"]];
    const n = DEC.filter((d) => decInfo(d).status === "decidida").length;
    return `<header class="cab"><span class="olho">Decisões</span><h1>${n} de ${DEC.length} decisões tomadas</h1>
        <p>As que faltam estão na ordem que recomendamos decidir: primeiro o que destrava a plataforma e a formação. Abra uma decisão para escolher uma opção, anotar condições ou comentar.</p></header>
      <div class="filtros" role="group" aria-label="Filtrar por vertente">${fv.map(([id, r, cor]) => `<button type="button" class="filtro${f.v === id ? " on" : ""}" data-acao="filtro-dec-v" data-id="${id}" aria-pressed="${f.v === id}">${cor ? `<i class="pt" style="background:${cor}"></i>` : ""}${esc(r)}</button>`).join("")}</div>
      <div class="filtros" role="group" aria-label="Filtrar por área de apoio">${Object.entries(ROT_AREA).map(([id, r]) => `<button type="button" class="filtro${f.v === "a:" + id ? " on" : ""}" data-acao="filtro-dec-v" data-id="a:${id}" aria-pressed="${f.v === "a:" + id}">${r}</button>`).join("")}</div>
      <div class="filtros" role="group" aria-label="Filtrar por situação">${fs.map(([id, r]) => `<button type="button" class="filtro${f.st === id ? " on" : ""}" data-acao="filtro-dec-st" data-id="${id}" aria-pressed="${f.st === id}">${r}</button>`).join("")}</div>
      <div class="decs">${ds.map(cartaoDec).join("") || `<p class="sem">Nenhuma decisão com esse filtro.</p>`}</div>`;
  }

  function pagMercado() {
    const fv = [["todas", "Todas as vertentes", null]].concat(VERT.map((v) => [v.id, v.curto, v.cor]));
    const cs = CONC.filter((c) => S.filtroConc === "todas" || c.v.includes(S.filtroConc));
    return `<header class="cab"><span class="olho">Mercado e concorrentes</span><h1>O mercado em que a Mentorei joga</h1>
        <p>Números gerais e o diretório de concorrentes e referências. Cada vertente traz os números e os concorrentes dela na etapa Mercado e concorrência.</p></header>
      <div class="numeros">${MERCADO_GERAL.map(([n, t, f]) => `<div class="numero"><b>${esc(n)}</b><span>${esc(t)}</span>${fonte(f)}</div>`).join("")}</div>
      <section class="bloco"><h2>Diretório (${cs.length})</h2><p class="sub">Filtre pela vertente que quer analisar.</p>
        <div class="filtros" role="group" aria-label="Filtrar por vertente">${fv.map(([id, r, cor]) => `<button type="button" class="filtro${S.filtroConc === id ? " on" : ""}" data-acao="filtro-conc" data-id="${id}" aria-pressed="${S.filtroConc === id}">${cor ? `<i class="pt" style="background:${cor}"></i>` : ""}${esc(r)}</button>`).join("")}</div>
        <div class="concs">${cs.map(cartaoConc).join("")}</div></section>
      <section class="bloco"><h2>Estudos completos</h2><p class="sub">Abrem no Claude da Juliana.</p>${lista([`<a href="${FONTES.benchmark.u}" target="_blank" rel="noopener">${esc(FONTES.benchmark.t)}</a>`, `<a href="${FONTES.mls.u}" target="_blank" rel="noopener">${esc(FONTES.mls.t)}</a>`])}</section>`;
  }

  function pagFontes() {
    const itens = Object.values(FONTES).filter((f) => f.u).sort((a, b) => a.t.localeCompare(b.t, "pt-BR"));
    return `<header class="cab"><span class="olho">Fontes</span><h1>De onde vêm os números</h1>
        <p>Pesquisas de mercado, sites dos concorrentes e os nossos próprios dados. Quando um número é conta nossa, ele aparece marcado assim no texto.</p></header>
      <div class="cartao"><ol class="lista fontes-lista" style="padding-left:22px">${itens.map((f) => `<li><a href="${esc(f.u)}" target="_blank" rel="noopener">${esc(f.t)}</a></li>`).join("")}</ol></div>`;
  }

  /* ---------- Áreas de apoio: modelos ---------- */
  const AR = Object.fromEntries(AREAS.map((a) => [a.id, a]));
  const ROT_AREA = { vendas: "Vendas", marketing: "Marketing", pessoas: "Pessoas", gestao: "Gestão" };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const CALC_PADRAO = {
    prosp: VENDAS.prospeccao.padrao, viagem: VENDAS.viagem.padrao, mkt: MKT.padrao, funil: MKT.funil.padrao, oper: OPER.padrao
  };
  S.calc = Object.assign(clone(CALC_PADRAO), { turmas: clone(OPER.turmas) });
  S.calcFin = { viagem: {}, marketing: {}, pessoas: {} };
  S.premissas = {}; S.finp = {}; S.calcMexido = {};

  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d || 0);
  function fmt(n, casas) {
    if (typeof n !== "number" || !isFinite(n)) return "0";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }
  const pct = (v) => num(v) / 100;
  function lerNum(s) {
    s = String(s || "").replace(/R\$|%|\s/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function modeloOper() {
    const p = S.calc.oper, turmas = S.calc.turmas;
    const durM = Math.max(1, Math.ceil(num(p.semanas, 12) / 4.33));
    const linhas = [];
    for (let m = 0; m < 12; m++) {
      const l = { ativos: 0, encontros: 0, praticas: 0, entregas: 0, plantoes: 0, mensagens: 0, boasvindas: 0, bancas: 0, formados: 0, comunidade: 0 };
      turmas.forEach((t) => {
        const ini = num(t.mes), n = num(t.alunos), fim = ini + durM;
        if (m >= ini && m < fim) {
          l.ativos += n;
          l.encontros += num(p.semanas) * num(p.encSem) / durM;
          l.praticas += n * num(p.praticas) / durM;
          l.entregas += n * num(p.entregas) / durM;
          l.plantoes += num(p.semanas) / 2 * num(p.plantaoQuinz) / durM;
        }
        if (m === ini) l.boasvindas += n;
        if (m === fim - 1) l.bancas += n;
        if (m >= fim) l.formados += n;
      });
      l.mensagens = l.ativos * num(p.contatosSem) * 4.33;
      l.chamados = l.formados * num(p.supChamados);
      l.comunidade = l.formados ? 1 : 0;
      l.h = {
        fac: l.encontros * (num(p.encH) + num(p.encPrep)) + l.plantoes * num(p.plantaoH),
        sup: l.praticas * num(p.revH) + l.entregas * num(p.corrMin) / 60 + l.bancas * num(p.bancaMin) / 60,
        ops: l.encontros * num(p.encPos) + l.mensagens * num(p.contatoMin) / 60 + l.boasvindas * num(p.onbH),
        plat: l.chamados * num(p.supMinCh) / 60 + l.comunidade * num(p.comunidadeH)
      };
      l.horas = l.h.fac + l.h.sup + l.h.ops + l.h.plat;
      l.atividades = l.encontros + l.praticas + l.entregas + l.plantoes + l.mensagens + l.boasvindas + l.bancas + l.chamados + l.comunidade;
      linhas.push(l);
    }
    return linhas;
  }
  function mesesCaptacao() {
    const n = Math.max(0, Math.round(num(S.calc.mkt.mesesCaptacao, 2))), set = new Set();
    S.calc.turmas.forEach((t) => { if (t.vendida) return; for (let k = 1; k <= n; k++) { const m = num(t.mes) - k; if (m >= 0 && m < 12) set.add(m); } });
    return set;
  }
  const ehHoras = (a) => /\(horas\)/.test(a[2]);
  function modeloMkt() {
    const camp = mesesCaptacao(), fator = 1 + pct(S.calc.mkt.revisao), hm = num(S.calc.mkt.horasMes, 140) || 140;
    return MESES.map((_, m) => {
      const h = {}; let entregas = 0;
      MKT.atividades.forEach((a) => {
        if (a[6] && !camp.has(m)) return;
        if (!ehHoras(a)) entregas += a[3];
        Object.entries(a[5]).forEach(([p, f]) => { h[p] = (h[p] || 0) + a[3] * a[4] * f * fator; });
      });
      const total = Object.values(h).reduce((x, y) => x + y, 0);
      return { m, captacao: camp.has(m), entregas, h, total, pessoas: total / hm };
    });
  }
  function funilFormacao() {
    const f = S.calc.funil;
    const vagas = S.calc.turmas.filter((t) => !t.vendida).reduce((x, t) => x + num(t.alunos), 0);
    const taxa = pct(f.aplicacao) * pct(f.call) * pct(f.venda);
    const calls = pct(f.venda) ? vagas / pct(f.venda) : 0;
    const aplicacoes = pct(f.call) ? calls / pct(f.call) : 0;
    const leads = pct(f.aplicacao) ? aplicacoes / pct(f.aplicacao) : 0;
    const meses = Math.max(1, mesesCaptacao().size);
    return { vagas, taxa, calls, aplicacoes, leads, meses, callsSemana: calls / (meses * 4.33) };
  }
  function modeloProsp() {
    const p = S.calc.prosp, base = VENDAS.prospeccao.base;
    const pessoas = num(p.contasMes) * num(p.contatosConta), toques = pessoas * num(p.toques);
    const reunioesMes = num(p.contasMes) * pct(p.convReuniao);
    const mesesBase = num(p.contasMes) ? base / num(p.contasMes) : 0;
    const contasAno = Math.min(base, num(p.contasMes) * 12);
    const reunioesAno = contasAno * pct(p.convReuniao), propostasAno = reunioesAno * pct(p.convProposta), contratosAno = propostasAno * pct(p.convContrato);
    return { pessoas, toques, toquesDia: toques / 21, reunioesMes, mesesBase, contasAno, reunioesAno, propostasAno, contratosAno };
  }
  function custoViagem(divididas) {
    const v = S.calc.viagem, f = S.calcFin.viagem;
    const carros = divididas ? num(v.carrosDivididas) : num(v.carros);
    const visitas = divididas ? num(v.visitasDivididas) : num(v.visitas);
    const itens = [
      ["Passagens (ida e volta)", num(v.socias) * 2 * num(f.trecho)],
      ["Hotel", num(v.quartos) * num(v.noites) * num(f.diaria)],
      ["Carro", carros * num(v.dias) * num(f.carroDia)],
      ["Alimentação", num(v.socias) * num(v.dias) * num(f.refeicaoDia)],
      ["Material para as visitas", visitas * num(f.materialVisita)],
      ["Dias de entrega que as sócias deixam de fazer", num(v.socias) * num(v.dias) * num(f.oportunidadeDia)]
    ];
    return { itens, total: itens.reduce((x, i) => x + i[1], 0), visitas };
  }
  function resultadoViagem(visitas, c, custo) {
    const f = S.calcFin.viagem;
    const propostas = visitas * pct(c.prop), contratos = propostas * pct(c.cont);
    const receita = contratos * num(f.ticket), margem = receita * pct(f.margem);
    const margem2 = margem * 0.92;
    return { propostas, contratos, receita, margem, roi: custo ? (margem - custo) / custo : 0, roi2: custo ? (margem + margem2 - custo) / custo : 0 };
  }
  function modeloInvest() {
    const fp = S.calcFin.pessoas || {}, fm = S.calcFin.marketing || {}, fv = S.calcFin.viagem || {};
    const fator = num(fp.fatorClt, 1.6) || 1.6;
    const sal = fp.salarios || {};
    const linhasPessoas = PESSOAS.map((r) => {
      const base = num(sal[r.id]);
      const mensal = /^CLT/.test(r.tipo) ? base * fator : base;
      const meses = MESES.map((_, m) => (m >= r.inicio ? mensal : 0));
      return { r, base, mensal, meses, ano: meses.reduce((x, y) => x + y, 0) };
    });
    const fun = funilFormacao(), camp = [...mesesCaptacao()];
    const midiaForm = MESES.map((_, m) => (camp.includes(m) ? fun.leads * num(fm.cpl) / camp.length : 0));
    const midiaDig = MESES.map(() => num(fm.midiaDigitalMes));
    const ferr = MESES.map(() => num(fm.ferramentasMes));
    const cv = custoViagem(true).total, nv = num(fm.viagensAno, 4);
    const viagens = MESES.map((_, m) => (nv && m % Math.max(1, Math.round(12 / nv)) === 1 ? cv : 0));
    const comissao = fun.vagas * num(fm.precoFormacao) * pct(fp.comissaoCloser);
    const grupos = [
      ["Pessoas", MESES.map((_, m) => linhasPessoas.reduce((x, l) => x + l.meses[m], 0))],
      ["Comissão das vendas da formação", MESES.map((_, m) => (camp.includes(m) ? comissao / camp.length : 0))],
      ["Mídia da captação da formação", midiaForm],
      ["Mídia dos produtos digitais", midiaDig],
      ["Viagens comerciais", viagens],
      ["Ferramentas e sistemas", ferr]
    ];
    const total = MESES.map((_, m) => grupos.reduce((x, g) => x + g[1][m], 0));
    return { linhasPessoas, grupos, total, fator, viagemCusto: cv, nv };
  }

  /* ---------- Áreas de apoio: peças ---------- */
  function campo(grupo, k, rot, opts) {
    const o = opts || {};
    const fonteVal = o.fin ? S.calcFin[grupo] : S.calc[grupo];
    const v = fonteVal && fonteVal[k];
    const val = typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "";
    return `<label class="rot">${esc(rot)}<input type="text" inputmode="decimal" ${o.fin ? "data-calcfin" : "data-calc"}="${grupo}" data-k="${k}" value="${esc(val)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}></label>`;
  }
  function blocoCampos(grupo, rotulos, chaves, opts) {
    return `<div class="calc-campos">${(chaves || Object.keys(rotulos)).map((k) => campo(grupo, k, rotulos[k], opts)).join("")}</div>`;
  }
  function botoesPremissa(grupos) {
    if (!S.canEdit) return `<p class="aviso-proposta">Você pode mexer nos números para simular; eles não ficam salvos.</p>`;
    return `<div class="btns" style="margin-top:10px"><button type="button" class="btn mini" data-acao="salvar-premissa" data-grupos="${grupos}">Salvar como padrão para todas</button>
      <button type="button" class="btn mini claro" data-acao="restaurar-premissa" data-grupos="${grupos}">Voltar ao padrão salvo</button></div>`;
  }
  function saida(id, html) { return `<div data-saida="${id}">${html}</div>`; }
  function controleArea(id) {
    const st = (S.casas[`ar-${id}`] && ROT_CASA[S.casas[`ar-${id}`].status]) ? S.casas[`ar-${id}`].status : "vazia";
    if (S.canEdit) return `<label class="estado-casa">Situação <select data-acao="casa-livre" data-id="ar-${id}">${Object.entries(ROT_CASA).map(([k, l]) => `<option value="${k}"${k === st ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    return `<span class="estado-casa">${badgeCasa(st)}</span>`;
  }
  function cabArea(id, titulo, texto) {
    return `<header class="cab vcab" style="--vc:${AR[id].cor}"><span class="olho">Área de apoio</span>
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end"><h1>${esc(titulo)}</h1>${controleArea(id)}</div><p>${texto}</p></header>`;
  }
  function decsArea(area, titulo) {
    const ds = DEC.filter((d) => d.area === area);
    return ds.length ? `<section class="bloco"><h2>${esc(titulo || "Decisões desta área")}</h2><div class="decs">${ds.map(cartaoDec).join("")}</div></section>` : "";
  }
  function numerosMercado(lista) {
    return `<div class="numeros">${lista.map(([n, t, f]) => `<div class="numero"><b>${esc(n)}</b><span>${esc(t)}</span>${f ? fonte(f) : ""}</div>`).join("")}</div>`;
  }
  function barras(valores, rotulos, cor, sufixo) {
    const max = Math.max(1, ...valores);
    return `<div class="barras" role="img" aria-label="${esc(sufixo || "")}">${valores.map((v, i) => `<div class="barra"><span class="bv">${fmt(v)}</span><i style="height:${Math.round(v / max * 100)}%;background:${cor}"></i><span class="bm">${rotulos[i]}</span></div>`).join("")}</div>`;
  }
  const soEditoras = (html) => (S.canEdit ? html : `<div class="cartao"><p class="sem">Os valores em reais desta parte ficam visíveis só para as sócias e a Cintia.</p></div>`);

  /* ---------- Vendas ---------- */
  function saidaProsp() {
    const r = modeloProsp();
    return `<div class="kpis" style="margin-top:12px">
      <div class="kpi"><b>${fmt(r.toquesDia)}</b><span>contatos por dia útil da SDR (${fmt(r.toques)} no mês, para ${fmt(r.pessoas)} pessoas)</span></div>
      <div class="kpi"><b>${fmt(r.mesesBase, 1)} meses</b><span>para passar por toda a base de ${VENDAS.prospeccao.base} cooperativas</span></div>
      <div class="kpi"><b>${fmt(r.reunioesMes, 1)}</b><span>reuniões de diagnóstico por mês vindas da prospecção</span></div>
      <div class="kpi"><b>${fmt(r.reunioesAno)} → ${fmt(r.propostasAno)} → ${fmt(r.contratosAno, 1)}</b><span>reuniões, propostas e contratos novos no ano, sem contar clientes atuais e viagens</span></div>
    </div>`;
  }
  function saidaViagem() {
    const v = S.calc.viagem;
    const jun = custoViagem(false), div = custoViagem(true);
    const cen = VENDAS.viagem.cenarios;
    const contagem = `<div class="tabela-caixa" style="margin-top:12px"><table class="tab"><thead><tr><th>Cenário</th><th>Visita vira proposta</th><th>Proposta vira contrato</th><th>Juntas: ${fmt(num(v.visitas))} visitas</th><th>Rotas separadas: ${fmt(num(v.visitasDivididas))} visitas</th></tr></thead><tbody>
      ${cen.map((c) => { const a = resultadoViagem(num(v.visitas), c, 0), b = resultadoViagem(num(v.visitasDivididas), c, 0); return `<tr><td><b>${c.nome}</b></td><td>${c.prop}%</td><td>${c.cont}%</td><td>${fmt(a.propostas, 1)} propostas, ${fmt(a.contratos, 1)} contratos</td><td>${fmt(b.propostas, 1)} propostas, ${fmt(b.contratos, 1)} contratos</td></tr>`; }).join("")}
      </tbody></table></div>`;
    if (!S.canEdit) return contagem + `<p class="aviso-proposta">Custos, ticket e ROI em reais aparecem só para as editoras.</p>`;
    const f = S.calcFin.viagem;
    const temTicket = num(f.ticket) > 0;
    const pe = num(f.ticket) * pct(f.margem) ? jun.total / (num(f.ticket) * pct(f.margem)) : 0;
    const linhaR = (c) => {
      const a = resultadoViagem(jun.visitas, c, jun.total), b = resultadoViagem(div.visitas, c, div.total);
      const roi = (x) => `<b style="color:${x >= 0 ? "var(--ok)" : "var(--alerta)"}">${fmt(x * 100)}%</b>`;
      return `<tr><td><b>${c.nome}</b></td><td>${brl(a.receita)}</td><td>${roi(a.roi)} <span class="sem">(2 anos: ${fmt(a.roi2 * 100)}%)</span></td><td>${brl(b.receita)}</td><td>${roi(b.roi)} <span class="sem">(2 anos: ${fmt(b.roi2 * 100)}%)</span></td></tr>`;
    };
    return contagem + `<div class="grade g2" style="margin-top:12px">
        <div class="cartao financeiro"><div class="h4">Custo da viagem</div><table class="tab fin-tab" style="min-width:0"><tbody>
          ${jun.itens.map((it, i) => `<tr><td>${esc(it[0])}</td><td class="v">${brl(it[1])}</td><td class="v sem">${brl(div.itens[i][1])}</td></tr>`).join("")}
          <tr><td><b>Total</b></td><td class="v"><b>${brl(jun.total)}</b></td><td class="v"><b>${brl(div.total)}</b></td></tr></tbody></table>
          <p class="aviso-proposta">Primeira coluna: sócias juntas. Segunda: rotas separadas.</p></div>
        <div class="cartao financeiro"><div class="h4">Ponto de equilíbrio</div>
          <p style="font-size:15px">${temTicket ? `Com ticket médio de <b>${brl(num(f.ticket))}</b> e margem de <b>${fmt(num(f.margem))}%</b>, <b>${fmt(pe, 2)} contrato</b> paga a viagem com as sócias juntas. Um único contrato cobre a viagem ${fmt(pe ? 1 / pe : 0, 1)} vezes.` : "Preencha o ticket médio e a margem para ver quantos contratos pagam a viagem."}</p></div>
      </div>
      <div class="tabela-caixa" style="margin-top:12px"><table class="tab"><thead><tr><th>Cenário</th><th>Receita (juntas)</th><th>ROI no 1º ano (juntas)</th><th>Receita (rotas separadas)</th><th>ROI no 1º ano (rotas)</th></tr></thead><tbody>${cen.map(linhaR).join("")}</tbody></table></div>`;
  }
  function pagVendas() {
    const p = VENDAS.prospeccao;
    const estrutura = `<div class="tabela-caixa"><table class="tab"><thead><tr><th>Vertente</th><th>Quem compra</th><th>Canal</th><th>Quem vende</th><th>Ciclo</th><th>Número que manda</th></tr></thead><tbody>
      ${VENDAS.estrutura.map((e) => `<tr><td>${chipV(e.v, true)}</td><td>${esc(e.quem)}</td><td>${esc(e.canal)}</td><td>${esc(e.vende)}</td><td>${esc(e.ciclo)}</td><td>${esc(e.numero)}</td></tr>`).join("")}</tbody></table></div>`;
    const finViagem = S.canEdit ? `<div class="h4" style="margin-top:14px">Valores (só editoras veem)</div><p class="aviso-proposta" style="margin-top:0;margin-bottom:8px">Começam com premissas de mercado. Troquem pelos números reais da Mentorei e cliquem em "Salvar como padrão para todas".</p>${blocoCampos("viagem", { trecho: "Passagem por trecho com taxas (R$)", diaria: "Diária de hotel (R$)", carroDia: "Carro por dia (R$)", refeicaoDia: "Alimentação por pessoa por dia (R$)", materialVisita: "Material por visita (R$)", oportunidadeDia: "Valor do dia de entrega de uma sócia (R$, opcional)", ticket: "Ticket médio de um contrato (R$)", margem: "Margem de contribuição (%)" }, null, { fin: true })}<p class="aviso-proposta">De onde vem o ticket inicial: uma cooperativa de crédito média tem cerca de 196 empregados (134 mil em 682 cooperativas) e, na média nacional de R$ 1.199 por pessoa, investe perto de R$ 235 mil por ano em T&D. Um programa de liderança costuma ser uma fatia disso. ${fonte("mundocoop")} ${fonte("abtd")}</p>` : "";
    return `${cabArea("vendas", "Vendas", "Como cada vertente vende, como trabalhar a base de cooperativas, onde as sócias devem pôr o tempo delas e como medir o retorno das viagens.")}
      <section class="bloco"><h2>Estrutura comercial por vertente</h2><p class="sub">Cada vertente vende de um jeito diferente. O T&D é venda consultiva e longa; a plataforma e os produtos digitais vendem sozinhos com boa página; a formação fica no meio.</p>${estrutura}</section>
      <section class="bloco"><h2>Prospecção das ${p.base} cooperativas</h2><p class="sub">${esc(p.texto)}</p>
        <div class="tabela-caixa"><table class="tab"><thead><tr><th>Camada</th><th>Quem está nela</th><th>Como trabalhar</th></tr></thead><tbody>${p.camadas.map((c) => `<tr><td><b>${c[0]}</b></td><td>${esc(c[1])}</td><td>${esc(c[2])}</td></tr>`).join("")}</tbody></table></div>
        <div class="cartao" style="margin-top:12px"><div class="h4">Simulador da prospecção</div>${blocoCampos("prosp", p.rotulos)}${saida("prosp", saidaProsp())}${botoesPremissa("prosp")}</div>
        <div style="margin-top:12px">${numerosMercado([["6% a 10%", "é a faixa considerada boa de conversão de prospecção em reunião agendada.", "agendor"], ["21%", "é a taxa média de vitória em vendas B2B.", "winrate"], ["8 a 12", "contatos em 14 a 21 dias úteis é a cadência de referência em 2026.", "cadencia"], ["742", "cooperativas de crédito singulares no fim de 2025, segundo o Banco Central.", "sncc"]])}</div>
      </section>
      <section class="bloco"><h2>Agenda estratégica das sócias</h2><p class="sub">O que só as sócias podem fazer e que mais traz contrato. O resto vai para a SDR, o marketing e a operação.</p>
        <div class="tabela-caixa"><table class="tab"><thead><tr><th>Atividade</th><th>Frequência sugerida</th><th>Por que</th></tr></thead><tbody>${VENDAS.socias.map((s) => `<tr><td><b>${esc(s[0])}</b></td><td>${esc(s[1])}</td><td>${esc(s[2])}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="bloco" id="viagem"><h2>ROI das viagens comerciais</h2><p class="sub">Exemplo: as três sócias vão para outro estado e fazem 10 visitas. A calculadora compara com as sócias em rotas separadas, que fazem mais visitas na mesma viagem.</p>
        <div class="grade g2"><div class="cartao"><div class="h4">Como calcular</div><ol class="lista" style="padding-left:20px">${VENDAS.viagem.metodo.map((m) => `<li>${esc(m)}</li>`).join("")}</ol></div>
          <div class="cartao"><div class="h4">O que esperar de 10 visitas</div><p>No cenário realista, 10 visitas geram cerca de 4 propostas e 1 contrato novo em até 12 meses. Como um contrato costuma valer bem mais que a viagem, um único fechamento já paga a ida. O ganho que não entra na conta: relação com o Sescoop e a central do estado, convites para palestras e indicação de cooperativas vizinhas.</p>
          <div style="margin-top:10px">${numerosMercado([["R$ 777", "por trecho foi a tarifa aérea doméstica média em agosto de 2026, sem taxas.", "anac"], ["R$ 469", "foi a diária média dos hotéis do FOHB em fevereiro de 2026.", "fohb"]])}</div></div></div>
        <div class="cartao" style="margin-top:12px"><div class="h4">Calculadora da viagem</div>${blocoCampos("viagem", VENDAS.viagem.rotulos)}${finViagem}${saida("viagem", saidaViagem())}${botoesPremissa("viagem")}</div>
      </section>
      ${decsArea("vendas")}
      <section class="bloco">${blocoComentarios("a-vendas", false)}</section>`;
  }

  /* ---------- Marketing ---------- */
  function saidaMkt() {
    const ms = modeloMkt();
    const pico = ms.reduce((a, b) => (b.total > a.total ? b : a), ms[0]);
    const normal = ms.find((x) => !x.captacao) || ms[0];
    const papeis = Object.keys(MKT.papeis);
    const tabPapeis = `<div class="tabela-caixa"><table class="tab"><thead><tr><th>Especialidade</th><th>Horas num mês normal</th><th>Horas num mês de captação</th><th>Pessoas no pico</th></tr></thead><tbody>
      ${papeis.map((p) => `<tr><td>${esc(MKT.papeis[p])}</td><td>${fmt(normal.h[p] || 0)}</td><td>${fmt(pico.h[p] || 0)}</td><td>${fmt((pico.h[p] || 0) / (num(S.calc.mkt.horasMes, 140) || 140), 1)}</td></tr>`).join("")}
      <tr><td><b>Total</b></td><td><b>${fmt(normal.total)}</b></td><td><b>${fmt(pico.total)}</b></td><td><b>${fmt(pico.pessoas, 1)}</b></td></tr></tbody></table></div>`;
    return `<div class="kpis" style="margin-top:12px">
        <div class="kpi"><b>${fmt(normal.entregas)} a ${fmt(pico.entregas)}</b><span>entregas por mês (peças, páginas, e-mails, vídeos)</span></div>
        <div class="kpi"><b>${fmt(normal.total)} a ${fmt(pico.total)} h</b><span>horas de marketing por mês</span></div>
        <div class="kpi"><b>${fmt(normal.pessoas, 1)} a ${fmt(pico.pessoas, 1)}</b><span>pessoas em tempo integral</span></div>
        <div class="kpi"><b>${ms.filter((x) => x.captacao).map((x) => MESES[x.m]).join(", ") || "nenhum"}</b><span>meses de captação das turmas</span></div>
      </div>
      <div class="cartao" style="margin-top:12px"><div class="h4">Horas de marketing por mês</div>${barras(ms.map((x) => Math.round(x.total)), MESES, "var(--bege-deep)", "Horas de marketing por mês")}</div>
      <div style="margin-top:12px">${tabPapeis}</div>`;
  }
  function saidaFunil() {
    const r = funilFormacao();
    const fm = S.calcFin.marketing;
    const midia = r.leads * num(fm.cpl);
    return `<div class="kpis" style="margin-top:12px">
        <div class="kpi"><b>${fmt(r.vagas)}</b><span>vagas a vender (a turma de janeiro já está completa)</span></div>
        <div class="kpi"><b>${fmt(r.leads)}</b><span>leads necessários (${fmt(r.taxa * 100, 2)}% viram matrícula)</span></div>
        <div class="kpi"><b>${fmt(r.aplicacoes)}</b><span>aplicações</span></div>
        <div class="kpi"><b>${fmt(r.calls)}</b><span>calls de vendas, cerca de ${fmt(r.callsSemana, 1)} por semana</span></div>
      </div>${S.canEdit ? `<p class="cartao financeiro" style="margin-top:12px">Mídia para a captação: <b>${brl(midia) || "preencha o custo por lead"}</b>${num(fm.precoFormacao) && midia ? `, ou ${fmt(midia / Math.max(1, r.vagas * num(fm.precoFormacao)) * 100, 1)}% da receita das ${fmt(r.vagas)} vagas` : ""}.</p>` : ""}`;
  }
  function pagMarketing() {
    const ativ = `<div class="tabela-caixa"><table class="tab"><thead><tr><th>Frente</th><th>Atividade</th><th>Por mês</th><th>Horas cada</th><th>Quando</th></tr></thead><tbody>
      ${MKT.atividades.map((a) => `<tr><td>${esc(a[1])}</td><td>${esc(a[2])}</td><td>${ehHoras(a) ? `${a[3]} h` : a[3]}</td><td>${ehHoras(a) ? "" : fmt(a[4], 2)}</td><td>${a[6] ? "Só nas captações" : "Todo mês"}</td></tr>`).join("")}</tbody></table></div>`;
    return `${cabArea("marketing", "Marketing", "Tudo o que precisa ser produzido para as seis vertentes, quantas pessoas isso exige e o funil para encher as turmas da formação.")}
      <section class="bloco"><h2>Volume de trabalho</h2><p class="sub">Estimativa por atividade, já contando o uso de IA que a Mentorei faz hoje nos criativos. Os meses de captação das turmas concentram o pico.</p>
        <div class="cartao"><div class="h4">Premissas</div>${blocoCampos("mkt", MKT.rotulos)}${botoesPremissa("mkt")}</div>
        ${saida("mkt", saidaMkt())}</section>
      <section class="bloco"><h2>As atividades</h2><p class="sub">Quantidades de referência por mês. Para a captação, o mercado recomenda de 15 a 30 conceitos de criativo distintos por mês no Meta.</p>${ativ}
        <div style="margin-top:12px">${numerosMercado([["15 a 30", "conceitos de criativo distintos por mês superam contas com 3 a 5.", "andromeda"], ["R$ 8 a R$ 25", "é o custo por lead de cursos com página própria no Meta em 2026.", "cpl"], ["49%", "dos inscritos comparecem a uma aula ao vivo, em média.", "webinar"]])}</div></section>
      <section class="bloco"><h2>Quantas pessoas e de quais especialidades</h2><p class="sub">Três formatos possíveis para o time.</p>
        <div class="grade g3">${MKT.equipes.map((e) => `<div class="cartao"><div class="h4">${esc(e.nome)}</div><p><b>${esc(e.pessoas)}</b></p><p class="sem" style="margin-top:6px">${esc(e.quando)}</p></div>`).join("")}</div></section>
      <section class="bloco"><h2>Funil da formação: turmas 2 e 3</h2><p class="sub">Aula ao vivo, aplicação e call de vendas, o formato mais comum para vendas acima de R$ 5 mil. ${fonte("highticket")}</p>
        <div class="cartao">${blocoCampos("funil", MKT.funil.rotulos)}${S.canEdit ? `<div class="h4" style="margin-top:14px">Valores (só editoras veem)</div><p class="aviso-proposta" style="margin-top:0;margin-bottom:8px">Começam com premissas de mercado. Troquem pelos números reais da Mentorei e cliquem em "Salvar como padrão para todas".</p>${blocoCampos("marketing", { cpl: "Custo por lead (R$)", precoFormacao: "Preço da formação (R$)", midiaDigitalMes: "Mídia dos produtos digitais por mês (R$)", ferramentasMes: "Ferramentas e sistemas por mês (R$)", viagensAno: "Viagens comerciais no ano" }, null, { fin: true })}` : ""}${saida("funil", saidaFunil())}${botoesPremissa("funil marketing")}</div></section>
      ${decsArea("marketing")}
      <section class="bloco">${blocoComentarios("a-marketing", false)}</section>`;
  }

  /* ---------- Operação da formação ---------- */
  function saidaOper() {
    const ls = modeloOper(), hm = num(S.calc.mkt.horasMes, 140) || 140;
    const pico = ls.reduce((a, b) => (b.horas > a.horas ? b : a), ls[0]);
    const tot = ls.reduce((x, l) => x + l.atividades, 0);
    const linha = (rot, f, casas) => `<tr><td>${rot}</td>${ls.map((l) => `<td>${fmt(f(l), casas || 0)}</td>`).join("")}</tr>`;
    return `<div class="kpis" style="margin-top:12px">
        <div class="kpi"><b>${fmt(ls.reduce((x, l) => x + l.boasvindas, 0))}</b><span>alunos no ano</span></div>
        <div class="kpi"><b>${fmt(tot)}</b><span>atividades da operação no ano</span></div>
        <div class="kpi"><b>${fmt(pico.horas)} h</b><span>no mês mais cheio (${MESES[ls.indexOf(pico)]})</span></div>
        <div class="kpi"><b>${fmt(ls[11].formados)}</b><span>mentores formados na plataforma em dezembro</span></div>
      </div>
      <div class="cartao" style="margin-top:12px"><div class="h4">Horas da operação por mês</div>${barras(ls.map((l) => Math.round(l.horas)), MESES, "#6E5E96", "Horas da operação por mês")}</div>
      <div class="tabela-caixa" style="margin-top:12px"><table class="tab mes-tab"><thead><tr><th>Atividade</th>${MESES.map((m) => `<th>${m}</th>`).join("")}</tr></thead><tbody>
        ${linha("Alunos em formação", (l) => l.ativos)}
        ${linha("Encontros ao vivo", (l) => l.encontros)}
        ${linha("Práticas para supervisionar", (l) => l.praticas)}
        ${linha("Entregas para corrigir", (l) => l.entregas)}
        ${linha("Plantões de dúvidas", (l) => l.plantoes)}
        ${linha("Mensagens de alunos", (l) => l.mensagens)}
        ${linha("Boas-vindas", (l) => l.boasvindas)}
        ${linha("Bancas de certificação", (l) => l.bancas)}
        ${linha("Mentores formados na plataforma", (l) => l.formados)}
        ${linha("Chamados de suporte dos mentores", (l) => l.chamados)}
        ${linha("Encontro da comunidade de formados", (l) => l.comunidade)}
        <tr class="sep"><td><b>Atividades no mês</b></td>${ls.map((l) => `<td><b>${fmt(l.atividades)}</b></td>`).join("")}</tr>
        ${Object.entries(OPER.papeis).map(([k, r]) => linha(`Horas: ${esc(r)}`, (l) => l.h[k])).join("")}
        <tr class="sep"><td><b>Horas no mês</b></td>${ls.map((l) => `<td><b>${fmt(l.horas)}</b></td>`).join("")}</tr>
        <tr><td><b>Pessoas em tempo integral</b></td>${ls.map((l) => `<td><b>${fmt(l.horas / hm, 1)}</b></td>`).join("")}</tr>
      </tbody></table></div>`;
  }
  function editorTurmas() {
    return `<div class="turmas">${S.calc.turmas.map((t, i) => `<div class="turma"><b>Turma ${i + 1}${t.vendida ? " (já vendida)" : ""}</b>
        <label class="rot">Começa em<select data-turma="${i}" data-k="mes">${MESES.map((m, j) => `<option value="${j}"${j === num(t.mes) ? " selected" : ""}>${m}</option>`).join("")}</select></label>
        <label class="rot">Alunos<input type="text" inputmode="numeric" data-turma="${i}" data-k="alunos" value="${num(t.alunos)}"></label>
        ${i > 0 ? `<button type="button" class="btn mini claro" data-acao="turma-remover" data-i="${i}">Remover</button>` : ""}</div>`).join("")}
      ${S.calc.turmas.length < 6 ? `<button type="button" class="btn mini claro" data-acao="turma-add">Adicionar turma</button>` : ""}</div>`;
  }
  function pagOperacao() {
    return `${cabArea("operacao", "Operação da formação", "Quanto trabalho as turmas de 2027 geram mês a mês: encontros, práticas supervisionadas, correções, atendimento, certificação e suporte aos formados na plataforma.")}
      <section class="bloco"><h2>Turmas</h2><p class="sub">Padrão: turma de 10 alunos em janeiro (já completa) e mais duas de 18 no 1º semestre, no meio da faixa de 15 a 20.</p>
        <div class="cartao">${editorTurmas()}${botoesPremissa("turmas")}</div></section>
      <section class="bloco"><h2>Como a formação funciona (premissas)</h2><p class="sub">Formato recomendado na decisão P15: conteúdo gravado, encontros ao vivo e prática supervisionada. Ajuste os números quando o desenho da formação estiver pronto.</p>
        <div class="cartao">${blocoCampos("oper", OPER.rotulos)}${botoesPremissa("oper")}</div></section>
      <section class="bloco"><h2>O que isso gera</h2>${saida("oper", saidaOper())}
        <div class="cartao" style="margin-top:12px"><div class="h4">Fora da conta acima</div>${lista(OPER.extras.map(esc))}</div></section>
      <section class="bloco">${blocoComentarios("a-operacao", false)}</section>`;
  }

  /* ---------- Pessoas ---------- */
  function saidaPessoas() {
    if (!S.canEdit) return "";
    const r = modeloInvest();
    const ano = r.total.reduce((x, y) => x + y, 0);
    return `<div class="tabela-caixa" style="margin-top:12px"><table class="tab mes-tab fin-tab"><thead><tr><th>Investimento</th>${MESES.map((m) => `<th>${m}</th>`).join("")}<th>Ano</th></tr></thead><tbody>
        ${r.grupos.map(([nome, vs]) => `<tr><td>${esc(nome)}</td>${vs.map((v) => `<td class="v">${v ? fmt(v / 1000, 1) : "0"}</td>`).join("")}<td class="v"><b>${fmt(vs.reduce((x, y) => x + y, 0) / 1000, 1)}</b></td></tr>`).join("")}
        <tr class="sep"><td><b>Total</b></td>${r.total.map((v) => `<td class="v"><b>${fmt(v / 1000, 1)}</b></td>`).join("")}<td class="v"><b>${fmt(ano / 1000, 1)}</b></td></tr>
      </tbody></table></div>
      <p class="aviso-proposta">Valores em milhares de reais. Pessoas CLT com fator de ${fmt(r.fator, 2)} sobre o salário (encargos, férias, 13º e benefícios). Viagens: ${fmt(r.nv)} no ano, ${brl(r.viagemCusto)} cada, com as sócias em rotas separadas. Comissão e mídia da formação distribuídas nos meses de captação.</p>
      <div class="cartao" style="margin-top:12px"><div class="h4">Pessoas: custo mensal quando a função está ativa</div><div class="tabela-caixa" style="border:0"><table class="tab fin-tab"><thead><tr><th>Função</th><th>Formato</th><th style="text-align:right">Valor de referência</th><th style="text-align:right">Custo mensal</th><th style="text-align:right">No ano</th></tr></thead><tbody>
        ${r.linhasPessoas.map((l) => `<tr><td>${esc(l.r.nome)}</td><td>${esc(l.r.tipo)}</td><td class="v">${brl(l.base) || "a preencher"}</td><td class="v">${brl(l.mensal)}</td><td class="v">${brl(l.ano)}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  function pagPessoas() {
    const tab = `<div class="tabela-caixa"><table class="tab"><thead><tr><th>Função</th><th>Área</th><th>A partir de</th><th>Formato</th><th>O que faz</th><th>Por que agora</th></tr></thead><tbody>
      ${PESSOAS.map((r) => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(r.area)}</td><td>${MESES[r.inicio]}</td><td>${esc(r.tipo)}</td><td>${esc(r.faz)}</td><td>${esc(r.porque)}</td></tr>`).join("")}</tbody></table></div>`;
    const sal = S.canEdit ? `<div class="cartao financeiro" style="margin-top:12px"><div class="h4">Valores de referência (só editoras veem)</div>
        <p class="aviso-proposta" style="margin-top:0">Salário mensal para funções CLT; valor mensal do contrato para prestadores. Referências de mercado nas fontes abaixo; troque pelos valores reais.</p>
        <div class="calc-campos">${PESSOAS.map((r) => `<label class="rot">${esc(r.nome)}<input type="text" inputmode="decimal" data-calcfin="pessoas" data-k="salarios.${r.id}" value="${num((S.calcFin.pessoas.salarios || {})[r.id]) ? num((S.calcFin.pessoas.salarios || {})[r.id]).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : ""}"></label>`).join("")}
        ${campo("pessoas", "fatorClt", "Fator de custo CLT sobre o salário", { fin: true })}${campo("pessoas", "comissaoCloser", "Comissão da consultora de vendas (%)", { fin: true })}</div>
        <p class="fonte" style="margin-top:8px">Referências: ${[["cs", "sucesso do cliente"], ["designer", "designer"], ["editor", "editor de vídeo"], ["sdr", "SDR"], ["rhmkt", "marketing digital"], ["rhinside", "executivo de contas e inside sales"], ["trafego", "tráfego"]].map(([k, r]) => fonte(k, r)).join(" ")}</p></div>` : "";
    return `${cabArea("pessoas", "Pessoas e investimentos", "Quem a Mentorei precisa contratar em 2027, em que ordem e formato, e quanto o ano custa somando pessoas, mídia, viagens e ferramentas.")}
      <section class="bloco"><h2>Estrutura de equipe proposta</h2><p class="sub">Contratação em ondas, puxada pela turma de janeiro, pelas captações e pela base de mentores na plataforma. A decisão P40 propõe que cada contratação dependa de uma meta anterior batida.</p>${tab}</section>
      <section class="bloco"><h2>Investimento em 2027</h2>${soEditoras(sal + saida("pessoas", saidaPessoas()) + botoesPremissa("pessoas"))}</section>
      ${decsArea("pessoas", "Decisões de pessoas")}${decsArea("gestao", "Decisões de gestão e finanças")}
      <section class="bloco">${blocoComentarios("a-pessoas", false)}</section>`;
  }

  /* ---------- O que mais pensar ---------- */
  function pagOutros() {
    return `${cabArea("outros", "O que mais pensar", "Temas que costumam ficar de fora e depois cobram a conta. Cada um tem situação, decisões ligadas e espaço para comentários.")}
      <div class="grade g2 bloco">${OUTROS.map((o) => {
        const st = (S.casas[`x-${o.id}`] && ROT_CASA[S.casas[`x-${o.id}`].status]) ? S.casas[`x-${o.id}`].status : "vazia";
        const ctrl = S.canEdit ? `<label class="estado-casa"><select data-acao="casa-livre" data-id="x-${o.id}" aria-label="Situação">${Object.entries(ROT_CASA).map(([k, l]) => `<option value="${k}"${k === st ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : badgeCasa(st);
        return `<article class="cartao" id="o-${o.id}" style="display:grid;gap:8px;align-content:start"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><h3 style="font-size:17px">${esc(o.titulo)}</h3>${ctrl}</div>
          <p>${esc(o.texto)} ${(o.fontes || []).map((f) => fonte(f)).join(" ")}</p>
          ${o.decs.length ? `<div class="chips">${o.decs.map((id) => `<a class="chip" href="#d-${id}">${id}: ${esc(D[id].titulo)}</a>`).join("")}</div>` : ""}
          ${blocoComentarios(`o-${o.id}`, true)}</article>`;
      }).join("")}</div>`;
  }

  function pagArea(id) {
    if (id === "vendas") return pagVendas();
    if (id === "marketing") return pagMarketing();
    if (id === "operacao") return pagOperacao();
    if (id === "pessoas") return pagPessoas();
    return pagOutros();
  }
  const SAIDAS = { prosp: saidaProsp, viagem: saidaViagem, mkt: saidaMkt, funil: saidaFunil, oper: saidaOper, pessoas: saidaPessoas, marketing: saidaFunil, turmas: saidaOper };
  function atualizarSaidas() {
    document.querySelectorAll("[data-saida]").forEach((el) => { const f = SAIDAS[el.dataset.saida]; if (f) el.innerHTML = f(); });
  }
  function aplicarPremissas() {
    ["prosp", "viagem", "mkt", "funil", "oper"].forEach((g) => {
      if (S.calcMexido[g]) return;
      const salvo = S.premissas[g];
      S.calc[g] = Object.assign(clone(CALC_PADRAO[g]), salvo && salvo.valores ? salvo.valores : {});
    });
    if (!S.calcMexido.turmas) S.calc.turmas = S.premissas.turmas && Array.isArray(S.premissas.turmas.lista) ? clone(S.premissas.turmas.lista) : clone(OPER.turmas);
    ["viagem", "marketing", "pessoas"].forEach((g) => {
      if (S.calcMexido[`fin-${g}`]) return;
      S.calcFin[g] = S.finp[g] && S.finp[g].valores ? clone(S.finp[g].valores) : {};
    });
  }


  /* ---------- Quem participa (só a administração) ---------- */
  S.part = null;
  const NIVEIS = [["", "Sem acesso"], ["colaboradora", "Lê e comenta"], ["leitora", "Só lê"]];
  async function carregarParticipantes() {
    const P = window.PLANEJAMENTO;
    try {
      const [eq, mem] = await Promise.all([
        P.sb.from("perfis").select("id, nome, papel, tambem_mentor, foto_url").eq("ativo", true).or("papel.in.(admin,mentor),tambem_mentor.eq.true").order("nome"),
        P.sb.from("planejamento_membros").select("perfil_id, nivel")
      ]);
      if (eq.error) throw eq.error;
      if (mem.error) throw mem.error;
      S.part = { pessoas: eq.data || [], membros: Object.fromEntries((mem.data || []).map((m) => [m.perfil_id, m.nivel])) };
    } catch (e) { S.part = { erro: (e && e.message) || "Não consegui ler a lista." }; }
    agendarRender();
  }
  function pagParticipantes() {
    if (!S.part) { carregarParticipantes(); return `<header class="cab"><span class="olho">Quem participa</span><h1>Carregando a lista da equipe…</h1></header>`; }
    if (S.part.erro) return `<header class="cab"><span class="olho">Quem participa</span><h1>Não consegui ler a lista</h1><p>${esc(S.part.erro)}</p></header>`;
    const adm = S.part.pessoas.filter((p) => p.papel === "admin"), outros = S.part.pessoas.filter((p) => p.papel !== "admin");
    const rosto = (p) => `<span class="rosto">${p.foto_url ? `<img src="${esc(p.foto_url)}" alt="">` : esc((String(p.nome || "?").trim()[0] || "?").toUpperCase())}</span>`;
    const nPart = outros.filter((p) => S.part.membros[p.id]).length;
    return `<header class="cab"><span class="olho">Quem participa</span><h1>Quem entra no planejamento</h1>
        <p>Cada pessoa entra com o login dela na plataforma, e cada comentário fica no nome de quem escreveu. A administração decide e vê os valores em reais; quem você incluir aqui lê o plano e comenta (ou só lê), sem ver o financeiro.</p></header>
      <div class="cartao"><div class="h4">Administração: decide e vê os valores</div>
        <div class="pessoas">${adm.map((p) => `<div class="pessoa">${rosto(p)}<b>${esc(p.nome)}</b></div>`).join("")}</div></div>
      <section class="bloco"><h2>Mentores e equipe</h2><p class="sub">${nPart} de ${outros.length} com acesso. A mudança vale na hora.</p>
        <div class="tabela-caixa"><table class="tab"><thead><tr><th>Pessoa</th><th>Acesso ao planejamento</th></tr></thead><tbody>
          ${outros.map((p) => { const n = S.part.membros[p.id] || ""; return `<tr><td><span class="pessoa">${rosto(p)}<b>${esc(p.nome)}</b></span></td>
            <td><select data-acao="nivel-membro" data-id="${esc(p.id)}" aria-label="Acesso de ${esc(p.nome)}">${NIVEIS.map(([v, r]) => `<option value="${v}"${v === n ? " selected" : ""}>${r}</option>`).join("")}</select></td></tr>`; }).join("")}
        </tbody></table></div></section>
      <div class="cartao bloco"><div class="h4">Alguém que ainda não está na plataforma?</div>
        <p>Cadastre a pessoa em <a href="/app.html#/equipe">Negócio › Equipe</a> e mande o convite pela própria plataforma. Quando ela estiver cadastrada, aparece nesta lista para você liberar o acesso.</p></div>`;
  }
  async function mudarNivel(id, nivel) {
    const P = window.PLANEJAMENTO;
    const q = nivel ? P.sb.from("planejamento_membros").upsert({ perfil_id: id, nivel, incluido_por: P.uid, incluido_em: new Date().toISOString() }, { onConflict: "perfil_id" })
      : P.sb.from("planejamento_membros").delete().eq("perfil_id", id);
    const { error } = await q;
    if (error) { toast("Não consegui mudar o acesso. Tente de novo."); S.part = null; agendarRender(); return; }
    if (nivel) S.part.membros[id] = nivel; else delete S.part.membros[id];
    S.nomesPedidos.delete(id);
    toast(nivel ? "Acesso liberado." : "Acesso retirado.");
    agendarRender();
  }

  /* ---------- rotas e render ---------- */
  function lerRota() {
    const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    let m;
    if ((m = h.match(/^v-([a-z]+)(?:-([a-z]+))?$/)) && V[m[1]]) return { tipo: "vertente", id: m[1], secao: m[2] && E[m[2]] ? m[2] : null };
    if ((m = h.match(/^e-([a-z]+)$/)) && E[m[1]]) return { tipo: "etapa", id: m[1] };
    if ((m = h.match(/^d-([A-Z0-9]+)$/)) && D[m[1]]) return { tipo: "decisoes", foco: m[1] };
    if (["decisoes", "mercado", "fontes"].includes(h)) return { tipo: h };
    if (AR[h]) return { tipo: "area", id: h };
    if (h === "participantes" && S.canEdit) return { tipo: "participantes" };
    return { tipo: "inicio" };
  }
  function render() {
    S.renderPendente = false;
    const r = S.rota;
    let html;
    if (r.tipo === "vertente") html = pagVertente(r.id);
    else if (r.tipo === "etapa") html = pagEtapa(r.id);
    else if (r.tipo === "decisoes") html = pagDecisoes();
    else if (r.tipo === "mercado") html = pagMercado();
    else if (r.tipo === "fontes") html = pagFontes();
    else if (r.tipo === "area") html = pagArea(r.id);
    else if (r.tipo === "participantes") html = pagParticipantes();
    else html = pagInicio();
    $("#view").innerHTML = html;
    renderNav();
    if (S.rolarPara) {
      const alvo = document.getElementById(S.rolarPara);
      S.rolarPara = null;
      if (alvo) alvo.scrollIntoView({ block: "start" });
    }
  }
  function ocupado() {
    const a = document.activeElement;
    return a && $("#view").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }
  let raf = null;
  function agendarRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; if (ocupado()) S.renderPendente = true; else render(); });
  }
  function navegar() {
    S.rota = lerRota();
    const r = S.rota;
    if (r.tipo === "vertente" && r.secao) S.rolarPara = `s-${r.secao}`;
    if (r.tipo === "decisoes" && r.foco) { S.abertas.add(r.foco); S.filtroDec = { v: "todas", st: "todas" }; S.rolarPara = `dec-${r.foco}`; }
    $("#menu").classList.remove("aberta");
    $("#abrirMenu").setAttribute("aria-expanded", "false");
    render();
    if (!S.rolarPara && !(r.tipo === "vertente" && r.secao) && !(r.tipo === "decisoes" && r.foco)) window.scrollTo(0, 0);
  }

  /* ---------- eventos ---------- */
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-acao]");
    if (!b || !$("#view").contains(b)) return;
    const a = b.dataset.acao, id = b.dataset.id;
    if (a === "salvar-premissa") { await salvarPremissas(b.dataset.grupos.split(" ")); return; }
    if (a === "restaurar-premissa") {
      b.dataset.grupos.split(" ").forEach((g) => { delete S.calcMexido[g]; delete S.calcMexido[`fin-${g}`]; });
      aplicarPremissas(); render(); toast("Números de volta ao padrão salvo."); return;
    }
    if (a === "turma-add") { const ult = S.calc.turmas[S.calc.turmas.length - 1]; S.calc.turmas.push({ mes: Math.min(11, num(ult && ult.mes) + 2), alunos: 18 }); S.calcMexido.turmas = true; render(); return; }
    if (a === "turma-remover") { S.calc.turmas.splice(Number(b.dataset.i), 1); S.calcMexido.turmas = true; render(); return; }
    if (a === "abrir-dec") { S.abertas.has(id) ? S.abertas.delete(id) : S.abertas.add(id); render(); return; }
    if (a === "ir-secao") { ev.preventDefault(); const el = document.getElementById(b.dataset.alvo); if (el) el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); return; }
    if (a === "filtro-dec-v") { S.filtroDec.v = id; render(); return; }
    if (a === "filtro-dec-st") { S.filtroDec.st = id; render(); return; }
    if (a === "filtro-conc") { S.filtroConc = id; render(); return; }
    if (a === "escolher") { await salvarDec(id, { status: "decidida", escolha: b.dataset.op }); return; }
    if (a === "discussao") { await salvarDec(id, { status: "em-discussao" }); return; }
    if (a === "reabrir") { await salvarDec(id, { status: "pendente" }); return; }
    if (a === "salvar-nota") {
      const nota = (S.rasc[`nota-${id}`] != null ? S.rasc[`nota-${id}`] : decInfo(D[id]).nota).trim();
      const cur = decInfo(D[id]);
      const novo = { status: cur.status, escolha: cur.escolha, origem: cur.origem, nota, por: cur.por, em: cur.em };
      Object.keys(novo).forEach((k) => { if (novo[k] === null || novo[k] === "") delete novo[k]; });
      if (await gravar(`decisoes/${id}`, novo)) { delete S.rasc[`nota-${id}`]; toast("Nota salva."); }
      return;
    }
    if (a === "comentar") {
      const alvo = b.dataset.alvo, texto = (S.rasc[alvo] || "").trim();
      if (!texto) { toast("Escreva o comentário antes de enviar."); return; }
      if (texto.length > 4000) { toast("Comentário muito longo. Divida em partes."); return; }
      const cid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      b.disabled = true;
      if (await gravar(`comentarios/${cid}`, { alvo, texto, autor: S.meId, autorNome: S.meNome || "", em: new Date().toISOString() }, "comentario")) { delete S.rasc[alvo]; S.comAbertos.add(alvo); }
      b.disabled = false;
      return;
    }
    if (a === "apagar-com") { await gravar(`comentarios/${id}`, null, "comentario"); return; }
    if (a === "acao-status") {
      const vid = b.dataset.v, at = acoesDe(vid).find((x) => x.id === id);
      await salvarAcao(vid, id, { status: PROX_ACAO[(at && at.status) || "a-fazer"] });
      return;
    }
    if (a === "acao-remover") {
      const vid = b.dataset.v;
      if (await salvarAcao(vid, id, { removida: true })) toast("Ação removida.", { rotulo: "Desfazer", fazer: () => salvarAcao(vid, id, { removida: false }) });
      return;
    }
    if (a === "acao-add") {
      const vid = b.dataset.v, titulo = $(`#nova-titulo-${vid}`).value.trim();
      if (!titulo) { toast("Escreva a ação antes de adicionar."); return; }
      const nid = `${vid}-c${Date.now().toString(36)}`;
      const ok = await gravar(`acoes/${nid}`, Object.assign({ titulo, tri: Number($(`#nova-tri-${vid}`).value), resp: $(`#nova-resp-${vid}`).value.trim(), status: "a-fazer", v: vid, custom: true }, carimbo()));
      if (ok) toast("Ação adicionada.");
      return;
    }
    if (a === "fin-obs-salvar") {
      const vid = b.dataset.v, obs = (S.rasc[`fin-${vid}`] != null ? S.rasc[`fin-${vid}`] : (S.fin[vid] || {}).obs || "").trim();
      if (await gravar(`fin/${vid}`, Object.assign({}, S.fin[vid] || {}, { obs }, carimbo()))) { delete S.rasc[`fin-${vid}`]; toast("Observações salvas."); }
    }
  });

  async function salvarAcao(vid, id, mud) {
    const base = acoesDe(vid).find((x) => x.id === id) || Object.assign({ id }, S.acoes[id] || {});
    const novo = Object.assign({ titulo: base.titulo, tri: base.tri, resp: base.resp || "", status: base.status || "a-fazer", v: vid }, S.acoes[id] && S.acoes[id].custom ? { custom: true } : {}, mud, carimbo());
    if (!novo.removida) delete novo.removida;
    return gravar(`acoes/${id}`, novo);
  }

  async function salvarPremissas(grupos) {
    let ok = true;
    for (const g of grupos) {
      if (CALC_PADRAO[g]) ok = (await gravar(`premissas/${g}`, Object.assign({ valores: S.calc[g] }, carimbo()))) && ok;
      if (g === "turmas") ok = (await gravar("premissas/turmas", Object.assign({ lista: S.calc.turmas }, carimbo()))) && ok;
      if (["viagem", "marketing", "pessoas"].includes(g)) ok = (await gravar(`finpremissas/${g}`, Object.assign({ valores: S.calcFin[g] }, carimbo()))) && ok;
    }
    if (ok) { grupos.forEach((g) => { delete S.calcMexido[g]; delete S.calcMexido[`fin-${g}`]; }); toast("Premissas salvas para todas."); }
  }

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset.calc || t.dataset.calcfin || t.dataset.turma) {
      if (t.dataset.turma) {
        const i = Number(t.dataset.turma), n = lerNum(t.value);
        if (S.calc.turmas[i] && n !== null && !Number.isNaN(n)) { S.calc.turmas[i][t.dataset.k] = n; S.calcMexido.turmas = true; }
      } else {
        const fin = !!t.dataset.calcfin, g = fin ? t.dataset.calcfin : t.dataset.calc, n = lerNum(t.value);
        if (Number.isNaN(n)) return;
        const alvo = fin ? S.calcFin[g] : S.calc[g];
        const ks = t.dataset.k.split(".");
        let o = alvo;
        for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== "object" || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
        if (n === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = n;
        S.calcMexido[fin ? `fin-${g}` : g] = true;
      }
      atualizarSaidas();
      return;
    }
    if (t.dataset.com) S.rasc[t.dataset.com] = t.value;
    else if (t.dataset.nota) S.rasc[`nota-${t.dataset.nota}`] = t.value;
    else if (t.dataset.acao === "fin-obs") S.rasc[`fin-${t.dataset.v}`] = t.value;
  });

  document.addEventListener("change", async (ev) => {
    const t = ev.target, a = t.dataset.acao;
    if (!a) return;
    if (a === "nivel-membro") {
      await mudarNivel(t.dataset.id, t.value);
    } else if (a === "casa-livre") {
      await gravar(`casas/${t.dataset.id}`, Object.assign({ status: t.value }, carimbo()));
    } else if (a === "casa") {
      const vid = t.dataset.v, eid = t.dataset.e;
      await gravar(`casas/${vid}-${eid}`, Object.assign({ status: t.value }, carimbo()));
    } else if (a === "meta") {
      const id = t.dataset.id, campo = t.dataset.campo, val = t.value.trim();
      const cur = Object.assign({}, S.metas[id] || {});
      if ((cur[campo] || "") === val) return;
      cur[campo] = val;
      await gravar(`metas/${id}`, Object.assign(cur, carimbo()));
    } else if (a === "acao-tri") {
      await salvarAcao(t.dataset.v, t.dataset.id, { tri: Number(t.value) });
    } else if (a === "acao-resp") {
      await salvarAcao(t.dataset.v, t.dataset.id, { resp: t.value.trim() });
    } else if (a === "fin") {
      const vid = t.dataset.v, campo = t.dataset.campo, n = lerValor(t.value);
      if (Number.isNaN(n)) { toast("Digite só números, por exemplo 350.000"); return; }
      const cur = Object.assign({}, S.fin[vid] || {});
      if (n === null) delete cur[campo]; else cur[campo] = n;
      await gravar(`fin/${vid}`, Object.assign(cur, carimbo()));
    }
  });

  document.addEventListener("focusout", () => {
    setTimeout(() => { if (S.renderPendente && !ocupado()) render(); }, 0);
  });
  document.addEventListener("toggle", (ev) => {
    const d = ev.target;
    if (d.tagName === "DETAILS" && d.dataset.alvo) { d.open ? S.comAbertos.add(d.dataset.alvo) : S.comAbertos.delete(d.dataset.alvo); }
  }, true);

  window.addEventListener("hashchange", navegar);
  $("#abrirMenu").addEventListener("click", () => {
    const m = $("#menu"), aberto = m.classList.toggle("aberta");
    $("#abrirMenu").setAttribute("aria-expanded", String(aberto));
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") $("#menu").classList.remove("aberta"); });

  /* ---------- dados ao vivo ---------- */
  function resolverNomes() {
    if (!S.user || typeof S.user.profiles !== "function") return;
    const ids = new Set();
    S.comentarios.forEach((c) => ids.add(c.autor));
    [S.decisoes, S.acoes, S.metas, S.casas].forEach((col) => Object.values(col).forEach((d) => ids.add(d.por)));
    const faltam = [...ids].filter((i) => i && i !== S.meId && !S.nomesPedidos.has(i));
    if (!faltam.length) return;
    faltam.forEach((i) => S.nomesPedidos.add(i));
    Promise.resolve(S.user.profiles(faltam)).then((ps) => {
      faltam.forEach((i) => { S.nomes[i] = (ps && ps[i] && ps[i].name) || ""; });
      agendarRender();
    }).catch(() => {});
  }

  function assinar(colecao, aplicar) {
    let timer = setTimeout(() => { if (S.conexao === "conectando") { S.conexao = "lento"; agendarRender(); } }, 10000);
    S.db.collection(colecao).onSnapshot((snap) => {
      aplicar(snap.docs.filter((d) => d.exists).map((d) => Object.assign({ id: d.id }, d.data())));
      if (!snap.metadata.fromCache) { clearTimeout(timer); if (S.conexao !== "ok") { S.conexao = "ok"; } }
      resolverNomes();
      agendarRender();
    }, (e) => {
      clearTimeout(timer);
      if (e && e.code === "revoked") S.conexao = "offline";
      else if (S.conexao !== "ok") S.conexao = "lento";
      agendarRender();
    });
  }
  const porId = (lista) => Object.fromEntries(lista.map((d) => { const o = Object.assign({}, d); delete o.id; return [d.id, o]; }));

  async function iniciar() {
    if (!window.claude || typeof window.claude.use !== "function") { S.conexao = "offline"; render(); return; }
    let db = null, user = null;
    try { [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); } catch (e) { /* segue sem dados */ }
    S.user = user;
    if (user) {
      try { S.canEdit = !!(await Promise.resolve(user.canEdit())); } catch (e) { S.canEdit = false; }
      try { const w = await Promise.resolve(user.can("data.write")); S.podeComentar = w !== false; } catch (e) { S.podeComentar = true; }
      try { S.meId = await user.id(); } catch (e) { S.meId = null; }
      try { const me = await user.me(); S.meNome = (me && me.name) || ""; } catch (e) { S.meNome = ""; }
    }
    if (!db) { S.conexao = "offline"; S.canEdit = false; S.podeComentar = false; render(); return; }
    S.db = db;
    if (S.canEdit) S.podeComentar = true;
    S.conexao = "conectando";
    assinar("decisoes", (l) => { S.decisoes = porId(l); });
    assinar("comentarios", (l) => { S.comentarios = l.filter((c) => typeof c.texto === "string" && typeof c.alvo === "string"); });
    assinar("acoes", (l) => { S.acoes = porId(l); });
    assinar("metas", (l) => { S.metas = porId(l); });
    assinar("casas", (l) => { S.casas = porId(l); });
    assinar("premissas", (l) => { S.premissas = porId(l); aplicarPremissas(); });
    if (S.canEdit) assinar("fin", (l) => { S.fin = porId(l); });
    if (S.canEdit) assinar("finpremissas", (l) => { S.finp = porId(l); aplicarPremissas(); });
    render();
  }

  S.rota = lerRota();
  navegar();
  iniciar();
})();
