// Meu perfil (mentor e administração) e Meus dados (mentorado), com salvamento automático.
import { sb, esc, autoSalvar, lerCampos } from '../base.js';
import { htmlFoto, ligarFoto, htmlContato, htmlTrajetoria, lerTrajetoria, htmlDadosMentorado, lerDadosMentorado } from './perfil-comum.js';
import { AUTORIZACOES_MENTORADO } from '../termos.js';

export async function render(ctx, el) {
  const p = ctx.perfil;
  const ehMentorado = p.papel === 'mentorado';
  const atende = p.papel === 'mentor' || p.tambem_mentor;
  let mentorado = null;
  if (ehMentorado) { const { data } = await sb.from('mentorados').select('*').eq('perfil_id', p.id).maybeSingle(); mentorado = data; }
  let foto = p.foto_url;
  const aut = p.autorizacoes || {};

  el.innerHTML = `
    <div class="cab"><div><h1>${ehMentorado ? 'Meus dados' : 'Meu perfil'}</h1><p class="sub">${esc(p.email)}</p></div>
      <div class="acoes"><span class="salvo" id="indicador"></span></div></div>
    <div class="grade g2" style="align-items:start">
      <div>
        <div class="cartao">${htmlFoto(p)}<h4 class="mt2">Contato</h4><div class="mt">${htmlContato(p)}</div></div>
        ${ehMentorado && mentorado ? `<div class="cartao"><h3>Seu trabalho</h3><div class="mt">${htmlDadosMentorado(mentorado)}</div></div>` : ''}
        ${atende ? `<div class="cartao"><h3>Sua trajetória</h3><div class="mt">${htmlTrajetoria(p)}</div></div>` : ''}
      </div>
      <div>
        ${atende ? `<div class="cartao" style="border-color:var(--verde)"><h3>Como os mentorados vão te ver</h3>
          ${p.resumo_apresentacao ? `<p class="mt">${esc(p.resumo_apresentacao)}</p>` : '<p class="apagado mt">O resumo de apresentação é escrito pela plataforma a partir da sua trajetória. Esta parte será ligada na próxima etapa, junto com os resumos de sessão.</p>'}</div>` : ''}
        ${ehMentorado ? `<div class="cartao"><h3>Suas autorizações</h3><div class="lista mt">
          ${AUTORIZACOES_MENTORADO.filter((a) => !a.obrigatoria).map((a) => `<label class="check"><input type="checkbox" data-aut="${a.chave}"${aut[a.chave] ? ' checked' : ''}><span>${a.texto}</span></label>`).join('')}
          </div><p class="peq apagado mt">O termo de consentimento foi aceito em ${p.termo_aceito_em ? new Date(p.termo_aceito_em).toLocaleDateString('pt-BR') : '—'}. Para retirar o consentimento, escreva para contato@mentorei.com.br.</p></div>` : ''}
        <div class="cartao"><h3>Senha</h3><p class="apagado mt">Para trocar a senha, saia e use "Esqueci minha senha" na tela de entrada.</p></div>
      </div>
    </div>`;

  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const mud = { ...lerCampos(el), foto_url: foto };
      if (atende) mud.trajetoria = lerTrajetoria(el);
      if (ehMentorado) {
        const a = { ...aut }; el.querySelectorAll('[data-aut]').forEach((c) => { a[c.dataset.aut] = c.checked; }); mud.autorizacoes = a;
      }
      const { error } = await sb.from('perfis').update(mud).eq('id', p.id);
      if (error) throw error;
      if (ehMentorado && mentorado) {
        const { error: e2 } = await sb.from('mentorados').update(lerDadosMentorado(el)).eq('id', mentorado.id);
        if (e2) throw e2;
      }
      await ctx.recarregarPerfil();
    },
  });
  el.querySelectorAll('input, textarea').forEach((c) => c.addEventListener(c.type === 'checkbox' ? 'change' : 'input', salvador.mudou));
  ligarFoto(el, p, (url) => { foto = url; salvador.mudou(); });
  return { sair: () => { salvador.agora(); salvador.parar(); } };
}
