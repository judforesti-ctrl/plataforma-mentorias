// Financeiro → "📥 Importar a planilha da Cintia" (11/11/2026, pedido da Juliana: enquanto a Cintia ainda usa a planilha
// "Controle de NF e recebimentos" para as notas, ela importa a planilha aqui e a plataforma se atualiza sozinha: notas
// emitidas, números de nota, recebimentos, linhas que faltam e o total dos meses antigos). Nada muda antes da confirmação;
// cada importação fica guardada em fin_importacoes (script 69) com o "antes", para desfazer.
// Tudo aparece separado por CNPJ. Regras puras em ../financeiro-planilha.js.
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';
import * as P from '../financeiro-planilha.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const agora = () => new Date().toISOString();
const CAMPOS = ['valor', 'situacao', 'nota_numero', 'nota_emitida_em', 'vencimento', 'recebido_em', 'valor_recebido'];

export async function janelaPlanilha(d, recarregar) {
  const j = janela('Importar a planilha da Cintia', '<div id="pl-corpo"><p class="apagado">Carregando…</p></div>', { largura: 1060 });
  const corpo = j.corpo.querySelector('#pl-corpo');
  const ult = await sb.from('fin_importacoes').select('id, arquivo, resumo, criado_em, desfeita_em').order('criado_em', { ascending: false }).limit(1);
  const semScript = ult.error && faltaScript(ult.error);
  const ultima = !ult.error && ult.data && ult.data[0] && !ult.data[0].desfeita_em ? ult.data[0] : null;
  corpo.innerHTML = `
    <p>Escolha a planilha <b>Controle de NF e recebimentos</b> (Excel). A plataforma lê a aba <b>Faturamento</b> do ano e mostra, separado por CNPJ, o que vai mudar: notas enviadas, números de nota, depósitos recebidos e linhas que ainda não estão aqui.</p>
    <p class="peq apagado mt">Nada muda antes de você clicar em "Atualizar a plataforma". A plataforma só avança (nota emitida → recebido); nunca apaga o que já está aqui.</p>
    ${semScript ? '<div class="aviso mt">Falta rodar o script <b>69</b> no Supabase: sem ele a importação funciona, mas não dá para desfazer.</div>' : ''}
    <div class="linha mt"><label class="btn pri" for="pl-arq" style="cursor:pointer">📂 Escolher a planilha</label><input type="file" id="pl-arq" accept=".xlsx,.xls,.xlsm" hidden>
      <span class="peq apagado" id="pl-nome"></span></div>
    ${ultima ? `<div class="cartao mt" style="margin-bottom:0;padding:10px 14px"><div class="linha"><span style="flex:1">Última importação: <b>${esc(ultima.arquivo || 'planilha')}</b> em ${dataBR(ultima.criado_em)} · ${Number((ultima.resumo || {}).mudadas || 0) + Number((ultima.resumo || {}).criadas || 0) + Number((ultima.resumo || {}).meses || 0)} mudanças</span>
      <button class="btn peq" type="button" id="pl-desfazer">Desfazer essa importação</button></div></div>` : ''}
    <div id="pl-previa" class="mt"></div>`;
  if (ultima) corpo.querySelector('#pl-desfazer').addEventListener('click', (ev) => desfazer(ultima.id, ev.target, () => { j.fechar(); recarregar(); }));
  corpo.querySelector('#pl-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!arq) return;
    corpo.querySelector('#pl-nome').textContent = arq.name;
    const alvo = corpo.querySelector('#pl-previa');
    alvo.innerHTML = '<p class="apagado">Lendo a planilha…</p>';
    try {
      const XLSX = await import(XLSX_URL);
      const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
      const abas = wb.SheetNames.map((n) => ({ n, ano: Number((n.match(/^\s*faturamento\s+(\d{4})\s*$/i) || [])[1]) })).filter((x) => x.ano).sort((a, b) => b.ano - a.ano);
      if (!abas.length) { alvo.innerHTML = '<div class="aviso erro">Não achei a aba "Faturamento 2026" (ou de outro ano) nesta planilha. É a planilha "Controle de NF e recebimentos"?</div>'; return; }
      const anoHoje = new Date().getFullYear();
      const escolhida = abas.find((x) => x.ano === anoHoje) || abas[0];
      const ler = (aba) => { const ls = XLSX.utils.sheet_to_json(wb.Sheets[aba.n], { header: 1, raw: true, defval: null }); const blocos = P.lerAba(ls, aba.ano); blocos.resumo = P.resumoDaAba(ls, aba.ano); return blocos; };
      previa(d, alvo, { arquivo: arq.name, abas, aba: escolhida, ler, semScript }, () => { j.fechar(); recarregar(); });
    } catch (e) { alvo.innerHTML = `<div class="aviso erro">Não consegui ler a planilha: ${esc(explicarErro(e))}</div>`; }
  });
}

// ---------- prévia ----------
function montar(d, blocos) {
  for (const b of blocos) P.numerosDasNotasSoltas(b);
  const itens = blocos.flatMap((b) => b.itens);
  const ctx = { linhas: d.receber, plano: d.plano, empresa: d.empresa };
  const res = P.casar(itens, ctx);
  const corte = F.somarMeses(d.config.inicio, -3);   // linhas sem par só dos últimos meses (as antigas ficam no total do mês)
  const mudar = [], iguais = [], novas = [], antigas = [];
  for (const r of res) {
    if (r.linha) {
      const p = d.plano(r.linha.plano_id);
      const m = P.mudancasDe(r.item, r.linha, { prazo: p ? p.prazo_dias : 30 });
      (m.textos.length ? mudar : iguais).push({ ...r, ...m, cnpj: d.cnpjDe(r.linha) });
    } else if (r.item.mes >= corte) novas.push({ ...r, sugestao: sugerirOnde(d, r) });
    else antigas.push(r);
  }
  const totais = P.totaisDosMeses(blocos, blocos.resumo);
  const meses = Object.entries(totais).filter(([m, v]) => m < d.config.inicio && v > 0).map(([mes, v]) => {
    const atual = d.meses.find((x) => x.mes === mes);
    const antes = atual && atual.faturado_planilha != null ? Number(atual.faturado_planilha) : null;
    return { mes, valor: v, antes };
  }).filter((x) => x.antes == null || Math.abs(x.antes - x.valor) >= 1);
  return { mudar, iguais, novas, antigas, meses, semValor: blocos.flatMap((b) => b.semValor.map((x) => ({ ...x, mes: b.mes }))) };
}

// Onde pôr uma linha que não está na plataforma: o plano da linha parecida, senão o plano ou o cliente cujo nome está no texto
function sugerirOnde(d, r) {
  if (r.parecida) return `l:${r.parecida.id}`;   // a linha parecida (mesmo nome, valor um pouco diferente): corrigir o valor
  const minhas = new Set(P.palavras(r.item.cliente));
  const nota = (texto) => { const ps = P.palavras(texto); return ps.length && ps.every((w) => minhas.has(w)) ? ps.length : 0; };
  const planos = d.planos.map((p) => ({ v: `p:${p.id}`, n: nota(`${d.empresa(p.empresa_id).nome} ${p.titulo}`) })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n);
  if (planos.length === 1 || (planos.length > 1 && planos[0].n > planos[1].n)) return planos[0].v;
  const emps = d.empresas.map((e) => ({ v: `e:${e.id}`, n: nota(e.nome) })).filter((x) => x.n >= 1).sort((a, b) => b.n - a.n);
  return emps.length && (emps.length === 1 || emps[0].n > emps[1].n) ? emps[0].v : '';
}

function opcoesOnde(d, atual, parecida) {
  const planos = [...d.planos].sort((a, b) => d.empresa(a.empresa_id).nome.localeCompare(d.empresa(b.empresa_id).nome) || a.titulo.localeCompare(b.titulo));
  const emps = [...d.empresas].sort((a, b) => a.nome.localeCompare(b.nome));
  const op = (v, t) => `<option value="${v}"${v === atual ? ' selected' : ''}>${esc(t)}</option>`;
  return `<option value="">Não pôr na plataforma</option>
    ${parecida ? op(`l:${parecida.id}`, `Corrigir a linha parecida: ${dinheiro(parecida.valor)} → valor da planilha`) : ''}
    <optgroup label="Turmas e mentorias">${planos.map((p) => op(`p:${p.id}`, `${d.empresa(p.empresa_id).nome} · ${p.titulo}`)).join('')}</optgroup>
    <optgroup label="Só o cliente (linha avulsa)">${emps.map((e) => op(`e:${e.id}`, e.nome)).join('')}</optgroup>`;
}

const textoLinha = (d, l) => { const p = d.plano(l.plano_id); return `${esc(d.empresa(l.empresa_id).nome)}<br><small class="apagado">${esc(p ? p.titulo : 'avulsa')} · ${esc(l.descricao)} · ${dataBR(l.data)} · ${dinheiro(l.valor)}</small>`; };
const textoItem = (it) => `${esc(it.cliente.length > 110 ? `${it.cliente.slice(0, 110)}…` : it.cliente)}<br><small class="apagado">${F.nomeMes(it.mes, true)} · ${it.dia ? dataBR(it.dia) : 'sem dia'} · ${dinheiro(it.valor)} · linha ${it.linha} da planilha</small>`;
const selos = (textos) => `<div class="fn-imp-muda">${textos.map((t) => `<span class="selo ${/recebido/.test(t) ? 'ok' : 'alerta'}">${esc(t)}</span>`).join('')}</div>`;

function previa(d, el, ctxArq, fechar) {
  const { abas, ler } = ctxArq;
  let aba = ctxArq.aba;
  let dados = montar(d, ler(aba));
  const desenhar = () => {
    const { mudar, iguais, novas, antigas, meses, semValor } = dados;
    el.innerHTML = `
      ${abas.length > 1 ? `<div class="campo" style="max-width:260px"><label for="pl-aba">Aba da planilha</label><select id="pl-aba" data-busca="nao">${abas.map((a) => `<option value="${esc(a.n)}"${a.n === aba.n ? ' selected' : ''}>${esc(a.n)}</option>`).join('')}</select></div>` : ''}
      ${!mudar.length && !novas.length && !iguais.length && !antigas.length ? '<div class="aviso mt">Não achei os meses nesta aba (a linha "Data | Cliente | Valor"). Escolha outra aba.</div>' : ''}
      <div class="grade g4 mt">
        <div class="cartao numero destaque"><b>${mudar.length}</b><span>linhas que a planilha atualiza</span></div>
        <div class="cartao numero"><b>${novas.length}</b><span>na planilha e não na plataforma</span></div>
        <div class="cartao numero"><b>${iguais.length}</b><span>já iguais (nada a fazer)</span></div>
        <div class="cartao numero"><b>${meses.length}</b><span>total de mês antigo para acertar</span></div>
      </div>
      ${mudar.length ? `<h3 class="mt">O que a planilha atualiza</h3>
        <p class="peq apagado">Separado pelo CNPJ que emite a nota. Desmarque o que não quiser mudar.</p>
        ${F.porCnpj(mudar, (x) => x.cnpj).map(([k, ls]) => `${cabCnpj(d, k, ls.length)}
          <div class="tabela cartao" style="padding:0;margin-bottom:14px"><table><thead><tr><th><input type="checkbox" data-todas="m" checked aria-label="Marcar todas"></th><th>Na planilha</th><th>Na plataforma</th><th>O que muda</th></tr></thead><tbody>
          ${ls.map((x) => `<tr><td><input type="checkbox" data-m="${mudar.indexOf(x)}" checked aria-label="Aplicar"></td><td>${textoItem(x.item)}</td><td>${textoLinha(d, x.linha)}</td><td>${selos(x.textos)}${x.item.depositoCorrigido ? '<small class="apagado">o ano do depósito estava errado na planilha</small>' : ''}</td></tr>`).join('')}
          </tbody></table></div>`).join('')}` : ''}
      ${novas.length ? `<h3 class="mt">Na planilha e não na plataforma (${novas.length})</h3>
        <p class="peq apagado">Para pôr na plataforma, escolha em "Onde pôr" a turma ou mentoria (ou o cliente, para uma linha avulsa) e marque a caixa. A linha entra com a nota e o recebimento que a planilha diz.</p>
        <div class="tabela cartao" style="padding:0"><table><thead><tr><th></th><th>Na planilha</th><th>O que diz</th><th>Onde pôr</th><th>CNPJ</th></tr></thead><tbody>
        ${novas.map((x, i) => { const nova = P.linhaNova(x.item); return `<tr><td><input type="checkbox" data-n="${i}"${x.sugestao ? '' : ' disabled'} aria-label="Pôr na plataforma"></td>
          <td>${textoItem(x.item)}${x.parecida ? `<br><small>Parecida na plataforma: ${esc(d.empresa(x.parecida.empresa_id).nome)} · ${esc(x.parecida.descricao)} · ${dinheiro(x.parecida.valor)} (valor diferente)</small>` : ''}</td>
          <td>${selos([F.SITUACOES[nova.situacao], nova.nota_numero && `nota nº ${nova.nota_numero}`, nova.recebido_em && `recebido em ${dataBR(nova.recebido_em)}`].filter(Boolean))}</td>
          <td><select data-onde="${i}" aria-label="Onde pôr" style="max-width:280px">${opcoesOnde(d, x.sugestao, x.parecida)}</select></td>
          <td><select data-cnpj="${i}" data-busca="nao" aria-label="CNPJ da nota"${x.sugestao.startsWith('e:') ? '' : ' disabled'}>${F.CHAVES_CNPJ.map((k) => `<option value="${k}"${cnpjDoOnde(d, x.sugestao) === k ? ' selected' : ''}>${esc(d.cnpjs[k].apelido)}</option>`).join('')}</select></td></tr>`; }).join('')}
        </tbody></table></div>` : ''}
      ${meses.length ? `<h3 class="mt">Total dos meses antes de ${F.nomeMes(d.config.inicio)}</h3>
        <p class="peq apagado">Nesses meses o faturado vem da planilha (ela não separa por CNPJ).</p>
        <div class="tabela cartao" style="padding:0"><table><tbody>${meses.map((x, i) => `<tr><td><input type="checkbox" data-mes="${i}" checked aria-label="Acertar o total"></td><td>${F.nomeMes(x.mes)}</td>
          <td class="fn-num">${x.antes == null ? 'sem valor' : dinheiro(x.antes)} → <b>${dinheiro(x.valor)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${antigas.length || semValor.length || iguais.length ? `<details class="mt"><summary class="peq">Ver o resto (${iguais.length} iguais, ${antigas.length} de meses antigos que não estão na plataforma, ${semValor.length} sem valor)</summary>
        ${iguais.length ? `<p class="peq mt"><b>Já iguais:</b> ${iguais.map((x) => esc(x.item.cliente.slice(0, 40))).join(' · ')}</p>` : ''}
        ${antigas.length ? `<p class="peq mt"><b>Meses antigos fora da plataforma</b> (contam só no total do mês): ${antigas.map((x) => `${esc(x.item.cliente.slice(0, 40))} (${dinheiro(x.item.valor)})`).join(' · ')}</p>` : ''}
        ${semValor.length ? `<p class="peq mt"><b>Sem valor na planilha</b> (não entram): ${semValor.map((x) => esc(x.cliente.slice(0, 40))).join(' · ')}</p>` : ''}</details>` : ''}
      <div class="linha mt" style="position:sticky;bottom:0;background:var(--papel);padding:10px 0"><button class="btn pri" type="button" id="pl-aplicar">Atualizar a plataforma</button><span class="peq apagado" id="pl-conta"></span></div>`;
    contar();
  };
  const marcados = () => ({
    m: [...el.querySelectorAll('[data-m]:checked')].map((c) => dados.mudar[Number(c.dataset.m)]),
    n: [...el.querySelectorAll('[data-n]:checked')].map((c) => ({ x: dados.novas[Number(c.dataset.n)], onde: el.querySelector(`[data-onde="${c.dataset.n}"]`).value, cnpj: el.querySelector(`[data-cnpj="${c.dataset.n}"]`).value })).filter((y) => y.onde),
    meses: [...el.querySelectorAll('[data-mes]:checked')].map((c) => dados.meses[Number(c.dataset.mes)]),
  });
  const contar = () => {
    const m = marcados(); const n = m.m.length + m.n.length + m.meses.length;
    const b = el.querySelector('#pl-aplicar'); if (!b) return;
    b.disabled = !n; b.textContent = n ? `Atualizar a plataforma (${n} ${n === 1 ? 'mudança' : 'mudanças'})` : 'Nada marcado';
  };
  desenhar();
  el.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'pl-aba') { aba = abas.find((a) => a.n === t.value); dados = montar(d, ler(aba)); desenhar(); return; }
    if (t.dataset.todas) t.closest('table').querySelectorAll('[data-m]').forEach((c) => { c.checked = t.checked; });
    if (t.dataset.onde != null) {
      const i = t.dataset.onde, caixa = el.querySelector(`[data-n="${i}"]`), cnpj = el.querySelector(`[data-cnpj="${i}"]`);
      caixa.disabled = !t.value; caixa.checked = !!t.value;
      cnpj.disabled = !t.value.startsWith('e:');
      if (!t.value.startsWith('e:')) cnpj.value = cnpjDoOnde(d, t.value);
    }
    contar();
  });
  el.addEventListener('click', async (ev) => {
    if (ev.target.id !== 'pl-aplicar') return;
    ev.target.disabled = true; ev.target.textContent = 'Atualizando…';
    try {
      const r = await aplicar(d, marcados(), ctxArq);
      avisar(`Pronto: ${r.mudadas} ${r.mudadas === 1 ? 'linha atualizada' : 'linhas atualizadas'}, ${r.criadas} ${r.criadas === 1 ? 'nova' : 'novas'}${r.meses ? `, ${r.meses} ${r.meses === 1 ? 'mês acertado' : 'meses acertados'}` : ''}.`);
      fechar();
    } catch (e) { ev.target.disabled = false; contar(); avisar(explicarErro(e), true); }
  });
}
// CNPJ de onde a linha vai: o do plano, o da linha parecida, ou (avulsa) o escolhido
function cnpjDoOnde(d, onde) {
  const [t, id] = String(onde || '').split(':');
  if (t === 'p') return (d.plano(id) || {}).emissor || 'principal';
  if (t === 'l') { const l = d.receber.find((x) => x.id === id); return l ? d.cnpjDe(l) : 'principal'; }
  return 'principal';
}
const cabCnpj = (d, k, n) => { const c = d.cnpjs[k]; return `<div class="fn-cnpj"><b>${esc(c.apelido || c.nome)}</b><span>${esc(c.nome)}${c.cnpj ? ` · CNPJ ${esc(c.cnpj)}` : ''}</span><em>${n} linha${n === 1 ? '' : 's'}</em></div>`; };

// ---------- gravar e desfazer ----------
async function aplicar(d, { m, n, meses }, { arquivo, semScript }) {
  const log = [];
  let corrigidas = 0;
  for (const x of m) {
    const antes = Object.fromEntries(CAMPOS.map((c) => [c, x.linha[c] ?? null]));
    const { error } = await sb.from('fin_receber').update({ ...x.novo, atualizado_em: agora() }).eq('id', x.linha.id);
    if (error) throw error;
    log.push({ tabela: 'fin_receber', id: x.linha.id, antes, depois: x.novo });
  }
  for (const { x, onde, cnpj } of n) {
    const [tipo, id] = onde.split(':');
    if (tipo === 'l') {   // corrige a linha parecida: valor da planilha + nota e recebimento
      const l = d.receber.find((y) => y.id === id);
      const p = d.plano(l.plano_id);
      const novo = { valor: x.item.valor, ...P.mudancasDe(x.item, l, { prazo: p ? p.prazo_dias : 30 }).novo };
      const antes = Object.fromEntries(CAMPOS.map((c) => [c, l[c] ?? null]));
      const { error } = await sb.from('fin_receber').update({ ...novo, atualizado_em: agora() }).eq('id', id);
      if (error) throw error;
      log.push({ tabela: 'fin_receber', id, antes, depois: novo });
      corrigidas++;
      continue;
    }
    const plano = tipo === 'p' ? d.plano(id) : null;
    const nova = P.linhaNova(x.item, { prazo: plano ? plano.prazo_dias : 30 });
    const reg = { ...nova, plano_id: plano ? plano.id : null, empresa_id: plano ? plano.empresa_id : id, observacoes: `Veio da planilha da Cintia (${arquivo}, linha ${x.item.linha}).`, atualizado_em: agora() };
    if (!plano) reg.emissor = cnpj;
    const { data, error } = await sb.from('fin_receber').insert(reg).select('id').single();
    if (error) throw error;
    log.push({ tabela: 'fin_receber', id: data.id, antes: null, depois: reg });
  }
  for (const x of meses) {
    const { error } = await sb.from('fin_meses').upsert({ mes: x.mes, faturado_planilha: x.valor, atualizado_em: agora() });
    if (error) throw error;
    log.push({ tabela: 'fin_meses', id: x.mes, antes: { faturado_planilha: x.antes }, depois: { faturado_planilha: x.valor } });
  }
  const resumo = { mudadas: m.length + corrigidas, criadas: n.length - corrigidas, meses: meses.length };
  if (!semScript) {
    const { error } = await sb.from('fin_importacoes').insert({ arquivo, resumo, mudancas: log });
    if (error) avisar(`A plataforma foi atualizada, mas o registro para desfazer não ficou gravado: ${explicarErro(error)}`, true);
  }
  return resumo;
}

async function desfazer(id, botao, depois) {
  if (botao.dataset.certeza !== '1') { botao.dataset.certeza = '1'; botao.textContent = 'Clique de novo para desfazer'; return; }
  botao.disabled = true;
  try {
    const { data, error } = await sb.from('fin_importacoes').select('mudancas').eq('id', id).single();
    if (error) throw error;
    for (const x of [...(data.mudancas || [])].reverse()) {
      let r;
      if (x.tabela === 'fin_receber') r = x.antes ? await sb.from('fin_receber').update({ ...x.antes, atualizado_em: agora() }).eq('id', x.id) : await sb.from('fin_receber').delete().eq('id', x.id);
      else if (x.tabela === 'fin_meses') r = await sb.from('fin_meses').upsert({ mes: x.id, faturado_planilha: x.antes ? x.antes.faturado_planilha : null, atualizado_em: agora() });
      if (r && r.error) throw r.error;
    }
    const u = await sb.from('fin_importacoes').update({ desfeita_em: agora() }).eq('id', id);
    if (u.error) throw u.error;
    avisar('Importação desfeita: tudo voltou como estava antes dela.');
    depois();
  } catch (e) { botao.disabled = false; avisar(explicarErro(e), true); }
}
