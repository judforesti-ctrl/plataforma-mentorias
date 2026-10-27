// Gestão › Emitir certificados (script 47; especificação e protótipo em docs/certificados). Só a administração.
// Uma pasta por cliente e programa: padrão claro ou escuro, dados do programa (de uma turma cadastrada ou do zero),
// módulos do verso e quem assina (pela Mentorei e, se quiser, pelo cliente), com a prévia ao vivo do certificado.
// A prévia é o próprio modelo (/certificados/modelo/certificado.html, sem mudança) num iframe, recebendo os dados por postMessage.
// Rotas: #/certificados · #/certificados/nova · #/certificados/<pasta>[/emitir|/emitidos|/editar]
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { faltaScript } from './agenda-dados.js';
import { paraPng, linkLogo, logoAnterior } from './proposta.js';
import { bibliotecaQr } from './avaliacao-modulo.js';
import * as R from '../certificados-regras.js';

const FALTA = '<div class="aviso erro">Para usar os certificados, falta rodar o script <b>47-certificados.sql</b> no Supabase (SQL Editor → New query → colar → Run).</div>';
const CODIGO_EXEMPLO = 'MTR-26-XXXX-XXXX';
const PADROES = { clara: ['Claro', 'Fundo bege, textos em azul-petróleo'], escura: ['Escuro', 'Fundo azul-petróleo, textos em branco'] };
const numero = (v) => Number(String(v == null ? '' : v).replace(',', '.')) || 0;
const diaBR = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : null);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export async function render(ctx, el, params) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração emite certificados.</div>'; return; }
  const [a, b] = params;
  if (a === 'nova') return nova(ctx, el);
  if (a && b === 'editar') return editar(ctx, el, a);
  if (a) return pasta(ctx, el, a, b);
  return lista(ctx, el);
}

const ir = (h) => { location.hash = h; };
const titulo = (h1, sub = '', acoes = '', volta = '') => `<div class="cab"><div>${volta ? `<p class="peq apagado">${volta}</p>` : ''}<h1>${h1}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${acoes ? `<div class="acoes">${acoes}</div>` : ''}</div>`;
const amostra = (v) => `<span class="ct-amostra ${v === 'escura' ? 'escura' : 'clara'}"></span>${v === 'escura' ? 'Escuro' : 'Claro'}`;

// ---------- 1. lista de pastas ----------
async function lista(ctx, el) {
  const { data, error } = await sb.from('cert_pastas')
    .select('id, nome, variacao, tipo, curso, cliente_nome, criado_em, resp1_assinatura_id, mostrar_resp2, resp2_assinatura_id, cert_certificados(status)')
    .order('criado_em', { ascending: false });
  const falta = error && faltaScript(error);
  if (error && !falta) throw error;
  const pastas = data || [];
  el.innerHTML = `${titulo('Emitir certificados', 'Crie uma pasta para cada cliente e programa. Dentro dela, importe a lista de nomes e baixe todos os certificados prontos, já com o QR code de verificação.',
    `<button class="btn pri" type="button" id="ct-nova"${falta ? ' disabled' : ''}>+ Nova pasta</button>`)}
    ${falta ? FALTA : ''}
    <div class="linha ag-filtros"><input type="search" id="ct-q" placeholder="Buscar por cliente ou programa" style="width:auto;min-width:260px" aria-label="Buscar"></div>
    <div id="ct-tab"></div>`;
  el.querySelector('#ct-nova').addEventListener('click', () => ir('#/certificados/nova'));
  const tab = el.querySelector('#ct-tab');
  const desenhar = () => {
    const q = el.querySelector('#ct-q').value.toLocaleLowerCase('pt-BR').trim();
    const vistas = pastas.filter((p) => !q || `${p.nome} ${p.cliente_nome || ''} ${p.curso}`.toLocaleLowerCase('pt-BR').includes(q));
    if (!pastas.length) { tab.innerHTML = falta ? '' : '<div class="vazio"><b>Nenhuma pasta ainda.</b><br>Comece criando a pasta do primeiro cliente.</div>'; return; }
    if (!vistas.length) { tab.innerHTML = `<div class="vazio">Nada encontrado para "${esc(q)}".</div>`; return; }
    tab.innerHTML = `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Pasta</th><th>Padrão</th><th>Certificados</th><th>Criada em</th></tr></thead><tbody>
      ${vistas.map((p) => {
        const v = (p.cert_certificados || []).filter((c) => c.status === 'valido').length;
        return `<tr class="ct-clicavel" data-id="${p.id}" tabindex="0"><td><b>${esc(p.nome)}</b><div class="peq apagado">${esc(p.cliente_nome || 'Sem cliente')} · ${esc(p.tipo)}</div></td>
          <td><span class="chip">${amostra(p.variacao)}</span></td>
          <td>${v ? `<span class="chip ct-ok">${plural(v, 'válido', 'válidos')}</span>` : '<span class="chip">Nenhum ainda</span>'}
            ${R.semAssinatura(p) ? '<div class="peq apagado mt" style="margin-top:4px">Sem assinatura</div>' : ''}</td>
          <td>${esc(dataBR(p.criado_em))}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  };
  el.querySelector('#ct-q').addEventListener('input', desenhar);
  tab.addEventListener('click', (ev) => { const tr = ev.target.closest('[data-id]'); if (tr) ir(`#/certificados/${tr.dataset.id}`); });
  tab.addEventListener('keydown', (ev) => { const tr = ev.target.closest('[data-id]'); if (tr && ev.key === 'Enter') ir(`#/certificados/${tr.dataset.id}`); });
  desenhar();
}

// ---------- 2. nova pasta (assistente em 3 passos) ----------
const modelo = () => ({
  nome: '', variacao: 'clara', tipo: 'programa', curso: '', empresa_id: null, turma_id: null, cliente_nome: '', cliente_logo: null,
  inicio: null, fim: null, periodo_texto: '', periodo_manual: false, carga_horas: '', cidade: '', data_emissao: hojeISO(),
  resp1_nome: '', resp1_cargo: '', resp1_assinatura_id: null, mostrar_resp2: false, resp2_nome: '', resp2_cargo: '', resp2_assinatura_id: null,
  modulos: [], origem: { tipo: 'manual' },
});

function passos(n) {
  const nomes = ['Padrão', 'Importar proposta ou trilha', 'Revisar e criar a pasta'];
  return `<div class="ct-passos">${nomes.map((t, i) => `<span class="${i + 1 === n ? 'atual' : i + 1 < n ? 'feito' : ''}"><i>${i + 1 < n ? '✓' : i + 1}</i>${t}</span>`).join('')}</div>`;
}

async function nova(ctx, el) {
  const N = { passo: 1, d: modelo(), aviso: '' };
  const volta = '<a href="#/certificados">← Emitir certificados</a>';
  const desenhar = async () => {
    window.scrollTo(0, 0);
    const topo = `${titulo('Nova pasta de certificados', '', '', volta)}${passos(N.passo)}`;
    if (N.passo === 1) {
      el.innerHTML = `${topo}<p class="apagado" style="margin-bottom:16px">Escolha o padrão do certificado. Os dois têm o mesmo desenho: use cores diferentes para diferenciar trilhas, por exemplo quando a mesma pessoa conclui duas.</p>
        <div class="ct-padroes">${Object.entries(PADROES).map(([v, [nome, sub]]) => `<button type="button" class="ct-padrao${N.d.variacao === v ? ' sel' : ''}" data-v="${v}" aria-pressed="${N.d.variacao === v}">
          <img src="/certificados/img/padrao-${v}.jpg" alt=""><span class="ct-padrao-rot"><b>${nome}</b><small>${sub}</small></span></button>`).join('')}</div>
        <div class="ct-rodape"><span></span><a class="btn" href="#/certificados">Cancelar</a><button class="btn pri" type="button" id="ct-seg">Continuar</button></div>`;
      el.querySelectorAll('.ct-padrao').forEach((b) => b.addEventListener('click', () => {
        N.d.variacao = b.dataset.v;
        el.querySelectorAll('.ct-padrao').forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      }));
      el.querySelector('#ct-seg').addEventListener('click', () => { N.passo = 2; desenhar(); });
      return;
    }
    if (N.passo === 2) {
      const { data: turmas } = await sb.from('turmas').select('id, nome, inicio, status, empresa:empresas(nome), modulos(id)').order('inicio', { ascending: false, nullsFirst: false });
      el.innerHTML = `${topo}<div class="ct-opcoes">
        <div class="cartao ct-opcao"><h3>Enviar a proposta ou a trilha</h3><p class="peq apagado">Envie o arquivo do programa. A plataforma lê e preenche o nome, o cliente, os módulos e as horas. Você revisa tudo antes de criar a pasta.</p>
          <div class="aviso mt">A leitura da proposta pela IA ainda vai ser ligada (etapa 5). Por enquanto, use uma turma cadastrada ou preencha do zero.</div></div>
        <div class="cartao ct-opcao"><h3>Usar uma turma cadastrada</h3><p class="peq apagado">Puxa o nome, o cliente, os módulos, as datas e as horas de uma turma que já existe na plataforma.</p>
          <select id="ct-turma" class="mt" aria-label="Turma"><option value="">Escolha a turma</option>${(turmas || []).map((t) => `<option value="${t.id}">${esc(t.empresa ? `${t.empresa.nome} · ` : '')}${esc(t.nome)} · ${plural((t.modulos || []).length, 'módulo', 'módulos')}</option>`).join('')}</select>
          <button class="btn mt" type="button" id="ct-usar-turma" disabled>Usar esta turma</button></div>
        <div class="cartao ct-opcao"><h3>Preencher do zero</h3><p class="peq apagado">Para um programa que não tem proposta nem turma na plataforma. Você digita as informações.</p>
          <button class="btn mt" type="button" id="ct-zero">Começar em branco</button></div></div>
        <div class="ct-rodape"><span></span><button class="btn" type="button" id="ct-volta">Voltar</button></div>`;
      el.querySelector('#ct-volta').addEventListener('click', () => { N.passo = 1; desenhar(); });
      el.querySelector('#ct-zero').addEventListener('click', () => { N.d.origem = { tipo: 'manual' }; N.aviso = ''; N.passo = 3; desenhar(); });
      const sel = el.querySelector('#ct-turma'), usar = el.querySelector('#ct-usar-turma');
      sel.addEventListener('change', () => { usar.disabled = !sel.value; });
      usar.addEventListener('click', async () => {
        usar.disabled = true; usar.textContent = 'Lendo a turma…';
        try {
          const nome = sel.selectedOptions[0].textContent.replace(/ · \d+ módulos?$/, '');
          await daTurma(N.d, sel.value);
          N.aviso = `Os dados vieram da turma <b>${esc(nome)}</b>. Confira o nome do programa (veio o nome da turma), a cidade e as horas de cada módulo.`;
          N.passo = 3; desenhar();
        } catch (e) { avisar(explicarErro(e), true); usar.disabled = false; usar.textContent = 'Usar esta turma'; }
      });
      return;
    }
    el.innerHTML = `${topo}<div id="ct-ed"></div>`;
    await editor(ctx, el.querySelector('#ct-ed'), N.d, {
      aviso: N.aviso,
      voltar: () => { N.passo = 2; desenhar(); },
      salvar: async (linha) => {
        const { data, error } = await sb.from('cert_pastas').insert(linha).select('id').single();
        if (error) throw error;
        avisar('Pasta criada. Agora importe a lista de nomes.');
        ir(`#/certificados/${data.id}/emitir`);
      },
    });
  };
  desenhar();
}

// Turma cadastrada → campos da pasta (sem IA): nome, cliente, logo do cliente, módulos com as horas, datas e cidade.
async function daTurma(d, turmaId) {
  const { data: t, error } = await sb.from('turmas').select('*, empresa:empresas(id, nome, cidade, marca), modulos(*)').eq('id', turmaId).single();
  if (error) throw error;
  const mods = (t.modulos || []).slice().sort((a, b) => a.numero - b.numero);
  const horas = (m) => (m.duracao_min ? Math.round((m.duracao_min / 60) * 2) / 2 : '');
  const dias = mods.map((m) => diaBR(m.data_hora)).filter(Boolean).sort();
  const presencial = mods.find((m) => m.formato === 'presencial' && m.local);
  const cidade = String((presencial && presencial.local) || t.local || (t.empresa && t.empresa.cidade) || '').replace(/\s*\(([A-Z]{2})\)\s*$/, '').split(/[,·]/)[0].trim();
  Object.assign(d, {
    tipo: 'trilha', curso: t.nome, turma_id: t.id,
    empresa_id: t.empresa ? t.empresa.id : null, cliente_nome: t.empresa ? t.empresa.nome : '',
    cliente_logo: (t.empresa && t.empresa.marca && t.empresa.marca.logo && t.empresa.marca.logo.caminho) ? t.empresa.marca.logo : (t.empresa ? await logoAnterior(t.empresa.id) : null),
    inicio: dias[0] || t.inicio || null, fim: dias[dias.length - 1] || t.fim_previsto || null,
    cidade,
    modulos: mods.map((m) => ({ titulo: m.titulo, descricao: '', horas: horas(m) })),
    origem: { tipo: 'trilha', turma_id: t.id, nome: t.nome },
  });
  const soma = R.somaHoras(d.modulos);
  if (soma) d.carga_horas = soma;
  d.periodo_texto = R.periodoTexto(d.inicio, d.fim); d.periodo_manual = false;
}

// ---------- 3. editar ----------
async function editar(ctx, el, id) {
  const [{ data: p, error }, emit] = await Promise.all([
    sb.from('cert_pastas').select('*').eq('id', id).maybeSingle(),
    sb.from('cert_certificados').select('id', { count: 'exact', head: true }).eq('pasta_id', id),
  ]);
  if (error) { if (faltaScript(error)) { el.innerHTML = FALTA; return; } throw error; }
  if (!p) { el.innerHTML = '<div class="vazio">Pasta não encontrada.</div>'; return; }
  const n = emit.count || 0;
  el.innerHTML = `${titulo('Editar informações', '', '', `<a href="#/certificados">Emitir certificados</a> › <a href="#/certificados/${p.id}">${esc(p.nome)}</a>`)}<div id="ct-ed"></div>`;
  await editor(ctx, el.querySelector('#ct-ed'), { ...p, modulos: (p.modulos || []).map((m) => ({ ...m })) }, {
    existente: p,
    aviso: n ? `Esta pasta já tem <b>${plural(n, 'certificado emitido', 'certificados emitidos')}</b>. As mudanças valem para as próximas emissões; os já emitidos continuam como foram impressos (e a verificação também) até você gerar de novo.` : '',
    salvar: async (linha) => {
      const { error: e } = await sb.from('cert_pastas').update({ ...linha, atualizado_por: ctx.perfil.id }).eq('id', p.id);
      if (e) throw e;
      avisar('Alterações salvas.');
      ir(`#/certificados/${p.id}`);
    },
  });
}

// ---------- formulário + prévia ao vivo (nova pasta e editar) ----------
async function editor(ctx, el, d, { existente = null, aviso = '', voltar = null, salvar }) {
  const { data: empresas } = await sb.from('empresas').select('id, nome, marca').order('nome');
  let nomeEditado = !!existente;
  const ass = (n) => `<div class="grade g2" style="gap:12px">
      <div class="campo"><label for="ct-r${n}n">${n === 1 ? 'Nome de quem assina pela Mentorei' : 'Nome de quem assina pelo cliente'}</label><input id="ct-r${n}n" data-k="resp${n}_nome" type="text"></div>
      <div class="campo"><label for="ct-r${n}c">Cargo</label><input id="ct-r${n}c" data-k="resp${n}_cargo" type="text" placeholder="${n === 1 ? 'Ex.: Sócia · Mentorei' : 'Ex.: Diretora de Pessoas · Sicoob Exemplo'}"></div></div>`;
  el.innerHTML = `${aviso ? `<div class="aviso" style="margin-bottom:16px">${aviso}</div>` : ''}
    <div class="ct-editor"><form class="cartao ct-form" id="ct-form" novalidate>
      <section><h3>Pasta</h3><div class="campo"><label for="ct-nome">Nome da pasta</label><input id="ct-nome" type="text"><small>Sugerido a partir do cliente, do programa e do ano. Pode mudar.</small></div></section>
      <section><h3>Padrão</h3><div class="ct-seg" id="ct-var">${Object.entries(PADROES).map(([v]) => `<button type="button" data-v="${v}">${amostra(v)}</button>`).join('')}</div></section>
      <section><h3>Programa</h3>
        <div class="ct-tipo-curso"><div class="campo"><label for="ct-tipo">Tipo</label><select id="ct-tipo" data-k="tipo">${R.TIPOS.map((t) => `<option>${t}</option>`).join('')}</select></div>
          <div class="campo"><label for="ct-curso">Nome do programa *</label><textarea id="ct-curso" data-k="curso" rows="2" placeholder="Ex.: Programa de Desenvolvimento de Lideranças"></textarea></div></div>
        <p class="peq apagado mt" id="ct-frase"></p></section>
      <section><h3>Cliente</h3>
        <div class="campo"><label for="ct-emp">Cliente cadastrado (opcional)</label><select id="ct-emp"><option value="">Nenhum (turma aberta ou cliente fora da lista)</option>${(empresas || []).map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select></div>
        <div class="campo mt"><label for="ct-cli">Nome do cliente no certificado</label><input id="ct-cli" data-k="cliente_nome" type="text" placeholder="Ex.: Sicoob Cooprem"><small>Aparece no verso como "Realizado para". Deixe vazio em turma aberta.</small></div>
        <div class="campo mt"><span class="rotulo">Logo do cliente (opcional)</span><div id="ct-logo"></div><small>PNG com fundo transparente fica melhor. Com logo, ele aparece no lugar do nome.</small></div></section>
      <section><h3>Datas e carga horária</h3>
        <div class="grade g2" style="gap:12px"><div class="campo"><label for="ct-ini">Início</label><input id="ct-ini" data-k="inicio" type="date"></div><div class="campo"><label for="ct-fim">Fim</label><input id="ct-fim" data-k="fim" type="date"></div></div>
        <div class="campo mt"><label for="ct-per">Período (como aparece no certificado) *</label><input id="ct-per" data-k="periodo_texto" type="text"><small id="ct-per-ajuda"></small></div>
        <div class="grade g3 mt" style="gap:12px"><div class="campo"><label for="ct-carga">Carga horária total (horas) *</label><input id="ct-carga" data-k="carga_horas" type="number" min="0" step="0.5" inputmode="decimal"></div>
          <div class="campo"><label for="ct-cid">Cidade *</label><input id="ct-cid" data-k="cidade" type="text"></div>
          <div class="campo"><label for="ct-emi">Data de emissão *</label><input id="ct-emi" data-k="data_emissao" type="date"></div></div></section>
      <section><h3>Módulos do verso</h3><div class="ct-mods" id="ct-mods"></div>
        <div class="linha mt"><button class="btn peq" type="button" id="ct-add">+ Adicionar módulo</button><span id="ct-soma"></span></div></section>
      <section><h3>Assinaturas</h3>${ass(1)}
        <label class="check mt"><input type="checkbox" data-k="mostrar_resp2"><span>Incluir a assinatura de alguém do cliente</span></label>
        <div id="ct-ass2" class="mt">${ass(2)}</div>
        <p class="peq apagado mt">A imagem da assinatura (foto ou escaneamento, enviada uma vez só) entra na próxima etapa. Sem a imagem, o certificado sai com a linha para assinar e a pasta fica marcada como "sem assinatura": dá para gerar assim para conferir e, depois de colocar a assinatura, gerar de novo a versão final com os mesmos códigos.</p></section>
    </form>
    <div class="ct-previa"><div class="linha"><div class="ct-seg" id="ct-face"><button type="button" class="on" data-f="frente">Frente</button><button type="button" data-f="verso">Verso</button></div>
        <input type="text" id="ct-teste" placeholder="Testar com um nome" aria-label="Testar com um nome" style="flex:1;min-width:160px"></div>
      <div class="ct-moldura mt" id="ct-moldura"></div>
      <p class="peq apagado mt">Prévia com o nome de teste e um QR code de exemplo. Cada pessoa recebe o próprio código ao gerar.</p></div></div>
    <div class="ct-rodape"><span class="peq" id="ct-falta"></span>${voltar ? '<button class="btn" type="button" id="ct-volta">Voltar</button>' : `<a class="btn" href="#/certificados/${existente.id}">Cancelar</a>`}
      <button class="btn pri" type="button" id="ct-salvar">${existente ? 'Salvar alterações' : 'Criar pasta'}</button></div>`;

  const f = el.querySelector('#ct-form');
  const $ = (s) => el.querySelector(s);
  $('#ct-nome').value = existente ? existente.nome : R.nomeSugerido(d);
  $('#ct-nome').addEventListener('input', () => { nomeEditado = true; });
  $('#ct-emp').value = d.empresa_id || '';

  f.querySelectorAll('[data-k]').forEach((inp) => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') inp.checked = !!d[k]; else inp.value = d[k] == null ? '' : d[k];
    inp.addEventListener(inp.tagName === 'SELECT' || inp.type === 'checkbox' || inp.type === 'date' ? 'change' : 'input', () => {
      d[k] = inp.type === 'checkbox' ? inp.checked : (inp.type === 'date' ? (inp.value || null) : inp.value);
      if (k === 'periodo_texto') d.periodo_manual = !!inp.value.trim() && inp.value !== R.periodoTexto(d.inicio, d.fim);
      if ((k === 'inicio' || k === 'fim') && !d.periodo_manual) { d.periodo_texto = R.periodoTexto(d.inicio, d.fim); $('#ct-per').value = d.periodo_texto; }
      if (!nomeEditado && ['cliente_nome', 'curso', 'inicio', 'fim'].includes(k)) $('#ct-nome').value = R.nomeSugerido(d);
      atualizar();
    });
  });
  $('#ct-per-ajuda').addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-auto]')) return;
    d.periodo_manual = false; d.periodo_texto = R.periodoTexto(d.inicio, d.fim); $('#ct-per').value = d.periodo_texto; atualizar();
  });

  const variacao = () => el.querySelectorAll('#ct-var button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.variacao));
  el.querySelectorAll('#ct-var button').forEach((b) => b.addEventListener('click', () => { d.variacao = b.dataset.v; variacao(); atualizar(); }));
  variacao();

  // cliente cadastrado: preenche o nome e oferece o logo que a plataforma já tem (área do aluno ou proposta anterior)
  const logoBox = $('#ct-logo');
  let logoDoCliente = null;
  const desenharLogo = (enviando = false) => {
    const l = d.cliente_logo && d.cliente_logo.caminho ? d.cliente_logo : null;
    const oferta = !l && logoDoCliente;
    logoBox.innerHTML = `<div class="ct-logo">${l ? `<img src="${esc(linkLogo(l))}" alt="Logo do cliente">` : '<span class="peq apagado">Sem logo</span>'}
      <label class="btn peq" style="cursor:pointer">${l ? 'Trocar logo' : 'Enviar logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
      ${l ? '<button class="btn peq" type="button" data-tirar>Remover</button>' : ''}${oferta ? '<button class="btn peq" type="button" data-cliente>Usar o logo já cadastrado do cliente</button>' : ''}
      ${enviando ? '<span class="peq apagado">Enviando…</span>' : ''}</div>`;
  };
  const buscarLogo = async () => {
    const e = (empresas || []).find((x) => x.id === d.empresa_id);
    logoDoCliente = e && e.marca && e.marca.logo && e.marca.logo.caminho ? e.marca.logo : (e ? await logoAnterior(e.id) : null);
    desenharLogo();
  };
  logoBox.addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
    if (arq.size > 8 * 1024 * 1024) { avisar('A imagem é grande demais (máximo 8 MB).', true); return; }
    desenharLogo(true);
    try {
      const png = await paraPng(arq);
      const caminho = `logos/${d.empresa_id || 'certificados'}/${Date.now()}.png`;
      const { error } = await sb.storage.from('fotos').upload(caminho, png.blob, { contentType: 'image/png', upsert: false });
      if (error) throw error;
      d.cliente_logo = { caminho, largura: png.largura, altura: png.altura };
    } catch (e) { avisar(explicarErro(e), true); }
    desenharLogo(); atualizar();
  });
  logoBox.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-tirar]')) { d.cliente_logo = null; desenharLogo(); atualizar(); }
    if (ev.target.closest('[data-cliente]')) { d.cliente_logo = logoDoCliente; desenharLogo(); atualizar(); }
  });
  $('#ct-emp').addEventListener('change', () => {
    const antes = (empresas || []).find((x) => x.id === d.empresa_id);
    const e = (empresas || []).find((x) => x.id === $('#ct-emp').value);
    d.empresa_id = e ? e.id : null;
    if (e && (!String(d.cliente_nome || '').trim() || (antes && d.cliente_nome === antes.nome))) { d.cliente_nome = e.nome; $('#ct-cli').value = e.nome; }
    if (!nomeEditado) $('#ct-nome').value = R.nomeSugerido(d);
    buscarLogo(); atualizar();
  });
  desenharLogo(); buscarLogo();

  // módulos: título, descrição curta, horas; subir, descer e remover
  const mods = $('#ct-mods');
  const desenharMods = () => {
    mods.innerHTML = d.modulos.length ? d.modulos.map((m, i) => `<div class="ct-mod" data-i="${i}"><span class="ct-mod-n">${String(i + 1).padStart(2, '0')}</span>
        <div class="ct-mod-txt"><input type="text" data-m="titulo" value="${esc(m.titulo)}" placeholder="Título do módulo" aria-label="Título do módulo ${i + 1}">
          <input type="text" data-m="descricao" value="${esc(m.descricao || '')}" placeholder="Descrição curta (opcional)" aria-label="Descrição do módulo ${i + 1}"></div>
        <input type="number" min="0" step="0.5" inputmode="decimal" data-m="horas" value="${esc(m.horas == null ? '' : m.horas)}" placeholder="Horas" aria-label="Horas do módulo ${i + 1}">
        <div class="ct-mod-acoes"><button type="button" data-a="cima" title="Subir" aria-label="Subir"${i ? '' : ' disabled'}>↑</button><button type="button" data-a="baixo" title="Descer" aria-label="Descer"${i < d.modulos.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-a="tirar" title="Remover" aria-label="Remover">✕</button></div></div>`).join('')
      : '<p class="peq apagado">Nenhum módulo. Sem módulos, o verso mostra só a carga horária.</p>';
  };
  mods.addEventListener('input', (ev) => {
    const inp = ev.target.closest('[data-m]'); if (!inp) return;
    d.modulos[+inp.closest('[data-i]').dataset.i][inp.dataset.m] = inp.value; atualizar();
  });
  mods.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i, j = b.dataset.a === 'cima' ? i - 1 : i + 1;
    if (b.dataset.a === 'tirar') d.modulos.splice(i, 1);
    else if (j >= 0 && j < d.modulos.length) [d.modulos[i], d.modulos[j]] = [d.modulos[j], d.modulos[i]];
    desenharMods(); atualizar();
  });
  $('#ct-add').addEventListener('click', () => {
    d.modulos.push({ titulo: '', descricao: '', horas: '' }); desenharMods(); atualizar();
    const ins = mods.querySelectorAll('[data-m=titulo]'); if (ins.length) ins[ins.length - 1].focus();
  });
  desenharMods();

  // prévia
  const previa = montarPrevia($('#ct-moldura'));
  el.querySelectorAll('#ct-face button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('#ct-face button').forEach((x) => x.classList.toggle('on', x === b)); previa.face(b.dataset.f);
  }));
  $('#ct-teste').addEventListener('input', () => atualizar());
  const qrExemplo = await qrDataUri(R.linkVerificacao(CODIGO_EXEMPLO)).catch(() => '');

  function atualizar() {
    $('#ct-ass2').hidden = !d.mostrar_resp2;
    const art = R.artigo(d.tipo);
    $('#ct-frase').textContent = `No certificado: "concluiu ${art} ${d.tipo}" e, no verso, "Conteúdo ${art === 'a' ? 'da' : 'do'} ${d.tipo}".`;
    $('#ct-per-ajuda').innerHTML = d.periodo_manual && (d.inicio || d.fim)
      ? 'Texto escrito à mão. <button class="btn peq" type="button" data-auto>Voltar ao texto das datas</button>' : 'Escrito sozinho a partir das datas. Pode ajustar.';
    const soma = R.somaHoras(d.modulos), total = numero(d.carga_horas);
    $('#ct-soma').innerHTML = !d.modulos.length ? '' : !total ? '<span class="chip ct-alerta">Preencha a carga horária total</span>'
      : Math.abs(soma - total) < 0.01 ? `<span class="chip ct-ok">Soma dos módulos: ${R.horasTexto(soma)} ✓</span>`
        : `<span class="chip ct-alerta">Soma dos módulos: ${R.horasTexto(soma) || '0 horas'} · total: ${R.horasTexto(total)}</span>`;
    previa.enviar(R.dadosDoModelo(R.retrato(d), {
      participante: $('#ct-teste').value.trim() || 'Nome do Participante', codigo: CODIGO_EXEMPLO, qr: qrExemplo,
      imagens: { logo: d.cliente_logo && d.cliente_logo.caminho ? linkLogo(d.cliente_logo) : '' },
    }));
    const falta = R.faltando(d);
    $('#ct-falta').textContent = falta.length ? `Falta preencher: ${falta.join(', ')}.` : '';
    $('#ct-salvar').disabled = !!falta.length;
  }
  atualizar();

  if (voltar) $('#ct-volta').addEventListener('click', voltar);
  $('#ct-salvar').addEventListener('click', async () => {
    if (R.faltando(d).length) return;
    const b = $('#ct-salvar'); b.disabled = true; const txt = b.textContent; b.textContent = 'Salvando…';
    try { await salvar(linhaDaPasta(d, $('#ct-nome').value.trim() || R.nomeSugerido(d))); } catch (e) { avisar(explicarErro(e), true); b.disabled = false; b.textContent = txt; }
  });
}

// só as colunas da tabela, com os textos limpos
function linhaDaPasta(d, nome) {
  return {
    nome, variacao: d.variacao, tipo: d.tipo, curso: R.limparNome(d.curso), empresa_id: d.empresa_id || null, turma_id: d.turma_id || null,
    cliente_nome: R.limparNome(d.cliente_nome) || null, cliente_logo: d.cliente_logo && d.cliente_logo.caminho ? d.cliente_logo : null,
    inicio: d.inicio || null, fim: d.fim || null, periodo_texto: R.limparNome(d.periodo_texto), periodo_manual: !!d.periodo_manual,
    carga_horas: numero(d.carga_horas), cidade: R.limparNome(d.cidade), data_emissao: d.data_emissao,
    resp1_nome: R.limparNome(d.resp1_nome) || null, resp1_cargo: R.limparNome(d.resp1_cargo) || null, resp1_assinatura_id: d.resp1_assinatura_id || null,
    mostrar_resp2: !!d.mostrar_resp2, resp2_nome: R.limparNome(d.resp2_nome) || null, resp2_cargo: R.limparNome(d.resp2_cargo) || null,
    resp2_assinatura_id: d.mostrar_resp2 ? (d.resp2_assinatura_id || null) : null,
    modulos: d.modulos.filter((m) => R.limparNome(m.titulo) || R.limparNome(m.descricao) || numero(m.horas))
      .map((m) => ({ titulo: R.limparNome(m.titulo), descricao: R.limparNome(m.descricao), horas: numero(m.horas) || null })),
    origem: d.origem || { tipo: 'manual' },
  };
}

// QR em SVG (o mesmo desenho que vai nos PDFs) como data URI
export async function qrDataUri(texto) {
  const qrcode = await bibliotecaQr();
  return R.svgParaDataUri(R.qrSvg(qrcode, texto));
}

// O modelo do certificado num iframe (1123 × 794 px, escalado para caber); recebe os dados por postMessage.
export function montarPrevia(el, face = 'frente') {
  el.innerHTML = `<iframe title="Prévia do certificado" src="${R.MODELO}?previa=${face}" tabindex="-1"></iframe>`;
  const f = el.querySelector('iframe');
  let pronto = false, dados = null, faceAtual = face, t = null;
  const escalar = () => { f.style.transform = `scale(${el.clientWidth / 1123})`; };
  new ResizeObserver(escalar).observe(el); escalar();
  const mandar = () => {
    if (!pronto || !f.contentWindow) return;
    if (dados) f.contentWindow.postMessage({ tipo: 'certificado:dados', dados }, location.origin);
    f.contentWindow.postMessage({ tipo: 'certificado:face', face: faceAtual }, location.origin);
  };
  f.addEventListener('load', () => { pronto = true; mandar(); });
  return {
    enviar(novos) { dados = novos; clearTimeout(t); t = setTimeout(mandar, 120); },
    face(novo) { faceAtual = novo; mandar(); },
  };
}

// ---------- 4. pasta: emitir e emitidos ----------
async function pasta(ctx, el, id, aba) {
  const [{ data: p, error }, certs] = await Promise.all([
    sb.from('cert_pastas').select('*').eq('id', id).maybeSingle(),
    sb.from('cert_certificados').select('id, codigo, numero, participante, status, sem_assinatura, emitido_em').eq('pasta_id', id).order('numero'),
  ]);
  if (error) { if (faltaScript(error)) { el.innerHTML = FALTA; return; } throw error; }
  if (!p) { el.innerHTML = '<div class="vazio">Pasta não encontrada. <a href="#/certificados">Voltar para a lista</a></div>'; return; }
  const lista = certs.data || [];
  const validos = lista.filter((c) => c.status === 'valido').length;
  aba = aba === 'emitidos' || aba === 'emitir' ? aba : (lista.length ? 'emitidos' : 'emitir');
  const nMods = (p.modulos || []).length;
  el.innerHTML = `${titulo(esc(p.nome), `${esc(p.curso)} · ${esc(p.periodo_texto)}`, `<a class="btn" href="#/certificados/${p.id}/editar">✎ Editar informações</a>`, '<a href="#/certificados">← Emitir certificados</a>')}
    <div class="chips" style="margin:-8px 0 16px"><span class="chip">${amostra(p.variacao)}</span><span class="chip">${esc(p.tipo)}</span><span class="chip">${esc(R.horasTexto(p.carga_horas))}</span>
      <span class="chip">${plural(nMods, 'módulo', 'módulos')}</span>${p.cliente_nome ? `<span class="chip">${esc(p.cliente_nome)}</span>` : ''}
      ${R.semAssinatura(p) ? '<span class="chip ct-alerta">Sem assinatura</span>' : ''}</div>
    <div class="abas" role="tablist"><button type="button" role="tab" data-aba="emitir">Emitir certificados</button><button type="button" role="tab" data-aba="emitidos">Emitidos (${validos})</button></div>
    <div id="ct-aba"></div>`;
  el.querySelectorAll('.abas button').forEach((b) => {
    b.classList.toggle('atual', b.dataset.aba === aba); b.setAttribute('aria-selected', String(b.dataset.aba === aba));
    b.addEventListener('click', () => ir(`#/certificados/${p.id}/${b.dataset.aba}`));
  });
  const caixa = el.querySelector('#ct-aba');
  if (aba === 'emitir') {
    caixa.innerHTML = `<div class="aviso">Importar a lista de nomes, gerar os PDFs e baixar o ZIP chegam na etapa 3. Abaixo, a prévia de como o certificado desta pasta vai sair.</div>
      <div class="cartao mt" style="max-width:760px"><div class="linha"><div class="ct-seg" id="ct-face"><button type="button" class="on" data-f="frente">Frente</button><button type="button" data-f="verso">Verso</button></div></div>
        <div class="ct-moldura mt" id="ct-moldura"></div></div>`;
    const previa = montarPrevia(caixa.querySelector('#ct-moldura'));
    caixa.querySelectorAll('#ct-face button').forEach((b) => b.addEventListener('click', () => {
      caixa.querySelectorAll('#ct-face button').forEach((x) => x.classList.toggle('on', x === b)); previa.face(b.dataset.f);
    }));
    const qr = await qrDataUri(R.linkVerificacao(CODIGO_EXEMPLO)).catch(() => '');
    previa.enviar(R.dadosDoModelo(R.retrato(p), { participante: 'Nome do Participante', codigo: CODIGO_EXEMPLO, qr, imagens: { logo: p.cliente_logo ? linkLogo(p.cliente_logo) : '' } }));
    return;
  }
  caixa.innerHTML = lista.length ? `<div class="tabela cartao" style="padding:0"><table><thead><tr><th>Participante</th><th>Código</th><th>Emitido em</th><th>Situação</th></tr></thead><tbody>
      ${lista.map((c) => `<tr><td>${esc(c.participante)}</td><td><code>${esc(c.codigo)}</code></td><td>${esc(dataBR(c.emitido_em))}</td>
        <td>${c.status === 'valido' ? '<span class="chip ct-ok">Válido</span>' : '<span class="chip ct-cancelado">Cancelado</span>'}${c.sem_assinatura ? ' <span class="peq apagado">sem assinatura</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="vazio">Nenhum certificado emitido nesta pasta ainda.</div>';
}
