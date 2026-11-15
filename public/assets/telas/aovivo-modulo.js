// Mentorei Ao Vivo dentro do módulo da turma (pedido da Juliana, 15/11/2026; script 73).
// O mentor do módulo (ou a coordenação) clica em "Abrir aula ao vivo": a plataforma cria (ou reabre) a aula deste módulo no
// Ao Vivo e já leva os slides do módulo (PDF para as imagens e PowerPoint para as anotações e o texto que a IA lê).
// Os alunos entram pela área deles, já com o nome certo; quando a aula é encerrada, a presença de quem foi reconhecido
// volta para "Presença dos alunos" deste módulo, e a avaliação da turma aparece sozinha no celular de cada um.
import { sb, esc, avisar, explicarErro, dataHoraBR } from '../base.js';

export const AOVIVO = 'https://mentorei-aovivo.netlify.app';
const FASE = { lobby: 'Sala de espera aberta', slide: 'Aula em andamento', atividade: 'Aula em andamento', resultado: 'Aula em andamento',
  ranking: 'Aula em andamento', sorteio: 'Aula em andamento', encerrada: 'Aula encerrada' };
const ext = (n) => ((String(n || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();

// os slides que vão para o Ao Vivo: a apresentação mais nova do mentor (PowerPoint .pptx/.ppt/.ppsx ou OpenOffice .odp;
// senão a oficial) e um PDF da mesma "família". Sem PDF, o próprio Ao Vivo transforma a apresentação em slides
// (/api/converter-slides, 15/11/2026): o mentor não precisa salvar como PDF.
const APRESENTACAO = ['pptx', 'ppsx', 'ppt', 'pps', 'odp'];
export function escolherSlides(arquivos, meuId) {
  const lista = (arquivos || []).slice().sort((a, b) => new Date(b.enviado_em) - new Date(a.enviado_em));
  const primeiro = (filtros, e) => { for (const f of filtros) { const x = lista.find((a) => f(a) && e.includes(ext(a.nome))); if (x) return x; } return null; };
  const doMentor = [(a) => a.tipo === 'mentor' && a.enviado_por === meuId, (a) => a.tipo === 'mentor'];
  const pptx = primeiro([...doMentor, (a) => a.tipo === 'oficial'], APRESENTACAO);
  const pdf = pptx && pptx.tipo === 'oficial'
    ? primeiro([(a) => a.tipo === 'oficial'], ['pdf'])
    : primeiro([...doMentor, (a) => a.tipo === 'aluno', (a) => a.tipo === 'oficial'], ['pdf']);
  return { pdf, pptx };
}

// abre o painel do Ao Vivo numa aba nova (a aba nasce no clique, para o navegador não bloquear)
export async function abrirAoVivo(ctx, m, botao) {
  const aba = window.open('', '_blank');
  if (aba) aba.document.write('<p style="font:16px sans-serif;padding:24px">Abrindo a aula ao vivo…</p>');
  if (botao) botao.disabled = true;
  try {
    const { data, error } = await sb.rpc('aovivo_do_modulo', { p_modulo: m.id });
    if (error) throw error;
    const p = new URLSearchParams({ s: data.id, k: data.chave });
    const { pdf, pptx } = escolherSlides(m.arquivos, ctx.perfil.id);
    for (const [nome, a] of [['pdf', pdf], ['pptx', pptx]]) {
      if (!a) continue;
      const { data: u } = await sb.storage.from('turmas').createSignedUrl(a.caminho, 3 * 3600);
      if (u && u.signedUrl) { p.set(nome, u.signedUrl); p.set(`${nome}nome`, a.nome); }
    }
    const url = `${AOVIVO}/apresentar.html#${p.toString()}`;
    if (aba) aba.location.href = url; else window.location.href = url;
    return data;
  } catch (e) {
    if (aba) aba.close();
    avisar(/aovivo_do_modulo|schema cache|PGRST20/.test(`${e && e.message}`) ? 'O Ao Vivo ainda não está ligado à plataforma (falta o script 73).' : explicarErro(e), true);
    return null;
  } finally { if (botao) botao.disabled = false; }
}

export const cartaoAoVivo = () => '<div class="cartao" id="aovivo-modulo" style="border-color:var(--verde)"><p class="peq apagado">Carregando a aula ao vivo…</p></div>';

export async function ligarAoVivo(ctx, el, m, pode) {
  const velho = el.querySelector('#aovivo-modulo');
  if (!velho) return;
  const box = velho.cloneNode(true);
  velho.replaceWith(box);
  if (!pode) { box.remove(); return; }
  const { data: s, error } = await sb.rpc('aovivo_situacao_modulo', { p_modulo: m.id });
  const { pdf, pptx } = escolherSlides(m.arquivos, ctx.perfil.id);
  const slides = pdf || pptx
    ? `Leva os slides ${[pdf && esc(pdf.nome), pptx && pptx !== pdf && esc(pptx.nome)].filter(Boolean).join(' e ')}.`
    : 'Ainda não há slides deste módulo aqui: dá para enviar a apresentação (PowerPoint ou PDF) direto no Ao Vivo.';
  box.innerHTML = `
    <div class="linha"><h3 style="flex:1">Aula ao vivo</h3>${s ? `<span class="selo${s.fase === 'encerrada' ? ' neutro' : ''}">${FASE[s.fase] || ''}</span>` : ''}</div>
    <p class="peq">Os slides, o quiz, a nuvem de palavras, a votação, os exercícios em grupo e a avaliação no fim, tudo no celular dos alunos (Mentorei Ao Vivo). Quando a aula termina, a presença volta para este módulo.</p>
    ${error && !/aovivo_situacao_modulo|schema cache|PGRST20/.test(error.message || '') ? `<p class="peq">${esc(explicarErro(error))}</p>` : ''}
    <div class="linha mt" style="gap:6px"><button class="btn pri" type="button" id="av-abrir">${s && s.roteiro ? '▶ Abrir a aula ao vivo' : '▶ Montar a aula ao vivo'}</button>
      ${s ? `<button class="btn peq" type="button" id="av-link">Copiar o convite para os alunos</button>` : ''}</div>
    <p class="peq apagado mt">${slides}</p>
    ${s ? `<p class="peq mt">Código da sala: <b>${esc(String(s.codigo).replace(/^(\d{3})/, '$1 '))}</b>${s.participantes ? ` · ${s.participantes} pessoa${s.participantes === 1 ? '' : 's'} participaram` : ''}${s.comecou_em ? ` · começou em ${dataHoraBR(s.comecou_em)}` : ''}</p>
      <p class="peq apagado">Os alunos com acesso à plataforma entram pelo botão "Entrar na aula ao vivo" na área deles, já com o nome certo. Quem não tem acesso entra pelo QR code do telão ou pelo convite.</p>` : ''}`;
  box.querySelector('#av-abrir').addEventListener('click', async (ev) => { if (await abrirAoVivo(ctx, m, ev.currentTarget)) setTimeout(() => ligarAoVivo(ctx, el, m, pode), 1500); });
  const lk = box.querySelector('#av-link');
  if (lk) lk.addEventListener('click', async () => {
    const txt = `📲 Participe da aula pelo celular: ${AOVIVO}/?c=${s.codigo}  Código: ${String(s.codigo).replace(/^(\d{3})/, '$1 ')}`;
    try { await navigator.clipboard.writeText(txt); avisar('Convite copiado. Cole no chat da aula ou no WhatsApp da turma.'); }
    catch (_) { window.prompt('Copie o convite:', txt); }
  });
}
