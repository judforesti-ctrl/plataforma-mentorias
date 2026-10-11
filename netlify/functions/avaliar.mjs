// Avaliação das turmas, pela página pública avaliar.html (QR code do último slide ou link no chat da aula). Sem login.
// GET  /api/avaliar?m=<módulo> → dados do encontro para a página (empresa, turma, módulo, mentores) e se aceita respostas
// POST /api/avaliar {m, geral, aula, conteudo, ferramentas, mentores: {id: nota}, aprendeu, tempo, nps, marcas, comentario, temas}
//      → grava a resposta e devolve o contador (média de recomendação de 0 a 10 e total de avaliações)
// ANÔNIMO: não se grava nada de quem respondeu (nem endereço de internet, nem aparelho).
// QR antigo: se o módulo já passou e a mesma turma tem aula hoje, a resposta vai para o módulo de hoje.
import { json, supa, FUSO } from '../lib/google.mjs';
import { janelaAvaliacao, APRENDEU, TEMPO, POSITIVOS, MELHORAR, TEMAS } from '../../public/assets/avaliacao-regras.js';

export const config = { path: '/api/avaliar', method: ['GET', 'POST'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEL = 'id,numero,titulo,data_hora,duracao_min,turma_id,turma:turmas(id,nome,empresa_id,empresa:empresas(nome)),mentores:modulo_mentores(mentor:perfis(id,nome,foto_url))';
const diaSP = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: FUSO });

async function buscarModulo(id) {
  const r = await supa(`/rest/v1/modulos?id=eq.${id}&select=${SEL}`);
  return r.ok && Array.isArray(r.dados) ? r.dados[0] : null;
}

// O módulo que vale para este QR: o próprio, ou o da mesma turma que acontece hoje (quando o QR é de um dia anterior).
async function moduloQueVale(m) {
  const agora = Date.now();
  const hoje = diaSP(agora);
  if (!m.data_hora || diaSP(Date.parse(m.data_hora)) >= hoje) return m;
  const ini = new Date(Date.parse(`${hoje}T00:00:00-03:00`)).toISOString(), fim = new Date(Date.parse(`${hoje}T23:59:59-03:00`)).toISOString();
  const r = await supa(`/rest/v1/modulos?turma_id=eq.${m.turma_id}&data_hora=gte.${ini}&data_hora=lte.${fim}&select=${SEL}&order=data_hora`);
  const deHoje = (r.ok && Array.isArray(r.dados) ? r.dados : []).filter((x) => x.id !== m.id && agora >= Date.parse(x.data_hora) - 60 * 60000);
  return deHoje.length ? deHoje[deHoje.length - 1] : m;
}

const publico = (m) => ({
  id: m.id, numero: m.numero, titulo: m.titulo, data_hora: m.data_hora,
  empresa: (m.turma && m.turma.empresa && m.turma.empresa.nome) || '', turma: (m.turma && m.turma.nome) || '',
  mentores: (m.mentores || []).map((x) => x.mentor).filter(Boolean).map((p) => ({ id: p.id, nome: String(p.nome || '').split(' ')[0], foto: p.foto_url || null })),
});

async function contador() {
  const r = await supa('/rest/v1/rpc/avaliacao_contador', { metodo: 'POST', corpo: {} });
  return r.ok && r.dados ? { media: r.dados.media == null ? null : Number(r.dados.media), total: Number(r.dados.total) || 0 } : null;
}

const nota = (v, min, max) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isInteger(n) || n < min || n > max ? null : n; };
const escolhas = (v, permitidas, max) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean))]
  .filter((x) => !permitidas || permitidas.includes(x) || x.startsWith('Outro: ')).slice(0, max);

export default async (req) => {
  const url = new URL(req.url);
  let corpo = {};
  if (req.method === 'POST') { try { corpo = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); } }
  const id = String((req.method === 'POST' ? corpo.m : url.searchParams.get('m')) || '').trim();
  if (!UUID.test(id)) return json({ mensagem: 'Este link de avaliação não está completo. Leia o QR code de novo ou peça o link ao mentor.' }, 404);
  const original = await buscarModulo(id);
  if (!original) return json({ mensagem: 'Não encontramos este encontro. Peça ao mentor o link de avaliação mais recente.' }, 404);
  const m = await moduloQueVale(original);
  const janela = janelaAvaliacao(m);

  if (req.method === 'GET') return json({ modulo: publico(m), estado: janela.estado, trocado: m.id !== original.id });

  if (janela.estado === 'fechada') return json({ mensagem: 'A avaliação deste encontro já foi encerrada. Obrigada pela vontade de ajudar!' }, 409);
  if (janela.estado === 'cedo') return json({ mensagem: 'A avaliação abre no dia do encontro.' }, 409);
  const resposta = {
    modulo_id: m.id, turma_id: m.turma_id, empresa_id: (m.turma && m.turma.empresa_id) || null, origem: 'plataforma',
    geral: nota(corpo.geral, 0, 10), aula: nota(corpo.aula, 1, 5), conteudo: nota(corpo.conteudo, 1, 5), ferramentas: nota(corpo.ferramentas, 1, 5),
    aprendeu: APRENDEU[corpo.aprendeu] ? corpo.aprendeu : null, tempo: TEMPO[corpo.tempo] ? corpo.tempo : null,
    nps: nota(corpo.nps, 0, 10),
    marcas: escolhas(corpo.marcas, [...POSITIVOS, ...MELHORAR], 12),
    comentario: String(corpo.comentario || '').trim().slice(0, 3000) || null,
    temas: escolhas(corpo.temas, TEMAS, 12),
  };
  if (resposta.geral === null && resposta.nps === null) return json({ mensagem: 'Dê pelo menos a nota do encontro.' }, 400);
  const g = await supa('/rest/v1/avaliacoes?select=id', { metodo: 'POST', corpo: resposta, prefer: 'return=representation' });
  if (!g.ok || !Array.isArray(g.dados) || !g.dados[0]) {
    const falta = /avaliacoes|42P01|PGRST20|schema cache/i.test(JSON.stringify(g.dados || ''));
    return json({ mensagem: falta ? 'A avaliação ainda está sendo preparada. Tente de novo mais tarde.' : 'Não conseguimos gravar agora. Tente de novo em instantes.' }, 500);
  }
  const daTurma = new Set((m.mentores || []).map((x) => x.mentor && x.mentor.id).filter(Boolean));
  const notas = Object.entries(corpo.mentores || {}).filter(([mid]) => daTurma.has(mid)).map(([mid, v]) => ({ avaliacao_id: g.dados[0].id, mentor_id: mid, nota: nota(v, 1, 5) }))
    .filter((x) => x.nota !== null);
  if (notas.length) await supa('/rest/v1/avaliacao_mentores', { metodo: 'POST', corpo: notas });
  return json({ ok: true, contador: await contador() });
};
