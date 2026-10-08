// Tela da sessão: antes de começar (sessões anteriores, pontos delicados, tarefa anterior, evolução),
// roteiro, anotações por voz, campo delicado, notas de evolução, tarefa, ferramentas e resumo para o mentorado.
// Depois de concluída, só a administração altera.
import { sb, esc, avatar, dataHoraBR, diaMes, autoSalvar, avisar, explicarErro, hojeISO } from '../base.js';
import { editarLinkMeet } from './meet.js';

// Janela flutuante (fica por cima de tudo, até do Meet): Google Chrome e Edge no computador.
const FLUTUANTE = 'documentPictureInPicture' in window;

const SITUACOES = [['agendada', 'Agendada'], ['realizada', 'Realizada'], ['falta_avisada', 'Falta avisada'],
  ['falta_sem_aviso', 'Falta sem aviso'], ['remarcada', 'Remarcada'], ['cancelada', 'Cancelada']];
const ROT_SIT = Object.fromEntries(SITUACOES);
const COR_SIT = { realizada: '', falta_avisada: 'alerta', falta_sem_aviso: 'erro', remarcada: 'alerta', cancelada: 'neutro', agendada: 'neutro' };
const NOTAS = ['', 'Começando', 'Em construção', 'Praticando', 'Consistente', 'Referência'];
const umaLinha = (s) => String(s || '').trim();
const prazoBR = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '');

const SEL_SESSAO = `id, numero, extra, data_hora, tema, roteiro, situacao, motivo_falta, duracao_min, resumo_mentorado,
  tarefa, tarefa_prazo, tarefa_feita_em, tarefa_comentario, concluida_em, mentorado_id,
  mentor:perfis!sessoes_mentor_id_fkey(id, nome),
  interno:sessoes_interno(resumo_mentor, informacoes_delicadas, notas_evolucao),
  avaliacao:avaliacoes_sessao(nota, comentario)`;

export async function render(ctx, el, [id]) {
  const { data: s, error } = await sb.from('sessoes').select(`${SEL_SESSAO},
    mentorado:mentorados(id, nome, cargo, programa_id, objetivo_principal, pontos_desenvolver, sala_meet,
      tempo_de_casa, pessoas_no_time, gestor_direto, swot,
      forcas_visao_mentorado, fraquezas_visao_mentorado, forcas_visao_gestor, fraquezas_visao_gestor,
      perfil:perfis!mentorados_perfil_id_fkey(nome, foto_url, whatsapp, autorizacoes, termo_aceito_em))`).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!s) { el.innerHTML = '<div class="vazio">Sessão não encontrada, ou você não tem acesso a ela.</div>'; return; }
  const m = s.mentorado;
  const p = m.perfil || {};
  const [{ data: todas }, { data: plano }, { data: ferramentas }, { data: enviadas }] = await Promise.all([
    sb.from('sessoes').select(SEL_SESSAO).eq('mentorado_id', m.id).order('numero'),
    sb.from('programa_temas').select('tema, roteiro, ferramentas').eq('programa_id', m.programa_id).eq('numero', s.numero).maybeSingle(),
    sb.from('ferramentas').select('id, nome, arquivo').order('nome'),
    sb.from('ferramentas_enviadas').select('id, ferramenta:ferramentas(nome)').eq('sessao_id', s.id),
  ]);
  const interno = s.interno || {};
  const notasEvol = { ...(interno.notas_evolucao || {}) };
  const anteriores = (todas || []).filter((x) => x.numero < s.numero && (x.concluida_em || x.situacao !== 'agendada'));
  const total = (todas || []).length;
  const concluida = !!s.concluida_em;
  const pode = !concluida || ctx.ehAdmin;
  const dis = pode ? '' : ' disabled';
  const pontos = (Array.isArray(m.pontos_desenvolver) ? m.pontos_desenvolver : []).map((x) => (typeof x === 'string' ? x : x.ponto)).filter(Boolean);
  const roteiroPlano = (plano && plano.roteiro) || '';
  const ferrPlano = ((plano && plano.ferramentas) || []).map((fid) => (ferramentas || []).find((f) => f.id === fid)).filter(Boolean);
  const whats = (p.whatsapp || '').replace(/\D/g, '');
  const aceitaWhats = !!(p.autorizacoes && p.autorizacoes.whatsapp && whats);

  // ---------- antes de começar ----------
  const ultimaComTarefa = anteriores.slice().reverse().find((x) => x.tarefa);
  const delicados = anteriores.filter((x) => x.interno && umaLinha(x.interno.informacoes_delicadas));
  const evolucao = pontos.map((pt) => ({ pt, serie: anteriores.map((x) => x.interno && x.interno.notas_evolucao && x.interno.notas_evolucao[pt]).filter(Boolean) }))
    .filter((x) => x.serie.length);
  const estadoTarefa = (x) => (x.tarefa_feita_em ? `<span class="selo">Feita em ${diaMes(x.tarefa_feita_em)}</span>`
    : x.tarefa_prazo && x.tarefa_prazo < hojeISO() ? '<span class="selo alerta">Atrasada</span>' : '<span class="selo neutro">Pendente</span>');

  // ---------- quem é o mentorado (para não precisar voltar à ficha) ----------
  const sw = m.swot || {};
  const caixa = (titulo, texto) => (umaLinha(texto) ? `<div class="sobre-caixa"><span class="peq apagado">${titulo}</span><p class="peq" style="white-space:pre-wrap">${esc(texto)}</p></div>` : '');
  const visoes = [caixa('Forças · visão do mentorado', m.forcas_visao_mentorado), caixa('Fraquezas · visão do mentorado', m.fraquezas_visao_mentorado),
    caixa('Forças · visão do gestor', m.forcas_visao_gestor), caixa('Fraquezas · visão do gestor', m.fraquezas_visao_gestor)].join('');
  const swotHtml = [caixa('SWOT · Forças', sw.forcas), caixa('SWOT · Fraquezas', sw.fraquezas), caixa('SWOT · Oportunidades', sw.oportunidades), caixa('SWOT · Ameaças', sw.ameacas)].join('');
  const trabalho = [m.cargo, m.tempo_de_casa && `${m.tempo_de_casa} de casa`, m.pessoas_no_time != null && `${m.pessoas_no_time} pessoas no time`, m.gestor_direto && `gestor: ${m.gestor_direto}`].filter(Boolean).map(esc).join(' · ');
  // começa como uma faixa pequena (nome e objetivo numa linha); o mentor abre para ler tudo e diminui de novo
  const blocoSobre = `
    <div class="cartao sobre" id="sobre">
      <button type="button" class="sobre-barra" id="sobre-alternar" aria-expanded="false" aria-controls="sobre-tudo">
        <span class="sobre-titulo"><b>Sobre ${esc(m.nome.split(' ')[0])}</b>${m.cargo ? ` <span class="peq apagado">· ${esc(m.cargo)}</span>` : ''}</span>
        <span class="sobre-linha peq"><b>Objetivo:</b> ${m.objetivo_principal ? esc(m.objetivo_principal) : 'ainda não combinado'}${pontos.length ? ` · ${pontos.length} ponto${pontos.length > 1 ? 's' : ''} a desenvolver` : ''}</span>
        <span class="btn peq sobre-acao">Ver tudo</span>
      </button>
      <div class="sobre-tudo" id="sobre-tudo" hidden>
        ${trabalho ? `<p class="peq apagado">${trabalho}</p>` : ''}
        <div class="sobre-objetivo mt"><span class="peq">Objetivo da mentoria</span><p>${m.objetivo_principal ? esc(m.objetivo_principal) : '<span class="apagado">Ainda não combinado. Anote na ficha do mentorado.</span>'}</p></div>
        ${pontos.length ? `<p class="peq mt"><b>Pontos a desenvolver</b></p><div class="chips mt">${pontos.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
        ${visoes ? `<div class="grade g2 mt">${visoes}</div>` : ''}
        ${swotHtml ? `<details class="mt"><summary class="peq" style="cursor:pointer"><b>Ver SWOT</b></summary><div class="grade g2 mt">${swotHtml}</div></details>` : ''}
        ${!visoes && !swotHtml ? `<p class="peq apagado mt">Forças, fraquezas e SWOT ainda não foram preenchidas na <a href="#/mentorado/${m.id}">ficha</a>.</p>` : ''}
        <div class="linha mt"><button type="button" class="btn peq" data-sobre-diminuir>Diminuir</button></div>
      </div>
    </div>`;

  const blocoAnteriores = anteriores.length ? `
    <div class="cartao">
      <h3>Antes de começar</h3>
      ${delicados.length ? `<div class="delicado mt"><b>🔒 Pontos delicados já registrados</b>
        ${delicados.map((x) => `<p class="mt"><span class="peq apagado">Sessão ${x.numero} · ${diaMes(x.data_hora)}${x.mentor ? ` · ${esc(x.mentor.nome)}` : ''}</span><br>${esc(x.interno.informacoes_delicadas)}</p>`).join('')}</div>` : ''}
      <div class="grade g2 mt">
        <div><h4>Tarefa da sessão anterior</h4>
          ${ultimaComTarefa ? `<p class="mt">${esc(ultimaComTarefa.tarefa)}</p>
            <p class="peq mt">${estadoTarefa(ultimaComTarefa)}${ultimaComTarefa.tarefa_prazo ? ` <span class="apagado">prazo ${prazoBR(ultimaComTarefa.tarefa_prazo)}</span>` : ''}</p>
            ${ultimaComTarefa.tarefa_comentario ? `<p class="peq apagado mt">Comentário do mentorado: “${esc(ultimaComTarefa.tarefa_comentario)}”</p>` : ''}`
            : '<p class="apagado mt">Nenhuma tarefa nas sessões anteriores.</p>'}</div>
        <div><h4>Evolução</h4>
          ${evolucao.length ? `<div class="lista mt">${evolucao.map(({ pt, serie }) => `<div class="peq"><b>${esc(pt)}</b>: ${serie.map((n) => `<span class="nota-mini">${n}</span>`).join(' → ')}</div>`).join('')}</div>`
            : '<p class="apagado mt">As notas de evolução aparecem aqui depois das primeiras sessões.</p>'}</div>
      </div>
      <h4 class="mt2">Resumo de cada sessão</h4>
      <div class="lista mt">${anteriores.slice().reverse().map((x, i) => {
        const it = x.interno || {};
        return `<details class="sessao-ant"${i === 0 ? ' open' : ''}>
          <summary><b>Sessão ${x.numero}</b> · ${diaMes(x.data_hora)}${x.mentor ? ` · ${esc(x.mentor.nome)}` : ''}
            <span class="selo ${COR_SIT[x.situacao] ?? 'neutro'}">${ROT_SIT[x.situacao] || x.situacao}</span>
            ${it.informacoes_delicadas ? '<span class="selo erro">🔒 ponto delicado</span>' : ''}
            ${x.avaliacao ? `<span class="selo neutro">nota do mentorado: ${x.avaliacao.nota}/5</span>` : ''}</summary>
          <div class="mt">
            ${x.tema ? `<p class="peq apagado">Tema: ${esc(x.tema)}</p>` : ''}
            ${x.motivo_falta ? `<p class="peq">Motivo: ${esc(x.motivo_falta)}</p>` : ''}
            ${umaLinha(it.resumo_mentor) ? `<p class="mt" style="white-space:pre-wrap">${esc(it.resumo_mentor)}</p>` : '<p class="peq apagado mt">Sem anotações.</p>'}
            ${umaLinha(it.informacoes_delicadas) ? `<div class="delicado mt"><b>🔒 Delicado:</b> ${esc(it.informacoes_delicadas)}</div>` : ''}
            ${x.tarefa ? `<p class="peq mt"><b>Tarefa:</b> ${esc(x.tarefa)} ${estadoTarefa(x)}</p>` : ''}
            ${x.avaliacao && x.avaliacao.comentario ? `<p class="peq apagado mt">O mentorado comentou: “${esc(x.avaliacao.comentario)}”</p>` : ''}
          </div></details>`;
      }).join('')}</div>
    </div>` : `<div class="cartao"><h3>Antes de começar</h3><p class="apagado mt">Esta é a primeira sessão registrada de ${esc(m.nome.split(' ')[0])}.${m.objetivo_principal ? '' : ' Lembre de combinar o objetivo principal da mentoria e anotar na ficha.'}</p></div>`;

  el.innerHTML = `
    <div class="linha" style="align-items:flex-start;gap:16px">
      ${avatar({ nome: m.nome, foto_url: p.foto_url }, true)}
      <div style="flex:1;min-width:220px">
        <p class="peq apagado"><a href="#/mentorado/${m.id}">← Ficha de ${esc(m.nome)}</a></p>
        <h1>Sessão ${s.numero}${total ? ` de ${total}` : ''}${s.extra ? ' <span class="selo neutro">extra</span>' : ''}</h1>
        <p class="apagado">${esc(m.nome)} · ${dataHoraBR(s.data_hora)}${s.mentor ? ` · ${esc(s.mentor.nome)}` : ''}</p>
      </div>
      <div class="linha">
        ${!concluida ? '<button class="btn" id="remarcar">Remarcar</button>' : ''}
        <span class="linha" id="meet-area" style="gap:6px"></span>
        ${FLUTUANTE && pode ? '<button type="button" class="btn" id="flutuar" title="Abre as anotações numa janela pequena que fica por cima do Meet">📝 Anotações flutuantes</button>' : ''}
        <span class="salvo" id="indicador"></span>
      </div>
    </div>
    ${concluida ? `<div class="aviso ${ctx.ehAdmin ? '' : 'ok'} mt">${ctx.ehAdmin
      ? `<b>Sessão concluída em ${dataHoraBR(s.concluida_em)}.</b> Você está como administração e pode corrigir; cada mudança fica guardada no histórico.`
      : `<b>🔒 Sessão concluída em ${dataHoraBR(s.concluida_em)}.</b> Ela não pode mais ser alterada. Se precisar corrigir algo, fale com a administração.`}</div>` : ''}

    <div class="sessao-grade mt2">
      <div class="sessao-col">
        ${blocoSobre}
        ${blocoAnteriores}
      </div>

      <div class="sessao-col">
        <div class="cartao">
          <h3>Roteiro desta sessão</h3>
          <div class="campo mt"><label>Tema</label><input type="text" data-s="tema" value="${esc(s.tema || (plano && plano.tema) || '')}"${dis}></div>
          <div class="campo mt"><label>Roteiro</label><textarea data-s="roteiro" style="min-height:110px"${dis}>${esc(s.roteiro || roteiroPlano)}</textarea></div>
          ${ferrPlano.length ? `<p class="peq mt"><b>Ferramentas previstas:</b></p><div class="chips mt">${ferrPlano.map((f) => `<button type="button" class="btn peq" data-enviar="${esc(f.id)}"${dis}>Enviar “${esc(f.nome)}”</button>`).join('')}</div>` : ''}
        </div>

        <div class="cartao">
          <h3>Como foi</h3>
          <div class="grade g2 mt">
            <div class="campo"><label>Situação</label><select data-s="situacao"${dis}>${SITUACOES.map(([v, r]) => `<option value="${v}"${v === s.situacao ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
            <div class="campo"><label>Duração (minutos)</label><input type="number" min="0" max="300" data-s="duracao_min" value="${esc(s.duracao_min ?? '')}"${dis}></div>
          </div>
          <div class="campo mt" id="motivo" hidden><label>Motivo da falta ou da remarcação</label><input type="text" data-s="motivo_falta" value="${esc(s.motivo_falta || '')}"${dis}></div>
        </div>

        <div class="flutuando-aviso cartao" id="flutuando-aviso" hidden>
          <h3>📝 As anotações estão na janela flutuante</h3>
          <p class="peq apagado mt">O resumo do mentorado, as anotações, as informações delicadas e a tarefa estão na janela pequena, por cima do Meet. Tudo continua salvando sozinho.</p>
          <div class="linha mt"><button type="button" class="btn peq" data-trazer>Trazer de volta para cá</button></div>
        </div>

        <div class="cartao" id="c-anotacoes">
          <div class="linha"><h3 style="flex:1">Anotações da sessão</h3>${pode ? '<button type="button" class="btn peq" data-voz="resumo_mentor">🎤 Falar</button>' : ''}</div>
          <p class="peq apagado">Só os mentores deste mentorado e a administração leem. Servem de base para o resumo do mentorado.</p>
          <textarea class="mt" data-i="resumo_mentor" style="min-height:200px" placeholder="O que foi conversado, percepções, o que mudou desde a última sessão…"${dis}>${esc(interno.resumo_mentor || '')}</textarea>
          <p class="peq apagado" data-ouvindo="resumo_mentor"></p>
        </div>

        <div class="cartao delicado-cartao" id="c-delicadas">
          <div class="linha"><h3 style="flex:1">🔒 Informações delicadas</h3>${pode ? '<button type="button" class="btn peq" data-voz="informacoes_delicadas">🎤 Falar</button>' : ''}</div>
          <p class="peq">Saúde, conflitos pessoais, confidências, riscos. Só os mentores deste mentorado e a administração veem. <b>Nunca vai para o mentorado nem para o resumo automático.</b></p>
          <textarea class="mt" data-i="informacoes_delicadas" style="min-height:90px" placeholder="Deixe em branco se não houver."${dis}>${esc(interno.informacoes_delicadas || '')}</textarea>
          <p class="peq apagado" data-ouvindo="informacoes_delicadas"></p>
        </div>

        <div class="cartao">
          <h3>Evolução nos pontos a desenvolver</h3>
          ${pontos.length ? `<p class="peq apagado">1 = começando · 5 = referência. Clique de novo para tirar a nota.</p>
            <div class="lista mt" id="notas">${pontos.map((pt) => `<div class="linha" style="gap:8px"><span style="flex:1;min-width:140px">${esc(pt)}</span>
              <span class="notas" data-pt="${esc(pt)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="nota${notasEvol[pt] === n ? ' on' : ''}" data-n="${n}" title="${NOTAS[n]}"${dis}>${n}</button>`).join('')}</span></div>`).join('')}</div>`
            : `<p class="apagado mt">Cadastre os pontos a desenvolver na <a href="#/mentorado/${m.id}">ficha do mentorado</a> para dar notas de evolução.</p>`}
        </div>

        <div class="cartao" id="c-tarefa">
          <h3>Tarefa para o mentorado</h3>
          <div class="grade mt" style="grid-template-columns:1fr 180px;gap:10px">
            <div class="campo"><label>O que ele vai fazer até a próxima sessão</label><textarea data-s="tarefa" style="min-height:70px"${dis}>${esc(s.tarefa || '')}</textarea></div>
            <div class="campo"><label>Prazo</label><input type="date" data-s="tarefa_prazo" value="${esc(s.tarefa_prazo || '')}"${dis}></div>
          </div>
        </div>

        <div class="cartao">
          <h3>Ferramentas enviadas nesta sessão</h3>
          <div class="chips mt" id="enviadas">${(enviadas || []).map((x) => `<span class="selo">${esc(x.ferramenta ? x.ferramenta.nome : '')}</span>`).join('') || '<span class="peq apagado">Nenhuma ainda.</span>'}</div>
          ${pode ? `<div class="linha mt"><input type="search" id="busca-ferr" list="lista-ferr" placeholder="Digite o nome da ferramenta…" style="flex:1;min-width:200px">
            <datalist id="lista-ferr">${(ferramentas || []).filter((f) => f.arquivo).map((f) => `<option value="${esc(f.nome)}">`).join('')}</datalist>
            <button type="button" class="btn peq pri" id="enviar-ferr">Enviar</button><a class="btn peq" href="#/arsenal">Abrir o arsenal</a></div>` : ''}
        </div>

        <div class="cartao">
          <div class="linha"><h3 style="flex:1">Resumo para o mentorado</h3>${pode ? '<button type="button" class="btn peq escuro" id="gerar">✨ Gerar com IA</button>' : ''}</div>
          <p class="peq apagado">É o que o mentorado lê na área dele. A IA escreve a partir das suas anotações e da tarefa (sem as informações delicadas). Revise antes de concluir.</p>
          <textarea class="mt" data-s="resumo_mentorado" style="min-height:160px"${dis}>${esc(s.resumo_mentorado || '')}</textarea>
        </div>

        <div class="cartao" id="final">
          ${concluida ? `<h3>Sessão concluída</h3>
            ${aceitaWhats && s.resumo_mentorado ? '<div class="linha mt"><a class="btn pri" id="whats" target="_blank" rel="noopener">Enviar resumo pelo WhatsApp</a></div>'
              : `<p class="peq apagado mt">${!p.termo_aceito_em ? 'O mentorado ainda não tem acesso à plataforma; ele vai ver o resumo quando entrar.' : !aceitaWhats ? 'O mentorado não autorizou mensagens por WhatsApp. O resumo e a tarefa já estão na área dele.' : 'O resumo e a tarefa já estão na área do mentorado.'}</p>`}`
            : `<h3>Concluir a sessão</h3>
            <p class="peq apagado">Ao concluir, o resumo e a tarefa aparecem para o mentorado, e a sessão fica trancada. Depois disso, só a administração altera.</p>
            <div class="linha mt"><button type="button" class="btn pri" id="concluir">Concluir sessão</button></div>`}
        </div>
      </div>
    </div>`;

  // Os campos ficam guardados aqui porque alguns blocos podem ir para a janela flutuante (fora desta página).
  const camposS = [...el.querySelectorAll('[data-s]')];
  const camposI = [...el.querySelectorAll('[data-i]')];
  const campoS = (k) => camposS.find((c) => c.dataset.s === k);
  const campoI = (k) => camposI.find((c) => c.dataset.i === k);
  const avisosVoz = Object.fromEntries([...el.querySelectorAll('[data-ouvindo]')].map((x) => [x.dataset.ouvindo, x]));

  // ---------- resumo do mentorado: abrir e diminuir ----------
  const sobre = el.querySelector('#sobre');
  const sobreTudo = sobre.querySelector('#sobre-tudo'), sobreBarra = sobre.querySelector('#sobre-alternar');
  const alternarSobre = (abrir) => {
    sobre.classList.toggle('aberto', abrir);
    sobreTudo.hidden = !abrir;
    sobreBarra.setAttribute('aria-expanded', String(abrir));
    sobre.querySelector('.sobre-acao').textContent = abrir ? 'Diminuir' : 'Ver tudo';
    if (!abrir) sobre.scrollIntoView({ block: 'nearest' });
  };
  sobreBarra.addEventListener('click', () => alternarSobre(!sobre.classList.contains('aberto')));
  sobre.querySelector('[data-sobre-diminuir]').addEventListener('click', () => alternarSobre(false));

  // ---------- anotações flutuantes ----------
  // Uma janela pequena que fica por cima de tudo, até do Meet em tela cheia. O resumo do mentorado, as anotações,
  // as informações delicadas e a tarefa mudam para ela e voltam para a página quando ela fecha. O salvamento é o mesmo.
  let flutuante = null;
  const botaoFlutuar = el.querySelector('#flutuar');
  const avisoFlutuando = el.querySelector('#flutuando-aviso');
  const blocosFlutuantes = ['#sobre', '#c-anotacoes', '#c-delicadas', '#c-tarefa'].map((x) => el.querySelector(x));
  const marcarBotaoFlutuar = () => { if (botaoFlutuar) botaoFlutuar.textContent = flutuante ? 'Trazer anotações de volta' : '📝 Anotações flutuantes'; };
  async function abrirFlutuante() {
    if (flutuante) { flutuante.focus(); return true; }
    let w;
    try { w = await window.documentPictureInPicture.requestWindow({ width: 440, height: 720 }); } catch (e) {
      console.warn('Janela flutuante:', e);
      avisar('Não foi possível abrir a janela flutuante. Ela funciona no Google Chrome ou no Edge, no computador.', true);
      return false;
    }
    flutuante = w;
    const d = w.document;
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((x) => d.head.appendChild(x.cloneNode(true)));
    d.title = `Sessão ${s.numero} · ${m.nome}`;
    d.body.className = 'janela-flutuante';
    d.body.innerHTML = `<div class="linha flutuante-topo"><b style="flex:1">Sessão ${s.numero} · ${esc(m.nome.split(' ')[0])}</b><span class="salvo" id="indicador-f"></span></div>
      <p class="peq apagado flutuante-dica">Esta janela fica por cima do Meet. Arraste pela borda de cima e mude o tamanho pelos cantos. Tudo salva sozinho.</p>`;
    // o "Salvo às..." da página aparece também na janela
    const ind = el.querySelector('#indicador'), indF = d.getElementById('indicador-f');
    const espelhar = () => { indF.className = ind.className; indF.textContent = ind.textContent; };
    espelhar();
    const observador = new MutationObserver(espelhar);
    observador.observe(ind, { attributes: true, childList: true, characterData: true, subtree: true });
    // muda os blocos (guardando o que já foi digitado) e deixa um marcador no lugar de cada um
    const marcadores = blocosFlutuantes.map((b) => {
      const marca = document.createComment('bloco na janela flutuante');
      const valores = [...b.querySelectorAll('textarea, input')].map((c) => [c, c.value]);
      b.before(marca); d.body.append(b);
      valores.forEach(([c, v]) => { c.value = v; });
      return marca;
    });
    avisoFlutuando.hidden = false; marcarBotaoFlutuar();
    w.addEventListener('pagehide', () => {
      salvador.agora();
      blocosFlutuantes.forEach((b, i) => {
        const valores = [...b.querySelectorAll('textarea, input')].map((c) => [c, c.value]);
        marcadores[i].replaceWith(b);
        valores.forEach(([c, v]) => { c.value = v; });
      });
      observador.disconnect();
      flutuante = null; avisoFlutuando.hidden = true; marcarBotaoFlutuar();
    });
    return true;
  }
  const fecharFlutuante = () => { if (flutuante) flutuante.close(); };
  botaoFlutuar?.addEventListener('click', () => (flutuante ? fecharFlutuante() : abrirFlutuante()));
  avisoFlutuando.querySelector('[data-trazer]').addEventListener('click', fecharFlutuante);

  // ---------- Meet: abre numa aba nova; o link pode ser colocado ou trocado aqui mesmo ----------
  const desenharMeet = () => {
    el.querySelector('#meet-area').innerHTML = m.sala_meet
      ? `<a class="btn escuro" id="meet" href="${esc(m.sala_meet)}" target="_blank" rel="noopener">Entrar no Meet</a>
         <button type="button" class="btn peq" id="meet-link" title="Trocar o link da sala do Meet" aria-label="Trocar o link da sala do Meet">✎</button>`
      : '<button type="button" class="btn" id="meet-link">+ Link do Meet</button>';
  };
  desenharMeet();
  el.querySelector('#meet-area').addEventListener('click', async (ev) => {
    if (ev.target.closest('#meet')) {
      if (!FLUTUANTE || !pode || flutuante) return; // o link abre o Meet numa aba nova, normalmente
      // primeiro as anotações flutuam, depois o Meet abre por baixo delas
      ev.preventDefault();
      await abrirFlutuante();
      const aba = window.open(m.sala_meet, '_blank');
      if (aba) aba.opener = null;
      else avisar('As anotações já estão na janela flutuante. Clique de novo em "Entrar no Meet" para abrir a chamada.');
      return;
    }
    if (ev.target.closest('#meet-link')) editarLinkMeet(m, (link) => { m.sala_meet = link; desenharMeet(); });
  });

  // ---------- motivo da falta ----------
  const sit = campoS('situacao');
  const mostrarMotivo = () => { el.querySelector('#motivo').hidden = !/falta|remarcada|cancelada/.test(sit.value); };
  mostrarMotivo(); sit.addEventListener('change', mostrarMotivo);

  // ---------- salvamento automático ----------
  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const mud = {};
      camposS.forEach((c) => {
        const x = c.value.trim();
        mud[c.dataset.s] = c.type === 'number' ? (x === '' ? null : Number(x)) : (x || null);
      });
      if (!mud.situacao) mud.situacao = 'agendada';
      const it = { sessao_id: s.id, notas_evolucao: notasEvol };
      camposI.forEach((c) => { it[c.dataset.i] = c.value.trim() || null; });
      const r1 = await sb.from('sessoes').update(mud).eq('id', s.id); if (r1.error) throw r1.error;
      const r2 = await sb.from('sessoes_interno').upsert(it, { onConflict: 'sessao_id' }); if (r2.error) throw r2.error;
    },
  });
  if (pode) {
    [...camposS, ...camposI].forEach((c) => {
      c.addEventListener('input', salvador.mudou); c.addEventListener('change', salvador.mudou);
    });
  }

  // ---------- notas de evolução ----------
  el.querySelector('#notas')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-n]'); if (!b || !pode) return;
    const pt = b.closest('[data-pt]').dataset.pt; const n = Number(b.dataset.n);
    if (notasEvol[pt] === n) delete notasEvol[pt]; else notasEvol[pt] = n;
    b.closest('[data-pt]').querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('on', notasEvol[pt] === Number(x.dataset.n)));
    salvador.mudou();
  });

  // ---------- voz (reconhecimento do próprio navegador, gratuito; melhor no Chrome) ----------
  const Reconhecer = window.SpeechRecognition || window.webkitSpeechRecognition;
  let voz = null;
  const pararVoz = () => { if (voz) { voz.ativo = false; voz.rec.stop(); voz.botao.textContent = '🎤 Falar'; voz.botao.classList.remove('gravando'); voz.aviso.textContent = ''; voz = null; } };
  el.querySelectorAll('[data-voz]').forEach((botao) => botao.addEventListener('click', () => {
    const campo = botao.dataset.voz;
    if (voz && voz.campo === campo) { pararVoz(); return; }
    pararVoz();
    if (!Reconhecer) { avisar('Este navegador não transcreve voz. Use o Google Chrome.', true); return; }
    const area = campoI(campo);
    const aviso = avisosVoz[campo];
    const rec = new Reconhecer();
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
    voz = { campo, rec, botao, aviso, ativo: true };
    const atual = voz;
    rec.onresult = (e) => {
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) {
          const frase = t.charAt(0).toUpperCase() + t.slice(1);
          area.value = `${area.value.replace(/\s+$/, '')}${area.value.trim() ? ' ' : ''}${frase}${/[.!?]$/.test(frase) ? '' : '.'}`;
          area.dispatchEvent(new Event('input'));
        } else parcial += `${t} `;
      }
      aviso.textContent = parcial ? `Ouvindo: ${parcial}` : 'Ouvindo…';
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { avisar('O navegador não deixou usar o microfone. Clique no cadeado ao lado do endereço e permita o microfone.', true); atual.ativo = false; }
    };
    rec.onend = () => { if (atual.ativo) { try { rec.start(); } catch (_) { /* já reiniciando */ } } else if (voz === atual) pararVoz(); };
    rec.start();
    botao.textContent = '⏹ Parar'; botao.classList.add('gravando'); aviso.textContent = 'Ouvindo… pode falar.';
  }));

  // ---------- ferramentas ----------
  const marcarEnviada = (nome) => {
    const box = el.querySelector('#enviadas');
    if (box.querySelector('.apagado')) box.innerHTML = '';
    box.insertAdjacentHTML('beforeend', `<span class="selo">${esc(nome)}</span>`);
  };
  const enviar = async (f) => {
    const { error: e } = await sb.from('ferramentas_enviadas').insert({ mentorado_id: m.id, ferramenta_id: f.id, sessao_id: s.id, enviado_por: ctx.perfil.id });
    if (e) { avisar(explicarErro(e), true); return; }
    marcarEnviada(f.nome); avisar(`“${f.nome}” enviada. Aparece na área do mentorado.`);
  };
  el.querySelectorAll('[data-enviar]').forEach((b) => b.addEventListener('click', async () => {
    const f = (ferramentas || []).find((x) => x.id === b.dataset.enviar); if (!f) return;
    b.disabled = true; await enviar(f);
  }));
  el.querySelector('#enviar-ferr')?.addEventListener('click', async () => {
    const inp = el.querySelector('#busca-ferr');
    const f = (ferramentas || []).find((x) => x.nome.toLowerCase() === inp.value.trim().toLowerCase());
    if (!f) { avisar('Escolha a ferramenta na lista que aparece ao digitar.', true); return; }
    await enviar(f); inp.value = '';
  });

  // ---------- resumo com IA ----------
  el.querySelector('#gerar')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const alvo = campoS('resumo_mentorado');
    if (alvo.value.trim() && !window.confirm('Já existe um resumo. Gerar outro e substituir?')) return;
    if (campoI('resumo_mentor').value.trim().length < 40) { avisar('Escreva (ou fale) as anotações da sessão primeiro.', true); return; }
    btn.disabled = true; btn.textContent = 'Escrevendo…';
    try {
      salvador.mudou(); await salvador.agora();
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/api/resumo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ sessao_id: s.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.mensagem || 'Não foi possível gerar o resumo.');
      alvo.value = j.resumo; salvador.mudou();
      avisar('Resumo escrito. Leia e ajuste o que quiser antes de concluir.');
    } catch (e) { avisar(explicarErro(e), true); }
    finally { btn.disabled = false; btn.textContent = '✨ Gerar com IA'; }
  });

  // ---------- concluir ----------
  el.querySelector('#concluir')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const situacao = sit.value;
    const resumo = campoS('resumo_mentorado').value.trim();
    if (situacao === 'agendada' && !window.confirm('A situação ainda está "Agendada". Concluir marcando como "Realizada"?')) return;
    if ((situacao === 'agendada' || situacao === 'realizada') && !resumo && !window.confirm('Ainda não há resumo para o mentorado. Concluir mesmo assim?')) return;
    if (!window.confirm('Depois de concluída, a sessão não pode mais ser alterada (só pela administração). Concluir agora?')) return;
    btn.disabled = true;
    pararVoz(); salvador.mudou(); await salvador.agora();
    const { error: e } = await sb.from('sessoes').update({ situacao: situacao === 'agendada' ? 'realizada' : situacao,
      concluida_em: new Date().toISOString(), concluida_por: ctx.perfil.id }).eq('id', s.id);
    if (e) { avisar(explicarErro(e), true); btn.disabled = false; return; }
    avisar('Sessão concluída.');
    import('./agenda-dados.js').then(({ avisarGoogle }) => avisarGoogle());
    ctx.irPara(`#/sessao/${s.id}`);
  });

  // ---------- WhatsApp (só se o mentorado autorizou) ----------
  const w = el.querySelector('#whats');
  if (w) {
    const primeiro = m.nome.split(' ')[0];
    const texto = [`Olá, ${primeiro}! Segue o resumo da nossa sessão ${s.numero}:`, s.resumo_mentorado,
      s.tarefa ? `Sua tarefa: ${s.tarefa}${s.tarefa_prazo ? ` (até ${prazoBR(s.tarefa_prazo)})` : ''}` : '',
      `Tudo fica guardado na sua área: ${location.origin}/app.html#/minha-area`].filter(Boolean).join('\n\n');
    w.href = `https://wa.me/55${whats.replace(/^55/, '')}?text=${encodeURIComponent(texto)}`;
  }

  el.querySelector('#remarcar')?.addEventListener('click', async () => {
    await salvador.agora();
    const { abrirRemarcar } = await import('./remarcar.js');
    abrirRemarcar(ctx, s.id, () => ctx.irPara(`#/sessao/${s.id}`));
  });

  return { sair: () => { pararVoz(); fecharFlutuante(); salvador.agora(); salvador.parar(); } };
}
