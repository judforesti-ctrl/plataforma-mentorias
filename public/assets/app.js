// Navegação da plataforma: confere o login, monta o menu de cada papel e abre a tela pedida no endereço (#/...).
import { sessaoAtual, meuPerfil, registrarAcesso, sair, esc, avatar, explicarErro } from './base.js';

const tela = document.getElementById('tela');

const sessao = await sessaoAtual();
if (!sessao) { location.replace('/'); throw new Error('sem login'); }

let perfil;
try { perfil = await meuPerfil(); } catch (e) { tela.innerHTML = `<div class="aviso erro">${esc(explicarErro(e))}</div>`; throw e; }

if (!perfil) {
  tela.innerHTML = `<div class="cartao" style="max-width:560px;margin:40px auto">
    <h2>Seu acesso ainda não foi liberado</h2>
    <p class="mt apagado">O e-mail ${esc(sessao.user.email)} não tem convite ativo na plataforma. Fale com a administração da Mentorei.</p>
    <button class="btn mt" id="sair2">Sair</button></div>`;
  document.getElementById('sair2').onclick = sair;
  throw new Error('sem perfil');
}
if (!perfil.ativo) {
  tela.innerHTML = `<div class="cartao" style="max-width:560px;margin:40px auto"><h2>Acesso desativado</h2>
    <p class="mt apagado">Fale com a administração da Mentorei.</p><button class="btn mt" id="sair2">Sair</button></div>`;
  document.getElementById('sair2').onclick = sair;
  throw new Error('inativo');
}

registrarAcesso(perfil.id);

const ehAdmin = perfil.papel === 'admin';
const atende = perfil.papel === 'mentor' || perfil.tambem_mentor;

const MENU = [
  ehAdmin && ['#/painel', 'Painel'],
  ehAdmin && ['#/mentorados', 'Mentorados'],
  atende && ['#/meus', 'Meus mentorados'],
  (ehAdmin || atende) && ['#/arsenal', 'Arsenal'],
  ehAdmin && ['#/relatorios', 'Relatórios'],
  ehAdmin && ['#/equipe', 'Equipe'],
  ehAdmin && ['#/importar', 'Importar planilha'],
  perfil.papel === 'mentorado' && ['#/minha-area', 'Minha mentoria'],
  ['#/perfil', perfil.papel === 'mentorado' ? 'Meus dados' : 'Meu perfil'],
].filter(Boolean);

const inicio = ehAdmin ? '#/painel' : atende ? '#/meus' : '#/minha-area';

// telas: cada uma é um módulo com render(ctx, elemento, parametros)
const ROTAS = {
  'primeiro-acesso': () => import('./telas/primeiro-acesso.js'),
  painel: () => import('./telas/admin.js'),
  equipe: () => import('./telas/equipe.js'),
  importar: () => import('./telas/importar.js'),
  mentorados: () => import('./telas/mentorados.js'),
  meus: () => import('./telas/mentorados.js'),
  mentorado: () => import('./telas/ficha.js'),
  perfil: () => import('./telas/perfil.js'),
  'minha-area': () => import('./telas/minha-area.js'),
  arsenal: () => import('./telas/arsenal.js'),
  'carregar-arsenal': () => import('./telas/carregar-arsenal.js'),
  sessao: () => import('./telas/sessao.js'),
  relatorios: () => import('./telas/relatorios.js'),
  ferramenta: () => import('./telas/ferramenta-online.js'),
};

function montarTopo(atual) {
  document.getElementById('topo').hidden = false;
  document.getElementById('menu').innerHTML = MENU.map(([h, t]) => `<a href="${h}" class="${atual === h.slice(2) ? 'atual' : ''}">${esc(t)}</a>`).join('');
  document.getElementById('quem-nome').textContent = perfil.nome;
  document.getElementById('quem-avatar').innerHTML = avatar(perfil);
}
document.getElementById('sair').onclick = sair;

const ctx = { perfil, ehAdmin, atende, recarregarPerfil: async () => { perfil = await meuPerfil(); ctx.perfil = perfil; return perfil; } };

let telaAtual = null;
async function abrir() {
  const precisaPrimeiroAcesso = !ctx.perfil.termo_aceito_em || !ctx.perfil.dados_completos;
  let [rota, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  if (precisaPrimeiroAcesso) rota = 'primeiro-acesso';
  if (!rota || !ROTAS[rota]) { location.replace(inicio); return; }
  if (telaAtual && telaAtual.sair) telaAtual.sair();
  montarTopo(rota === 'mentorado' || rota === 'sessao' ? (ehAdmin ? 'mentorados' : 'meus') : rota === 'carregar-arsenal' ? 'arsenal'
    : rota === 'ferramenta' ? (perfil.papel === 'mentorado' ? 'minha-area' : 'arsenal') : rota);
  document.getElementById('topo').querySelector('.menu').hidden = precisaPrimeiroAcesso;
  // cada tela nasce num elemento novo, para os cliques de uma tela não se acumularem na outra
  const alvo = document.createElement('div');
  alvo.innerHTML = '<p class="carregando">Carregando…</p>';
  tela.replaceChildren(alvo);
  try {
    const mod = await ROTAS[rota]();
    telaAtual = (await mod.render({ ...ctx, rota }, alvo, params)) || null;
  } catch (e) {
    console.error(e);
    alvo.innerHTML = `<div class="aviso erro">Não foi possível abrir esta tela: ${esc(explicarErro(e))}</div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', abrir);
ctx.irPara = (h) => { if (location.hash === h) abrir(); else location.hash = h; };
ctx.inicio = inicio;
abrir();
