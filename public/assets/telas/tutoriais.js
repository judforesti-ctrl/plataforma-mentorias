// Tutoriais em vídeo (script 63, pedido da Juliana em 31/10/2026). Cada pessoa vê só a série dela (mentor, aluno, mentorado, RH);
// a administração vê todas e, em cada vídeo, envia ou troca o arquivo (pasta pública "tutoriais", até 50 MB, MP4), muda título e frase,
// esconde ou mostra, e copia o link público dos vídeos de boas-vindas (o mesmo que vai junto com o convite).
// "Assistido" quando a pessoa vê 80% do vídeo (tutoriais_vistos). Faixa "Comece por aqui" na primeira tela: lembreteTutoriais().
import { sb, esc, avisar, explicarErro } from '../base.js';
import { SERIES, seriesDe, linkPublico, duracaoTexto, serieDoArquivo } from '../tutoriais-regras.js';
import { janela } from './agenda-dados.js';

const faltaScript = (e) => /tutoriais|schema cache|42P01|PGRST20/.test(`${e && e.code} ${e && e.message}`);
const urlVideo = (caminho) => sb.storage.from('tutoriais').getPublicUrl(caminho).data.publicUrl;
const ADIADO = 'mentorei.tutoriaisDepois';

async function carregar(ctx) {
  const [t, v] = await Promise.all([
    sb.from('tutoriais').select('*').order('serie').order('numero'),
    sb.from('tutoriais_vistos').select('tutorial_id, visto_em').eq('perfil_id', ctx.perfil.id),
  ]);
  if (t.error) return { erro: t.error };
  return { lista: t.data || [], vistos: new Set((v.data || []).map((x) => x.tutorial_id)) };
}

// duração de um arquivo de vídeo, lida no navegador antes de enviar
const duracaoDoArquivo = (arq) => new Promise((ok) => {
  const v = document.createElement('video'); v.preload = 'metadata';
  v.onloadedmetadata = () => { ok(Math.round(v.duration) || null); URL.revokeObjectURL(v.src); };
  v.onerror = () => ok(null);
  v.src = URL.createObjectURL(arq);
});

async function enviarVideo(t, arq) {
  if (!/\.mp4$/i.test(arq.name) && arq.type !== 'video/mp4') throw new Error('Envie o vídeo em MP4.');
  if (arq.size > 52428800) throw new Error(`${arq.name} passa de 50 MB.`);
  const duracao = await duracaoDoArquivo(arq);
  const caminho = `${t.serie}/${t.numero}-${Date.now()}.mp4`;
  const up = await sb.storage.from('tutoriais').upload(caminho, arq, { contentType: 'video/mp4', upsert: false });
  if (up.error) throw up.error;
  const { error } = await sb.from('tutoriais').update({ video: caminho, duracao_seg: duracao, atualizado_em: new Date().toISOString() }).eq('id', t.id);
  if (error) { await sb.storage.from('tutoriais').remove([caminho]); throw error; }
  if (t.video) sb.storage.from('tutoriais').remove([t.video]).catch(() => {});
}

function assistir(ctx, t, jaVisto, aoMarcar, aoFechar) {
  const j = janela(`${t.numero} · ${t.titulo}`, `<video id="tv" controls autoplay playsinline style="width:100%;border-radius:10px;background:#000;aspect-ratio:16/9" src="${esc(urlVideo(t.video))}"></video>
    ${t.descricao ? `<p class="peq apagado mt">${esc(t.descricao)}</p>` : ''}`, { largura: 960, aoFechar });
  const v = j.corpo.querySelector('#tv');
  let marcado = jaVisto;
  const marcar = async () => {
    if (marcado) return; marcado = true;
    const { error } = await sb.from('tutoriais_vistos').upsert({ perfil_id: ctx.perfil.id, tutorial_id: t.id, visto_em: new Date().toISOString() });
    if (!error) aoMarcar();
  };
  v.addEventListener('timeupdate', () => { if (v.duration && v.currentTime / v.duration >= 0.8) marcar(); });
  v.addEventListener('ended', marcar);
}

function cartao(t, visto, adm) {
  const temVideo = !!t.video;
  return `<article class="cartao" data-tut="${t.id}" style="display:grid;gap:10px;align-content:start${t.ativo ? '' : ';opacity:.6'}">
    <div class="linha" style="gap:10px;align-items:center">
      <span style="flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:var(--petroleo);color:#fff">${t.numero}</span>
      <h3 style="flex:1;margin:0">${esc(t.titulo)}</h3></div>
    ${t.descricao ? `<p class="peq" style="margin:0">${esc(t.descricao)}</p>` : ''}
    <div class="linha" style="gap:6px">
      ${t.duracao_seg ? `<span class="selo neutro">${duracaoTexto(t.duracao_seg)}</span>` : ''}
      ${visto ? '<span class="selo ok">✓ Assistido</span>' : ''}
      ${adm && !temVideo ? '<span class="selo alerta">Falta enviar o vídeo</span>' : ''}
      ${adm && !t.ativo ? '<span class="selo neutro">Escondido</span>' : ''}</div>
    <div class="linha" style="gap:6px">
      ${temVideo ? `<button class="btn ${visto ? '' : 'pri'} peq" type="button" data-assistir="${t.id}">${visto ? 'Assistir de novo' : '▶ Assistir'}</button>` : ''}
      ${adm ? `<label class="btn peq" style="cursor:pointer">${temVideo ? 'Trocar o vídeo' : 'Enviar o vídeo'}<input type="file" accept="video/mp4,.mp4" data-enviar="${t.id}" hidden></label>
        <button class="btn peq" type="button" data-editar="${t.id}">Editar</button>
        <button class="btn peq" type="button" data-ativo="${t.id}">${t.ativo ? 'Esconder' : 'Mostrar'}</button>` : ''}
    </div></article>`;
}

export async function render(ctx, el) {
  const adm = ctx.ehAdmin;
  const d = await carregar(ctx);
  if (d.erro) {
    el.innerHTML = `<div class="cab"><div><h1>Tutoriais</h1></div></div><div class="aviso">${faltaScript(d.erro)
      ? (adm ? 'Para os tutoriais, falta rodar o script <b>63-tutoriais.sql</b> no Supabase.' : 'Os tutoriais ainda não estão disponíveis.') : esc(explicarErro(d.erro))}</div>`;
    return;
  }
  const minhas = seriesDe({ ...ctx.perfil, temTrilha: ctx.temTrilha, ehAdmin: adm });
  const porSerie = (s) => d.lista.filter((t) => t.serie === s && (adm || (t.ativo && t.video)));
  const series = minhas.filter((s) => adm || porSerie(s).length);

  el.innerHTML = `
    <div class="cab"><div><h1>Tutoriais</h1><p class="sub">Vídeos curtos que mostram, passo a passo, como usar a plataforma.</p></div>
      ${adm ? `<div class="acoes"><label class="btn escuro" style="cursor:pointer">Enviar vários vídeos de uma vez<input type="file" accept="video/mp4,.mp4" multiple id="tv-varios" hidden></label></div>` : ''}</div>
    ${adm ? '<p class="peq apagado" style="margin-bottom:14px">O nome do arquivo diz a série e o número: "Tutorial do mentor 3 - Mentoria em grupo.mp4" vai para o vídeo 3 do mentor. Cada vídeo pode ter até 50 MB.</p>' : ''}
    <p class="peq apagado" id="tv-progresso" role="status"></p>
    ${series.length ? series.map((s) => {
      const lista = porSerie(s);
      const comVideo = lista.filter((t) => t.ativo && t.video);
      const vistos = comVideo.filter((t) => d.vistos.has(t.id)).length;
      const total = comVideo.reduce((a, t) => a + (t.duracao_seg || 0), 0);
      return `<section style="margin-bottom:26px">
        <div class="linha" style="align-items:baseline;gap:6px 14px;margin-bottom:10px">
          <h2 style="margin:0;flex:1 1 auto">${esc(SERIES[s].titulo)}</h2>
          ${comVideo.length ? `<span class="peq apagado">${comVideo.length} vídeo${comVideo.length > 1 ? 's' : ''}${total ? ` · ${duracaoTexto(total)}` : ''}${adm ? '' : ` · ${vistos} de ${comVideo.length} assistido${vistos === 1 ? '' : 's'}`}</span>` : ''}
          ${adm && comVideo.length ? `<button class="btn peq" type="button" data-copiar="${s}">Copiar o link para quem ainda não entrou</button>
            <a class="btn peq" href="${esc(linkPublico(location.origin, s))}" target="_blank" rel="noopener">Ver como o convidado vê</a>` : ''}
        </div>
        ${lista.length ? `<div class="grade g3">${lista.map((t) => cartao(t, d.vistos.has(t.id), adm)).join('')}</div>` : '<p class="apagado">Nenhum vídeo nesta série ainda.</p>'}
      </section>`;
    }).join('') : '<div class="vazio">Os vídeos estão sendo preparados. Em breve eles aparecem aqui.</div>'}`;

  const recarregar = () => ctx.irPara('#/tutoriais');
  const prog = el.querySelector('#tv-progresso');
  const subir = async (pares) => {
    let ok = 0;
    for (const [i, [t, arq]] of pares.entries()) {
      prog.textContent = `Enviando ${i + 1} de ${pares.length}: ${arq.name}…`;
      try { await enviarVideo(t, arq); ok += 1; } catch (e) { avisar(`${arq.name}: ${explicarErro(e)}`, true); }
    }
    prog.textContent = '';
    if (ok) { avisar(`${ok} vídeo${ok > 1 ? 's enviados' : ' enviado'}.`); recarregar(); }
  };

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const t = d.lista.find((x) => x.id === (b.dataset.assistir || b.dataset.editar || b.dataset.ativo));
    if (b.dataset.assistir) { const antes = d.vistos.has(t.id); return assistir(ctx, t, antes, () => { d.vistos.add(t.id); }, () => { if (!antes && d.vistos.has(t.id)) recarregar(); }); }
    if (b.dataset.copiar) {
      const link = linkPublico(location.origin, b.dataset.copiar);
      try { await navigator.clipboard.writeText(link); avisar('Link copiado.'); } catch (_) { window.prompt('Copie o link:', link); }
      return;
    }
    if (b.dataset.ativo) {
      const { error } = await sb.from('tutoriais').update({ ativo: !t.ativo, atualizado_em: new Date().toISOString() }).eq('id', t.id);
      if (error) { avisar(explicarErro(error), true); return; }
      return recarregar();
    }
    if (b.dataset.editar) {
      const j = janela(`Editar · ${SERIES[t.serie].nome} ${t.numero}`, `<div class="grade" style="gap:10px">
        <div class="campo"><label for="te-tit">Título</label><input id="te-tit" type="text" maxlength="120" value="${esc(t.titulo)}"></div>
        <div class="campo"><label for="te-desc">O que a pessoa aprende (uma frase)</label><textarea id="te-desc" maxlength="300" rows="3">${esc(t.descricao || '')}</textarea></div>
        <div class="linha"><button class="btn pri" type="button" id="te-salvar">Salvar</button></div></div>`, { largura: 560 });
      j.corpo.querySelector('#te-salvar').addEventListener('click', async () => {
        const titulo = j.corpo.querySelector('#te-tit').value.trim();
        if (!titulo) { avisar('Escreva o título.', true); return; }
        const { error } = await sb.from('tutoriais').update({ titulo, descricao: j.corpo.querySelector('#te-desc').value.trim() || null, atualizado_em: new Date().toISOString() }).eq('id', t.id);
        if (error) { avisar(explicarErro(error), true); return; }
        j.fechar(); recarregar();
      });
    }
  });
  el.addEventListener('change', async (ev) => {
    const inp = ev.target;
    if (inp.dataset.enviar) {
      const arq = inp.files[0]; inp.value = '';
      if (arq) await subir([[d.lista.find((x) => x.id === inp.dataset.enviar), arq]]);
    }
    if (inp.id === 'tv-varios') {
      const arqs = [...inp.files]; inp.value = '';
      const pares = []; const sem = [];
      for (const a of arqs) {
        const k = serieDoArquivo(a.name);
        const t = k && d.lista.find((x) => x.serie === k.serie && x.numero === k.numero);
        if (t) pares.push([t, a]); else sem.push(a.name);
      }
      if (sem.length) avisar(`Não sei de qual vídeo é: ${sem.join(', ')}. Use "Enviar o vídeo" no cartão certo.`, true);
      if (pares.length) await subir(pares);
    }
  });
}

// faixa "Comece por aqui" na primeira tela de quem ainda não viu os vídeos da série dele ("Agora não" = 7 dias)
export async function lembreteTutoriais(ctx) {
  if (ctx.ehAdmin) return null;
  try { const t = Number(localStorage.getItem(ADIADO) || 0); if (Date.now() - t < 7 * 864e5) return null; } catch (_) { /* sem armazenamento */ }
  const d = await carregar(ctx);
  if (d.erro) return null;
  const minhas = seriesDe({ ...ctx.perfil, temTrilha: ctx.temTrilha });
  const faltam = d.lista.filter((t) => minhas.includes(t.serie) && t.ativo && t.video && !d.vistos.has(t.id));
  if (!faltam.length) return null;
  const total = faltam.reduce((a, t) => a + (t.duracao_seg || 0), 0);
  const caixa = document.createElement('div');
  caixa.className = 'foto-lembrete';
  caixa.setAttribute('role', 'region');
  caixa.setAttribute('aria-label', 'Comece por aqui');
  caixa.innerHTML = `<span class="foto-lembrete-rosto" style="display:grid;place-items:center;background:var(--petroleo);color:#fff;font-size:20px" aria-hidden="true">▶</span>
    <div class="foto-lembrete-txt"><b>Comece por aqui</b>
      <span>${faltam.length} vídeo${faltam.length > 1 ? 's' : ''} curto${faltam.length > 1 ? 's' : ''}${total ? ` (${duracaoTexto(total)})` : ''} mostram, passo a passo, como usar a plataforma.</span></div>
    <div class="foto-lembrete-acoes"><a class="btn pri peq" href="#/tutoriais">Assistir aos vídeos</a>
      <button type="button" class="btn peq" data-depois>Agora não</button></div>`;
  caixa.querySelector('[data-depois]').addEventListener('click', () => { try { localStorage.setItem(ADIADO, String(Date.now())); } catch (_) { /* ok */ } caixa.remove(); });
  return caixa;
}

