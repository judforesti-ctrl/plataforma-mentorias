// Financeiro → Despesas → Reembolsos (script 71, pedido da Juliana em 11/11/2026).
// A Cintia importa a planilha de reembolso de uma sócia ou de um mentor (Excel, CSV ou PDF). Cada gasto vira uma despesa ligada
// ao cliente, à turma e ao módulo (pelo texto da planilha e pela agenda de quem gastou), que é o centro de custo do cliente para
// a margem. O PIX do reembolso no extrato é reconhecido sozinho pelo total (financeiro-extratos.js chama `sugestaoReembolso` antes
// das regras: o mesmo CPF da retirada da sócia não vira retirada). Se o PIX já estava no extrato, a importação já liga.
// Regras puras em ../financeiro-reembolso.js.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';
import * as R from '../financeiro-reembolso.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const COMO = { texto: ['pela planilha', 'ok'], agenda: ['pela agenda de quem gastou', 'ok'], cidade: ['pela cidade e data: confira', 'alerta'] };

export async function carregarReembolsos() {
  const r = await sb.from('fin_reembolsos').select('*').order('criado_em', { ascending: false });
  if (r.error) { if (faltaScript(r.error)) return null; throw r.error; }
  return r.data || [];
}

// pessoa (perfil) que o texto do extrato mostra: regra "lembrar" com pessoa (o pedaço do CPF) ou o nome no histórico
export function pessoaDoTextoCom(regras, pessoas, X) {
  return (mov) => {
    const regra = X.regraDoMovimento(mov, (regras || []).filter((r) => r.pessoa_id));
    if (regra) return regra.pessoa_id;
    const t = R.norm(`${mov.historico || ''} ${mov.detalhe || ''}`);
    const tem = (p) => new RegExp(`\\b${p}\\b`).test(t);
    const p = pessoas.find((x) => { const ps = R.norm(x.nome).split(' ').filter((z) => z.length >= 3); return ps.length && tem(ps[0]) && (ps.length === 1 || ps.slice(1).some(tem)); });
    return p ? p.id : null;
  };
}

// ---------- pagar e desfazer (usados pela conferência do extrato e pela importação) ----------
export async function pagarReembolsos(reembolsos, mov) {
  for (const r of reembolsos) {
    const e1 = await sb.from('fin_despesas').update({ pago_em: mov.data, conta: mov.conta }).eq('reembolso_id', r.id);
    if (e1.error) throw e1.error;
    const e2 = await sb.from('fin_reembolsos').update({ situacao: 'pago', pago_em: mov.data, conta: mov.conta, movimento_id: mov.id }).eq('id', r.id);
    if (e2.error) throw e2.error;
    Object.assign(r, { situacao: 'pago', pago_em: mov.data, conta: mov.conta, movimento_id: mov.id });
  }
}
export async function desfazerReembolsos(ids) {
  for (const id of ids || []) {
    const e1 = await sb.from('fin_despesas').update({ pago_em: null, conta: null }).eq('reembolso_id', id);
    if (e1.error) throw e1.error;
    const e2 = await sb.from('fin_reembolsos').update({ situacao: 'a_pagar', pago_em: null, conta: null, movimento_id: null }).eq('id', id);
    if (e2.error) throw e2.error;
  }
}
// liga o movimento do extrato ao reembolso (o movimento pode estar pendente ou conferido como retirada por engano)
export async function ligarMovimento(mov, reembolsos, eu) {
  await pagarReembolsos(reembolsos, mov);
  const { error } = await sb.from('fin_movimentos').update({ situacao: 'conciliado', acao: 'reembolso', reembolso_id: reembolsos[0].id, receber_ids: [], despesa_id: null,
    pessoa_id: reembolsos[0].pessoa_id, regra_id: null, observacao: reembolsos.length > 1 ? `${reembolsos.length} reembolsos num PIX só` : null,
    desfazer: { reembolsos: reembolsos.map((r) => r.id) }, conciliado_por: eu || null, conciliado_em: new Date().toISOString() }).eq('id', mov.id);
  if (error) throw error;
}

// ---------- bloco na aba Despesas ----------
export function blocoReembolsos(d, reembolsos) {
  if (reembolsos == null) return '<div class="aviso" style="margin-bottom:14px">Falta rodar o script <b>71</b> no Supabase para importar as planilhas de reembolso.</div>';
  const abertos = reembolsos.filter((r) => r.situacao !== 'pago');
  const pagos = reembolsos.filter((r) => r.situacao === 'pago').slice(0, 12);
  const nome = (r) => esc((d.pessoa(r.pessoa_id) || {}).nome || '—');
  const linha = (r) => `<tr><td>${nome(r)}<br><small class="apagado">${esc(r.titulo || r.arquivo || '')}</small></td><td>${r.enviado_em ? dataBR(r.enviado_em) : dataBR(String(r.criado_em).slice(0, 10))}</td>
    <td class="fn-num" style="text-align:right">${dinheiro(r.total)}</td>
    <td>${r.situacao === 'pago' ? `<span class="selo ok">PIX em ${dataBR(r.pago_em)}${r.conta ? ` · ${esc(r.conta)}` : ''}</span>` : '<span class="selo alerta">Esperando o PIX</span>'}</td>
    <td style="white-space:nowrap"><button class="btn peq" type="button" data-reemb-ver="${r.id}">Ver os gastos</button>${r.situacao !== 'pago' ? ` <button class="btn peq" type="button" data-reemb-pago="${r.id}">Já paguei</button>` : ''}</td></tr>`;
  return `<div class="cartao" style="margin-bottom:14px"><div class="linha"><h3 style="flex:1">Reembolsos das sócias e dos mentores</h3>
      <button class="btn pri" type="button" id="reemb-importar">📥 Importar planilha de reembolso</button></div>
    <p class="apagado">Cada gasto da planilha vai para o cliente, a turma e o módulo certos (é o que mostra a margem de cada cliente). Quando o PIX aparecer no extrato, eu reconheço sozinha pelo total e marco tudo como pago.</p>
    ${abertos.length ? `<div class="tabela mt"><table><thead><tr><th>De quem</th><th>Enviado</th><th style="text-align:right">Total</th><th>PIX</th><th></th></tr></thead><tbody>${abertos.map(linha).join('')}</tbody></table></div>` : '<p class="peq apagado mt">Nenhum reembolso esperando PIX.</p>'}
    ${pagos.length ? `<details class="mt"><summary>Já pagos (${pagos.length})</summary><div class="tabela mt"><table><tbody>${pagos.map(linha).join('')}</tbody></table></div></details>` : ''}</div>`;
}

export function ligarBloco(d, el, reembolsos, recarregar) {
  el.addEventListener('click', async (ev) => {
    if (ev.target.id === 'reemb-importar') return janelaImportar(d, recarregar);
    const v = ev.target.closest('[data-reemb-ver]'), p = ev.target.closest('[data-reemb-pago]');
    if (v) return janelaVer(d, reembolsos.find((r) => r.id === v.dataset.reembVer), recarregar);
    if (p) {
      const r = reembolsos.find((x) => x.id === p.dataset.reembPago);
      const j = janela('Reembolso pago', `<form class="grade" style="gap:12px" novalidate><p>${esc((d.pessoa(r.pessoa_id) || {}).nome || '')} · ${dinheiro(r.total)}</p>
        <p class="peq apagado">Use só se o PIX não vai aparecer num extrato importado (pago por outra conta, em dinheiro…). Se vier no extrato, eu ligo sozinha.</p>
        <div class="grade g2" style="gap:10px"><div class="campo"><label for="rp-dia">Pago em</label><input type="date" id="rp-dia" value="${hojeISO()}"></div>
        <div class="campo"><label for="rp-conta">Conta</label><select id="rp-conta"><option value="">—</option>${['Sicoob', 'Sicoob Mentorei', 'Unicred', 'Cartão PJ'].map((c) => `<option>${c}</option>`).join('')}</select></div></div>
        <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 520 });
      j.corpo.querySelector('form').addEventListener('submit', async (e2) => {
        e2.preventDefault();
        try { await pagarReembolsos([r], { id: null, data: j.corpo.querySelector('#rp-dia').value || hojeISO(), conta: j.corpo.querySelector('#rp-conta').value || null }); j.fechar(); avisar('Reembolso marcado como pago.'); recarregar(); }
        catch (e) { avisar(explicarErro(e), true); }
      });
    }
  });
}

function onde(d, x) {
  const t = x.turma_id && d.turmas.find((y) => y.id === x.turma_id), p = x.programa_id && d.programas.find((y) => y.id === x.programa_id), m = x.modulo_id && d.modulo(x.modulo_id);
  return [x.empresa_id && d.empresa(x.empresa_id).nome, t && t.nome, p && p.nome, m && `Módulo ${m.numero}`].filter(Boolean).map(esc).join(' · ');
}

async function janelaVer(d, r, recarregar) {
  const { data, error } = await sb.from('fin_despesas').select('*').eq('reembolso_id', r.id).order('data');
  if (error) { avisar(explicarErro(error), true); return; }
  const j = janela(`Reembolso de ${(d.pessoa(r.pessoa_id) || {}).nome || ''} · ${dinheiro(r.total)}`, `<div class="grade" style="gap:10px">
    <p class="apagado">${esc(r.arquivo || '')}${r.enviado_em ? ` · enviado em ${dataBR(r.enviado_em)}` : ''}${r.situacao === 'pago' ? ` · PIX em ${dataBR(r.pago_em)}` : ' · esperando o PIX'}</p>
    <div class="tabela"><table><thead><tr><th>Dia</th><th>Para que foi</th><th>Tipo</th><th>É de</th><th style="text-align:right">Valor</th></tr></thead><tbody>
    ${(data || []).map((x) => `<tr><td>${dataBR(x.data)}</td><td>${esc(x.descricao)}</td><td>${esc(F.nomeCategoria(x.categoria))}</td><td>${onde(d, x) || '<span class="selo alerta">escolher em Conferir</span>'}</td><td class="fn-num" style="text-align:right">${dinheiro(x.valor)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="peq apagado">Para mudar um gasto, abra em Despesas (mês do gasto) → Editar.</p>
    <div class="linha">${r.caminho ? '<button class="btn peq" type="button" id="rv-arq">Ver a planilha</button>' : ''}<span style="flex:1"></span>
      ${r.situacao === 'pago' ? '' : '<button class="btn perigo peq" type="button" id="rv-apagar">Apagar este reembolso</button>'}</div></div>`, { largura: 900 });
  if (r.caminho) j.corpo.querySelector('#rv-arq').addEventListener('click', async () => { try { (await import('./financeiro-recibo.js')).abrirComprovante(r.caminho); } catch (e) { avisar(explicarErro(e), true); } });
  const ap = j.corpo.querySelector('#rv-apagar');
  if (ap) ap.addEventListener('click', async () => {
    if (ap.dataset.certeza !== '1') { ap.dataset.certeza = '1'; ap.textContent = 'Clique de novo: apaga o reembolso e os gastos dele'; return; }
    const { error: e } = await sb.from('fin_reembolsos').delete().eq('id', r.id);
    if (e) { avisar(explicarErro(e), true); return; }
    j.fechar(); avisar('Reembolso apagado.'); recarregar();
  });
}

// ---------- importar ----------
async function lerArquivo(arq) {
  if (/\.pdf$/i.test(arq.name) || arq.type === 'application/pdf') {
    const { linhasDoPdf } = await import('./financeiro-extratos.js');
    return (await linhasDoPdf(arq)).map((l) => l.split('\t'));
  }
  const XLSX = await import(XLSX_URL);
  const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array', cellDates: false });
  // a aba com mais linhas que tenham valor (planilhas com capa ou resumo)
  let melhor = null;
  for (const n of wb.SheetNames) {
    const ls = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const h = R.acharCabecalho(ls);
    const n2 = h.cabecalho >= 0 ? R.lerGastos(ls, h).length : 0;
    if (!melhor || n2 > melhor.n) melhor = { ls, n: n2 };
  }
  return melhor ? melhor.ls : [];
}

export async function janelaImportar(d, recarregar) {
  const [mm, regras, movs] = await Promise.all([
    sb.from('modulo_mentores').select('modulo_id, mentor_id'),
    sb.from('fin_regras_extrato').select('*'),
    sb.from('fin_movimentos').select('*').lt('valor', 0).gte('data', F.somarDias(hojeISO(), -150)),
  ]);
  const mentoresDoModulo = (id) => (mm.data || []).filter((x) => x.modulo_id === id).map((x) => x.mentor_id);
  const pessoas = d.perfis.filter((p) => p.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const X = await import('../financeiro-extrato.js');
  const pessoaDoTexto = pessoaDoTextoCom(regras.data, pessoas, X);
  const j = janela('Importar planilha de reembolso', `<div class="grade" style="gap:12px">
    <p>Escolha a planilha de reembolso (Excel, CSV ou PDF) de uma sócia ou de um mentor. Eu leio cada gasto, separo por tipo e coloco no cliente, na turma e no módulo certos. Nada é gravado antes de você conferir.</p>
    <div class="linha"><label class="btn pri" for="ri-arq" style="cursor:pointer">📂 Escolher a planilha</label><input type="file" id="ri-arq" accept=".xlsx,.xls,.xlsm,.csv,.ods,.pdf" hidden><span class="peq apagado" id="ri-nome"></span></div>
    <div id="ri-previa"></div></div>`, { largura: 1100 });
  const alvo = j.corpo.querySelector('#ri-previa');
  j.corpo.querySelector('#ri-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!arq) return;
    j.corpo.querySelector('#ri-nome').textContent = arq.name;
    alvo.innerHTML = '<p class="apagado">Lendo a planilha…</p>';
    try {
      const linhas = await lerArquivo(arq);
      const h = R.acharCabecalho(linhas);
      if (h.cabecalho < 0) { alvo.innerHTML = '<div class="aviso erro">Não achei a tabela dos gastos (uma linha com os títulos das colunas, com pelo menos "Valor" e "Data" ou "Descrição"). Me mande a planilha que eu ensino a plataforma a ler esse modelo.</div>'; return; }
      const ano = Number((h.enviado || hojeISO()).slice(0, 4));
      const gastos = R.lerGastos(linhas, h, { anoPadrao: ano });
      if (!gastos.length) { alvo.innerHTML = '<div class="aviso erro">Achei os títulos das colunas, mas nenhum gasto com valor embaixo deles.</div>'; return; }
      previa({ d, alvo, arq, h, gastos, pessoas, mentoresDoModulo, pessoaDoTexto, movimentos: movs.data || [], fechar: () => { j.fechar(); recarregar(); } });
    } catch (e) { alvo.innerHTML = `<div class="aviso erro">Não consegui ler a planilha: ${esc(explicarErro(e))}</div>`; }
  });
}

function previa(x) {
  const { d, alvo, arq, h, gastos, pessoas } = x;
  let pessoa = R.acharPessoa(h.pessoa, pessoas);
  const enviado = h.enviado || gastos.map((g) => g.data).filter(Boolean).sort().pop() || hojeISO();
  const itens = gastos.map((g) => ({ ...g, categoria: R.tipoDoGasto(g), onde: null, ok: true }));
  const alocarTodos = () => {
    const ctx = { empresas: d.empresas, turmas: d.turmas, programas: d.programas, modulos: d.modulos, mentoresDoModulo: x.mentoresDoModulo, pessoaId: pessoa ? pessoa.id : null };
    for (const it of itens) if (!it.mudado) it.onde = R.alocar(it, ctx);
  };
  alocarTodos();
  const valorOnde = (o) => (!o ? '' : o.geral ? 'g:' : o.turma_id ? `t:${o.turma_id}` : o.programa_id ? `p:${o.programa_id}` : o.empresa_id ? `e:${o.empresa_id}` : '');
  const modulosDa = (turmaId) => d.modulos.filter((m) => m.turma_id === turmaId).sort((a, b) => a.numero - b.numero);
  const desenhar = () => {
    const sel = itens.filter((i) => i.ok);
    const total = F.soma(sel, (i) => i.valor);
    const semOnde = sel.filter((i) => !valorOnde(i.onde)).length;
    alvo.innerHTML = `
      <div class="grade g3" style="gap:10px">
        <div class="campo"><label for="ri-pessoa">De quem é o reembolso *</label><select id="ri-pessoa"><option value="">Escolha…</option>${pessoas.map((p) => `<option value="${p.id}"${pessoa && p.id === pessoa.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
          ${h.pessoa ? `<small>Na planilha: ${esc(h.pessoa)}</small>` : ''}</div>
        <div class="campo"><label for="ri-env">Enviado em</label><input type="date" id="ri-env" value="${enviado}"><small>O PIX costuma sair alguns dias depois.</small></div>
        <div class="campo"><label for="ri-tit">Nome</label><input type="text" id="ri-tit" maxlength="120" value="${esc(`Reembolso de ${F.nomeMes((gastos.map((g) => g.data).filter(Boolean).sort().pop() || enviado).slice(0, 7))}`)}"></div>
      </div>
      <div class="tabela mt"><table><thead><tr><th></th><th>Dia</th><th>Para que foi</th><th>Tipo</th><th>É de</th><th>Módulo</th><th style="text-align:right">Valor</th></tr></thead><tbody>
      ${itens.map((it, i) => { const v = valorOnde(it.onde); const t = it.onde && it.onde.turma_id; const como = it.onde && COMO[it.onde.como];
        return `<tr${it.ok ? '' : ' style="opacity:.45"'}><td><input type="checkbox" data-ok="${i}"${it.ok ? ' checked' : ''} aria-label="Importar este gasto"></td>
        <td><input type="date" data-i="${i}" data-c="data" value="${it.data || ''}" aria-label="Dia"></td>
        <td><input type="text" data-i="${i}" data-c="descricao" value="${esc(it.descricao)}" aria-label="Para que foi">${it.cidade ? `<br><small class="apagado">${esc(it.cidade)}</small>` : ''}</td>
        <td><select data-i="${i}" data-c="categoria" aria-label="Tipo">${F.CATEGORIAS.filter(([k]) => k !== 'socia').map(([k, n]) => `<option value="${k}"${k === it.categoria ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></td>
        <td><select data-i="${i}" data-c="onde" aria-label="É de" data-busca="sim">${d.opcoesOnde(v || '').replace('<option value="">É de…</option>', '<option value="">Escolha o cliente…</option>')}</select>
          ${como ? `<br><span class="selo ${como[1]}">${como[0]}</span>` : v ? '' : '<br><span class="selo alerta">escolha</span>'}</td>
        <td>${t ? `<select data-i="${i}" data-c="modulo" aria-label="Módulo"><option value="">—</option>${modulosDa(t).map((m) => `<option value="${m.id}"${it.onde.modulo_id === m.id ? ' selected' : ''}>${m.numero} · ${m.data_hora ? dataBR(String(m.data_hora).slice(0, 10)) : 'sem data'}</option>`).join('')}</select>` : '<span class="apagado">—</span>'}</td>
        <td class="fn-num" style="text-align:right"><input type="number" data-i="${i}" data-c="valor" min="0" step="0.01" value="${Number(it.valor).toFixed(2)}" style="max-width:110px;text-align:right" aria-label="Valor"></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="linha mt"><b>Total: ${dinheiro(total)}</b><span class="peq apagado">${sel.length} gasto${sel.length === 1 ? '' : 's'}${semOnde ? ` · ${semOnde} sem cliente (vão para Conferir)` : ''}</span><span style="flex:1"></span>
        <button class="btn pri" type="button" id="ri-salvar">Importar o reembolso</button></div>
      <p class="peq apagado mt">Gasto sem cliente vai para a lista Conferir. Os gastos ficam "a pagar" até o PIX aparecer no extrato.</p>`;
  };
  desenhar();
  alvo.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'ri-pessoa') { pessoa = pessoas.find((p) => p.id === t.value) || null; alocarTodos(); desenhar(); return; }
    if (t.dataset.ok != null) { itens[Number(t.dataset.ok)].ok = t.checked; desenhar(); return; }
    const c = t.dataset.c; if (!c) return;
    const it = itens[Number(t.dataset.i)];
    if (c === 'onde') { const campos = d.camposOnde(t.value || '', { categoria: it.categoria }); it.onde = { empresa_id: campos.empresa_id, turma_id: campos.turma_id, programa_id: campos.programa_id, modulo_id: null, como: null, geral: t.value === 'g:', socia: campos.categoria === 'socia' ? campos.pessoa_id : null }; it.mudado = true; desenhar(); return; }
    if (c === 'modulo') { it.onde = { ...(it.onde || {}), modulo_id: t.value || null }; it.mudado = true; return; }
    if (c === 'valor') { it.valor = Number(t.value) || 0; desenhar(); return; }
    it[c] = t.value;
    if (c === 'data' && !it.mudado) { alocarTodos(); desenhar(); }
  });
  alvo.addEventListener('click', async (ev) => {
    if (ev.target.id !== 'ri-salvar') return;
    const b = ev.target;
    const pid = alvo.querySelector('#ri-pessoa').value;
    if (!pid) { avisar('Escolha de quem é o reembolso.', true); return; }
    const sel = itens.filter((i) => i.ok);
    if (!sel.length) { avisar('Marque pelo menos um gasto.', true); return; }
    if (sel.some((i) => !i.data)) { avisar('Todo gasto precisa do dia.', true); return; }
    b.disabled = true; b.textContent = 'Importando…';
    const nomePessoa = (d.pessoa(pid) || {}).nome || '';
    try {
      // a planilha fica guardada (pasta privada), para conferir depois
      let caminho = null;
      const up = await sb.storage.from('financeiro').upload(`reembolsos/${hojeISO().slice(0, 7)}/${crypto.randomUUID()}-${arq.name.replace(/[^\w.\-]+/g, '_')}`, arq, { upsert: false, contentType: arq.type || 'application/octet-stream' });
      if (!up.error) caminho = up.data.path;
      const total = F.soma(sel, (i) => i.valor);
      const enviado = alvo.querySelector('#ri-env').value || null;
      const ins = await sb.from('fin_reembolsos').insert({ pessoa_id: pid, titulo: alvo.querySelector('#ri-tit').value.trim() || null, arquivo: arq.name, caminho, enviado_em: enviado, total }).select('*').single();
      if (ins.error) throw ins.error;
      const reemb = ins.data;
      const linhasDesp = sel.map((i) => {
        const o = i.onde || {};
        const socia = o.socia || null;
        const temOnde = !!(o.empresa_id || o.turma_id || o.programa_id || socia || o.geral);
        return { data: i.data, descricao: (i.descricao || F.nomeCategoria(i.categoria)).slice(0, 200), valor: i.valor, categoria: socia ? 'socia' : i.categoria,
          empresa_id: o.empresa_id || null, turma_id: o.turma_id || null, programa_id: o.programa_id || null, modulo_id: o.modulo_id || null, pessoa_id: socia || pid,
          origem: 'reembolso', reembolso_id: reemb.id, observacoes: [`Reembolso de ${nomePessoa}`, i.cidade && `Cidade: ${i.cidade}`, i.observacao].filter(Boolean).join(' · ').slice(0, 300),
          conferir: temOnde ? null : `De qual cliente é este gasto do reembolso de ${nomePessoa}?` };
      });
      const e2 = await sb.from('fin_despesas').insert(linhasDesp);
      if (e2.error) { await sb.from('fin_reembolsos').delete().eq('id', reemb.id); throw e2.error; }
      // o PIX já está no extrato? liga agora
      const mov = R.movimentoDoReembolso(reemb, x.movimentos, { pessoaDoTexto: x.pessoaDoTexto });
      let msg = `Reembolso de ${nomePessoa} importado: ${sel.length} gasto${sel.length === 1 ? '' : 's'}, ${dinheiro(total)}.`;
      if (mov) { await ligarMovimento(mov, [reemb], null); msg += ` Achei o PIX de ${dataBR(mov.data)} no ${mov.conta} e já marquei como pago.`; }
      else msg += ' Quando o PIX aparecer no extrato, eu ligo sozinha.';
      avisar(msg);
      x.fechar();
    } catch (e) { b.disabled = false; b.textContent = 'Importar o reembolso'; avisar(explicarErro(e), true); }
  });
}

// ---------- para a conferência do extrato ----------
// Antes das regras: um PIX com o total de um reembolso a pagar é o reembolso (e não retirada de sócia).
export function sugestaoReembolso(mov, reembolsos, pessoaDoTexto) {
  if (!reembolsos || !reembolsos.length) return null;
  const s = R.reembolsoDoMovimento(mov, reembolsos, { pessoaDoTexto });
  return s ? { tipo: 'reembolso', reembolsos: s.reembolsos, automatico: s.automatico } : null;
}
