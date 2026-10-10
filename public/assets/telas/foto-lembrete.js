// Incentivo às fotos de perfil (pedido da Juliana: todo mentor e todo mentorado com foto).
// 1) lembreteFoto: faixa "Coloque a sua foto" logo abaixo do título de qualquer tela, para quem ainda está sem foto.
//    Um clique escolhe a foto ali mesmo; "Agora não" esconde por 3 dias neste navegador.
// 2) cartaoFotos: no Painel, quem da equipe e dos mentorados ainda está sem foto, com lembrete pronto pelo WhatsApp.
import { sb, esc, avatar, avisar, explicarErro } from '../base.js';
import { enviarFotoPerfil, paraQuemAparece } from './perfil-comum.js';

const CHAVE = 'mentorei.fotoLembreteAte';
const adiado = () => { try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch (_) { return false; } };
const adiar = (dias) => { try { localStorage.setItem(CHAVE, String(Date.now() + dias * 86400000)); } catch (_) { /* sem armazenamento */ } };
const primeiro = (n) => String(n || '').split(' ')[0];
const SEM_LEMBRETE = ['primeiro-acesso', 'perfil', 'pessoa'];   // nessas telas o campo da foto já está à vista

export function lembreteFoto(ctx, rota) {
  if (ctx.perfil.foto_url || SEM_LEMBRETE.includes(rota) || adiado()) return null;
  const caixa = document.createElement('div');
  caixa.className = 'foto-lembrete';
  caixa.setAttribute('role', 'region');
  caixa.setAttribute('aria-label', 'Coloque a sua foto');
  caixa.innerHTML = `<span class="foto-lembrete-rosto">${avatar(ctx.perfil)}<i aria-hidden="true">📷</i></span>
    <div class="foto-lembrete-txt"><b>${esc(primeiro(ctx.perfil.nome))}, coloque a sua foto!</b>
      <span>Ela aparece para ${paraQuemAparece(ctx.perfil)}. Com rosto, a conversa fica mais próxima. Leva um minuto.</span></div>
    <div class="foto-lembrete-acoes"><label class="btn pri peq" style="cursor:pointer">Escolher a minha foto<input type="file" accept="image/*" hidden></label>
      <button type="button" class="btn peq" data-depois>Agora não</button></div>`;
  caixa.querySelector('[data-depois]').addEventListener('click', () => { adiar(3); caixa.remove(); });
  caixa.querySelector('input[type=file]').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    try {
      avisar('Enviando a foto…');
      const url = await enviarFotoPerfil(ctx.perfil.id, arq);
      window.dispatchEvent(new CustomEvent('mentorei:foto', { detail: url }));
      caixa.classList.add('ok');
      caixa.innerHTML = `${avatar({ ...ctx.perfil, foto_url: url })}<div class="foto-lembrete-txt"><b>Foto salva. Ficou ótima! 😊</b>
        <span>Para trocar, é só ir em ${ctx.perfil.papel === 'mentorado' ? 'Meus dados' : 'Meu perfil'}.</span></div>`;
      setTimeout(() => caixa.remove(), 6000);
    } catch (e) { avisar(`Não foi possível enviar a foto: ${explicarErro(e)}`, true); }
  });
  return caixa;
}

// ---------- Painel: quem ainda está sem foto ----------
const pendente = (email) => /@pendente\.mentorei\.com\.br$/i.test(String(email || ''));

export async function cartaoFotos(ctx, el) {
  const { data, error } = await sb.from('perfis').select('id, nome, email, papel, tambem_mentor, foto_url, whatsapp, termo_aceito_em, ativo').eq('ativo', true);
  if (error) { el.innerHTML = ''; return; }
  const gente = (data || []).filter((p) => !pendente(p.email));
  const equipe = gente.filter((p) => p.papel !== 'mentorado');
  const mentorados = gente.filter((p) => p.papel === 'mentorado');
  const com = (l) => l.filter((p) => p.foto_url).length;
  // quem já entra na plataforma e ainda está sem foto (quem nunca entrou vai ser convidado a colocar no primeiro acesso)
  const faltam = gente.filter((p) => !p.foto_url && p.termo_aceito_em).sort((a, b) => (a.papel === 'mentorado') - (b.papel === 'mentorado') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const nuncaEntraram = gente.filter((p) => !p.foto_url && !p.termo_aceito_em).length;
  const barra = (n, t) => `<span class="foto-barra" aria-hidden="true"><i style="width:${t ? Math.round((n / t) * 100) : 0}%"></i></span>`;
  el.innerHTML = `<div class="cartao">
    <div class="linha"><h3 style="flex:1">Fotos de perfil</h3><span class="peq apagado">Pessoas com foto criam conexão mais rápido.</span></div>
    <div class="grade g2 mt" style="gap:10px">
      <div><b>${com(equipe)} de ${equipe.length}</b> <span class="peq apagado">da equipe com foto</span>${barra(com(equipe), equipe.length)}</div>
      <div><b>${com(mentorados)} de ${mentorados.length}</b> <span class="peq apagado">mentorados com foto</span>${barra(com(mentorados), mentorados.length)}</div>
    </div>
    ${faltam.length ? `<p class="peq mt"><b>Já entram na plataforma e ainda estão sem foto:</b></p>
      <div class="lista mt">${faltam.map((p) => `<div class="item" style="grid-template-columns:auto 1fr auto;padding:10px 12px">${avatar(p)}
        <div style="min-width:0"><div class="nome">${esc(p.nome)}</div><div class="info">${p.papel === 'mentorado' ? 'Mentorado(a)' : 'Equipe'}</div></div>
        <div class="linha" style="gap:6px"><button type="button" class="btn peq pri" data-lembrar="${p.id}">Lembrar pelo WhatsApp</button>
          <a class="btn peq" href="#/pessoa/${p.id}" title="Você coloca a foto por esta pessoa">Colocar a foto</a></div></div>`).join('')}</div>`
      : `<div class="aviso ok mt">Todo mundo que já entra na plataforma tem foto. 🎉</div>`}
    ${nuncaEntraram ? `<p class="peq apagado mt">${nuncaEntraram} ${nuncaEntraram === 1 ? 'pessoa ainda não entrou' : 'pessoas ainda não entraram'} na plataforma: a foto é pedida no primeiro acesso.</p>` : ''}
  </div>`;
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-lembrar]'); if (!b) return;
    const p = faltam.find((x) => x.id === b.dataset.lembrar); if (!p) return;
    const onde = p.papel === 'mentorado' ? 'Meus dados' : 'Meu perfil';
    const quem = p.papel === 'mentorado' ? 'os seus mentores' : 'os seus mentorados';
    const { janelaWhatsApp } = await import('./equipe.js');
    janelaWhatsApp({ titulo: `Lembrar ${primeiro(p.nome)} de colocar a foto`, whatsapp: p.whatsapp || '',
      texto: `Oi, ${primeiro(p.nome)}! Aqui é ${primeiro(ctx.perfil.nome)}, da Mentorei. 😊\n\nQue tal colocar a sua foto na plataforma? Leva um minuto:\n1. Entre em https://plataforma.mentorei.com.br\n2. Clique em "${onde}"\n3. Clique em "Colocar a minha foto" e escolha uma foto de rosto\n\nCom foto, ${quem} reconhecem você na hora e a conversa fica mais próxima. Conto com você!` });
  });
}
