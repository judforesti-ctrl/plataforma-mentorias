// Primeiro acesso: aceite do termo, autorizações e dados pessoais. Só depois disso o resto da plataforma abre.
import { sb, esc, avisar, explicarErro, lerCampos } from '../base.js';
import { TERMO_VERSAO } from '../config.js';
import { TERMO_MENTORADO, TERMO_MENTOR, AUTORIZACOES_MENTORADO, AUTORIZACOES_MENTOR } from '../termos.js';
import { htmlFoto, ligarFoto, htmlContato, htmlTrajetoria, lerTrajetoria, trajetoriaCompleta, htmlDadosMentorado, lerDadosMentorado } from './perfil-comum.js';

export async function render(ctx, el) {
  const p = ctx.perfil;
  const ehMentorado = p.papel === 'mentorado';
  const atende = p.papel === 'mentor' || p.tambem_mentor;
  let mentorado = null;
  if (ehMentorado) {
    const { data } = await sb.from('mentorados').select('*').eq('perfil_id', p.id).maybeSingle();
    mentorado = data || {};
  }
  const autorizacoes = ehMentorado ? AUTORIZACOES_MENTORADO : AUTORIZACOES_MENTOR;
  let fotoUrl = p.foto_url;
  const jaAceitou = !!p.termo_aceito_em;

  el.innerHTML = `
  <div style="max-width:820px;margin:0 auto">
    <div class="cab"><div><h1>Olá, ${esc(p.nome.split(' ')[0])}!</h1>
      <p class="sub">Antes de começar, são dois passos rápidos: ${jaAceitou ? 'falta só completar os seus dados.' : 'ler e aceitar o termo e completar os seus dados.'}</p></div></div>

    <section class="cartao" ${jaAceitou ? 'hidden' : ''}>
      <span class="selo escuro">Passo 1 de 2</span>
      <h2 class="mt">${ehMentorado ? 'Termo de consentimento' : 'Termo de confidencialidade'}</h2>
      <div class="texto-termo mt">${ehMentorado ? TERMO_MENTORADO : TERMO_MENTOR}</div>
      <div class="lista mt">${autorizacoes.map((a) => `<label class="check"><input type="checkbox" data-aut="${a.chave}"${a.obrigatoria ? ' required' : ' checked'}>
        <span>${a.texto} ${a.obrigatoria ? '<span class="selo neutro">obrigatório</span>' : '<span class="selo">opcional</span>'}</span></label>`).join('')}</div>
      ${ehMentorado ? '<p class="peq apagado mt">As autorizações opcionais podem ser mudadas quando você quiser, em "Meus dados".</p>' : ''}
    </section>

    <section class="cartao" id="dados">
      <span class="selo escuro">${jaAceitou ? 'Seus dados' : 'Passo 2 de 2'}</span>
      <h2 class="mt">Seus dados</h2>
      <div class="mt">${htmlFoto(p)}</div>
      <h4 class="mt2">Contato</h4>
      <div class="mt">${htmlContato(mentorado ? { ...p, whatsapp: p.whatsapp || mentorado.whatsapp, rede_social: p.rede_social || mentorado.rede_social } : p)}</div>
      ${ehMentorado ? `<h4 class="mt2">Seu trabalho</h4><div class="mt">${htmlDadosMentorado(mentorado)}</div>` : ''}
      ${atende ? `<h4 class="mt2">Sua trajetória</h4>
        <p class="peq apagado">A plataforma junta estas respostas num resumo de apresentação que os seus mentorados vão ver. Você revisa o texto antes de publicar.</p>
        <div class="mt">${htmlTrajetoria(p)}</div>` : ''}
    </section>

    <div class="linha mt"><button class="btn pri" id="concluir">Concluir e entrar</button><span class="peq apagado" id="msg" role="status"></span></div>
  </div>`;

  ligarFoto(el, p, (url) => { fotoUrl = url; });

  el.querySelector('#concluir').addEventListener('click', async () => {
    const msg = el.querySelector('#msg');
    const aut = {};
    el.querySelectorAll('[data-aut]').forEach((c) => { aut[c.dataset.aut] = c.checked; });
    if (!jaAceitou && autorizacoes.some((a) => a.obrigatoria && !aut[a.chave])) { msg.textContent = 'Para continuar, marque as caixas obrigatórias do termo.'; return; }
    const dados = lerCampos(el.querySelector('#dados'));
    if (!dados.whatsapp) { msg.textContent = 'Preencha o seu WhatsApp.'; return; }
    const trajetoria = atende ? lerTrajetoria(el) : p.trajetoria;
    if (atende && !trajetoriaCompleta(trajetoria)) { msg.textContent = 'Preencha pelo menos cargo, anos liderando, empresas, especialidades e como é a sua mentoria.'; return; }
    msg.textContent = 'Salvando…';
    try {
      const mudar = { ...dados, foto_url: fotoUrl, trajetoria, dados_completos: true };
      if (!jaAceitou) Object.assign(mudar, { termo_versao: TERMO_VERSAO, termo_aceito_em: new Date().toISOString(), autorizacoes: aut });
      const { error } = await sb.from('perfis').update(mudar).eq('id', p.id);
      if (error) throw error;
      if (ehMentorado && mentorado.id) {
        const { error: e2 } = await sb.from('mentorados').update({ ...lerDadosMentorado(el), email: p.email }).eq('id', mentorado.id);
        if (e2) throw e2;
      }
      await ctx.recarregarPerfil();
      avisar('Tudo certo. Bem-vindo à plataforma!');
      ctx.irPara(ctx.inicio);
    } catch (e) { msg.textContent = explicarErro(e); avisar(explicarErro(e), true); }
  });
}
