// Para respostas grandes demais para o formato garantido do Claude (output_config.format recusa com "The compiled grammar
// is too large"): o pedido leva um molde do JSON por escrito, a resposta é lida com tolerância e depois encaixada no
// esquema (campo que faltar vira vazio, campo a mais sai), para o resto do sistema receber sempre o mesmo formato.

// Molde legível do esquema: "texto" = string, 0 = inteiro, listas com um item de exemplo, "ícone" = valor de uma lista fixa.
export const moldeDoEsquema = (e) => {
  if (e.type === 'object') return Object.fromEntries(Object.entries(e.properties).map(([k, s]) => [k, moldeDoEsquema(s)]));
  if (e.type === 'array') return [moldeDoEsquema(e.items)];
  if (e.enum) return 'ícone';
  return e.type === 'integer' ? 0 : 'texto';
};

// O objeto JSON da resposta (aceita texto ou ``` em volta); null se não der para ler.
export function lerJson(texto) {
  const s = String(texto || '');
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { const v = JSON.parse(s.slice(i, j + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (_) { return null; }
}

// Encaixa o valor no esquema: só os campos do esquema, todos presentes, cada um no tipo certo.
export function encaixar(v, e) {
  if (e.type === 'object') {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    return Object.fromEntries(Object.entries(e.properties).map(([k, s]) => [k, encaixar(o[k], s)]));
  }
  if (e.type === 'array') return Array.isArray(v) ? v.map((x) => encaixar(x, e.items)) : [];
  if (e.type === 'integer') { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
  if (e.enum) return e.enum.includes(v) ? v : '';                       // ícone desconhecido: fica sem desenho
  return v == null || typeof v === 'object' ? '' : String(v);
}
