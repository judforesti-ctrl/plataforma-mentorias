// Área do aluno da turma (script 44, pedido da Juliana em 27/10/2026): "#/trilha" ou "#/trilha/<turma>".
// O aluno vê o nome da trilha e da empresa, a próxima aula com o botão de entrar, e todos os módulos: data, mentores, link da sala,
// slides em PDF, tarefas e ferramentas para baixar, a gravação da aula e o atalho para avaliar o encontro.
// Os dados do aluno vêm só da função minhas_trilhas() (nada de percepções, recomendações ou slides internos).
// A administração e o mentor da turma abrem a mesma tela em PRÉVIA ("Ver como o aluno vê", na página da turma).
import { sb, esc, avatar, dataBR, horaBR, avisar, explicarErro } from '../base.js';
import { janelaAvaliacao, linkAvaliacao } from '../avaliacao-regras.js';
import { tema, temMarca } from '../marca.js';

const TZ = 'America/Sao_Paulo';
const diaSemana = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' });
const diaISO = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
const fimDa = (m) => Date.parse(m.data_hora) + (Number(m.duracao_min) || 180) * 60000;
const ONLINE = { meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams', outro: 'Online' };
const urlBoa = (x) => (x && /^https?:\/\//i.test(x) ? x : x ? `https://${x}` : '');

// Mesma forma que minhas_trilhas() devolve, montada pelas tabelas (para a prévia da equipe).
async function trilhaDaEquipe(turmaId) {
  const sel = (emp) => sb.from('turmas').select(`id, nome, inicio, fim_previsto, status, empresa:empresas(${emp}),
    modulos(id, numero, titulo, data_hora, duracao_min, formato, link, local, mentores:modulo_mentores(mentor:perfis(nome, foto_url)),
      arquivos:modulo_arquivos(id, tipo, nome, caminho, tamanho, enviado_em))`).eq('id', turmaId).maybeSingle();
  let { data: t, error } = await sel('nome, marca');
  if (error && /marca/.test(error.message || '')) ({ data: t, error } = await sel('nome'));   // antes do script 44
  if (error) throw error;
  if (!t) return null;
  const ids = (t.modulos || []).map((m) => m.id);
  const { data: gs } = ids.length ? await sb.from('gravacoes').select('*').in('modulo_id', ids).eq('ignorada', false) : { data: [] };
  return {
    id: t.id, nome: t.nome, empresa: t.empresa && t.empresa.nome, marca: (t.empresa && t.empresa.marca) || {}, inicio: t.inicio, fim: t.fim_previsto, status: t.status,
    modulos: (t.modulos || []).map((m) => ({
      ...m, link: m.formato === 'presencial' ? null : m.link, local: m.formato === 'presencial' ? m.local : null,
      mentores: (m.mentores || []).map((x) => x.mentor).filter(Boolean),
      arquivos: (m.arquivos || []).filter((a) => a.tipo === 'aluno' || a.tipo === 'tarefa'),
      gravacoes: (gs || []).filter((g) => g.modulo_id === m.id).sort((a, b) => String(a.gravada_em || '').localeCompare(String(b.gravada_em || ''))),
    })),
  };
}

export async function render(ctx, el, [turmaId]) {
  const previa = !!turmaId && (ctx.ehAdmin || ctx.atende);
  let trilhas = [];
  if (previa) {
    const t = await trilhaDaEquipe(turmaId);
    if (!t) { el.innerHTML = '<div class="vazio">Turma não encontrada, ou você não tem acesso a ela.</div>'; return; }
    trilhas = [t];
  } else {
    const { data, error } = await sb.rpc('minhas_trilhas');
    if (error) {
      el.innerHTML = `<div class="vazio">${/minhas_trilhas|PGRST202|schema cache/.test(`${error.code} ${error.message}`) ? 'A área das trilhas ainda está sendo preparada pela Mentorei. Volte daqui a pouco.' : esc(explicarErro(error))}</div>`;
      return;
    }
    trilhas = data || [];
  }
  if (!trilhas.length) {
    el.innerHTML = `<div class="cartao" style="max-width:620px;margin:30px auto"><h2>Olá, ${esc(ctx.perfil.nome.split(' ')[0])}!</h2>
      <p class="mt apagado">Você ainda não está em nenhuma trilha. Se acabou de receber o convite, fale com a Mentorei: <a href="mailto:contato@mentorei.com.br">contato@mentorei.com.br</a>.</p></div>`;
    return;
  }
  const t = trilhas.find((x) => x.id === turmaId) || trilhas[0];
  const mods = (t.modulos || []).slice().sort((a, b) => a.numero - b.numero);
  const agora = Date.now();
  const comData = mods.filter((m) => m.data_hora);
  const proxima = comData.filter((m) => fimDa(m) > agora).sort((a, b) => Date.parse(a.data_hora) - Date.parse(b.data_hora))[0];
  const feitas = comData.filter((m) => fimDa(m) <= agora).length;
  const nomesMentores = (m) => (m.mentores || []).map((x) => x.nome).join(' e ');
  const rostos = (m) => (m.mentores || []).map((x) => `<span class="selo neutro com-rosto">${avatar(x)}${esc(x.nome)}</span>`).join('');

  const situacaoDe = (m) => {
    if (!m.data_hora) return ['Data a definir', 'neutro'];
    if (fimDa(m) <= agora) return ['Realizada', ''];
    if (diaISO(Date.parse(m.data_hora)) === diaISO(agora)) return ['Hoje', 'alerta'];
    if (proxima && m.id === proxima.id) return ['Próxima aula', 'alerta'];
    return ['A acontecer', 'neutro'];
  };
  const ondeE = (m) => (m.formato === 'presencial' ? `Presencial${m.local ? ` · ${esc(m.local)}` : ''}` : ONLINE[m.formato] || 'Online');
  const botaoEntrar = (m, grande = false) => (m.link && m.formato !== 'presencial'
    ? `<a class="btn ${grande ? 'pri' : 'escuro peq'}" href="${esc(urlBoa(m.link))}" target="_blank" rel="noopener">Entrar na aula${grande ? ` (${ONLINE[m.formato] || 'online'})` : ''}</a>` : '');

  const arquivosHtml = (m) => {
    const slides = (m.arquivos || []).filter((a) => a.tipo === 'aluno');
    const tarefas = (m.arquivos || []).filter((a) => a.tipo === 'tarefa');
    const botoes = (xs, icone) => xs.map((a) => `<button class="btn peq" type="button" data-baixar="${a.id}" title="Baixar ${esc(a.nome)}">${icone} ${esc(a.nome.replace(/\.[^.]+$/, ''))}</button>`).join('');
    return `${slides.length ? `<div class="tr-grupo"><span class="peq"><b>Slides da aula</b></span><div class="linha" style="gap:6px">${botoes(slides, '📄')}</div></div>` : ''}
      ${tarefas.length ? `<div class="tr-grupo"><span class="peq"><b>Tarefas e ferramentas</b></span><div class="linha" style="gap:6px">${botoes(tarefas, '📝')}</div></div>` : ''}`;
  };
  const gravacaoHtml = (m) => {
    const gs = m.gravacoes || [];
    if (gs.length) {
      // a senha do Zoom já vai dentro do link; por garantia ela aparece ao lado, com "Copiar"
      return `<div class="tr-grupo"><span class="peq"><b>Gravação</b></span><div class="linha" style="gap:6px">${gs.map((g, i) => `<a class="btn peq pri" href="${esc(g.link)}" target="_blank" rel="noopener">▶ ${gs.length > 1 ? `Assistir · parte ${i + 1}` : 'Assistir à gravação'}${g.duracao_min ? ` <span class="peq">(${g.duracao_min} min)</span>` : ''}</a>
        ${g.senha ? `<span class="tr-senha peq">Senha: <b>${esc(g.senha)}</b> <button class="btn peq" type="button" data-copiar="${esc(g.senha)}" aria-label="Copiar a senha da gravação">Copiar</button></span>` : ''}`).join('')}</div>
        ${gs.some((g) => g.senha) ? '<p class="peq apagado">Se o Zoom pedir a senha, cole a que está aqui ao lado.</p>' : ''}</div>`;
    }
    if (m.data_hora && fimDa(m) <= agora && m.formato !== 'presencial') return '<p class="peq apagado">A gravação desta aula ainda não está disponível. Ela aparece aqui assim que ficar pronta.</p>';
    return '';
  };
  const avaliarHtml = (m) => {
    if (!m.data_hora || Date.parse(m.data_hora) > agora) return '';
    return janelaAvaliacao(m, agora).estado === 'aberta' ? `<a class="btn peq" href="${esc(linkAvaliacao(m.id))}" target="_blank" rel="noopener">⭐ Avaliar esta aula</a>` : '';
  };

  // logo e cores do cliente (empresas.marca): as variáveis de cor valem só dentro desta tela
  const marca = t.marca || {};
  const logoUrl = marca.logo && marca.logo.caminho ? sb.storage.from('fotos').getPublicUrl(marca.logo.caminho).data.publicUrl : '';
  el.classList.toggle('tr-marca', temMarca(marca));
  if (temMarca(marca)) el.setAttribute('style', tema(marca).estilo); else el.removeAttribute('style');

  el.innerHTML = `
    ${previa ? `<div class="aviso mt" style="margin-bottom:12px"><b>Prévia:</b> é assim que os alunos desta turma veem a área deles. <a href="#/turma/${t.id}">← Voltar para a turma</a></div>` : ''}
    <div class="cartao" style="background:var(--petroleo);color:#fff;border:0">
      <div class="linha" style="gap:16px">
        ${previa ? '' : avatar(ctx.perfil, true)}
        <div style="flex:1;min-width:220px">
          <p class="peq" style="color:var(--bege);font-weight:700;letter-spacing:.06em;text-transform:uppercase">${esc(t.empresa || '')} · Sua trilha</p>
          <h1 style="color:#fff">${esc(t.nome)}</h1>
          <p style="opacity:.82">${previa ? '' : `Olá, ${esc(ctx.perfil.nome.split(' ')[0])}! `}${mods.length} módulo${mods.length === 1 ? '' : 's'}${comData.length ? ` · ${feitas} realizado${feitas === 1 ? '' : 's'}` : ''}${t.inicio ? ` · de ${dataBR(t.inicio)}${t.fim ? ` a ${dataBR(t.fim)}` : ''}` : ''}</p>
        </div>
        ${logoUrl ? `<span class="tr-logo"><img src="${esc(logoUrl)}" alt="Logo de ${esc(t.empresa || 'da empresa')}"></span>` : ''}
      </div>
      ${trilhas.length > 1 ? `<div class="linha mt" style="gap:6px">${trilhas.map((x) => `<a class="btn peq${x.id === t.id ? ' pri' : ''}" href="#/trilha/${x.id}">${esc(x.nome)}</a>`).join('')}</div>` : ''}
    </div>

    ${proxima ? `<div class="cartao destaque mt">
      <p class="peq" style="text-transform:uppercase;letter-spacing:.06em;font-weight:700">${situacaoDe(proxima)[0] === 'Hoje' ? 'Sua aula é hoje' : 'Próxima aula'}</p>
      <h2 class="mt">Módulo ${proxima.numero} · ${esc(proxima.titulo)}</h2>
      <p class="mt" style="font-size:17px"><b style="color:var(--bege)">${esc(diaSemana(proxima.data_hora))} · ${horaBR(proxima.data_hora)}</b>${proxima.duracao_min ? ` · ${proxima.duracao_min} min` : ''} · ${ondeE(proxima)}</p>
      ${nomesMentores(proxima) ? `<p class="peq mt">Com ${esc(nomesMentores(proxima))}</p>` : ''}
      <div class="linha mt">${botaoEntrar(proxima, true)}${proxima.formato !== 'presencial' && !proxima.link ? '<span class="peq">O link da sala aparece aqui antes da aula.</span>' : ''}</div>
    </div>` : comData.length && feitas === comData.length ? '<div class="aviso ok mt">Você completou todos os módulos desta trilha. As gravações e os materiais continuam aqui para consultar.</div>' : ''}

    <h2 class="mt2">Os módulos da trilha</h2>
    <div class="tr-lista mt">${mods.map((m) => { const [st, cls] = situacaoDe(m); const extras = `${arquivosHtml(m)}${gravacaoHtml(m)}`; return `
      <div class="cartao tr-mod${proxima && m.id === proxima.id ? ' tr-proxima' : ''}" style="margin-top:0">
        <div class="tr-cab">
          <span class="tr-num" aria-hidden="true">${m.numero}</span>
          <div style="flex:1;min-width:0">
            <h3>${esc(m.titulo)}</h3>
            <p class="peq apagado">${m.data_hora ? `${esc(diaSemana(m.data_hora))} · ${horaBR(m.data_hora)}` : 'Data a definir'} · ${ondeE(m)}</p>
            ${rostos(m) ? `<div class="linha mt" style="gap:6px">${rostos(m)}</div>` : ''}
          </div>
          <span class="selo ${cls}">${st}</span>
        </div>
        ${extras.trim() || (m.data_hora && fimDa(m) > agora && m.link) || avaliarHtml(m) ? `<div class="tr-corpo">
          ${m.data_hora && fimDa(m) > agora ? `<div class="linha" style="gap:6px">${botaoEntrar(m)}</div>` : ''}
          ${extras}
          ${avaliarHtml(m) ? `<div class="linha" style="gap:6px">${avaliarHtml(m)}</div>` : ''}
        </div>` : ''}
      </div>`; }).join('') || '<p class="apagado">Os módulos desta trilha ainda vão ser cadastrados.</p>'}</div>

    <div class="cartao mt2"><h3>Precisa de ajuda?</h3>
      <p class="peq apagado mt">Dúvidas sobre datas, acesso ou materiais: fale com a coordenação da Mentorei.</p>
      <div class="linha mt"><button class="btn" type="button" id="tr-ajuda">Falar pelo WhatsApp</button><a class="btn" href="mailto:contato@mentorei.com.br">contato@mentorei.com.br</a></div></div>`;

  const arquivos = mods.flatMap((m) => m.arquivos || []);
  el.addEventListener('click', async (ev) => {
    const cp = ev.target.closest('[data-copiar]');
    if (cp) {
      try { await navigator.clipboard.writeText(cp.dataset.copiar); avisar('Senha copiada. Cole no Zoom, se ele pedir.'); }
      catch (_) { window.prompt('Copie a senha:', cp.dataset.copiar); }
      return;
    }
    const b = ev.target.closest('[data-baixar]');
    if (b) {
      const a = arquivos.find((x) => x.id === b.dataset.baixar);
      const aba = window.open('', '_blank');   // abre já no clique, para o navegador não bloquear
      const { data, error } = await sb.storage.from('turmas').createSignedUrl(a.caminho, 300, { download: a.nome });
      if (error) { if (aba) aba.close(); avisar(explicarErro(error), true); return; }
      if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
      return;
    }
    if (ev.target.id === 'tr-ajuda') {
      const { data } = await sb.rpc('contato_coordenacao');
      const c = (data || [])[0];
      const num = (c && c.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
      if (!num) { location.href = 'mailto:contato@mentorei.com.br'; return; }
      const texto = `Oi! Aqui é ${ctx.perfil.nome}, da trilha ${t.nome}${t.empresa ? ` (${t.empresa})` : ''}. `;
      window.open(`https://wa.me/55${num}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    }
  });
}
