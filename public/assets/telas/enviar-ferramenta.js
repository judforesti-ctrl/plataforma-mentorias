// Janela "Enviar ferramenta": escolhe o mentorado, registra o envio e, se ele autorizou, abre o WhatsApp com a mensagem pronta.
import { sb, esc, avisar, explicarErro } from '../base.js';

export async function enviarFerramenta(ctx, ferramenta, mentoradoFixo = null) {
  let consulta = sb.from('mentorados').select('id, nome, status, perfil:perfis!mentorados_perfil_id_fkey(whatsapp, autorizacoes, termo_aceito_em)').eq('status', 'ativo').order('nome');
  if (mentoradoFixo) consulta = consulta.eq('id', mentoradoFixo);
  else if (!ctx.ehAdmin || location.hash.startsWith('#/meus')) {
    const { data: v } = await sb.from('mentor_mentorado').select('mentorado_id').eq('mentor_id', ctx.perfil.id);
    consulta = consulta.in('id', (v || []).map((x) => x.mentorado_id));
  }
  const { data: ms, error } = await consulta;
  if (error) { avisar(explicarErro(error), true); return; }

  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(9,18,22,.55);z-index:40;display:grid;place-items:center;padding:16px';
  fundo.innerHTML = `<div class="cartao" role="dialog" aria-modal="true" aria-label="Enviar ferramenta" style="width:100%;max-width:520px;max-height:90vh;overflow:auto">
    <div class="linha"><h3 style="flex:1">Enviar “${esc(ferramenta.nome)}”</h3><button class="btn peq" data-fechar>Fechar</button></div>
    ${ms && ms.length ? `<p class="peq apagado mt">A ferramenta aparece na área do mentorado, com o PDF para baixar.</p>
      <input type="search" class="mt" id="q-ment" placeholder="Buscar mentorado…">
      <div class="lista mt" id="l-ment">${ms.map((m) => `<label class="check" data-nome="${esc(m.nome.toLowerCase())}"><input type="radio" name="ment" value="${m.id}"><span>${esc(m.nome)}</span></label>`).join('')}</div>
      <div class="linha mt"><button class="btn pri" id="confirmar">Enviar</button></div>
      <div id="depois" class="mt"></div>` : '<p class="apagado mt">Você não tem mentorados ativos.</p>'}
  </div>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });
  fundo.querySelector('#q-ment')?.addEventListener('input', (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    fundo.querySelectorAll('#l-ment label').forEach((l) => { l.hidden = q && !l.dataset.nome.includes(q); });
  });
  fundo.querySelector('#confirmar')?.addEventListener('click', async (ev) => {
    const id = fundo.querySelector('input[name=ment]:checked')?.value;
    if (!id) { avisar('Escolha o mentorado.', true); return; }
    ev.target.disabled = true;
    const { error: e } = await sb.from('ferramentas_enviadas').insert({ mentorado_id: id, ferramenta_id: ferramenta.id, enviado_por: ctx.perfil.id });
    if (e) { avisar(explicarErro(e), true); ev.target.disabled = false; return; }
    const m = ms.find((x) => x.id === id);
    const p = m.perfil || {};
    const whats = (p.whatsapp || '').replace(/\D/g, '');
    const autorizou = p.autorizacoes && p.autorizacoes.whatsapp;
    const texto = `Olá, ${m.nome.split(' ')[0]}! Enviei para você a ferramenta "${ferramenta.nome}". Ela está na sua área da plataforma de mentorias: ${location.origin}/app.html#/minha-area`;
    fundo.querySelector('#depois').innerHTML = `<div class="aviso ok">Enviada para ${esc(m.nome)}.</div>
      ${!p.termo_aceito_em ? '<p class="peq apagado mt">Este mentorado ainda não tem acesso à plataforma. Ele vai ver a ferramenta quando entrar.</p>'
        : whats && autorizou ? `<div class="linha mt"><a class="btn" href="https://wa.me/55${whats.replace(/^55/, '')}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Avisar pelo WhatsApp</a></div>`
        : '<p class="peq apagado mt">Ele não autorizou mensagens por WhatsApp. A ferramenta já está na área dele.</p>'}`;
    avisar('Ferramenta enviada.');
  });
}
