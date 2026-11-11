// Reembolsos (script 70, pedido da Juliana em 11/11/2026): a Cintia importa a planilha de reembolso de uma sócia ou de um mentor.
// Cada gasto vira uma despesa ligada ao cliente, à turma e ao módulo (o "centro de custo" do cliente, para a margem), e o PIX do
// reembolso no extrato é reconhecido sozinho pelo total, sem a Cintia precisar dizer do que se trata.
// Regras puras, sem banco e sem tela (testáveis no Node): ler a planilha (qualquer arrumação de colunas com cabeçalho), adivinhar
// o tipo do gasto, achar de qual cliente/turma/módulo é e achar o PIX no extrato.

export const norm = (t) => String(t ?? '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const arred = (v) => Math.round(Number(v || 0) * 100) / 100;
const diaMs = (d) => new Date(`${d}T12:00:00Z`).getTime();
export const diasEntre = (a, b) => Math.round((diaMs(b) - diaMs(a)) / 86400000);
const somarDias = (d, n) => new Date(diaMs(d) + n * 86400000).toISOString().slice(0, 10);

// ---------- valores e datas como vêm na planilha ----------
export function lerValor(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? arred(v) : null;
  let t = String(v ?? '').replace(/R\$|\s/gi, '').trim();
  if (!t || !/\d/.test(t)) return null;
  const neg = /^-|\(.*\)/.test(t);
  t = t.replace(/[()\-]/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');      // 1.234,56
  else if (/\.\d{1,2}$/.test(t)) t = t.replace(/,/g, '');                  // 1,234.56
  else t = t.replace(/[.,]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? arred(neg ? -n : n) : null;
}

// Data ISO (AAAA-MM-DD) de: número de série do Excel, Date, "dd/mm/aaaa", "dd/mm/aa", "dd/mm" (ano = anoPadrao), "aaaa-mm-dd"
export function lerData(v, anoPadrao = null) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const t = String(v).trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?/);
  if (!m) return null;
  const dia = Number(m[1]), mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : anoPadrao;
  if (!ano || dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  if (ano < 100) ano += 2000;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// ---------- cabeçalho ----------
// Para cada coisa que a plataforma precisa, os nomes de coluna que a querem dizer (sem acento, minúsculas)
export const CAMPOS = {
  data: ['data', 'dia', 'data da despesa', 'data do gasto', 'data gasto'],
  descricao: ['descricao', 'despesa', 'item', 'historico', 'o que', 'o que foi', 'detalhe', 'detalhes', 'gasto', 'especificacao', 'motivo', 'discriminacao'],
  valor: ['valor', 'total', 'valor r', 'valor total', 'quantia', 'r', 'valor pago', 'preco', 'custo'],
  categoria: ['tipo', 'categoria', 'natureza', 'tipo de despesa', 'classificacao'],
  cidade: ['cidade', 'local', 'destino', 'municipio', 'cidade uf', 'onde'],
  cliente: ['cliente', 'empresa', 'cooperativa', 'contratante', 'centro de custo', 'cc'],
  treinamento: ['treinamento', 'turma', 'programa', 'evento', 'projeto', 'curso', 'trilha', 'atividade', 'servico'],
  modulo: ['modulo', 'encontro', 'aula', 'modulo encontro'],
  observacao: ['observacao', 'observacoes', 'obs', 'comentario', 'nota'],
};
const campoDe = (texto) => {
  const t = norm(texto);
  if (!t) return null;
  for (const [k, nomes] of Object.entries(CAMPOS)) if (nomes.includes(t)) return k;
  for (const [k, nomes] of Object.entries(CAMPOS)) if (nomes.some((n) => n.length >= 4 && (t.startsWith(`${n} `) || t.endsWith(` ${n}`)))) return k;
  return null;
};

// linhas = matriz (array de arrays) da planilha. Devolve { colunas: {campo: índice}, inicio, cabecalho, pessoa, enviado, avisos }
export function acharCabecalho(linhas) {
  let melhor = null;
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    const cols = {};
    (linhas[i] || []).forEach((c, j) => { const k = campoDe(c); if (k && cols[k] == null) cols[k] = j; });
    const pontos = Object.keys(cols).length + (cols.valor != null ? 2 : 0) + (cols.data != null ? 1 : 0);
    if (cols.valor != null && Object.keys(cols).length >= 2 && (!melhor || pontos > melhor.pontos)) melhor = { i, cols, pontos };
  }
  // nome de quem gastou e dia do envio escritos acima da tabela ("Nome: Fulana", "Colaborador", "Data de envio")
  let pessoa = null, enviado = null;
  const ate = melhor ? melhor.i : Math.min(linhas.length, 12);
  for (let i = 0; i < ate; i++) {
    const l = linhas[i] || [];
    l.forEach((c, j) => {
      const t = norm(c);
      const proximo = () => { for (let k = j + 1; k < l.length; k++) if (String(l[k] ?? '').trim()) return l[k]; return null; };
      const depoisDoDoisPontos = String(c ?? '').split(':').slice(1).join(':').trim();
      if (!pessoa && /^(nome|colaborador|colaboradora|solicitante|mentor|mentora|socia|funcionario|favorecido|beneficiario)\b/.test(t)) pessoa = depoisDoDoisPontos || proximo();
      if (!enviado && /^(data de envio|data do envio|enviado em|data do relatorio|data da solicitacao|data)\b/.test(t) && !(melhor && i === melhor.i)) {
        const v = depoisDoDoisPontos || proximo();
        const dt = lerData(v);
        if (dt) enviado = dt;
      }
    });
  }
  return { colunas: melhor ? melhor.cols : {}, inicio: melhor ? melhor.i + 1 : 0, cabecalho: melhor ? melhor.i : -1, pessoa: pessoa ? String(pessoa).trim() : null, enviado };
}

// Linhas da tabela → gastos { data, descricao, valor, categoria, cidade, cliente, treinamento, modulo, observacao, linha }
// Para em "total" (e não conta a linha de total). Linha sem valor ou com valor zero fica de fora.
export function lerGastos(linhas, { colunas, inicio }, { anoPadrao = null } = {}) {
  const pega = (l, k) => (colunas[k] == null ? '' : l[colunas[k]]);
  const gastos = [];
  let ultimaData = null;
  for (let i = inicio; i < linhas.length; i++) {
    const l = linhas[i] || [];
    if (!l.some((c) => String(c ?? '').trim())) continue;
    const textoLinha = norm(l.join(' '));
    if (/^(total|subtotal|soma|valor total|total geral|total a reembolsar|total do reembolso)\b/.test(norm(pega(l, 'descricao') || l.find((c) => String(c ?? '').trim()))) || /\btotal (geral|a reembolsar|do reembolso)\b/.test(textoLinha)) {
      if (gastos.length) break; else continue;
    }
    const valor = lerValor(pega(l, 'valor'));
    if (valor == null || valor <= 0) continue;
    const data = lerData(pega(l, 'data'), anoPadrao) || ultimaData;
    if (data) ultimaData = data;
    const t = (k) => String(pega(l, k) ?? '').trim();
    gastos.push({ linha: i + 1, data, valor, descricao: t('descricao'), categoria_texto: t('categoria'), cidade: t('cidade'), cliente: t('cliente'),
      treinamento: t('treinamento'), modulo: t('modulo'), observacao: t('observacao') });
  }
  return gastos;
}

// ---------- tipo do gasto ----------
const TIPOS = [
  ['passagem', /\b(passage(m|ns)|aere[ao]|voo|azul|gol|latam|bilhete|rodoviari[ao]|onibus|embarque|bagagem)\b/],
  ['hospedagem', /\b(hote(l|is)|pousada|hosped\w*|airbnb|diaria(s)? de hotel|ibis|flat)\b/],
  ['refeicao', /\b(almoco|jantar|refeic\w*|restaurante|lanche|cafe|alimentac\w*|churrascaria|padaria|pizzaria|comida|janta)\b/],
  ['transporte', /\b(uber|99|taxi|combustivel|gasolina|etanol|pedagio|estacionamento|km|quilometr\w*|locadora|aluguel de carro|carro alugado|translado|transfer|posto|metro)\b/],
  ['impressao', /\b(impress\w*|grafica|xerox|copias|plotagem)\b/],
  ['material', /\b(material|materiais|papelaria|brinde\w*|kit\w*|post it|canetas?)\b/],
  ['ferramentas', /\b(assinatura|software|aplicativo|licenca)\b/],
];
export function tipoDoGasto(g) {
  const t = norm(`${g.categoria_texto || ''} ${g.descricao || ''}`);
  for (const [k, re] of TIPOS) if (re.test(t)) return k;
  return 'outros';
}

// ---------- de qual cliente, turma e módulo é ----------
// ctx: { empresas, turmas, programas, modulos, mentoresDoModulo: (moduloId) => [perfilId], pessoaId }
// Devolve { empresa_id, turma_id, modulo_id, programa_id, como: 'texto'|'agenda'|'cidade'|null, texto }
const PALAVRAS_FRACAS = new Set(['sicoob', 'sicredi', 'cresol', 'unicred', 'cooperativa', 'credito', 'turma', 'modulo', 'programa', 'treinamento', 'lideres', 'lideranca',
  'liderancas', 'formacao', 'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'trilha', 'mentoria', 'mentorei', 'encontro', 'ltda', 'sa', 'instituto', 'central', 'sistema']);
const fortes = (t) => norm(t).split(' ').filter((p) => p.length >= 3 && !PALAVRAS_FRACAS.has(p) && !/^\d+$/.test(p));
// quanto o texto "fala" de um nome: palavras fortes do nome que aparecem no texto (inteiras)
function pontosNome(texto, nome) {
  const t = ` ${norm(texto)} `;
  const ps = fortes(nome);
  if (!ps.length) return norm(nome).length >= 4 && t.includes(` ${norm(nome)} `) ? 1 : 0;
  const achou = ps.filter((p) => t.includes(` ${p} `)).length;
  return achou ? achou / ps.length + (t.includes(` ${norm(nome)} `) ? 1 : 0) : 0;
}

export function alocar(g, ctx) {
  const { empresas = [], turmas = [], programas = [], modulos = [], mentoresDoModulo = () => [], pessoaId = null } = ctx;
  const texto = [g.cliente, g.treinamento, g.modulo, g.descricao, g.observacao].filter(Boolean).join(' · ');
  const cidade = norm(g.cidade);
  // 1) pelo texto: turma (nome da turma + empresa), mentoria individual ou só o cliente
  const nomeEmp = (id) => (empresas.find((e) => e.id === id) || {}).nome || '';
  const candT = turmas.map((t) => ({ t, p: pontosNome(texto, t.nome) + pontosNome(texto, nomeEmp(t.empresa_id)) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
  const candP = programas.map((p) => ({ p, s: pontosNome(texto, p.nome) + pontosNome(texto, nomeEmp(p.empresa_id)) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const candE = empresas.map((e) => ({ e, p: pontosNome(texto, e.nome) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
  const unico = (lista, f) => (lista.length && (lista.length === 1 || f(lista[0]) > f(lista[1])) ? lista[0] : null);
  let empresa = null, turmasPossiveis = null, programa = null, como = null;
  const tT = unico(candT, (x) => x.p), tE = unico(candE, (x) => x.p), tP = unico(candP, (x) => x.s);
  if (tE) { empresa = tE.e.id; como = 'texto'; }
  if (tT && (!empresa || tT.t.empresa_id === empresa)) { turmasPossiveis = [tT.t]; empresa = tT.t.empresa_id; como = 'texto'; }
  else if (empresa) turmasPossiveis = turmas.filter((t) => t.empresa_id === empresa);
  if (!turmasPossiveis && tP) { programa = tP.p; empresa = tP.p.empresa_id; como = 'texto'; }
  // 2) pela agenda: módulos de 2 dias antes a 2 dias depois do gasto (viagem: véspera e dia seguinte)
  const dia = (m) => (m.data_hora ? String(m.data_hora).slice(0, 10) : null);
  let perto = g.data ? modulos.filter((m) => dia(m) && Math.abs(diasEntre(g.data, dia(m))) <= 2) : [];
  if (turmasPossiveis) perto = perto.filter((m) => turmasPossiveis.some((t) => t.id === m.turma_id));
  const daPessoa = pessoaId ? perto.filter((m) => mentoresDoModulo(m.id).includes(pessoaId)) : [];
  const turmaDe = (m) => turmas.find((t) => t.id === m.turma_id) || {};
  const naCidade = (lista) => (cidade ? lista.filter((m) => norm(`${m.local || ''} ${turmaDe(m).local || ''} ${turmaDe(m).nome || ''} ${nomeEmp(turmaDe(m).empresa_id)}`).includes(cidade)) : []);
  const maisPerto = (lista) => {
    const dist = (m) => Math.abs(diasEntre(g.data, dia(m))) + (m.formato === 'presencial' ? 0 : 0.5);
    const o = [...lista].sort((a, b) => dist(a) - dist(b));
    return o.length && (o.length === 1 || dist(o[0]) < dist(o[1])) ? o[0] : null;
  };
  let mod = null;
  for (const lista of [naCidade(daPessoa), daPessoa, naCidade(perto), turmasPossiveis ? perto : []]) {
    if (lista.length) { mod = maisPerto(lista); if (mod) break; }
  }
  if (mod) {
    const t = turmaDe(mod);
    const porTexto = como === 'texto';
    return { empresa_id: t.empresa_id || null, turma_id: t.id || null, modulo_id: mod.id, programa_id: null,
      como: porTexto ? 'texto' : daPessoa.includes(mod) ? 'agenda' : 'cidade' };
  }
  if (turmasPossiveis && turmasPossiveis.length === 1) return { empresa_id: empresa, turma_id: turmasPossiveis[0].id, modulo_id: null, programa_id: null, como };
  if (programa) return { empresa_id: empresa, turma_id: null, modulo_id: null, programa_id: programa.id, como };
  // cliente só com mentoria individual ativa: vai para ela
  if (empresa) {
    const ps = programas.filter((p) => p.empresa_id === empresa && !/conclu/.test(p.status || ''));
    const ts = turmas.filter((t) => t.empresa_id === empresa && !/conclu/.test(t.status || ''));
    if (ps.length === 1 && !ts.length) return { empresa_id: empresa, turma_id: null, modulo_id: null, programa_id: ps[0].id, como };
    return { empresa_id: empresa, turma_id: null, modulo_id: null, programa_id: null, como };
  }
  return { empresa_id: null, turma_id: null, modulo_id: null, programa_id: null, como: null };
}

// ---------- quem é a pessoa da planilha ----------
export function acharPessoa(nome, pessoas) {
  const ps = fortes(nome || '');
  if (!ps.length) return null;
  const pontos = pessoas.map((p) => { const q = norm(p.nome).split(' '); return { p, n: ps.filter((x) => q.includes(x)).length + (q[0] === ps[0] ? 1 : 0) }; })
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  return pontos.length && (pontos.length === 1 || pontos[0].n > pontos[1].n) ? pontos[0].p : null;
}

// ---------- o PIX do reembolso no extrato ----------
// O PIX sai da conta (valor negativo) com o mesmo total de um reembolso a pagar, ou com a soma dos reembolsos a pagar da mesma
// pessoa. Janela: de 15 dias antes do envio da planilha (às vezes paga antes de importar) a 75 dias depois.
// Devolve { reembolsos: [..], automatico } ou null.
export function reembolsoDoMovimento(mov, reembolsos, { pessoaDoTexto = () => null } = {}) {
  if (!(mov.valor < 0)) return null;
  const v = Math.abs(Number(mov.valor));
  const abertos = reembolsos.filter((r) => r.situacao !== 'pago');
  const dentro = (r) => { const base = r.enviado_em || String(r.criado_em || '').slice(0, 10) || mov.data; const k = diasEntre(base, mov.data); return k >= -15 && k <= 75; };
  const quem = pessoaDoTexto(mov);
  const iguais = abertos.filter((r) => dentro(r) && Math.abs(Number(r.total) - v) < 0.01);
  if (iguais.length) {
    const daPessoa = quem ? iguais.filter((r) => r.pessoa_id === quem) : [];
    const lista = daPessoa.length ? daPessoa : iguais;
    return { reembolsos: [lista[0]], automatico: lista.length === 1 };
  }
  // vários reembolsos da mesma pessoa pagos num PIX só
  const porPessoa = new Map();
  for (const r of abertos.filter(dentro)) { if (!porPessoa.has(r.pessoa_id)) porPessoa.set(r.pessoa_id, []); porPessoa.get(r.pessoa_id).push(r); }
  const juntos = [...porPessoa.values()].filter((rs) => rs.length > 1 && Math.abs(rs.reduce((a, r) => a + Number(r.total), 0) - v) < 0.01);
  if (juntos.length) return { reembolsos: juntos[0], automatico: juntos.length === 1 };
  return null;
}

// Na importação: o PIX que já está no extrato (pendente, ou conferido como retirada da mesma pessoa) com o total do reembolso
export function movimentoDoReembolso(r, movimentos, { pessoaDoTexto = () => null } = {}) {
  const base = r.enviado_em || r.data_ref || null;
  const cands = movimentos.filter((m) => m.valor < 0 && Math.abs(Math.abs(Number(m.valor)) - Number(r.total)) < 0.01
    && (m.situacao === 'pendente' || (m.acao === 'retirada' && (!m.pessoa_id || m.pessoa_id === r.pessoa_id)))
    && (!base || (diasEntre(base, m.data) >= -15 && diasEntre(base, m.data) <= 75)));
  if (!cands.length) return null;
  const daPessoa = cands.filter((m) => pessoaDoTexto(m) === r.pessoa_id || m.pessoa_id === r.pessoa_id);
  const lista = daPessoa.length ? daPessoa : cands;
  return lista.length === 1 ? lista[0] : null;
}

export { somarDias };
