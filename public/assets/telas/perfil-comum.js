// Campos de perfil compartilhados pelo primeiro acesso e pela tela "Meu perfil".
import { sb, esc, avatar, avisar, explicarErro } from '../base.js';

const v = (x) => esc(x == null ? '' : x);

export function htmlFoto(perfil) {
  return `<div class="linha" style="gap:16px">
    <span id="foto-prev">${avatar(perfil, true)}</span>
    <div><label class="btn peq" for="foto-arquivo" style="cursor:pointer">Escolher foto</label>
      <input id="foto-arquivo" type="file" accept="image/*" hidden>
      <p class="peq apagado" style="margin-top:6px">Uma foto de rosto, de frente. Ela aparece para ${perfil.papel === 'mentorado' ? 'os seus mentores' : 'os seus mentorados'}.</p></div></div>`;
}

// Reduz a imagem para 400 px antes de enviar (foto leve e rápida).
async function reduzir(arquivo) {
  const img = await createImageBitmap(arquivo);
  const lado = 400, escala = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}

export function ligarFoto(raiz, perfil, aoTrocar) {
  raiz.querySelector('#foto-arquivo').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0];
    if (!arq) return;
    try {
      avisar('Enviando a foto…');
      const blob = await reduzir(arq);
      const caminho = `${perfil.id}/foto-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('fotos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const url = sb.storage.from('fotos').getPublicUrl(caminho).data.publicUrl;
      raiz.querySelector('#foto-prev').innerHTML = avatar({ ...perfil, foto_url: url }, true);
      aoTrocar(url);
      avisar('Foto enviada.');
    } catch (e) { avisar(`Não foi possível enviar a foto: ${explicarErro(e)}`, true); }
  });
}

// LinkedIn e Instagram ficam em campos separados (13-linkedin-instagram.sql). Antes desse script o banco só tem
// o campo único "rede_social": as telas já mostram os dois campos, e o que for "@..." ou "instagram" vai para Instagram.
const pareceInstagram = (x) => /instagram|^\s*@/i.test(String(x || ''));
export function redes(x) {
  const o = x || {};
  if ('linkedin' in o || 'instagram' in o) return { linkedin: o.linkedin || '', instagram: o.instagram || '' };
  const r = String(o.rede_social || '').trim();
  return pareceInstagram(r) ? { linkedin: '', instagram: r } : { linkedin: r, instagram: '' };
}
// "@fulano", "instagram.com/fulano" ou o endereço completo viram um link que abre o perfil.
export function linkRede(tipo, valor) {
  const x = String(valor || '').trim();
  if (!x) return '';
  if (/^https?:\/\//i.test(x)) return x;
  if (/linkedin\.com|instagram\.com/i.test(x)) return `https://${x.replace(/^\/+/, '')}`;
  const nome = x.replace(/^@/, '');
  return tipo === 'instagram' ? `https://www.instagram.com/${nome}` : `https://www.linkedin.com/in/${nome}`;
}
// Grava em perfis ou mentorados; "rede_social" acompanha, para o que ainda lê o campo antigo.
// Se o banco ainda não tem as colunas novas, grava o resto sem elas.
export async function gravarComRedes(tabela, id, mud) {
  const dados = { ...mud };
  if ('linkedin' in dados || 'instagram' in dados) dados.rede_social = dados.linkedin || dados.instagram || null;
  let { error } = await sb.from(tabela).update(dados).eq('id', id);
  if (error && /linkedin|instagram/i.test(error.message || '')) {
    const { linkedin: _l, instagram: _i, ...resto } = dados;
    ({ error } = await sb.from(tabela).update(resto).eq('id', id));
  }
  return { error };
}

// Contato (todos os papéis)
export function htmlContato(perfil) {
  const r = redes(perfil);
  return `<div class="grade g2">
    <div class="campo"><label for="p-whats">WhatsApp</label><input id="p-whats" type="tel" data-campo="whatsapp" placeholder="(54) 99999-0000" value="${v(perfil.whatsapp)}"></div>
    <div class="campo"><label for="p-cargo">Cargo</label><input id="p-cargo" type="text" data-campo="cargo" value="${v(perfil.cargo)}"></div>
    <div class="campo"><label for="p-linkedin">LinkedIn</label><input id="p-linkedin" type="text" data-campo="linkedin" placeholder="linkedin.com/in/seu-nome" value="${v(r.linkedin)}"></div>
    <div class="campo"><label for="p-instagram">Instagram</label><input id="p-instagram" type="text" data-campo="instagram" placeholder="@seuperfil" value="${v(r.instagram)}"></div>
  </div>`;
}

// Trajetória do mentor (vira o resumo de apresentação)
const TRAJ = [
  ['cargo_atual', 'Cargo ou função hoje', 'text', 'Ex.: Mentora de liderança e consultora de RH'],
  ['anos_lideranca', 'Anos liderando pessoas', 'text', 'Ex.: 18 anos'],
  ['empresas', 'Cargos e empresas por onde passou', 'area', 'Ex.: Gerente de RH em indústria de autopeças; diretora de pessoas em rede de concessionárias'],
  ['formacao', 'Formação e certificações', 'text', 'Ex.: Psicologia, MBA em Gestão de Pessoas'],
  ['setores', 'Setores que conhece bem', 'text', 'Ex.: automotivo, indústria, varejo'],
  ['especialidades', 'Especialidades na mentoria (separe por vírgula)', 'text', 'Ex.: delegação, conversas difíceis, primeira liderança'],
  ['conquistas', 'Conquistas de que se orgulha (de preferência com números)', 'area', 'Ex.: formei 40 líderes que hoje são gerentes'],
  ['estilo', 'Como é a sua mentoria', 'area', 'Ex.: prática, com exemplos reais e tarefas pequenas entre as sessões'],
  ['frase', 'Uma frase que te move', 'text', ''],
  ['fora', 'Fora do trabalho (opcional)', 'text', 'Ex.: corrida e cozinha'],
];
export function htmlTrajetoria(perfil) {
  const t = perfil.trajetoria || {};
  return `<div class="grade g2">${TRAJ.map(([k, rot, tipo, ph]) => `<div class="campo"${tipo === 'area' ? ' style="grid-column:1/-1"' : ''}>
    <label for="t-${k}">${esc(rot)}</label>
    ${tipo === 'area' ? `<textarea id="t-${k}" data-traj="${k}" placeholder="${esc(ph)}" style="min-height:70px">${v(t[k])}</textarea>`
      : `<input id="t-${k}" type="text" data-traj="${k}" placeholder="${esc(ph)}" value="${v(t[k])}">`}</div>`).join('')}</div>
    <div class="grade g2 mt">
      <div class="campo"><label for="p-meet">Sua sala do Google Meet</label><input id="p-meet" type="url" data-campo="sala_meet" placeholder="https://meet.google.com/…" value="${v(perfil.sala_meet)}"></div>
      <div class="campo"><label for="p-ass">Assinatura das mensagens</label><input id="p-ass" type="text" data-campo="assinatura" placeholder="Um abraço, Cláudia · Mentorei" value="${v(perfil.assinatura)}"></div>
    </div>`;
}
export function lerTrajetoria(raiz) {
  const t = {};
  raiz.querySelectorAll('[data-traj]').forEach((el) => { const x = el.value.trim(); if (x) t[el.dataset.traj] = x; });
  return t;
}
export const trajetoriaCompleta = (t) => ['cargo_atual', 'anos_lideranca', 'empresas', 'especialidades', 'estilo'].every((k) => t[k]);

// Dados de trabalho do mentorado (ficam na ficha dele)
export function htmlDadosMentorado(m) {
  return `<div class="grade g2">
    <div class="campo"><label for="m-cargo">Cargo</label><input id="m-cargo" type="text" data-mtd="cargo" value="${v(m.cargo)}"></div>
    <div class="campo"><label for="m-casa">Tempo de casa</label><input id="m-casa" type="text" data-mtd="tempo_de_casa" placeholder="Ex.: 3 anos" value="${v(m.tempo_de_casa)}"></div>
    <div class="campo"><label for="m-time">Pessoas no seu time</label><input id="m-time" type="number" min="0" data-mtd="pessoas_no_time" value="${v(m.pessoas_no_time)}"></div>
    <div class="campo"><label for="m-gestor">Seu gestor direto</label><input id="m-gestor" type="text" data-mtd="gestor_direto" value="${v(m.gestor_direto)}"></div>
  </div>`;
}
export function lerDadosMentorado(raiz) {
  const o = {};
  raiz.querySelectorAll('[data-mtd]').forEach((el) => {
    const x = el.value.trim();
    o[el.dataset.mtd] = el.type === 'number' ? (x === '' ? null : Number(x)) : (x || null);
  });
  return o;
}
