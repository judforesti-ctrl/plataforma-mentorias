// Área do aluno da turma (script 44, pedido da Juliana em 27/10/2026): "#/trilha" ou "#/trilha/<turma>".
// Visual da opção A (28/10/2026, peças em area-aluno.js): saudação, cartão escuro com o quanto já fez, números, próximo encontro,
// jornada em bolinhas e, embaixo, todos os módulos com materiais e gravações.
// O aluno vê o nome da trilha e da empresa, a próxima aula com o botão de entrar, e todos os módulos: data, mentores, link da sala,
// slides em PDF, tarefas e ferramentas para baixar, a gravação da aula e o atalho para avaliar o encontro.
// Os dados do aluno vêm só da função minhas_trilhas() (nada de percepções, recomendações ou slides internos).
// A administração e o mentor da turma abrem a mesma tela em PRÉVIA ("Ver como o aluno vê", na página da turma).
import { sb, esc, avatar, dataBR, horaBR, avisar, explicarErro } from '../base.js';
import { janelaAvaliacao, linkAvaliacao } from '../avaliacao-regras.js';
import { tema, temMarca } from '../marca.js';
import { saudacao, faltam, anel, numero, blocoData, jornada, icone } from './area-aluno.js';

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
    const botoes = (xs, ic) => xs.map((a) => `<button class="btn peq" type="button" data-baixar="${a.id}" title="Baixar ${esc(a.nome)}">${ic} ${esc(a.nome.replace(/\.[^.]+$/, ''))}</button>`).join('');
    return `${slides.length ? `<div class="tr-grupo"><span class="peq"><b>Slides da aula</b></span><div class="linha" style="gap:6px">${botoes(slides, icone('arquivo', 15))}</div></div>` : ''}
      ${tarefas.length ? `<div class="tr-grupo"><span class="peq"><b>Tarefas e ferramentas</b></span><div class="linha" style="gap:6px">${botoes(tarefas, icone('tarefa', 15))}</div></div>` : ''}`;
  };
  const gravacaoHtml = (m) => {
    const gs = m.gravacoes || [];
    if (gs.length) {
      // a senha do Zoom já vai dentro do link; por garantia ela aparece ao lado, com "Copiar"
      return `<div class="tr-grupo"><span class="peq"><b>Gravação</b></span><div class="linha" style="gap:6px">${gs.map((g, i) => `<a class="btn peq pri" href="${esc(g.link)}" target="_blank" rel="noopener">${icone('play', 15)} ${gs.length > 1 ? `Assistir · parte ${i + 1}` : 'Assistir à gravação'}${g.duracao_min ? ` <span class="peq">(${g.duracao_min} min)</span>` : ''}</a>
        ${g.senha ? `<span class="tr-senha peq">Senha: <b>${esc(g.senha)}</b> <button class="btn peq" type="button" data-copiar="${esc(g.senha)}" aria-label="Copiar a senha da gravação">Copiar</button></span>` : ''}`).join('')}</div>
        ${gs.some((g) => g.senha) ? '<p class="peq apagado">Se o Zoom pedir a senha, cole a que está aqui ao lado.</p>' : ''}</div>`;
    }
    if (m.data_hora && fimDa(m) <= agora && m.formato !== 'presencial') return '<p class="peq apagado">A gravação desta aula ainda não está disponível. Ela aparece aqui assim que ficar pronta.</p>';
    return '';
  };
  const avaliarHtml = (m) => {
    if (!m.data_hora || Date.parse(m.data_hora) > agora) return '';
    return janelaAvaliacao(m, agora).estado === 'aberta' ? `<a class="btn peq" href="${esc(linkAvaliacao(m.id))}" target="_blank" rel="noopener">Avaliar esta aula</a>` : '';
  };

  // logo e cores do cliente (empresas.marca): as variáveis de cor valem só dentro desta tela
  const marca = t.marca || {};
  const logoUrl = marca.logo && marca.logo.caminho ? sb.storage.from('fotos').getPublicUrl(marca.logo.caminho).data.publicUrl : '';
  el.classList.toggle('tr-marca', temMarca(marca));
  if (temMarca(marca)) el.setAttribute('style', tema(marca).estilo); else el.removeAttribute('style');

  // números do cartão escuro e da jornada
  const pct = mods.length ? Math.round((feitas / mods.length) * 100) : 0;
  const nArquivos = mods.reduce((n, m) => n + (m.arquivos || []).length, 0);
  const nGravacoes = mods.reduce((n, m) => n + (m.gravacoes || []).length, 0);
  const ultima = comData.filter((m) => fimDa(m) <= agora).sort((a, b) => Date.parse(b.data_hora) - Date.parse(a.data_hora))[0];
  const comGravacao = mods.filter((m) => (m.gravacoes || []).length).sort((a, b) => b.numero - a.numero)[0];
  const ehHoje = !!proxima && diaISO(Date.parse(proxima.data_hora)) === diaISO(agora);
  const ddmm = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
  const terminou = comData.length > 0 && feitas === comData.length && comData.length === mods.length;
  const disponivel = (m) => {
    const p = [(m.arquivos || []).some((a) => a.tipo === 'aluno') && 'slides', (m.arquivos || []).some((a) => a.tipo === 'tarefa') && 'tarefa',
      (m.gravacoes || []).length && 'gravação'].filter(Boolean);
    return p.length ? ` · ${p.length > 1 ? `${p.slice(0, -1).join(', ')} e ${p[p.length - 1]}` : p[0]} disponíve${p.length > 1 ? 'is' : 'l'}` : '';
  };

  el.classList.add('aa');
  el.innerHTML = `
    ${previa ? `<div class="aviso"><b>Prévia:</b> é assim que os alunos desta turma veem a área deles. <a href="#/turma/${t.id}">← Voltar para a turma</a></div>` : ''}
    ${saudacao(previa ? 'aluno(a)' : ctx.perfil.nome, esc(proxima ? faltam(proxima.data_hora, 'encontro') : ''))}

    <div class="aa-linha">
      <section class="aa-heroi" aria-labelledby="tr-nome">
        <div class="aa-heroi-texto">
          <p class="aa-kicker">${t.empresa ? `${esc(t.empresa)} · ` : ''}Sua trilha</p>
          <h2 id="tr-nome">${esc(t.nome)}</h2>
          <p class="aa-sub">${terminou ? 'Você completou todos os encontros desta trilha. As gravações e os materiais continuam aqui para consultar.'
            : `Você já fez ${feitas} de ${mods.length} encontro${mods.length === 1 ? '' : 's'}.${proxima ? ` ${ehHoje ? 'Hoje' : 'No próximo'}: ${esc(proxima.titulo)}.` : ''}`}${t.inicio ? ` <span class="peq">(${dataBR(t.inicio)}${t.fim ? ` a ${dataBR(t.fim)}` : ''})</span>` : ''}</p>
          <div class="linha" style="margin-top:6px">
            ${ehHoje && botaoEntrar(proxima, true) ? botaoEntrar(proxima, true) : `<button class="btn pri" type="button" data-ir="${proxima ? proxima.id : 'modulos'}">${proxima ? 'Ver o próximo encontro' : 'Ver os módulos'} ${icone('seta', 17)}</button>`}
            ${comGravacao ? `<button class="btn" type="button" data-ir="${comGravacao.id}">Ver gravações</button>` : ''}
          </div>
          ${trilhas.length > 1 ? `<div class="linha" style="gap:6px">${trilhas.map((x) => `<a class="btn peq${x.id === t.id ? ' pri' : ''}" href="#/trilha/${x.id}">${esc(x.nome)}</a>`).join('')}</div>` : ''}
        </div>
        <div class="aa-heroi-lado">
          ${logoUrl ? `<span class="tr-logo"><img src="${esc(logoUrl)}" alt="Logo de ${esc(t.empresa || 'da empresa')}"></span>` : ''}
          ${anel(pct, 'da trilha')}
        </div>
      </section>
      <div class="aa-numeros">
        ${numero({ ic: 'check', cor: 'ok', valor: `${feitas} de ${mods.length}`, texto: `encontro${mods.length === 1 ? '' : 's'} realizado${feitas === 1 ? '' : 's'}` })}
        ${numero({ ic: 'arquivo', cor: 'bege', valor: nArquivos, texto: nArquivos === 1 ? 'material para baixar' : 'materiais para baixar' })}
        ${numero({ ic: 'play', cor: 'azul', valor: nGravacoes, texto: nGravacoes === 1 ? 'gravação para assistir' : 'gravações para assistir' })}
      </div>
    </div>

    <div class="aa-linha">
      <section class="aa-cartao aa-prox" aria-labelledby="tr-prox">
        <h3 id="tr-prox">${ehHoje ? 'Seu encontro é hoje' : 'Próximo encontro'}</h3>
        ${proxima ? `
          <div class="aa-prox-cab">${blocoData(proxima.data_hora)}
            <div><b>Módulo ${proxima.numero} · ${esc(proxima.titulo)}</b>
              <span class="peq apagado">${esc(diaSemana(proxima.data_hora))} · ${horaBR(proxima.data_hora)} às ${horaBR(new Date(fimDa(proxima)).toISOString())} · ${ondeE(proxima)}</span></div></div>
          ${rostos(proxima) ? `<div class="linha" style="gap:6px">${rostos(proxima)}</div>` : ''}
          ${(proxima.arquivos || []).length ? `<div class="aa-preparo"><b>Materiais deste encontro</b>${arquivosHtml(proxima)}</div>` : ''}
          ${botaoEntrar(proxima, true) ? `<div class="linha">${botaoEntrar(proxima, true)}</div>`
            : proxima.formato !== 'presencial' ? '<p class="peq apagado">O link da sala aparece aqui antes da aula.</p>' : ''}`
          : `<p class="apagado">${terminou ? 'Você completou todos os encontros desta trilha.' : 'As datas dos próximos encontros ainda vão ser marcadas. Elas aparecem aqui assim que forem definidas.'}</p>`}
      </section>

      <section class="aa-cartao aa-jorn" aria-labelledby="tr-jorn">
        <div class="aa-titulo"><h3 id="tr-jorn">Sua jornada</h3><button class="btn peq" type="button" data-ir="modulos">Ver todos os módulos</button></div>
        ${mods.length ? jornada(mods.map((m) => ({
          numero: m.numero, titulo: `${m.numero} · ${m.titulo}`,
          estado: m.data_hora && fimDa(m) <= agora ? 'feito' : proxima && m.id === proxima.id ? 'atual' : 'futuro',
          sub: `${m.data_hora ? ddmm(m.data_hora) : 'a definir'}${proxima && m.id === proxima.id ? (ehHoje ? ' · hoje' : ' · próximo') : ''}`,
        })), 'Módulos da trilha') : '<p class="apagado">Os módulos desta trilha ainda vão ser cadastrados.</p>'}
        ${ultima ? `<div class="aa-rodape"><span>Último encontro: <b style="color:var(--texto)">${esc(ultima.titulo)}</b>${disponivel(ultima)}</span>
          ${(ultima.gravacoes || [])[0] ? `<a class="btn peq" href="${esc(ultima.gravacoes[0].link)}" target="_blank" rel="noopener">${icone('play', 16)} Assistir</a>` : ''}
          <button class="btn peq" type="button" data-ir="${ultima.id}">${icone('arquivo', 16)} Materiais</button></div>` : ''}
      </section>
    </div>

    <section class="aa-secao" id="tr-modulos" aria-labelledby="tr-mods">
      <h2 id="tr-mods">Os módulos da trilha</h2>
      <div class="tr-lista">${mods.map((m) => { const [st, cls] = situacaoDe(m); const extras = `${arquivosHtml(m)}${gravacaoHtml(m)}`; return `
      <div class="cartao tr-mod${proxima && m.id === proxima.id ? ' tr-proxima' : ''}" id="tr-mod-${m.id}" style="margin-top:0">
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
    </section>

    <section class="aa-cartao" aria-labelledby="tr-ajuda-t"><h3 id="tr-ajuda-t">Precisa de ajuda?</h3>
      <p class="peq apagado">Dúvidas sobre datas, acesso ou materiais: fale com a coordenação da Mentorei.</p>
      <div class="linha"><button class="btn" type="button" id="tr-ajuda">Falar pelo WhatsApp</button><a class="btn" href="mailto:contato@mentorei.com.br">contato@mentorei.com.br</a></div></section>`;

  const arquivos = mods.flatMap((m) => m.arquivos || []);
  el.addEventListener('click', async (ev) => {
    const ir = ev.target.closest('[data-ir]');
    if (ir) {
      const alvo = el.querySelector(ir.dataset.ir === 'modulos' ? '#tr-modulos' : `#tr-mod-${ir.dataset.ir}`);
      if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
