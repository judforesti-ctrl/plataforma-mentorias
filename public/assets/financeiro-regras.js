// Regras puras do Financeiro (script 52), sem banco e sem tela: montar o plano de faturamento de uma turma ou programa a
// partir da proposta, dividir valores sem perder centavos, datas das parcelas, situação de cada linha a receber e o texto da
// nota. Testáveis no Node.
import { numero, precosValidos, totalDe } from './proposta-comum.js';

export const SITUACOES = { aberto: 'Em aberto', faturado: 'Nota emitida', recebido: 'Recebido', cancelado: 'Cancelado' };

// Tipos de despesa (a ordem é a das listas na tela)
export const CATEGORIAS = [
  ['parceiros', 'Mentores e parceiros'], ['passagem', 'Passagem'], ['hospedagem', 'Hospedagem'], ['refeicao', 'Refeição'],
  ['transporte', 'Transporte (táxi, Uber, carro)'], ['impressao', 'Impressão'], ['material', 'Material'],
  ['impostos', 'Impostos'], ['contabilidade', 'Contabilidade'], ['equipe', 'Equipe fixa'], ['marketing', 'Marketing e site'],
  ['ferramentas', 'Ferramentas e assinaturas'], ['bancarias', 'Tarifas do banco'], ['socia', 'Despesa pessoal de sócia'], ['outros', 'Outros'],
];
export const nomeCategoria = (k) => (CATEGORIAS.find(([c]) => c === k) || [k, k || 'Outros'])[1];
// despesas de viagem (vão para a margem da turma ou do módulo)
export const VIAGEM = ['passagem', 'hospedagem', 'refeicao', 'transporte'];

export const centavos = (v) => Math.round(Number(v || 0) * 100);
export const arred = (v) => Math.round(Number(v || 0) * 100) / 100;
export const soma = (lista, f = (x) => x) => arred(lista.reduce((a, x) => a + Number(f(x) || 0), 0));

// Divide um total em n partes iguais sem perder centavo: a diferença vai para a última.
export function dividir(total, n) {
  const t = centavos(total);
  if (!n || n < 1) return [];
  const base = Math.floor(t / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? t - base * (n - 1) : base) / 100);
}

// ---------- datas ----------
const TZ = 'America/Sao_Paulo';
export const diaDe = (iso) => (iso ? (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ })) : null);
export const mesDe = (iso) => (iso ? String(iso).slice(0, 7) : null);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (mes, curto = false) => { const [a, m] = String(mes).split('-').map(Number); const n = MESES[m - 1] || ''; return curto ? `${n.slice(0, 3)}/${String(a).slice(2)}` : `${n} de ${a}`; };
export function somarMeses(mes, k) { const [a, m] = mes.split('-').map(Number); const t = a * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
export function somarDias(dia, k) { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); }
export const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
// mesmo dia nos meses seguintes; dia 31 em mês curto vira o último dia do mês
export function dataDaParcela(primeira, i) {
  const [a, m, d] = primeira.split('-').map(Number);
  const mes = somarMeses(`${a}-${String(m).padStart(2, '0')}`, i);
  const [a2, m2] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a2, m2, 0)).getUTCDate();
  return `${mes}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

// ---------- de onde vem o valor ----------
// Lê a proposta (preços da proposta feita na plataforma, ou o valor da importada) e diz como cobrar.
// Devolve { modo, valor_total, valor_modulo, fonte } — fonte é o texto que a tela mostra ("Proposta v2: R$ 8.900 por módulo").
export function sugestaoDoValor({ oportunidade = null, proposta = null, temModulos = false } = {}) {
  const precos = precosValidos(proposta && proposta.conteudo && proposta.conteudo.precos);
  const p = precos[0];
  const rotulo = proposta ? `Proposta${proposta.versao ? ` versão ${proposta.versao}` : ''}` : 'Oportunidade de vendas';
  if (p && p.cobranca === 'modulo' && numero(p.valor) != null) {
    const q = numero(p.quantidade);
    return { modo: 'modulo', valor_modulo: numero(p.valor), valor_total: q ? totalDe(p) : null, fonte: `${rotulo}: valor por módulo${p.nome ? ` (${p.nome})` : ''}` };
  }
  const total = (p && totalDe(p)) ?? numero(proposta && proposta.valor) ?? numero(oportunidade && oportunidade.valor);
  if (total == null) return { modo: temModulos ? 'modulo' : 'parcelas', valor_total: null, valor_modulo: null, fonte: null };
  return { modo: temModulos ? 'modulo' : 'parcelas', valor_total: total, valor_modulo: null, fonte: `${rotulo}: valor total` };
}

// ---------- montar as linhas ----------
// Por módulo: uma linha por módulo, na data do módulo. valorModulo vale para todos; sem ele, divide o total.
export function linhasPorModulo(modulos, { valorModulo = null, valorTotal = null } = {}) {
  const lista = [...modulos].sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const valores = valorModulo != null ? lista.map(() => arred(valorModulo)) : valorTotal != null ? dividir(valorTotal, lista.length) : lista.map(() => 0);
  return lista.map((m, i) => ({ modulo_id: m.id, descricao: `Módulo ${m.numero}${m.titulo ? ` · ${m.titulo}` : ''}`, data: diaDe(m.data_hora), valor: valores[i] }));
}
// Por parcelas: n parcelas mensais a partir da primeira data.
export function linhasPorParcela({ n, primeira, total, titulo = 'Parcela' }) {
  const valores = dividir(total || 0, n);
  return valores.map((v, i) => ({ modulo_id: null, descricao: `${titulo} ${i + 1}/${n}`, data: primeira ? dataDaParcela(primeira, i) : null, valor: v }));
}

// Antes do mês atual = já foi faturado e recebido fora da plataforma (a Cintia muda na tela se não for).
export const situacaoInicial = (data, hoje) => (data && mesDe(data) < mesDe(hoje) ? 'recebido' : 'aberto');

// ---------- situação de cada linha a receber ----------
// a_emitir: aconteceu e falta a nota · proximo: acontece nos próximos 7 dias · futuro · sem_data
// atrasado: nota emitida e venceu · a_vencer · recebido · cancelado
export function estado(linha, hoje) {
  if (linha.situacao === 'cancelado') return 'cancelado';
  if (linha.situacao === 'recebido') return 'recebido';
  if (linha.situacao === 'faturado') return linha.vencimento && linha.vencimento < hoje ? 'atrasado' : 'a_vencer';
  if (!linha.data) return 'sem_data';
  if (linha.data <= hoje) return 'a_emitir';
  return diasEntre(hoje, linha.data) <= 7 ? 'proximo' : 'futuro';
}
export const ROTULO_ESTADO = {
  a_emitir: ['Emitir nota', 'alerta'], proximo: ['Esta semana', 'neutro'], futuro: ['Previsto', 'neutro'], sem_data: ['Sem data', 'neutro'],
  atrasado: ['Atrasado', 'ruim'], a_vencer: ['Aguardando', 'neutro'], recebido: ['Recebido', 'ok'], cancelado: ['Cancelado', 'neutro'],
};
export const vencimentoPadrao = (emissao, prazo = 30) => somarDias(emissao, Number(prazo) || 0);

// Texto para colar no emissor da nota: descrição do plano + o que está sendo cobrado (módulos com data).
export function textoDaNota({ plano, linhas, empresa }) {
  const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
  const itens = linhas.map((l) => `${l.descricao}${l.data ? ` (${dataBR(l.data)})` : ''}`);
  const base = (plano && plano.descricao_nota) || `${plano ? plano.titulo : ''}${empresa ? ` · ${empresa}` : ''}`;
  return [base, itens.length > 1 ? itens.map((t) => `- ${t}`).join('\n') : itens[0]].filter(Boolean).join('\n');
}

// ---------- números do mês ----------
// Faturamento do mês: antes do "inicio" do Financeiro vale a planilha; dali em diante, as linhas da plataforma pela data
// (módulo dado ou parcela do mês), menos as canceladas.
export function faturadoNoMes(mes, { inicio, linhas, meses }) {
  if (inicio && mes < inicio) { const m = meses.find((x) => x.mes === mes); return m && m.faturado_planilha != null ? Number(m.faturado_planilha) : null; }
  return soma(linhas.filter((l) => l.situacao !== 'cancelado' && mesDe(l.data) === mes), (l) => l.valor);
}

// ---------- pagamento dos mentores parceiros (script 54) ----------
// Como cada um recebe: [rótulo, unidade no singular, no plural]
export const FORMAS = {
  hora: ['Por hora', 'hora', 'horas'], atendimento: ['Por atendimento ou aula', 'atendimento', 'atendimentos'],
  modulo: ['Por módulo', 'módulo', 'módulos'], mensal: ['Valor mensal fixo', 'mês', 'meses'], percentual: ['% do faturado da turma', '%', '%'],
};
export const nomeForma = (f) => (FORMAS[f] || FORMAS.hora)[0];

// Total de uma linha pela forma: hora = horas × valor; atendimento/módulo = quantidade × valor; percentual = faturado × valor %;
// mensal = valor (uma vez).
export function totalDaLinha({ forma, valor_unit, quantidade, horas, faturado = 0 }) {
  const v = Number(valor_unit || 0);
  if (forma === 'hora') return arred(Number(horas || 0) * v);
  if (forma === 'atendimento' || forma === 'modulo') return arred(Number(quantidade || 0) * v);
  if (forma === 'percentual') return arred(Number(faturado || 0) * v / 100);
  if (forma === 'mensal') return arred(v);
  return 0;
}

// Monta as linhas do mês de um mentor. itens = aulas e sessões dadas no mês:
// [{ chave: 't:<turma>' | 'p:<programa>', rotulo, tipo: 'modulo' | 'sessao', data, minutos }]
// padrao = cadastro do mentor { forma, valor }; regra(chave) = valor combinado para aquela turma/programa (ou null);
// faturado(chave) = faturado da turma no mês (só para percentual). Mensal fixo vira uma linha só, sem contar as aulas.
export function calcularPagamento(itens, { padrao = null, regra = () => null, faturado = () => 0 } = {}) {
  const grupos = new Map();
  for (const i of itens) {
    if (!grupos.has(i.chave)) grupos.set(i.chave, { chave: i.chave, rotulo: i.rotulo, itens: [] });
    grupos.get(i.chave).itens.push(i);
  }
  const linhas = [];
  for (const g of [...grupos.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo))) {
    const r = regra(g.chave) || padrao || {};
    const forma = r.forma || 'hora';
    const quantidade = g.itens.length;
    const horas = arred(g.itens.reduce((a, i) => a + Number(i.minutos || 0), 0) / 60);
    const semDuracao = g.itens.filter((i) => !i.minutos).length;
    const base = { chave: g.chave, rotulo: g.rotulo, forma, valor_unit: r.valor == null ? null : Number(r.valor), quantidade, horas, sem_duracao: semDuracao,
      datas: g.itens.map((i) => i.data).filter(Boolean).sort(), combinado: !!regra(g.chave) };
    if (forma === 'mensal' && !regra(g.chave)) linhas.push({ ...base, total: 0, coberto_pelo_mensal: true });
    else linhas.push({ ...base, total: totalDaLinha({ ...base, faturado: faturado(g.chave) }) });
  }
  if (padrao && padrao.forma === 'mensal') linhas.unshift({ chave: 'mensal', rotulo: 'Valor mensal fixo', forma: 'mensal', valor_unit: Number(padrao.valor || 0), quantidade: 1, horas: 0, sem_duracao: 0, datas: [], combinado: false, total: arred(padrao.valor) });
  return { linhas, total: soma(linhas, (l) => l.total) };
}

// Texto do extrato do mês para mandar ao mentor (WhatsApp ou e-mail)
export function textoExtrato({ nome, mes, linhas, total }) {
  const br = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const unid = (l) => (l.forma === 'hora' ? `${String(l.horas).replace('.', ',')} h` : l.forma === 'percentual' ? `${l.valor_unit}%` : l.forma === 'mensal' ? 'mensal' : `${l.quantidade} ${l.quantidade === 1 ? (FORMAS[l.forma] || FORMAS.atendimento)[1] : (FORMAS[l.forma] || FORMAS.atendimento)[2]}`);
  return [`Olá, ${String(nome || '').split(' ')[0]}! Segue o resumo de ${nomeMes(mes)} na Mentorei:`, '',
    ...linhas.filter((l) => l.total > 0).map((l) => `• ${l.rotulo}: ${unid(l)} = ${br(l.total)}`), '', `Total: ${br(total)}`].join('\n');
}

// ---------- imposto (30/10: pedido dela; vale para o reembolso cobrado do cliente e, na etapa 4, para a distribuição) ----------
// Alíquota real: impostos pagos (categoria 'impostos', pela data de pagamento) nos 3 últimos meses fechados ÷ faturado do mês
// anterior a cada pagamento (o Simples de um mês é sobre o faturamento do mês anterior). Sem pagamento ou sem faturado = null.
export function aliquotaReal({ despesas, faturado, hoje }) {
  const meses = [1, 2, 3].map((k) => somarMeses(hoje.slice(0, 7), -k));
  const pago = soma(despesas.filter((x) => x.categoria === 'impostos' && meses.includes(mesDe(x.pago_em || x.data))), (x) => x.valor);
  const base = meses.reduce((a, m) => a + Number(faturado(somarMeses(m, -1)) || 0), 0);
  if (!pago || !base) return null;
  return { pct: Math.round(pago / base * 10000) / 100, pago, base, meses };
}
export const impostoSobre = (valor, pct) => arred(Number(valor || 0) * Number(pct || 0) / 100);
// Valor da nota para, depois do imposto, sobrar o que foi gasto
export const comImpostoIncluido = (valor, pct) => (Number(pct) >= 100 ? null : arred(Number(valor || 0) / (1 - Number(pct || 0) / 100)));

// ---------- visão da direção (30/10: pedido dela, "como CEO, o que devo ter à vista") ----------
// Faturado, custos diretos, imposto e margem de cada cliente no período [de, ate]. Faturado = linhas a receber (não canceladas)
// pela data; custos = despesas ligadas ao cliente (direto ou pela turma/programa; empresaDaDespesa resolve), menos impostos
// (entram pela alíquota) e despesas pessoais das sócias. pct = alíquota real do imposto.
export function rankingClientes({ linhas, despesas, de, ate, empresaDaDespesa, pct = 0 }) {
  const por = new Map();
  const pega = (id) => { if (!por.has(id)) por.set(id, { empresa_id: id, faturado: 0, custos: 0 }); return por.get(id); };
  const dentro = (dia) => dia && dia >= de && dia <= ate;
  for (const l of linhas) if (l.situacao !== 'cancelado' && l.empresa_id && dentro(l.data)) pega(l.empresa_id).faturado += Number(l.valor || 0);
  for (const x of despesas) {
    if (x.categoria === 'impostos' || x.categoria === 'socia' || !dentro(x.data)) continue;
    const id = empresaDaDespesa(x);
    if (id) pega(id).custos += Number(x.valor || 0);
  }
  return [...por.values()].map((c) => {
    const faturado = arred(c.faturado), custos = arred(c.custos), imposto = impostoSobre(faturado, pct);
    const margem = arred(faturado - custos - imposto);
    return { empresa_id: c.empresa_id, faturado, custos, imposto, margem, margem_pct: faturado ? Math.round(margem / faturado * 1000) / 10 : null };
  });
}

// Previsão dos próximos meses: faturado = linhas do mês (não canceladas); custos = fixas ativas + mentores parceiros
// (mentores(mes), pelas aulas e sessões marcadas) + outros variáveis (média) + imposto sobre o previsto.
export function previsaoMeses({ meses, linhas, fixas, mentores = () => 0, outrosVariaveis = 0, pct = 0 }) {
  const fixo = soma(fixas.filter((f) => f.ativo !== false), (f) => f.valor);
  return meses.map((mes) => {
    const doMes = linhas.filter((l) => l.situacao !== 'cancelado' && mesDe(l.data) === mes);
    const faturado = soma(doMes, (l) => l.valor);
    const parceiros = arred(mentores(mes));
    const imposto = impostoSobre(faturado, pct);
    const custos = arred(fixo + parceiros + Number(outrosVariaveis || 0) + imposto);
    return { mes, faturado, fixas: fixo, parceiros, outros: arred(outrosVariaveis), imposto, custos, resultado: arred(faturado - custos),
      clientes: new Set(doMes.map((l) => l.empresa_id)).size };
  });
}

// Nome do parceiro tirado da descrição da despesa, quando ela não está ligada a um cadastro ("Pagamento Carla 03/26",
// "Pagamento Pix (Lidia Naomi Minasse Uda)", "Adiantamento Lauane - professora evento"). Sem nome = null.
export function nomeDoParceiro(descricao) {
  const t = String(descricao || '').trim();
  const par = t.match(/\(([^)]+)\)/);
  let n = par ? par[1] : t.replace(/^(pagamento|adiantamento|antecipa\S*)\s+(final\s+|pix\s+)?/i, '');
  n = n.split(/\s+-\s+|\s+·\s+|\s+ref\b|\s+\d|\*|\s+aula\b/i)[0].trim();
  const palavras = n.split(/\s+/).filter((p) => /^\p{L}{2,}$/u.test(p));
  if (!palavras.length || /^(boleto|pix|pagamento|nf|nota)$/i.test(palavras[0])) return null;
  // o sobrenome só entra se veio com maiúscula ("Lauane professora evento" = Lauane)
  const usar = palavras.length > 1 && /^\p{Lu}/u.test(palavras[1]) ? 2 : 1;
  return palavras.slice(0, usar).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}
// Quanto cada parceiro recebeu (despesas "Mentores e parceiros" no período), do maior para o menor.
// nome(id) = nome do cadastro. Devolve [{ chave, nome, total, vezes, cadastro }].
export function rankingRecebido(despesas, { de, ate, nome = () => null }) {
  const por = new Map();
  for (const x of despesas) {
    if (x.categoria !== 'parceiros' || !x.data || x.data < de || x.data > ate) continue;
    const doCadastro = x.pessoa_id && nome(x.pessoa_id);
    const n = doCadastro || nomeDoParceiro(x.descricao) || 'Outros parceiros';
    const chave = doCadastro ? x.pessoa_id : `n:${n.toLowerCase()}`;
    if (!por.has(chave)) por.set(chave, { chave, nome: n, total: 0, vezes: 0, cadastro: !!doCadastro });
    const r = por.get(chave); r.total += Number(x.valor || 0); r.vezes += 1;
  }
  return [...por.values()].map((r) => ({ ...r, total: arred(r.total) })).sort((a, b) => b.total - a.total);
}

// Ponto de equilíbrio: faturamento do mês que paga o custo fixo, depois do imposto e dos custos variáveis (% do faturado).
export function pontoDeEquilibrio({ fixo, pctImposto = 0, pctVariavel = 0 }) {
  const sobra = 1 - Number(pctImposto || 0) / 100 - Number(pctVariavel || 0) / 100;
  return sobra > 0 ? arred(Number(fixo || 0) / sobra) : null;
}

// ---------- fundo de reserva (capital de giro) ----------
// Lançamentos [{ data, tipo: saldo|aporte|resgate|rendimento, valor }]: "saldo" é o valor do extrato naquele dia (recomeça a
// conta); os outros somam ou tiram dali em diante. No mesmo dia vale a ordem em que foram lançados (em).
// ---------- etapa 4: margem, viagem, fechamento, distribuição e caixa ----------
// Ajustes que a tela usa quando a administração não mudou nada (ficam em configuracoes.financeiro.custos)
export const PADRAO_CUSTOS = {
  hora_referencia: null,          // R$ por hora de mentor parceiro (vazio = média dos cadastros "por hora", senão 230)
  socia_vezes: 3,                 // hora da sócia = 3 × a hora de referência (decisão dela, 30/10)
  cidade_socias: 'Campinas',
  viagem: { passagem: 1400, hotel: 350, dia: 180, km: 1.5, noites_aviao: 2, dias_aviao: 3, noites_carro: 1, dias_carro: 2 },
  caixa_pct: 10,                  // parte do líquido que fica no caixa da empresa (planilha: 10%)
  participacao: { juliana: 40, viviane: 40, claudia: 20 },   // pelo primeiro nome, sem acento
  margem_alvo: 30,
};
export function custos(config) {
  const c = (config && config.custos) || {};
  return { ...PADRAO_CUSTOS, ...c, viagem: { ...PADRAO_CUSTOS.viagem, ...(c.viagem || {}) }, participacao: { ...PADRAO_CUSTOS.participacao, ...(c.participacao || {}) } };
}
const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const primeiroNome = (nome) => semAcento(nome).split(/\s+/)[0] || '';
// Hora de referência: a dos Ajustes; senão a média dos mentores que recebem por hora; senão 230
export function horaReferencia(cfg, cadastros = []) {
  if (Number(cfg.hora_referencia) > 0) return Number(cfg.hora_referencia);
  const v = cadastros.filter((c) => c.forma === 'hora' && Number(c.valor) > 0).map((c) => Number(c.valor));
  return v.length ? arred(v.reduce((a, x) => a + x, 0) / v.length) : 230;
}

// Viagem estimada de uma pessoa para um módulo presencial. modo: aviao (passagem + véspera e dia seguinte: 2 noites, 3 dias de
// refeição e transporte) | carro (km ida e volta × R$/km + 1 noite, 2 dias) | nao. pagaEmpresa = itens que a empresa paga
// ({ passagem, hotel, transporte }: true = sai da conta da Mentorei).
export function custoViagem({ modo = 'aviao', km = 0 } = {}, v = PADRAO_CUSTOS.viagem, pagaEmpresa = {}) {
  if (modo === 'nao') return { passagem: 0, hotel: 0, dias: 0, total: 0 };
  const aviao = modo !== 'carro';
  const passagem = pagaEmpresa.passagem ? 0 : aviao ? Number(v.passagem) : Number(km || 0) * Number(v.km);
  const hotel = pagaEmpresa.hotel ? 0 : Number(v.hotel) * Number(aviao ? v.noites_aviao : v.noites_carro);
  // refeição e transporte no local (o transporte some se a empresa paga; fica a refeição: metade da diária)
  const dias = Number(v.dia) * Number(aviao ? v.dias_aviao : v.dias_carro) * (pagaEmpresa.transporte ? 0.5 : 1);
  return { passagem: arred(passagem), hotel: arred(hotel), dias: arred(dias), total: arred(passagem + hotel + dias) };
}

// Margem de uma turma ou mentoria. receita = linhas do plano; reais = despesas lançadas; estimados = mentores parceiros ainda não
// pagos e viagens futuras; socias = horas das sócias (custo de oportunidade: elas recebem pela distribuição).
export function margem({ receita = 0, reais = 0, parceiros = 0, viagens = 0, socias = 0, pct = 0 }) {
  const imposto = impostoSobre(receita, pct);
  const semSocias = arred(receita - reais - parceiros - viagens - imposto);
  const comSocias = arred(semSocias - socias);
  const p = (v) => (receita ? Math.round(v / receita * 1000) / 10 : null);
  return { receita: arred(receita), reais: arred(reais), parceiros: arred(parceiros), viagens: arred(viagens), socias: arred(socias), imposto,
    sem_socias: semSocias, sem_socias_pct: p(semSocias), com_socias: comSocias, com_socias_pct: p(comSocias) };
}

// Preço para chegar à margem desejada: custos ÷ (1 − imposto − margem)
export function precoPara({ custos: c, pct = 0, alvo = 30 }) {
  const sobra = 1 - Number(pct || 0) / 100 - Number(alvo || 0) / 100;
  return sobra > 0 ? arred(Number(c || 0) / sobra) : null;
}

// Fechamento do mês como na aba "Precificação/distribuição" da planilha: faturamento − despesas − Simples − INSS = líquido;
// caixa da empresa (10%); o resto dividido entre as sócias pela participação, menos as despesas pessoais de cada uma.
// despesas = do mês (pela data); socias = [{ id, nome }].
export function fechamento({ faturado, despesas, socias = [], cfg = PADRAO_CUSTOS }) {
  const imp = despesas.filter((x) => x.categoria === 'impostos');
  const inss = soma(imp.filter((x) => /inss|gps|previd/i.test(`${x.descricao} ${x.observacoes || ''}`)), (x) => x.valor);
  const simples = arred(soma(imp, (x) => x.valor) - inss);
  const pessoais = despesas.filter((x) => x.categoria === 'socia');
  const gerais = soma(despesas.filter((x) => x.categoria !== 'impostos' && x.categoria !== 'socia'), (x) => x.valor);
  const liquido = arred(Number(faturado || 0) - gerais - simples - inss);
  const caixa = arred(Math.max(0, liquido) * Number(cfg.caixa_pct || 0) / 100);
  const distribuir = arred(liquido - caixa);
  const pcts = socias.map((s) => Number(cfg.participacao[primeiroNome(s.nome)] || 0));
  const totalPct = pcts.reduce((a, x) => a + x, 0) || 1;
  const partes = socias.map((s, i) => {
    const bruto = arred(distribuir * pcts[i] / totalPct);
    const pess = soma(pessoais.filter((x) => x.pessoa_id === s.id), (x) => x.valor);
    return { id: s.id, nome: s.nome, pct: pcts[i], bruto, pessoais: pess, liquido: arred(bruto - pess) };
  });
  return { faturado: arred(faturado || 0), despesas: gerais, simples, inss, liquido, caixa_pct: Number(cfg.caixa_pct || 0), caixa, distribuir, partes,
    pessoais_sem_socia: soma(pessoais.filter((x) => !socias.some((s) => s.id === x.pessoa_id)), (x) => x.valor) };
}

// Caixa dos próximos dias, semana a semana. movimentos = [{ dia, valor (+ entra / − sai), rotulo, tipo }]; os de antes de hoje
// (atrasados) contam na 1ª semana.
export function caixaPorSemana({ hoje, saldo = 0, movimentos = [], semanas = 13 }) {
  let atual = Number(saldo || 0);
  const out = [];
  for (let s = 0; s < semanas; s++) {
    const de = somarDias(hoje, s * 7), ate = somarDias(hoje, s * 7 + 6);
    const dentro = movimentos.filter((m) => (s === 0 ? m.dia <= ate : m.dia >= de && m.dia <= ate));
    const entra = soma(dentro.filter((m) => m.valor > 0), (m) => m.valor);
    const sai = soma(dentro.filter((m) => m.valor < 0), (m) => -m.valor);
    atual = arred(atual + entra - sai);
    out.push({ de, ate, entra, sai, saldo: atual, itens: dentro });
  }
  const menor = out.reduce((a, x) => (x.saldo < a.saldo ? x : a), out[0] || { saldo: atual });
  return { semanas: out, menor, final: atual };
}

// ---------- dias de pagamento (30/10, decisão dela: pagar 3 vezes ao mês, salvo o que for fora da curva) ----------
export const DIAS_PAGAMENTO = [5, 15, 25];
// base dos mentores parceiros sem cadastro (30/10, decisão dela: a mesma do Isaac na planilha, R$ 187 por hora)
export const BASE_ISAAC = { forma: 'hora', valor: 187 };
const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();
export const diaUtil = (dia, feriado = () => null) => diaDaSemana(dia) % 6 !== 0 && !feriado(dia);
const ajustar = (dia, passo, feriado) => { let d = dia; while (!diaUtil(d, feriado)) d = somarDias(d, passo); return d; };
const slotsDoMes = (mes) => DIAS_PAGAMENTO.map((n) => `${mes}-${String(n).padStart(2, '0')}`);
// Próximo dia de pagamento (5, 15 ou 25) a partir de "desde" (inclusive); fim de semana ou feriado = dia útil seguinte
export function proximoPagamento(desde, feriado) {
  for (let k = 0; k < 3; k++) for (const s of slotsDoMes(somarMeses(desde.slice(0, 7), k))) if (s >= desde) return ajustar(s, 1, feriado);
  return null;
}
// Nota do mentor: entra no primeiro dia de pagamento que vier pelo menos 3 dias depois do envio e depois do fim do mês da nota
export function pagamentoDaNota({ enviadaEm, mesReferencia, feriado }) {
  const envio = diaDe(enviadaEm);
  const fimDoMes = somarDias(`${somarMeses(mesReferencia, 1)}-01`, -1);
  const pronta = [somarDias(envio, 3), somarDias(fimDoMes, 1)].sort().pop();
  return proximoPagamento(pronta, feriado);
}
// Conta com vencimento: paga no último dia de pagamento até o vencimento (se cair em fim de semana ou feriado, o dia útil antes)
export function pagamentoDaConta(vencimento, feriado) {
  const antes = [...slotsDoMes(somarMeses(vencimento.slice(0, 7), -1)), ...slotsDoMes(vencimento.slice(0, 7))].filter((s) => s <= vencimento);
  return ajustar(antes[antes.length - 1], -1, feriado);
}
// Os próximos n dias de pagamento a partir de hoje
export function proximosPagamentos(hoje, n = 6, feriado) {
  const out = [];
  let d = hoje;
  while (out.length < n) { const p = proximoPagamento(d, feriado); if (!out.includes(p)) out.push(p); d = somarDias(p, 1); }
  return out;
}

// Valor que a Juliana informou em 30/10/2026 (falta o extrato): vale até o primeiro lançamento de verdade
export const RESERVA_INICIAL = [{ id: 'informado-2026-10-30', data: '2026-10-30', tipo: 'saldo', valor: 62000, obs: 'Valor aproximado informado pela Juliana. Falta o extrato.', provisorio: true }];
export const TIPOS_RESERVA = { saldo: 'Saldo do extrato', aporte: 'Aporte (entrou)', resgate: 'Resgate (saiu)', rendimento: 'Rendimento' };
export function saldoReserva(lancamentos) {
  const lista = [...(lancamentos || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.em || '').localeCompare(String(b.em || '')));
  let saldo = null, data = null, ultimoExtrato = null;
  for (const l of lista) {
    const v = Number(l.valor || 0);
    if (l.tipo === 'saldo') { saldo = v; ultimoExtrato = l; } else saldo = (saldo || 0) + (l.tipo === 'resgate' ? -v : v);
    data = l.data;
  }
  return { saldo: saldo == null ? null : arred(saldo), data, ultimoExtrato };
}
