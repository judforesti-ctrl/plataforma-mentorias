// Financeiro, etapa 2 (script 54): despesa pela FOTO DO RECIBO. A foto é reduzida no navegador (até 1600 px), vai para a pasta
// privada "financeiro" e a função /api/despesa-recibo (IA, em segundo plano) devolve data, valor, quem vendeu, cidade e tipo.
// Depois a agenda sugere a turma e o módulo: o módulo do mesmo dia (ou da véspera/dia seguinte, pela regra de deslocamento) cuja
// cidade bate com a do recibo; sem cidade, o único módulo presencial perto da data.
import { sb, hojeISO } from '../base.js';
import { api, faltaScript } from './agenda-dados.js';
import * as F from '../financeiro-regras.js';

const norm = (t) => String(t || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Foto grande → JPEG de até 1600 px (fica pequena para guardar e para a IA ler). PDF vai como está.
async function preparar(arq) {
  if (/pdf$/i.test(arq.type) || /\.pdf$/i.test(arq.name)) {
    if (arq.size > 10 * 1024 * 1024) throw new Error('PDF grande demais (máximo 10 MB).');
    return { blob: arq, tipo: 'application/pdf', ext: 'pdf' };
  }
  if (!/^image\//.test(arq.type)) throw new Error('Envie uma foto (JPG, PNG) ou um PDF do recibo.');
  let img;
  try { img = await createImageBitmap(arq); } catch (_) {
    img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('Não consegui abrir esta foto. Tire de novo ou envie em JPG.')); i.src = URL.createObjectURL(arq); });
  }
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
  return { blob, tipo: 'image/jpeg', ext: 'jpg' };
}

// Envia e espera a leitura. aoAvancar(texto) mostra o andamento. Devolve { caminho, resultado }.
export async function lerRecibo(arq, aoAvancar = () => {}) {
  aoAvancar('Preparando a foto…');
  const { blob, tipo, ext } = await preparar(arq);
  const caminho = `recibos/${hojeISO().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  aoAvancar('Guardando o recibo…');
  const up = await sb.storage.from('financeiro').upload(caminho, blob, { contentType: tipo, upsert: false });
  if (up.error) throw new Error(/bucket/i.test(up.error.message || '') ? 'Falta rodar o script 54 no Supabase (pasta "financeiro").' : up.error.message);
  const ins = await sb.from('fin_recibos').insert({ caminho, tipo }).select('id').single();
  if (ins.error) throw new Error(faltaScript(ins.error) ? 'Falta rodar o script 54 no Supabase.' : ins.error.message);
  aoAvancar('A IA está lendo o recibo (uns 15 segundos)…');
  const r = await api('/api/despesa-recibo', { recibo_id: ins.data.id });
  if (!r.ok && r.mensagem) throw new Error(r.mensagem);
  for (let i = 0; i < 45; i++) {
    await new Promise((ok) => setTimeout(ok, 2000));
    const { data } = await sb.from('fin_recibos').select('status, resultado, erro').eq('id', ins.data.id).single();
    if (data && data.status === 'erro') throw Object.assign(new Error(data.erro || 'A IA não conseguiu ler o recibo.'), { caminho });
    if (data && data.status === 'pronto') return { caminho, resultado: data.resultado || {} };
  }
  throw Object.assign(new Error('A leitura está demorando. O recibo ficou guardado: preencha à mão ou tente de novo.'), { caminho });
}

// Sugestão pela agenda: módulos de d.modulos entre a véspera e o dia seguinte da data do recibo.
// Prefere o que tem a cidade do recibo no local do módulo, da turma ou no nome; depois o presencial único da janela.
export function sugerirModulo(d, { data, cidade } = {}) {
  if (!data) return null;
  const perto = d.modulos.filter((m) => { const dia = F.diaDe(m.data_hora); return dia && Math.abs(F.diasEntre(data, dia)) <= 1; })
    .map((m) => ({ m, t: d.turmas.find((t) => t.id === m.turma_id) }))
    .filter((x) => x.t);
  if (!perto.length) return null;
  const c = norm(cidade);
  const comCidade = c ? perto.filter((x) => norm(`${x.m.local || ''} ${x.t.local || ''} ${x.t.nome} ${d.empresa(x.t.empresa_id).nome}`).includes(c)) : [];
  const presenciais = perto.filter((x) => x.m.formato === 'presencial');
  // entre os candidatos, o de data mais perto do recibo; empate = não escolhe (a pessoa decide)
  const maisPerto = (lista) => {
    const dist = (x) => Math.abs(F.diasEntre(data, F.diaDe(x.m.data_hora)));
    const ord = [...lista].sort((a, b) => dist(a) - dist(b));
    return ord.length && (ord.length === 1 || dist(ord[0]) < dist(ord[1])) ? ord[0] : null;
  };
  // a cidade decide primeiro; sem cidade (ou sem nenhum módulo na cidade), vale o presencial mais perto da data
  const escolhido = comCidade.length ? maisPerto(comCidade) : maisPerto(presenciais);
  if (!escolhido) return null;
  return { turma_id: escolhido.t.id, modulo_id: escolhido.m.id, empresa_id: escolhido.t.empresa_id,
    texto: `${d.empresa(escolhido.t.empresa_id).nome} · ${escolhido.t.nome} · módulo ${escolhido.m.numero} (${F.diaDe(escolhido.m.data_hora).split('-').reverse().join('/')})`,
    pela_cidade: comCidade.includes(escolhido) };
}

// Abre o comprovante guardado (link temporário de 10 minutos)
export async function abrirComprovante(caminho) {
  const { data, error } = await sb.storage.from('financeiro').createSignedUrl(caminho, 600);
  if (error || !data) throw new Error('Não consegui abrir o comprovante.');
  window.open(data.signedUrl, '_blank', 'noopener');
}
