// Navegação da plataforma: confere o login, monta o menu de cada papel e abre a tela pedida no endereço (#/...).
import { sessaoAtual, meuPerfil, registrarAcesso, sair, esc, explicarErro } from './base.js';
import { montarMenu } from './menu.js';

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
// tipo de atendimento: individual (padrão) e/ou mentoria em grupo
const individual = atende && perfil.atende_individual !== false;
const grupo = atende && perfil.atende_grupo === true;

const mentorado = perfil.papel === 'mentorado';

// Menu: UMA lista (grupo → itens com nome, ícone, rota e quem pode ver), usada pelos dois formatos (topo e lateral) e pelo celular.
// As permissões são as mesmas do menu antigo; grupo sem nenhum item visível some. O mentorado continua com os 3 itens dele
// (Minha mentoria, Ferramentas, Meus dados), todos em Mentoria.
const GRUPOS = [
  { id: 'mentoria', nome: 'Mentoria', icone: 'compass', itens: [
    { nome: 'Mentorados', icone: 'users', rota: '#/mentorados', pode: ehAdmin },
    { nome: 'Meus mentorados', icone: 'user-check', rota: '#/meus', pode: individual },
    { nome: ehAdmin ? 'Turmas' : 'Minhas turmas', icone: 'layers', rota: '#/turmas', pode: ehAdmin || grupo },
    { nome: ehAdmin ? 'Agenda' : 'Minha agenda', icone: 'calendar', rota: '#/agenda', pode: ehAdmin || atende },
    { nome: 'Arsenal', icone: 'wrench', rota: '#/arsenal', pode: ehAdmin || atende },
    { nome: 'Minha mentoria', icone: 'compass', rota: '#/minha-area', pode: mentorado },
    { nome: 'Ferramentas', icone: 'wrench', rota: '#/biblioteca', pode: mentorado },
    { nome: 'Meus dados', icone: 'circle-user', rota: '#/perfil', pode: mentorado },
  ] },
  { id: 'gestao', nome: 'Gestão', icone: 'sliders-horizontal', itens: [
    { nome: 'Painel', icone: 'layout-dashboard', rota: '#/painel', pode: ehAdmin },
    { nome: 'Mentores', icone: 'graduation-cap', rota: '#/mentores', pode: ehAdmin },
    { nome: 'Checklist', icone: 'list-checks', rota: '#/checklist', pode: ehAdmin || atende },
    { nome: 'Importar planilha', icone: 'file-up', rota: '#/importar', pode: ehAdmin },
    { nome: 'Meu perfil', icone: 'circle-user', rota: '#/perfil', pode: !mentorado },
  ] },
  { id: 'negocio', nome: 'Negócio', icone: 'briefcase', itens: [
    { nome: 'Relatórios', icone: 'bar-chart-3', rota: '#/relatorios', pode: ehAdmin },
    { nome: 'Vendas', icone: 'trending-up', rota: '#/vendas', pode: ehAdmin },
    { nome: 'Equipe', icone: 'users-round', rota: '#/equipe', pode: ehAdmin },
  ] },
];
// papel de quem está usando, em letra pequena embaixo do nome (ex.: "Admin · Mentor(a)")
const papelTexto = [ehAdmin && 'Admin', atende && 'Mentor(a)', mentorado && 'Mentorado(a)'].filter(Boolean).join(' · ');
const menu = montarMenu(document.getElementById('navegacao'), { grupos: GRUPOS, usuario: { nome: perfil.nome, papel: papelTexto }, aoSair: sair });

const inicio = ehAdmin ? '#/painel' : individual ? '#/meus' : grupo ? '#/turmas' : atende ? '#/perfil' : '#/minha-area';

// telas: cada uma é um módulo com render(ctx, elemento, parametros)
const ROTAS = {
  'primeiro-acesso': () => import('./telas/primeiro-acesso.js'),
  painel: () => import('./telas/admin.js'),
  equipe: () => import('./telas/equipe.js'),
  importar: () => import('./telas/importar.js'),
  mentorados: () => import('./telas/mentorados.js'),
  meus: () => import('./telas/mentorados.js'),
  mentorado: () => import('./telas/ficha.js'),
  mentores: () => import('./telas/mentores.js'),
  perfil: () => import('./telas/perfil.js'),
  'minha-area': () => import('./telas/minha-area.js'),
  biblioteca: () => import('./telas/biblioteca.js'),
  arsenal: () => import('./telas/arsenal.js'),
  'carregar-arsenal': () => import('./telas/carregar-arsenal.js'),
  sessao: () => import('./telas/sessao.js'),
  relatorios: () => import('./telas/relatorios.js'),
  ferramenta: () => import('./telas/ferramenta-online.js'),
  pessoa: () => import('./telas/perfil.js'),
  turmas: () => import('./telas/turmas.js'),
  turma: () => import('./telas/turmas.js'),
  modulo: () => import('./telas/turmas.js'),
  'importar-proposta': () => import('./telas/importar-proposta.js'),
  agenda: () => import('./telas/agenda.js'),
  vendas: () => import('./telas/vendas.js'),
  checklist: () => import('./telas/checklist.js'),
  'relatorio-turmas': () => import('./telas/relatorio-turmas.js'),
};

// Marca no menu a página atual e devolve o caminho "Grupo › Página" (escondido no primeiro acesso, quando o menu fica escondido).
function montarTopo(atual, restrito) {
  const achado = menu.atualizar({ rota: `#/${atual}`, restrito, nome: ctx.perfil.nome });
  const caminho = document.createElement('nav');
  caminho.className = 'mn-caminho';
  caminho.setAttribute('aria-label', 'Você está em');
  if (achado) caminho.innerHTML = `<span>${esc(achado.grupo.nome)}</span><span aria-hidden="true">›</span><b>${esc(achado.item.nome)}</b>`;
  else caminho.hidden = true;
  return caminho;
}

const ctx = { perfil, ehAdmin, atende, recarregarPerfil: async () => { perfil = await meuPerfil(); ctx.perfil = perfil; return perfil; } };

let telaAtual = null;
async function abrir() {
  const precisaPrimeiroAcesso = !ctx.perfil.termo_aceito_em || !ctx.perfil.dados_completos;
  let [rota, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  if (precisaPrimeiroAcesso) rota = 'primeiro-acesso';
  if (!rota || !ROTAS[rota]) { location.replace(inicio); return; }
  if (telaAtual && telaAtual.sair) telaAtual.sair();
  const caminho = montarTopo(rota === 'mentorado' || rota === 'sessao' ? (ehAdmin ? 'mentorados' : 'meus') : rota === 'carregar-arsenal' ? 'arsenal'
    : rota === 'ferramenta' ? (perfil.papel === 'mentorado' ? 'minha-area' : 'arsenal') : rota === 'pessoa' ? (params[1] === 'mentores' ? 'mentores' : 'equipe') : rota === 'turma' || rota === 'modulo' || rota === 'importar-proposta' ? 'turmas' : rota === 'relatorio-turmas' ? 'relatorios' : rota,
  precisaPrimeiroAcesso);
  // cada tela nasce num elemento novo, para os cliques de uma tela não se acumularem na outra
  const alvo = document.createElement('div');
  alvo.innerHTML = '<p class="carregando">Carregando…</p>';
  tela.replaceChildren(caminho, alvo);
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
