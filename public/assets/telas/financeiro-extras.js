// Pedidos da Cintia no Financeiro (11/11/2026, pelo WhatsApp; script 70):
// 1. Categorias de despesa novas ("Despesas digital", por exemplo): guardadas em configuracoes.financeiro.categorias.
// 2. Dividir um pagamento entre vários programas (o mentor recebe de uma vez por várias turmas): várias despesas com o mesmo grupo.
// 3. PDF da nota emitida guardado na linha a receber (pasta privada financeiro/notas/...).
// 4. Editar ou excluir uma linha a receber direto em "Emitir nota", e juntar linhas do mesmo plano numa só.
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';
import { janela } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';

const v2 = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2));

async function salvarConfig(d, mudar) {
  const { data, error: e0 } = await sb.from('configuracoes').select('valor').eq('chave', 'financeiro').maybeSingle();
  if (e0) throw e0;
  const atual = (data && data.valor) || {};
  const novo = mudar({ ...atual });
  const { error } = await sb.from('configuracoes').upsert({ chave: 'financeiro', valor: novo });
  if (error) throw error;
  Object.assign(d.config, novo);
}

// ---------- 1. categoria nova ----------
// Abre a janela, grava e devolve a chave da categoria nova (ou null se desistiu)
export function novaCategoria(d) {
  return new Promise((ok) => {
    let feito = null;
    const j = janela('Nova categoria de despesa', `<form class="grade" style="gap:12px" novalidate>
      <div class="campo"><label for="nc-nome">Nome da categoria *</label><input type="text" id="nc-nome" maxlength="60" placeholder="Ex.: Despesas digital"></div>
      <p class="peq apagado">Ela passa a aparecer em todas as listas de tipo de despesa (despesas, extrato, reembolsos e relatórios).</p>
      <div class="linha"><button class="btn pri" type="submit">Criar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 480, aoFechar: () => ok(feito) });
    const campo = j.corpo.querySelector('#nc-nome');
    campo.focus();
    j.corpo.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nome = campo.value.trim();
      if (nome.length < 2) { avisar('Escreva o nome da categoria.', true); return; }
      const existe = F.CATEGORIAS.find(([, n]) => F.normalCategoria(n) === F.normalCategoria(nome));
      if (existe) { feito = existe[0]; j.fechar(); avisar(`A categoria "${existe[1]}" já existe: escolhi ela.`); return; }
      const chave = `x_${F.normalCategoria(nome).replace(/ /g, '_').slice(0, 30)}_${Date.now().toString(36).slice(-4)}`;
      try {
        await salvarConfig(d, (c) => ({ ...c, categorias: [...(Array.isArray(c.categorias) ? c.categorias : []), { k: chave, nome }] }));
        F.usarCategoriasExtras(d.config.categorias);
        feito = chave; j.fechar(); avisar(`Categoria "${nome}" criada.`);
      } catch (e) { avisar(explicarErro(e), true); }
    });
  });
}

// Liga o botão "+ Nova" ao lado de um select de categoria
export function ligarNovaCategoria(d, select, botao) {
  botao.addEventListener('click', async () => {
    const k = await novaCategoria(d);
    if (!k) return;
    const atual = select.value;
    select.innerHTML = F.CATEGORIAS.filter(([c]) => c !== 'socia' || [...select.options].some((o) => o.value === 'socia')).map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
    select.value = k || atual;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// ---------- 2. dividir entre vários programas ----------
// Devolve { html, ligar(raiz, totalFn), partes() }. partes() = null se não está dividindo; senão [{ v, valor }]
export function divisao(d, { inicial = '' } = {}) {
  let ligado = false;
  let partes = [{ v: inicial, valor: null }, { v: '', valor: null }];
  let raiz = null, total = () => 0;
  const html = `<details class="cartao" data-divisao style="margin:0;padding:10px 14px"><summary><b>Dividir entre vários programas</b> <span class="peq apagado">(um pagamento que é de várias turmas ou mentorias)</span></summary>
    <p class="peq apagado mt">Com a divisão ligada, vale o programa de cada parte (e não o cliente escolhido acima).</p><div data-div-corpo class="mt"></div></details>`;
  const desenhar = () => {
    const c = raiz.querySelector('[data-div-corpo]');
    c.innerHTML = `<label class="check"><input type="checkbox" data-div-ligar${ligado ? ' checked' : ''}><span>Sim, dividir este pagamento</span></label>
      ${ligado ? `<div class="tabela mt"><table><tbody>${partes.map((p, i) => `<tr><td style="width:65%"><select data-div-onde="${i}" aria-label="É de">${d.opcoesOnde(p.v)}</select></td>
        <td><input type="number" data-div-valor="${i}" min="0" step="0.01" value="${v2(p.valor)}" placeholder="R$" style="max-width:130px;text-align:right" aria-label="Valor desta parte"></td>
        <td>${partes.length > 2 ? `<button class="btn peq perigo" type="button" data-div-tirar="${i}" aria-label="Tirar">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="linha mt"><button class="btn peq" type="button" data-div-mais>+ Mais um programa</button><button class="btn peq" type="button" data-div-igual>Dividir igual</button><span style="flex:1"></span>
          <span data-div-soma>${textoSoma()}</span></div>` : ''}`;
  };
  function textoSoma() {
    const soma = F.soma(partes, (p) => p.valor);
    const t = total();
    return `Soma: <b>${dinheiro(soma)}</b>${t && Math.abs(soma - t) >= 0.01 ? ` <span class="selo alerta">${soma < t ? 'falta' : 'passou'} ${dinheiro(Math.abs(F.arred(t - soma)))}</span>` : t ? ' <span class="selo ok">bate com o total</span>' : ''}`;
  }
  const atualizarSoma = () => { const e = raiz && raiz.querySelector('[data-div-soma]'); if (e) e.innerHTML = textoSoma(); };
  return {
    html,
    ligar(r, totalFn) {
      raiz = r.querySelector('[data-divisao]'); total = totalFn;
      desenhar();
      raiz.addEventListener('change', (ev) => {
        const t = ev.target;
        if (t.matches('[data-div-ligar]')) { ligado = t.checked; desenhar(); return; }
        if (t.dataset.divOnde != null) partes[Number(t.dataset.divOnde)].v = t.value;
        if (t.dataset.divValor != null) { partes[Number(t.dataset.divValor)].valor = t.value === '' ? null : Number(t.value); atualizarSoma(); }
      });
      raiz.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t.dataset.divValor != null) { partes[Number(t.dataset.divValor)].valor = t.value === '' ? null : Number(t.value); atualizarSoma(); }
      });
      raiz.addEventListener('click', (ev) => {
        if (ev.target.matches('[data-div-mais]')) { partes.push({ v: '', valor: null }); desenhar(); }
        if (ev.target.matches('[data-div-igual]')) { const ps = F.dividir(total(), partes.length); partes = partes.map((p, i) => ({ ...p, valor: ps[i] })); desenhar(); }
        const x = ev.target.closest('[data-div-tirar]');
        if (x) { partes.splice(Number(x.dataset.divTirar), 1); desenhar(); }
      });
    },
    // null = não divide; lança erro com a explicação se estiver errado
    partes() {
      if (!ligado) return null;
      const t = total();
      if (partes.some((p) => !p.v)) throw new Error('Na divisão, escolha de qual programa é cada parte.');
      if (partes.some((p) => !(p.valor > 0))) throw new Error('Na divisão, coloque o valor de cada parte.');
      if (Math.abs(F.soma(partes, (p) => p.valor) - t) >= 0.01) throw new Error(`A soma das partes (${dinheiro(F.soma(partes, (p) => p.valor))}) precisa dar o total (${dinheiro(t)}).`);
      return partes.map((p) => ({ ...p }));
    },
  };
}

// ---------- 3. PDF da nota ----------
export async function enviarPdfNota(d, linhas, arq) {
  if (!arq) return null;
  if (!/pdf$/i.test(arq.type) && !/\.pdf$/i.test(arq.name)) throw new Error('A nota precisa ser um PDF.');
  if (arq.size > 10 * 1024 * 1024) throw new Error('PDF grande demais (máximo 10 MB).');
  const k = d.cnpjDe(linhas[0]);
  const caminho = `notas/${k}/${(linhas[0].nota_numero || 'sem-numero')}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const up = await sb.storage.from('financeiro').upload(caminho, arq, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw up.error;
  for (const l of linhas) {
    const { error } = await sb.from('fin_receber').update({ nota_arquivo: caminho, atualizado_em: new Date().toISOString() }).eq('id', l.id);
    if (error) throw error;
    l.nota_arquivo = caminho;
  }
  return caminho;
}
export async function abrirPdfNota(caminho) {
  const { data, error } = await sb.storage.from('financeiro').createSignedUrl(caminho, 600);
  if (error || !data) throw new Error('Não consegui abrir a nota.');
  window.open(data.signedUrl, '_blank', 'noopener');
}
// janela só para anexar o PDF numa nota já registrada (A receber)
export function janelaAnexar(d, linhas, recarregar) {
  const j = janela(`Anexar a nota ${linhas[0].nota_numero || ''}`, `<form class="grade" style="gap:12px" novalidate>
    <p class="apagado">${esc(d.empresa(linhas[0].empresa_id).nome)} · ${dinheiro(F.soma(linhas, (l) => l.valor))}</p>
    <div class="campo"><label for="an-arq">PDF da nota</label><input type="file" id="an-arq" accept="application/pdf,.pdf"><small>Fica guardado só para a administração.</small></div>
    <div class="linha"><button class="btn pri" type="submit">Anexar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 520 });
  j.corpo.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const arq = j.corpo.querySelector('#an-arq').files[0];
    if (!arq) { avisar('Escolha o PDF da nota.', true); return; }
    try { await enviarPdfNota(d, linhas, arq); j.fechar(); avisar('Nota anexada.'); recarregar(); } catch (e) { avisar(explicarErro(e), true); }
  });
}

// ---------- 4. editar, excluir e juntar linhas a receber ----------
export function janelaLinha(d, l, recarregar, abrirPlano) {
  const p = d.plano(l.plano_id);
  const j = janela('Mudar esta linha', `<form class="grade" style="gap:12px" novalidate>
    <p class="apagado">${esc(d.empresa(l.empresa_id).nome)}${p ? ` · ${esc(p.titulo)}` : ''}</p>
    <div class="campo"><label for="ln-desc">O que vai na nota *</label><input type="text" id="ln-desc" maxlength="200" value="${esc(l.descricao)}"></div>
    <div class="grade g2" style="gap:10px">
      <div class="campo"><label for="ln-data">Data</label><input type="date" id="ln-data" value="${l.data || ''}"${l.modulo_id && l.situacao === 'aberto' ? ' readonly' : ''}>${l.modulo_id && l.situacao === 'aberto' ? '<small>Acompanha a data do módulo (mude a data no módulo da turma).</small>' : ''}</div>
      <div class="campo"><label for="ln-valor">Valor (R$)</label><input type="number" id="ln-valor" min="0" step="0.01" value="${v2(l.valor)}"></div>
    </div>
    ${p ? `<div class="aviso">Cobrou de outro jeito (por exemplo, juntou palestras e fez parcelas)? <button class="btn peq" type="button" id="ln-plano">Abrir o plano inteiro</button> e troque "Como cobra" para "Por parcelas com data".</div>` : ''}
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button><span style="flex:1"></span>
      ${l.situacao === 'aberto' ? '<button class="btn perigo" type="button" id="ln-apagar">Excluir esta linha</button>' : ''}</div></form>`, { largura: 600 });
  const $ = (s) => j.corpo.querySelector(s);
  if ($('#ln-plano')) $('#ln-plano').addEventListener('click', () => { j.fechar(); abrirPlano(p); });
  if ($('#ln-apagar')) $('#ln-apagar').addEventListener('click', async (ev) => {
    const b = ev.target;
    if (b.dataset.certeza !== '1') { b.dataset.certeza = '1'; b.textContent = 'Clique de novo para excluir'; return; }
    const { error } = await sb.from('fin_receber').delete().eq('id', l.id);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('Linha excluída.'); recarregar();
  });
  j.corpo.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const descricao = $('#ln-desc').value.trim();
    if (!descricao) { avisar('Escreva o que vai na nota.', true); return; }
    const mud = { descricao, data: $('#ln-data').value || null, valor: Number($('#ln-valor').value) || 0, atualizado_em: new Date().toISOString() };
    const { error } = await sb.from('fin_receber').update(mud).eq('id', l.id);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('Linha salva.'); recarregar();
  });
}

// Junta linhas em aberto do mesmo plano numa linha só (soma os valores; a descrição lista o que foi junto)
export function janelaJuntar(d, linhas, recarregar) {
  if (new Set(linhas.map((l) => l.plano_id || l.id)).size > 1) { avisar('Para juntar numa linha só, marque linhas da mesma turma ou mentoria. Para uma nota só de várias turmas, use "Nota emitida para as marcadas" (cada turma continua com a sua linha, com o mesmo número de nota).', true); return; }
  if (linhas.some((l) => l.situacao !== 'aberto')) { avisar('Só dá para juntar linhas em aberto.', true); return; }
  const ord = [...linhas].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const total = F.soma(ord, (l) => l.valor);
  const j = janela(`Juntar ${ord.length} linhas numa só`, `<form class="grade" style="gap:12px" novalidate>
    <div class="campo"><label for="jn-desc">O que vai na nota *</label><textarea id="jn-desc" rows="3">${esc(ord.map((l) => `${l.descricao}${l.data ? ` (${dataBR(l.data)})` : ''}`).join('; '))}</textarea></div>
    <div class="grade g2" style="gap:10px"><div class="campo"><label for="jn-data">Data</label><input type="date" id="jn-data" value="${ord[ord.length - 1].data || ''}"></div>
      <div class="campo"><label for="jn-valor">Valor (R$)</label><input type="number" id="jn-valor" min="0" step="0.01" value="${v2(total)}"></div></div>
    <div class="linha"><button class="btn pri" type="submit">Juntar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 620 });
  j.corpo.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const $ = (s) => j.corpo.querySelector(s);
    try {
      const [fica, ...saem] = ord;
      const { error } = await sb.from('fin_receber').update({ descricao: $('#jn-desc').value.trim().slice(0, 500) || fica.descricao, data: $('#jn-data').value || fica.data,
        valor: Number($('#jn-valor').value) || 0, modulo_id: null, atualizado_em: new Date().toISOString() }).eq('id', fica.id);
      if (error) throw error;
      const r = await sb.from('fin_receber').delete().in('id', saem.map((l) => l.id));
      if (r.error) throw r.error;
      // o plano cobrava por módulo: agora cobra por parcela (senão os módulos juntados voltariam como "módulo sem linha")
      const p = d.plano(fica.plano_id);
      if (p && p.modo === 'modulo') { const e3 = await sb.from('fin_planos').update({ modo: 'parcelas', atualizado_em: new Date().toISOString() }).eq('id', p.id); if (e3.error) throw e3.error; }
      j.fechar(); avisar(p && p.modo === 'modulo' ? 'Linhas juntadas numa só. O plano passou a cobrar por parcela.' : 'Linhas juntadas numa só.'); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}
