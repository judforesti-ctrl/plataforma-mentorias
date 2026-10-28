// Certificados (etapa 5): a IA lê a proposta ou a trilha (texto extraído no navegador de PPTX, PDF ou DOCX) e devolve os
// campos da pasta: tipo, programa, cliente, datas, período, carga, cidade, módulos e as dúvidas para conferir (observacoes).
// Prompt e esquema do pacote dela (docs/certificados/extracao, copiados em netlify/lib/certificados-extracao.mjs).
// Roda em segundo plano; o resultado vai para importacoes_proposta (resultado.tipo = 'certificado', fora das listas de propostas).
// Nada é gravado na pasta aqui: a administração revisa tudo no formulário antes de criar.
import Anthropic from '@anthropic-ai/sdk';
import { motivoClaude } from '../lib/claude-erro.mjs';
import { supa, env, quemPede } from '../lib/google.mjs';
import { INSTRUCOES, ESQUEMA } from '../lib/certificados-extracao.mjs';
import { TIPOS } from '../../public/assets/certificados-regras.js';

export const config = { path: '/api/certificados-extrair', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
const texto = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export default async (req) => {
  let b; try { b = await req.json(); } catch (_) { return; }
  const id = String(b.importacao_id || '');
  if (!UUID.test(id) || !env('SUPABASE_SECRET_KEY')) return;
  const falhar = (erro) => supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'erro', erro } });
  const eu = await quemPede(req);
  if (!eu) return falhar('Sessão expirada. Entre de novo e tente outra vez.');
  if (eu.papel !== 'admin') return falhar('Só a administração emite certificados.');
  const chaveClaude = env('ANTHROPIC_API_KEY');
  if (!chaveClaude) return falhar('A chave do Claude (ANTHROPIC_API_KEY) não está na Netlify.');
  // marcadores de página como pede o prompt do pacote: "=== Slide 3 ===" / "=== Página 2 ==="
  const conteudo = String(b.texto || '').slice(0, 150000)
    .replace(/--- (página|slide|parte) (\d+) ---/gi, (_, t, n) => `=== ${t.charAt(0).toUpperCase()}${t.slice(1).toLowerCase()} ${n} ===`);
  if (conteudo.replace(/=== \S+ \d+ ===/g, '').trim().length < 80) {
    return falhar('Não consegui ler texto neste arquivo. Se ele for uma imagem escaneada, exporte de novo como PDF a partir do Canva, do PowerPoint ou do Word.');
  }
  try {
    const client = new Anthropic({ apiKey: chaveClaude });
    const r = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      system: INSTRUCOES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: `Arquivo: ${String(b.arquivo || '').slice(0, 200)}\n\n${conteudo}` }],
    });
    let res;
    try { res = JSON.parse(r.content.filter((x) => x.type === 'text').map((x) => x.text).join('')); } catch (_) {
      return falhar('A IA não devolveu os campos organizados. Tente de novo.');
    }
    // confere o que veio: o formulário recebe só valores no formato certo; o resto fica vazio para a pessoa preencher
    const campos = {
      tipo: TIPOS.includes(res.tipo) ? res.tipo : null,
      curso: texto(res.curso) || null,
      cliente: texto(res.cliente) || null,
      inicio: DATA.test(String(res.inicio || '')) ? res.inicio : null,
      fim: DATA.test(String(res.fim || '')) ? res.fim : null,
      periodo_texto: texto(res.periodo_texto) || null,
      carga_horas: numero(res.carga_horas),
      cidade: texto(res.cidade) || null,
      modulos: (Array.isArray(res.modulos) ? res.modulos : []).map((m) => ({ titulo: texto(m.titulo), descricao: texto(m.descricao), horas: numero(m.horas) }))
        .filter((m) => m.titulo).slice(0, 30),
      observacoes: (Array.isArray(res.observacoes) ? res.observacoes : []).map(texto).filter(Boolean).slice(0, 12),
    };
    await supa(`/rest/v1/importacoes_proposta?id=eq.${id}`, { metodo: 'PATCH', corpo: { status: 'pronto', resultado: { tipo: 'certificado', arquivo: b.arquivo || null, campos } } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return falhar('A chave do Claude na Netlify não está valendo.');
    if (e instanceof Anthropic.RateLimitError) return falhar('Muitos pedidos ao mesmo tempo. Espere um minuto e tente de novo.');
    if (e instanceof Anthropic.APIError) return falhar(motivoClaude(e));
    return falhar('Não foi possível falar com o Claude agora. Tente de novo.');
  }
};
