// Sala do Meet do mentorado: colocar ou trocar o link a qualquer momento (na ficha e na tela da sessão).
// O link fica em mentorados.sala_meet e vale para todas as sessões.
import { sb, esc, avisar, explicarErro } from '../base.js';

// "meet.google.com/abc" vira "https://meet.google.com/abc"; em branco vira null.
export function normalizarMeet(valor) {
  const x = String(valor || '').trim();
  if (!x) return null;
  return /^https?:\/\//i.test(x) ? x : `https://${x}`;
}

// Janela para colar (ou trocar) o link da sala. Chama aoSalvar(novoLink) depois de gravar.
export function editarLinkMeet({ id, nome, sala_meet }, aoSalvar) {
  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(9,18,22,.55);z-index:40;display:grid;place-items:center;padding:16px';
  fundo.innerHTML = `<form class="cartao" role="dialog" aria-modal="true" aria-label="Link da sala do Meet" style="width:100%;max-width:520px">
    <h3>Link da sala do Meet · ${esc(String(nome || '').split(' ')[0])}</h3>
    <p class="peq apagado mt">Cole o link da sala. Ele fica guardado na ficha e vale para todas as sessões. O mentorado também vê na área dele.</p>
    <div class="campo mt"><label for="meet-link">Link</label>
      <input id="meet-link" type="text" inputmode="url" placeholder="https://meet.google.com/abc-defg-hij" value="${esc(sala_meet || '')}"></div>
    <div class="linha mt"><button class="btn pri" type="submit">Salvar link</button><button class="btn" type="button" data-fechar>Cancelar</button>
      ${sala_meet ? '<button class="btn perigo" type="button" data-tirar style="margin-left:auto">Tirar o link</button>' : ''}</div>
  </form>`;
  document.body.appendChild(fundo);
  const campo = fundo.querySelector('#meet-link');
  campo.focus(); campo.select();
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla);

  const gravar = async (valor) => {
    const link = normalizarMeet(valor);
    if (link && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(link)) { avisar('Esse link não parece completo. Copie o endereço inteiro da sala do Meet.', true); return; }
    fundo.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const { error } = await sb.from('mentorados').update({ sala_meet: link }).eq('id', id);
    if (error) { avisar(explicarErro(error), true); fundo.querySelectorAll('button').forEach((b) => { b.disabled = false; }); return; }
    fechar();
    avisar(link ? 'Link do Meet salvo.' : 'Link do Meet retirado.');
    aoSalvar(link);
  };
  fundo.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); gravar(campo.value); });
  fundo.querySelector('[data-tirar]')?.addEventListener('click', () => { if (window.confirm('Tirar o link da sala do Meet deste mentorado?')) gravar(''); });
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });
}
