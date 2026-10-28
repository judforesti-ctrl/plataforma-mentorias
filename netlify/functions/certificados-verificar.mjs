// Verificação PÚBLICA de um certificado (página certificados.mentorei.com.br/CODIGO, sem login).
// Só consulta pelo código exato (nunca lista nada) e devolve só o necessário, lido do RETRATO guardado na emissão:
// nome, programa, carga, período, emissão, cliente e quantos módulos. Nunca e-mail nem dados internos.
// Limite de 30 consultas por minuto por pessoa (IP), para dificultar quem tenta adivinhar códigos.
import { supa } from '../lib/google.mjs';
import { normalizarCodigo, dataLonga, ALFABETO } from '../../public/assets/certificados-regras.js';

export const config = {
  path: '/api/certificados/verificar/:codigo',
  method: 'GET',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

const FORMATO = new RegExp(`^MTR-\\d{2}-[${ALFABETO}]{4}-[${ALFABETO}]{4}$`);
const resposta = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
});
const diaBR = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export default async (req, context) => {
  const bruto = (context && context.params && context.params.codigo) || new URL(req.url).pathname.split('/').pop();
  let codigo = '';
  try { codigo = normalizarCodigo(decodeURIComponent(bruto || '')); } catch (_) { codigo = ''; }
  if (!FORMATO.test(codigo)) return resposta({ encontrado: false }, 404);
  const r = await supa(`/rest/v1/cert_certificados?codigo=eq.${encodeURIComponent(codigo)}&select=status,participante,dados_snapshot,cancelado_em&limit=1`);
  if (!r.ok) return resposta({ mensagem: 'Não conseguimos verificar agora. Tente de novo em alguns minutos.' }, 503);
  const c = r.dados && r.dados[0];
  if (!c) return resposta({ encontrado: false }, 404);
  if (c.status !== 'valido') return resposta({ status: 'cancelado', codigo, cancelado_em: c.cancelado_em ? dataLonga(diaBR(c.cancelado_em)) : '' });
  const s = c.dados_snapshot || {};
  return resposta({
    status: 'valido', codigo, participante: c.participante, tipo: s.tipo || '', curso: s.curso || '', carga: s.carga || '',
    periodo: s.periodo || '', data_emissao: s.data_emissao || '', cliente: s.cliente || '', modulos: Array.isArray(s.modulos) ? s.modulos.length : 0,
  });
};
