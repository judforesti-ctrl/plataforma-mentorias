// Meu perfil (mentor e administração) e Meus dados (mentorado), com salvamento automático.
// "#/pessoa/<id>": a administração edita o perfil de outra pessoa da equipe.
import { sb, esc, autoSalvar, lerCampos, avisar, explicarErro, dataBR } from '../base.js';
import { htmlFoto, ligarFoto, htmlContato, htmlTrajetoria, lerTrajetoria, htmlDadosMentorado, lerDadosMentorado } from './perfil-comum.js';
import { AUTORIZACOES_MENTORADO } from '../termos.js';

export async function render(ctx, el, [id] = []) {
  const outro = !!(id && ctx.ehAdmin && id !== ctx.perfil.id);
  let p = ctx.perfil;
  if (outro) {
    const { data, error } = await sb.from('perfis').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { el.innerHTML = '<div class="vazio">Pessoa não encontrada.</div>'; return; }
    p = data;
  }
  const ehMentorado = p.papel === 'mentorado';
  const atende = p.papel === 'mentor' || p.tambem_mentor;
  let mentorado = null;
  if (ehMentorado) { const { data } = await sb.from('mentorados').select('*').eq('perfil_id', p.id).maybeSingle(); mentorado = data; }
  let foto = p.foto_url;
  const aut = p.autorizacoes || {};

  el.innerHTML = `
    <div class="cab"><div>${outro ? '<p class="peq apagado"><a href="#/equipe">← Equipe</a></p>' : ''}<h1>${outro ? `Perfil de ${esc(p.nome)}` : ehMentorado ? 'Meus dados' : 'Meu perfil'}</h1><p class="sub">${esc(p.email)}${outro ? ' · você está editando como administração' : ''}</p></div>
      <div class="acoes"><span class="salvo" id="indicador"></span></div></div>
    <div class="grade g2" style="align-items:start">
      <div>
        <div class="cartao">${outro ? `<div class="campo" style="margin-bottom:14px"><label for="p-nome">Nome</label><input id="p-nome" type="text" data-campo="nome" value="${esc(p.nome)}"></div>` : ''}${htmlFoto(p)}<h4 class="mt2">Contato</h4><div class="mt">${htmlContato(p)}</div></div>
        ${ehMentorado && mentorado ? `<div class="cartao"><h3>Seu trabalho</h3><div class="mt">${htmlDadosMentorado(mentorado)}</div></div>` : ''}
        ${atende ? `<div class="cartao"><h3>${outro ? 'Trajetória' : 'Sua trajetória'}</h3><div class="mt">${htmlTrajetoria(p)}</div></div>` : ''}
      </div>
      <div>
        ${atende ? `<div class="cartao" style="border-color:var(--verde)"><div class="linha"><h3 style="flex:1">${outro ? 'Como os mentorados veem' : 'Como os mentorados vão te ver'}</h3><span id="apres-estado"></span></div>
          <p class="peq apagado mt">A plataforma escreve este texto a partir da sua trajetória. Você ajusta o que quiser e aprova. Só depois de aprovado ele aparece para os seus mentorados.</p>
          <textarea id="apres" class="mt" style="min-height:180px" placeholder="Preencha a sua trajetória ao lado e clique em Gerar com IA.">${esc(p.resumo_apresentacao || '')}</textarea>
          <div class="linha mt"><button type="button" class="btn peq escuro" id="gerar-apres">✨ Gerar com IA</button><button type="button" class="btn peq pri" id="aprovar-apres">Aprovar e publicar</button></div></div>` : ''}
        ${ehMentorado && !outro ? `<div class="cartao"><h3>Suas autorizações</h3><div class="lista mt">
          ${AUTORIZACOES_MENTORADO.filter((a) => !a.obrigatoria).map((a) => `<label class="check"><input type="checkbox" data-aut="${a.chave}"${aut[a.chave] ? ' checked' : ''}><span>${a.texto}</span></label>`).join('')}
          </div><p class="peq apagado mt">O termo de consentimento foi aceito em ${p.termo_aceito_em ? new Date(p.termo_aceito_em).toLocaleDateString('pt-BR') : '—'}. Para retirar o consentimento, escreva para contato@mentorei.com.br.</p></div>` : ''}
        ${outro ? `<div class="cartao"><h3>Acesso à plataforma</h3>
          <p class="apagado mt">${p.termo_aceito_em ? `Entrou pela primeira vez em ${dataBR(p.termo_aceito_em)}. Se esqueceu a senha, gere um link novo.` : 'Ainda não entrou na plataforma. Mande o convite pelo WhatsApp, que não cai no spam.'}</p>
          <div class="linha mt"><button type="button" class="btn pri peq" id="acesso-whats">${p.termo_aceito_em ? 'Novo link de acesso pelo WhatsApp' : 'Convite por WhatsApp'}</button>
            ${p.termo_aceito_em ? '' : '<button type="button" class="btn peq" id="acesso-email">Convite por e-mail</button>'}</div></div>`
          : '<div class="cartao"><h3>Senha</h3><p class="apagado mt">Para trocar a senha, saia e use "Esqueci minha senha" na tela de entrada.</p></div>'}
      </div>
    </div>`;

  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const mud = { ...lerCampos(el), foto_url: foto };
      if (atende) mud.trajetoria = lerTrajetoria(el);
      if (ehMentorado && !outro) {
        const a = { ...aut }; el.querySelectorAll('[data-aut]').forEach((c) => { a[c.dataset.aut] = c.checked; }); mud.autorizacoes = a;
      }
      const { error } = await sb.from('perfis').update(mud).eq('id', p.id);
      if (error) throw error;
      if (ehMentorado && mentorado) {
        const { error: e2 } = await sb.from('mentorados').update(lerDadosMentorado(el)).eq('id', mentorado.id);
        if (e2) throw e2;
      }
      if (!outro) await ctx.recarregarPerfil();
    },
  });
  el.querySelectorAll('input, textarea').forEach((c) => c.id !== 'apres' && c.addEventListener(c.type === 'checkbox' ? 'change' : 'input', salvador.mudou));
  ligarFoto(el, p, (url) => { foto = url; salvador.mudou(); });

  // acesso de outra pessoa da equipe (administração): convite ou link novo de senha
  el.querySelector('#acesso-whats')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    await salvador.agora();
    const { conviteWhatsApp } = await import('./equipe.js');
    await conviteWhatsApp({ email: p.email, nome: el.querySelector('#p-nome')?.value.trim() || p.nome, papel: p.papel, tambem_mentor: p.tambem_mentor,
      whatsapp: el.querySelector('[data-campo="whatsapp"]')?.value.trim() || '', remetente: ctx.perfil.nome });
    btn.disabled = false;
  });
  el.querySelector('#acesso-email')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const { convidar } = await import('./equipe.js');
    await convidar({ email: p.email, nome: p.nome, papel: p.papel, tambem_mentor: p.tambem_mentor });
    btn.disabled = false;
  });

  // resumo de apresentação: gerar com IA, ajustar e aprovar
  const apres = el.querySelector('#apres');
  let publicado = p;
  if (apres) {
    const estado = () => {
      const atual = publicado;
      const box = el.querySelector('#apres-estado');
      if (!apres.value.trim()) box.innerHTML = '<span class="selo neutro">Ainda não publicado</span>';
      else if (atual.resumo_aprovado_em && apres.value.trim() === (atual.resumo_apresentacao || '').trim()) box.innerHTML = `<span class="selo">Publicado em ${dataBR(atual.resumo_aprovado_em)}</span>`;
      else box.innerHTML = '<span class="selo alerta">Não publicado</span>';
    };
    estado(); apres.addEventListener('input', estado);
    el.querySelector('#gerar-apres').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (apres.value.trim() && !window.confirm('Gerar um texto novo no lugar deste?')) return;
      btn.disabled = true; btn.textContent = 'Escrevendo…';
      try {
        salvador.mudou(); await salvador.agora(); // a IA lê a trajetória já salva
        const { data: { session } } = await sb.auth.getSession();
        const r = await fetch('/api/apresentacao', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify(outro ? { perfil_id: p.id } : {}) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.mensagem || 'Não foi possível gerar o texto.');
        apres.value = j.texto; estado();
        avisar('Texto escrito. Leia, ajuste se quiser e clique em "Aprovar e publicar".');
      } catch (e) { avisar(explicarErro(e), true); }
      finally { btn.disabled = false; btn.textContent = '✨ Gerar com IA'; }
    });
    el.querySelector('#aprovar-apres').addEventListener('click', async (ev) => {
      const texto = apres.value.trim();
      if (!texto) { avisar('Gere ou escreva o texto primeiro.', true); return; }
      const btn = ev.currentTarget; btn.disabled = true;
      const { error } = await sb.from('perfis').update({ resumo_apresentacao: texto, resumo_aprovado_em: new Date().toISOString() }).eq('id', p.id);
      btn.disabled = false;
      if (error) { avisar(explicarErro(error), true); return; }
      const novo = { ...publicado, resumo_apresentacao: texto, resumo_aprovado_em: new Date().toISOString() };
      publicado = outro ? novo : ((await ctx.recarregarPerfil()) || novo); estado();
      avisar(outro ? 'Publicado. Os mentorados desta pessoa já veem este texto.' : 'Publicado. Seus mentorados já veem este texto.');
    });
  }
  return { sair: () => { salvador.agora(); salvador.parar(); } };
}
