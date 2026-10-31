// Navegação da plataforma: confere o login, monta o menu de cada papel e abre a tela pedida no endereço (#/...).
import { sb, sessaoAtual, meuPerfil, registrarAcesso, sair, esc, explicarErro } from './base.js';
import { montarMenu } from './menu.js';
import { temMarca } from './marca.js';
import { aplicarMarca } from './telas/area-aluno.js';
import { VERSAO as CONTRATO_VERSAO, LIBERADO as CONTRATO_LIBERADO } from './contrato-mentor.js';

const tela = document.getElementById('tela');

const sessao = await sessaoAtual();
if (!sessao) {
  // ferramenta aberta ao público (QR code de app.html#/ferramenta/<id>): quem não tem login vai direto para a versão aberta
  const f = location.hash.match(/^#\/ferramenta\/([\w-]+)/);
  const o = f && (await import('./ferramentas-online.js')).ONLINE[f[1]];
  location.replace(o && o.publica ? o.url : '/'); throw new Error('sem login');
}

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

// Contrato de prestação de serviço (script 55): só o mentor parceiro (papel 'mentor') assina. Pendente = ainda não assinou a versão
// atual. Sem o script 55, nada muda.
let contratoPendente = null;
if (perfil.papel === 'mentor' && CONTRATO_LIBERADO) {
  try {
    const { data, error } = await sb.from('contratos_mentor').select('aceito_em, visto_em').eq('perfil_id', perfil.id).eq('versao', CONTRATO_VERSAO).maybeSingle();
    if (!error && !(data && data.aceito_em)) contratoPendente = { visto_em: data ? data.visto_em : null };
  } catch (_) { /* sem o script 55 */ }
}
const contratoAdiado = () => { try { return sessionStorage.getItem('mentorei.contratoDepois') === CONTRATO_VERSAO; } catch (_) { return false; } };

const ehAdmin = perfil.papel === 'admin';
const atende = perfil.papel === 'mentor' || perfil.tambem_mentor;
// tipo de atendimento: individual (padrão) e/ou mentoria em grupo
const individual = atende && perfil.atende_individual !== false;
const grupo = atende && perfil.atende_grupo === true;

const mentorado = perfil.papel === 'mentorado';
// aluno de turma (script 44); um mentorado individual que também faz uma trilha ganha "Minha trilha" no menu
const aluno = perfil.papel === 'aluno';
let trilhas = [];
if (aluno || mentorado) {
  try { const { data } = await sb.rpc('minhas_trilhas'); trilhas = Array.isArray(data) ? data : []; } catch (_) { /* sem o script 44 */ }
}
const temTrilha = aluno || trilhas.length > 0;
// RH da empresa cliente (script 49): só o painel da empresa (números) e os dados dele; as cores do cliente vêm na própria tela
const rh = perfil.papel === 'rh';
if (rh) { document.documentElement.classList.add('area-aluno'); document.documentElement.dataset.menu = 'lateral'; }
// Aluno e mentorado (opção A, 28/10/2026): menu sempre na lateral, sem a escolha do formato, e com as cores do cliente
// (empresas.marca: a do programa do mentorado ou a da trilha; sem marca = cores da Mentorei) no menu e nas telas.
if (aluno || mentorado) {
  document.documentElement.classList.add('area-aluno');
  document.documentElement.dataset.menu = 'lateral';
  let marca = trilhas[0] && trilhas[0].marca;
  if (mentorado) {
    const { data } = await sb.from('mentorados').select('programa:programas(empresa:empresas(marca))').eq('perfil_id', perfil.id).maybeSingle();
    const m = data && data.programa && data.programa.empresa && data.programa.empresa.marca;
    if (temMarca(m)) marca = m;
  }
  aplicarMarca(marca);
}

// Menu: UMA lista (grupo → itens com nome, ícone, rota e quem pode ver), usada pelos dois formatos (topo e lateral) e pelo celular.
// As permissões são as mesmas do menu antigo; grupo sem nenhum item visível some. O mentorado continua com os 3 itens dele
// (Minha mentoria, Ferramentas, Meus dados), todos em Mentoria.
const GRUPOS = [
  { id: 'mentoria', nome: aluno || mentorado || rh ? 'Minha área' : 'Mentoria', icone: 'compass', itens: [
    { nome: 'Mentorados', icone: 'users', rota: '#/mentorados', pode: ehAdmin },
    { nome: 'Meus mentorados', icone: 'user-check', rota: '#/meus', pode: individual },
    { nome: ehAdmin ? 'Turmas' : 'Minhas turmas', icone: 'layers', rota: '#/turmas', pode: ehAdmin || grupo },
    { nome: ehAdmin ? 'Agenda' : 'Minha agenda', icone: 'calendar', rota: '#/agenda', pode: ehAdmin || atende },
    { nome: 'Arsenal', icone: 'wrench', rota: '#/arsenal', pode: ehAdmin || atende },
    { nome: 'Minha mentoria', icone: 'compass', rota: '#/minha-area', pode: mentorado },
    { nome: 'Minha trilha', icone: 'layers', rota: '#/trilha', pode: temTrilha },
    { nome: 'Ferramentas', icone: 'wrench', rota: '#/biblioteca', pode: mentorado },
    { nome: 'Painel da empresa', icone: 'layout-dashboard', rota: '#/rh', pode: rh },
    { nome: 'Meus dados', icone: 'circle-user', rota: '#/perfil', pode: mentorado || aluno || rh },
    { nome: 'Meu contrato', icone: 'file-signature', rota: '#/contrato', pode: perfil.papel === 'mentor' && CONTRATO_LIBERADO },
    { nome: 'Notas fiscais', icone: 'wallet', rota: '#/notas', pode: perfil.papel === 'mentor' },
  ] },
  { id: 'gestao', nome: 'Gestão', icone: 'sliders-horizontal', itens: [
    { nome: 'Painel', icone: 'layout-dashboard', rota: '#/painel', pode: ehAdmin },
    { nome: 'Mentores', icone: 'graduation-cap', rota: '#/mentores', pode: ehAdmin },
    { nome: 'Convites', icone: 'mail', rota: '#/convites', pode: ehAdmin },
    { nome: 'Contrato dos mentores', icone: 'file-signature', rota: '#/contrato', pode: ehAdmin },
    { nome: 'Checklist', icone: 'list-checks', rota: '#/checklist', pode: ehAdmin || atende },
    { nome: 'Avaliações', icone: 'star', rota: '#/avaliacoes', pode: ehAdmin },
    { nome: 'Emitir certificados', icone: 'award', rota: '#/certificados', pode: ehAdmin },
    { nome: 'Importar planilha', icone: 'file-up', rota: '#/importar', pode: ehAdmin },
    { nome: 'Meu perfil', icone: 'circle-user', rota: '#/perfil', pode: !mentorado && !aluno && !rh },
  ] },
  { id: 'negocio', nome: 'Negócio', icone: 'briefcase', itens: [
    { nome: 'Relatórios', icone: 'bar-chart-3', rota: '#/relatorios', pode: ehAdmin },
    { nome: 'Vendas', icone: 'trending-up', rota: '#/vendas', pode: ehAdmin },
    { nome: 'Financeiro', icone: 'wallet', rota: '#/financeiro', pode: ehAdmin },
    { nome: 'Equipe', icone: 'users-round', rota: '#/equipe', pode: ehAdmin },
  ] },
];
// papel de quem está usando, em letra pequena embaixo do nome (ex.: "Admin · Mentor(a)")
const papelTexto = [ehAdmin && 'Admin', atende && 'Mentor(a)', mentorado && 'Mentorado(a)', aluno && 'Aluno(a)', rh && 'RH da empresa'].filter(Boolean).join(' · ');
const menu = montarMenu(document.getElementById('navegacao'), { grupos: GRUPOS, usuario: { nome: perfil.nome, papel: papelTexto, foto: perfil.foto_url }, aoSair: sair });

const inicio = ehAdmin ? '#/painel' : individual ? '#/meus' : grupo ? '#/turmas' : atende ? '#/perfil' : aluno ? '#/trilha' : rh ? '#/rh' : '#/minha-area';

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
  financeiro: () => import('./telas/financeiro.js'),
  checklist: () => import('./telas/checklist.js'),
  'relatorio-turmas': () => import('./telas/relatorio-turmas.js'),
  avaliacoes: () => import('./telas/avaliacoes.js'),
  convites: () => import('./telas/convites.js'),
  certificados: () => import('./telas/certificados.js'),
  trilha: () => import('./telas/minha-trilha.js'),
  rh: () => import('./telas/painel-rh.js'),
  contrato: () => import('./telas/contrato.js'),
  notas: () => import('./telas/notas-mentor.js'),
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

const ctx = { perfil, ehAdmin, atende, contratoPendente, recarregarPerfil: async () => { perfil = await meuPerfil(); ctx.perfil = perfil; return perfil; } };

let telaAtual = null;
async function abrir() {
  const precisaPrimeiroAcesso = !ctx.perfil.termo_aceito_em || !ctx.perfil.dados_completos;
  let [rota, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  if (precisaPrimeiroAcesso) rota = 'primeiro-acesso';
  else if (ctx.contratoPendente && !contratoAdiado() && rota !== 'contrato') rota = 'contrato';
  if (!rota || !ROTAS[rota]) { location.replace(inicio); return; }
  if (telaAtual && telaAtual.sair) telaAtual.sair();
  const caminho = montarTopo(rota === 'mentorado' || rota === 'sessao' ? (ehAdmin ? 'mentorados' : 'meus') : rota === 'carregar-arsenal' ? 'arsenal'
    : rota === 'ferramenta' ? (params[1] ? (ehAdmin || atende ? 'turmas' : 'trilha') : perfil.papel === 'mentorado' ? 'minha-area' : 'arsenal') : rota === 'pessoa' ? (params[1] === 'mentores' ? 'mentores' : 'equipe') : rota === 'turma' || rota === 'modulo' || rota === 'importar-proposta' || (rota === 'trilha' && (ehAdmin || atende)) ? 'turmas' : rota === 'relatorio-turmas' ? 'relatorios' : rota === 'rh' && ehAdmin ? 'painel' : rota,
  precisaPrimeiroAcesso);
  // cada tela nasce num elemento novo, para os cliques de uma tela não se acumularem na outra
  const alvo = document.createElement('div');
  alvo.innerHTML = '<p class="carregando">Carregando…</p>';
  tela.replaceChildren(caminho, alvo);
  try {
    const mod = await ROTAS[rota]();
    telaAtual = (await mod.render({ ...ctx, rota }, alvo, params)) || null;
    // quem ainda está sem foto vê o convite para colocar, logo abaixo do título da tela
    // contrato deixado para depois: faixa no alto de toda tela até assinar
    if (ctx.contratoPendente && rota !== 'contrato' && !precisaPrimeiroAcesso) {
      const faixa = document.createElement('div');
      faixa.className = 'aviso';
      faixa.style.margin = '0 0 14px';
      faixa.innerHTML = 'Falta assinar o seu <b>contrato de prestação de serviço</b> com a Mentorei. <a href="#/contrato">Ler e assinar</a>';
      const cab = alvo.querySelector('.cab');
      if (cab) cab.after(faixa); else alvo.prepend(faixa);
    }
    if (!ctx.perfil.foto_url && !precisaPrimeiroAcesso) {
      const { lembreteFoto } = await import('./telas/foto-lembrete.js');
      const faixa = lembreteFoto(ctx, rota);
      const cab = faixa && alvo.querySelector('.cab');
      if (faixa) { if (cab) cab.after(faixa); else alvo.prepend(faixa); }
    }
  } catch (e) {
    console.error(e);
    alvo.innerHTML = `<div class="aviso erro">Não foi possível abrir esta tela: ${esc(explicarErro(e))}</div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', abrir);
// foto nova de quem está usando (Meu perfil, primeiro acesso ou a faixa de lembrete): vale na hora, no menu e nas telas
window.addEventListener('mentorei:foto', (ev) => { ctx.perfil.foto_url = ev.detail; menu.foto(ev.detail); });
ctx.irPara = (h) => { if (location.hash === h) abrir(); else location.hash = h; };
ctx.inicio = inicio;
// a tela recebe uma cópia do ctx: assinar o contrato precisa limpar o pendente do original
ctx.contratoAssinado = () => { ctx.contratoPendente = null; };
abrir();
