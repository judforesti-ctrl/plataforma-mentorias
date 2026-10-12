// Notas fiscais (script 32): importar a planilha de controle das notas emitidas pela Mentorei e mostrar as notas na ficha da
// empresa. Cada CNPJ/CPF da planilha vira um cliente: quem já está na plataforma (mesmo CNPJ ou nome que a administração
// confirma) não é duplicado, só recebe as notas e os dados que faltam. Nota há menos de 1 ano = cliente ativo; mais antiga =
// cliente inativo, que entra na Prospecção na lista "Clientes inativos".
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { norm, dinheiro } from './vendas.js';
import { comparar, palavras, MARCAS, formataCnpj } from './prospeccao.js';

export const LISTA_INATIVOS = 'Clientes inativos';
const AVISO_32 = 'Falta rodar o script <b>32-notas-fiscais.sql</b> no Supabase (SQL Editor → New query → colar → Run).';
const limpa = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const digitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const mesAno = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
// 1 ano antes de hoje: nota depois disso = cliente ativo
export const corteAtivo = () => { const d = new Date(`${hojeISO()}T12:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 1); return d.toISOString().slice(0, 10); };

// ---------- ler a planilha ----------
const COLUNAS = {
  numero: ['numero nf', 'numero da nota', 'nf'], emissao: ['data emissao', 'emissao', 'data'], cliente: ['cliente / razao social (xml)', 'cliente / razao social', 'cliente', 'razao social'],
  cnpj: ['cnpj/cpf', 'cnpj', 'cpf'], descricao: ['descricao servico', 'descricao'], valor: ['valor servicos', 'valor'], valor_liquido: ['valor liquido'],
  iss: ['iss'], pis: ['pis'], cofins: ['cofins'], inss: ['inss'], ir: ['ir'], csll: ['csll'], codigo_verificacao: ['codigo verificacao'],
  logradouro: ['logradouro'], numero_end: ['numero endereco'], complemento: ['complemento'], bairro: ['bairro'], cidade: ['cidade', 'municipio'], uf: ['uf'],
  cep: ['cep'], telefone: ['telefone (xml)', 'telefone'], email: ['e-mail (xml)', 'e-mail', 'email'],
};
// "1.234,56" ou 1234.56
const numero = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const t = String(v).replace(/[^\d,.-]/g, '');
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const dataISO = (v) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = limpa(v);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
};

export function lerNotas(XLSX, wb) {
  const notas = [];
  for (const aba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: '' });
    const h = linhas.findIndex((l) => l.some((c) => COLUNAS.numero.slice(0, 2).includes(norm(limpa(c)))));
    if (h < 0) continue;
    const cab = linhas[h].map((c) => norm(limpa(c)));
    const col = Object.fromEntries(Object.entries(COLUNAS).map(([k, nomes]) => [k, cab.findIndex((c) => nomes.includes(c))]));
    for (const l of linhas.slice(h + 1)) {
      const v = (k) => (col[k] >= 0 ? l[col[k]] : '');
      const num = parseInt(digitos(v('numero')), 10), emissao = dataISO(v('emissao'));
      if (!num || !emissao) continue;
      const email = limpa(v('email')).toLowerCase();
      notas.push({
        numero: num, emissao, cliente: String(v('cliente') || '').replace(/[\r\n\t]+/g, ' ').trim(), doc: digitos(v('cnpj')), descricao: String(v('descricao') || '').trim() || null,
        valor: numero(v('valor')), valor_liquido: numero(v('valor_liquido')), iss: numero(v('iss')), pis: numero(v('pis')), cofins: numero(v('cofins')),
        inss: numero(v('inss')), ir: numero(v('ir')), csll: numero(v('csll')), codigo_verificacao: limpa(v('codigo_verificacao')) || null,
        logradouro: limpa(v('logradouro')), numero_end: limpa(v('numero_end')), complemento: limpa(v('complemento')), bairro: limpa(v('bairro')),
        cidade: limpa(v('cidade')) || null, uf: limpa(v('uf')).toUpperCase().slice(0, 2) || null, cep: digitos(v('cep')) || null,
        telefone: digitos(v('telefone')) || null, email: /@/.test(email) ? email : null,
      });
    }
    if (notas.length) break;   // só a aba das notas (as outras são resumos)
  }
  return notas;
}

// ---------- montar os clientes ----------
const formataDoc = (d) => (d.length === 14 ? formataCnpj(d) : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d || null);
export const formataFone = (d) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);
const formataCep = (d) => (d && d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d || null);
const CONECTIVOS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'a', 'o', 'as', 'os', 'ao', 'aos', 'para', 'com', 'no', 'na']);
const SIGLAS_UF = new Set('AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' '));
// "COOPERATIVA DE CREDITO DO VALE LTDA" → "Cooperativa de Credito do Vale"; siglas de estado e sem vogal ficam maiúsculas
function titulo(t) {
  return t.split(' ').map((p, i) => p.split('/').map((q) => {
    if (SIGLAS_UF.has(q.toUpperCase()) && q === q.toUpperCase() && q.length === 2 && (p.includes('/') || i > 0)) return q;
    if (/\d/.test(q) || /^([A-Z]\.)+[A-Z]?$/.test(q) || (/^[A-Z]{2,4}$/.test(q) && !/[AEIOU]/.test(q)) || ['EMS', 'ADS', 'ELS', 'BR'].includes(q)) return q;
    const b = q.toLowerCase();
    return i > 0 && CONECTIVOS.has(b) ? b : b.charAt(0).toUpperCase() + b.slice(1);
  }).join('/')).join(' ');
}
// nome curto para a plataforma: a parte depois do " - " (ex.: "... - SICOOB PAULISTA"; nas notas o traço às vezes virou
// dois espaços ou ficou depois do LTDA), "Sescoop/UF" ou a razão social sem LTDA/S.A.
export function nomeAmigavel(razao, uf) {
  if (/^servi[cç]o nacional de aprendizagem do cooperativismo/i.test(limpa(razao)) && uf) return `Sescoop/${uf}`;
  const partes = String(razao).trim().split(/\s+[-–—¿]\s+|\s{2,}|\s+ltda\.?\s+/i).map((x) => limpa(x).replace(/^[-–—¿\s]+/, ''));
  let base = limpa(razao);
  const fim = partes.length > 1 ? partes[partes.length - 1].trim() : '';
  if (fim && (fim.split(' ').length >= 2 || fim.includes('/'))) base = fim;
  for (let i = 0; i < 3; i++) base = base.replace(/[\s,.-]+(ltda|limitada|s\/a|s\.a|sa|eireli|me|epp)\.?$/i, '').trim();
  return titulo(base);
}
const TIPO_COOP = /\b(cooperativa|coperativa|sicoob|sicredi|cresol|unicred|uniprime|unique br|ailos)\b/;
const SISTEMAS = [['sicoob', 'Sicoob'], ['sicredi', 'Sicredi'], ['cresol', 'Cresol'], ['unicred', 'Unicred'], ['uniprime', 'Uniprime'], ['ailos', 'Ailos']];
// e-mail de pessoa (nome.sobrenome) vira contato; os de setor (financeiro@, contabilidade@...) ficam como e-mail da empresa
const SETORES = /contab|financ|fiscal|compra|administ|adm\b|assessor|sescoop|paralegal|ubr|ptb|contas|social|integracao|sicoob|rh|comercial|atendimento|contato/;
const ehPessoa = (email) => { const local = email.split('@')[0]; return /^[a-z]{3,}[._][a-z]{3,}$/.test(local) && !SETORES.test(local); };
const nomeDoEmail = (email) => email.split('@')[0].split(/[._]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

export function montarClientes(notas) {
  const grupos = new Map();
  for (const n of notas) {
    const k = n.doc || `sem-${n.numero}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(n);
  }
  const corte = corteAtivo();
  return [...grupos.values()].map((ns) => {
    ns.sort((a, b) => a.emissao.localeCompare(b.emissao) || a.numero - b.numero);
    const ult = ns[ns.length - 1], doc = ult.doc;
    const razaoBruta = [...ns].reverse().find((n) => n.cliente)?.cliente || '', razao = limpa(razaoBruta);
    const nomesNota = [...new Set(ns.map((n) => limpa(n.cliente)).filter(Boolean))];
    const outrosNomes = nomesNota.filter((x, i) => norm(x) !== norm(razao) && nomesNota.findIndex((y) => norm(y) === norm(x)) === i);
    const fones = [...new Set([...ns].reverse().map((n) => n.telefone).filter((t) => t && t.length >= 10))];
    const emails = [...new Set([...ns].reverse().map((n) => n.email).filter(Boolean))];
    const pessoas = emails.filter(ehPessoa), setores = emails.filter((e) => !ehPessoa(e));
    const coop = doc.length !== 11 && TIPO_COOP.test(norm(razao));
    const textoSistema = norm([razao, ...outrosNomes, ...emails].join(' '));
    const sistema = coop ? (SISTEMAS.find(([k]) => textoSistema.includes(k)) || [])[1] || null : null;
    const comEnd = [...ns].reverse().find((n) => n.logradouro) || ult;
    const endereco = [[comEnd.logradouro, comEnd.numero_end].filter(Boolean).join(', '), comEnd.complemento, comEnd.bairro].filter(Boolean).join(' - ') || null;
    const obs = [outrosNomes.length ? `Também aparece nas notas como: ${outrosNomes.join('; ')}.` : '',
      fones.length > 1 ? `Outros telefones das notas: ${fones.slice(1).map(formataFone).join(', ')}.` : '',
      setores.length > 1 ? `Outros e-mails das notas: ${setores.slice(1).join(', ')}.` : ''].filter(Boolean).join(' ');
    const total = ns.reduce((a, n) => a + Number(n.valor || 0), 0);
    return {
      nome: razao ? nomeAmigavel(razaoBruta, ult.uf) : `Cliente sem nome (nota ${ns[0].numero})`, razao_social: razao || null,
      cnpj: formataDoc(doc), doc, tipo: doc.length === 11 ? 'outro' : coop ? 'cooperativa' : 'empresa', sistema,
      telefone: fones[0] ? formataFone(fones[0]) : null, email: setores[0] || null, cidade: comEnd.cidade || ult.cidade, uf: comEnd.uf || ult.uf,
      endereco, cep: formataCep(comEnd.cep), observacoes: obs || null, outros_nomes: outrosNomes, dominios: emails.map((e) => e.split('@')[1].split('.')[0]),
      contatos: pessoas.map((e) => ({ nome: nomeDoEmail(e), email: e })),
      primeira: ns[0].emissao, ultima: ult.emissao, total, ativo: ult.emissao >= corte,
      notas: ns.map((n) => ({ numero: n.numero, emissao: n.emissao, cnpj: formataDoc(n.doc), razao_social: n.cliente || null, descricao: n.descricao,
        valor: n.valor, valor_liquido: n.valor_liquido, iss: n.iss, pis: n.pis, cofins: n.cofins, inss: n.inss, ir: n.ir, csll: n.csll,
        codigo_verificacao: n.codigo_verificacao, endereco: [[n.logradouro, n.numero_end].filter(Boolean).join(', '), n.complemento, n.bairro].filter(Boolean).join(' - ') || null,
        cidade: n.cidade, uf: n.uf, cep: formataCep(n.cep), telefone: n.telefone ? formataFone(n.telefone) : null, email: n.email })),
    };
  }).sort((a, b) => b.ultima.localeCompare(a.ultima));
}

// Quem já está na plataforma: mesmo CNPJ (ou mesma raiz = matriz/filial) é certo; nome parecido a administração confere.
export function acharCadastradas(clientes, empresas) {
  const porDoc = new Map(), porRaiz = new Map();
  for (const e of empresas) {
    const d = digitos(e.cnpj); if (!d) continue;
    porDoc.set(d, e); if (d.length === 14 && !porRaiz.has(d.slice(0, 8))) porRaiz.set(d.slice(0, 8), e);
  }
  const usadas = new Set();
  for (const c of clientes) {
    const e = (c.doc && porDoc.get(c.doc)) || (c.doc.length === 14 && porRaiz.get(c.doc.slice(0, 8)));
    if (e) { c.certa = e; usadas.add(e.id); }
  }
  // sem CNPJ na plataforma: comparar nomes (nome curto, razão social, outros nomes) e o domínio do e-mail
  const candidatas = empresas.filter((e) => !digitos(e.cnpj));
  const nomes = (c) => [c.nome, c.razao_social, ...c.outros_nomes].filter(Boolean);
  const peloDominio = (e, c) => {
    const ps = palavras(e.nome).filter((p) => !MARCAS.has(p) && p.length >= 4);
    return ps.length && c.dominios.some((dm) => ps.every((p) => dm.includes(p)));
  };
  for (const nivel of ['igual', 'parecida', 'dominio']) {
    for (const c of clientes) {
      if (c.certa || c.palpite) continue;
      const e = candidatas.find((x) => !usadas.has(x.id) && (nivel === 'dominio' ? peloDominio(x, c) : nomes(c).some((n) => comparar(x.nome, n) === nivel)));
      if (e) { c.palpite = e; c.nivel = nivel; usadas.add(e.id); }
    }
  }
  return candidatas;
}

// ---------- janela de importação ----------
export async function janelaImportarNotas(ctx, d, aoTerminar) {
  let importou = false;
  const j = janela('Importar notas fiscais', `<div class="grade" style="gap:14px">
    <div class="campo"><label for="nf-arq">Planilha das notas fiscais (.xlsx)</label><input type="file" id="nf-arq" accept=".xlsx,.xls">
      <small>A planilha de controle das notas emitidas (uma linha por nota, com número, data, cliente, CNPJ, valor, endereço, telefone e e-mail). Pode importar de novo quando sair uma versão atualizada: as notas que já entraram são puladas.</small></div>
    <div id="nf-passos"></div></div>`, { largura: 900, aoFechar: () => { if (importou && aoTerminar) aoTerminar(); } });
  const passos = j.corpo.querySelector('#nf-passos');
  j.corpo.querySelector('#nf-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0]; if (!arq) return;
    passos.innerHTML = '<p class="apagado">Lendo a planilha…</p>';
    let notas;
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      notas = lerNotas(XLSX, XLSX.read(await arq.arrayBuffer(), { type: 'array', cellDates: true }));
    } catch (err) { passos.innerHTML = `<div class="aviso erro">Não consegui ler a planilha: ${esc(err.message || err)}</div>`; return; }
    if (!notas.length) { passos.innerHTML = '<div class="aviso erro">Não achei as colunas <b>Número NF</b> e <b>Data emissão</b> na planilha.</div>'; return; }
    // notas que já estão na plataforma
    const ja = new Set();
    for (let de = 0; ; de += 1000) {
      const r = await sb.from('notas_fiscais').select('numero').range(de, de + 999);
      if (r.error) { passos.innerHTML = `<div class="aviso erro">${faltaScript(r.error) ? AVISO_32 : esc(explicarErro(r.error))}</div>`; return; }
      for (const x of r.data || []) ja.add(x.numero);
      if ((r.data || []).length < 1000) break;
    }
    const todos = montarClientes(notas);
    const clientes = todos.filter((c) => c.notas.some((n) => !ja.has(n.numero)));
    const repetidos = todos.filter((c) => !clientes.includes(c));
    const candidatas = acharCadastradas(clientes, d.empresas);
    const anos = [notas.map((n) => n.emissao).sort()[0], notas.map((n) => n.emissao).sort().pop()].map((x) => x.slice(0, 4));
    const notasNovas = notas.filter((n) => !ja.has(n.numero)).length;
    const opcoes = (sel) => `<option value="">➕ Entra como nova</option>${candidatas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((e) => `<option value="${e.id}"${sel && sel.id === e.id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}`;
    const info = (c) => `<span class="selo ${c.ativo ? 'ok' : 'alerta'}">${c.ativo ? 'Ativo' : 'Inativo'}</span>
      <span class="peq apagado">última nota ${mesAno(c.ultima)} · ${c.notas.length} ${c.notas.length === 1 ? 'nota' : 'notas'} · ${dinheiro(c.total)}</span>`;
    const linhaC = (c, i) => `<tr><td><b>${esc(c.nome)}</b><div class="peq apagado">${esc([c.razao_social !== c.nome ? c.razao_social : '', c.cnpj, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '))}</div></td>
      <td>${info(c)}</td>
      <td>${c.certa ? `✔ <b>${esc(c.certa.nome)}</b><div class="peq apagado">mesmo CNPJ</div>`
        : `<select data-c="${i}" aria-label="Na plataforma">${opcoes(c.palpite)}</select>${c.palpite ? `<div class="peq"><span class="selo alerta">${c.nivel === 'igual' ? 'mesmo nome: confira' : c.nivel === 'dominio' ? 'pelo e-mail: confira' : 'nome parecido: confira'}</span></div>` : ''}`}</td></tr>`;
    const achadas = clientes.map((c, i) => [c, i]).filter(([c]) => c.certa || c.palpite);
    const outras = clientes.map((c, i) => [c, i]).filter(([c]) => !c.certa && !c.palpite);
    const nAtivos = clientes.filter((c) => c.ativo).length, nInativos = clientes.length - nAtivos;
    const reconferir = repetidos.filter((c) => !c.ativo).length;
    if (!clientes.length && !reconferir) { passos.innerHTML = `<div class="aviso ok">Todas as ${notas.length} notas desta planilha já estão na plataforma. Nada novo para importar.</div>`; return; }
    passos.innerHTML = `
      <div class="aviso ok"><b>${notas.length}</b> notas de <b>${todos.length}</b> clientes (${anos[0]} a ${anos[1]}) · ${dinheiro(notas.reduce((a, n) => a + Number(n.valor || 0), 0))}
        ${notas.length - notasNovas ? `<br>${notas.length - notasNovas} notas e ${repetidos.length} clientes já estavam na plataforma (não repito nada; só confiro quem passou de 1 ano sem nota e leva para ${LISTA_INATIVOS}).` : ''}
        ${clientes.length ? `<br>Para importar: <b>${clientes.length}</b> clientes · <b>${nAtivos}</b> ativos (nota depois de ${dataBR(corteAtivo())}) · <b>${nInativos}</b> inativos → lista <b>${LISTA_INATIVOS}</b> na Prospecção.` : ''}</div>
      ${clientes.length ? `<div class="cartao" style="padding:12px"><h3>1. Quem já está na plataforma?</h3>
        <p class="peq apagado mt">Quem já está cadastrado <b>não é duplicado</b>: recebe as notas e os dados que faltam (CNPJ, telefone, endereço). Confira os nomes marcados com <span class="selo alerta">confira</span>; se não for a mesma, escolha <b>Entra como nova</b>.</p>
        ${achadas.length ? `<div class="tabela mt"><table><thead><tr><th>Cliente nas notas</th><th>Situação</th><th>Na plataforma</th></tr></thead><tbody>${achadas.map(([c, i]) => linhaC(c, i)).join('')}</tbody></table></div>`
          : '<p class="peq mt">Nenhum cliente das notas bate com as empresas que já estão na plataforma.</p>'}
        ${outras.length ? `<details class="mt"><summary><b>${outras.length}</b> entram como novas (abra se reconhecer alguma que já está na plataforma com outro nome)</summary>
          <div class="tabela mt"><table><thead><tr><th>Cliente nas notas</th><th>Situação</th><th>Na plataforma</th></tr></thead><tbody>${outras.map(([c, i]) => linhaC(c, i)).join('')}</tbody></table></div></details>` : ''}</div>` : ''}
      <div class="cartao" style="padding:12px"><h3>2. Quem cuida da lista ${LISTA_INATIVOS}?</h3>
        <p class="peq apagado mt">${clientes.length ? `Os ${nInativos} inativos entram` : 'Quem passou de 1 ano sem nota entra'} em <b>A prospectar</b> com esta responsável. Dá para trocar uma por uma depois.</p>
        <select id="nf-resp" class="mt"><option value="">Sem responsável por enquanto</option>${d.equipe.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>
      <div class="linha"><button class="btn pri" type="button" id="nf-ok">${clientes.length ? `Importar ${clientes.length} clientes e ${notasNovas} notas` : 'Conferir os inativos'}</button><button class="btn" type="button" data-fechar>Desistir</button></div>
      <div id="nf-prog"></div>`;
    passos.querySelector('#nf-ok').addEventListener('click', async (e2) => {
      const btn = e2.target; btn.disabled = true;
      const prog = passos.querySelector('#nf-prog');
      const resp = passos.querySelector('#nf-resp').value;
      const campos = ['nome', 'razao_social', 'cnpj', 'tipo', 'sistema', 'telefone', 'email', 'cidade', 'uf', 'endereco', 'cep', 'observacoes', 'ativo', 'contatos', 'notas'];
      const enviar = clientes.map((c, i) => {
        const s = passos.querySelector(`select[data-c="${i}"]`);
        return { ...Object.fromEntries(campos.map((k) => [k, c[k]])), empresa_id: c.certa ? c.certa.id : (s ? s.value : ''), responsavel_id: resp };
      }).concat(repetidos.map((c) => ({ ...Object.fromEntries(campos.map((k) => [k, c[k]])), empresa_id: '', responsavel_id: resp })));
      const total = { novas: 0, ligadas: 0, notas: 0, contatos: 0, ja_importadas: 0, inativos: 0, mudaram_lista: 0, sairam: 0 };
      try {
        for (let k = 0; k < enviar.length; k += 10) {
          prog.innerHTML = `<p class="apagado">Importando… ${k} de ${enviar.length} clientes</p>`;
          const { data, error } = await sb.rpc('importar_notas_fiscais', { itens: enviar.slice(k, k + 10), fonte: 'notas fiscais' });
          if (error) throw error;
          importou = true;
          for (const c of Object.keys(total)) total[c] += Number((data || {})[c] || 0);
        }
        passos.innerHTML = `<div class="aviso ok"><b>Pronto!</b> ${total.notas} notas fiscais importadas.
          <br>${total.novas} empresas novas · ${total.ligadas} já estavam cadastradas (não duplicadas; receberam as notas)${total.ja_importadas ? ` · ${total.ja_importadas} já tinham sido importadas antes` : ''}${total.contatos ? ` · ${total.contatos} contatos de pessoas tirados dos e-mails` : ''}.
          <br><b>${total.inativos + total.mudaram_lista}</b> na lista <b>${LISTA_INATIVOS}</b>${total.mudaram_lista ? ` (${total.mudaram_lista === 1 ? '1 já estava em A prospectar e mudou' : `${total.mudaram_lista} já estavam em A prospectar e mudaram`} para esta lista)` : ''}${total.sairam ? ` · ${total.sairam === 1 ? '1 cliente ativo saiu' : `${total.sairam} clientes ativos saíram`} de A prospectar` : ''}.</div>
          <div class="linha mt"><a class="btn pri" href="#/vendas/prospeccao" data-ir>Ver ${LISTA_INATIVOS}</a><a class="btn" href="#/vendas/clientes" data-ir>Ver Clientes</a></div>`;
        passos.querySelectorAll('a[data-ir]').forEach((a) => a.addEventListener('click', async (e3) => {
          e3.preventDefault(); importou = false; j.fechar();
          if (a.getAttribute('href').endsWith('prospeccao')) (await import('./prospeccao.js')).abrirLista(LISTA_INATIVOS);
          ctx.irPara(a.getAttribute('href'));
        }));
      } catch (err) {
        const msg = faltaScript(err) ? 'Falta rodar o script 32-notas-fiscais.sql no Supabase.' : explicarErro(err);
        prog.innerHTML = `<div class="aviso erro">Parou no meio: ${esc(msg)} O que já entrou fica; pode importar a mesma planilha de novo que nada se repete.</div>`;
        btn.disabled = false;
      }
    });
  });
}

// ---------- cartão na ficha da empresa ----------
export async function cartaoNotas(el, empresaId) {
  const { data, error } = await sb.from('notas_fiscais').select('numero, emissao, valor, descricao').eq('empresa_id', empresaId).order('emissao', { ascending: false });
  if (error || !(data || []).length) { el.remove(); return; }
  data.sort((a, b) => b.emissao.localeCompare(a.emissao) || b.numero - a.numero);
  const total = data.reduce((a, n) => a + Number(n.valor || 0), 0);
  const ativo = data[0].emissao >= corteAtivo();
  const linha = (n) => `<tr><td class="peq">${dataBR(n.emissao)}</td><td class="peq">${n.numero}</td><td>${dinheiro(n.valor)}</td>
    <td class="peq apagado" title="${esc(n.descricao || '')}" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((n.descricao || '').split('\n')[0])}</td></tr>`;
  el.innerHTML = `<div class="linha"><h3 style="flex:1">Notas fiscais</h3><span class="selo ${ativo ? 'ok' : 'alerta'}">${ativo ? 'comprou no último ano' : 'sem nota há mais de 1 ano'}</span></div>
    <p class="peq mt"><b>${dinheiro(total)}</b> em ${data.length} ${data.length === 1 ? 'nota' : 'notas'} · de ${mesAno(data[data.length - 1].emissao)} a ${mesAno(data[0].emissao)}</p>
    <div class="tabela mt"><table><thead><tr><th>Data</th><th>Nº</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>${data.slice(0, 8).map(linha).join('')}</tbody></table></div>
    ${data.length > 8 ? `<button class="btn peq mt" type="button" id="nf-todas">Ver as ${data.length} notas</button>` : ''}`;
  el.querySelector('#nf-todas')?.addEventListener('click', (ev) => { el.querySelector('tbody').innerHTML = data.map(linha).join(''); ev.target.remove(); });
}
