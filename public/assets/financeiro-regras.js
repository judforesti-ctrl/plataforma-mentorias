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
  ['ferramentas', 'Ferramentas e assinaturas'], ['bancarias', 'Tarifas do banco'], ['outros', 'Outros'],
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
