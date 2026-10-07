// Ficha do mentorado: visão geral (objetivo, pontos, duas visões, SWOT), plano de sessões e dados.
// Mentor e administração editam; o salvamento é automático.
import { sb, esc, avatar, dataHoraBR, autoSalvar, avisar, explicarErro, localParaISO, hojeISO } from '../base.js';
import { htmlResultado } from '../ferramentas-online.js';

const SITUACAO = { agendada: ['Agendada', 'neutro'], realizada: ['Feita', ''], falta_avisada: ['Falta avisada', 'alerta'],
  falta_sem_aviso: ['Falta sem aviso', 'erro'], remarcada: ['Remarcada', 'alerta'], cancelada: ['Cancelada', 'neutro'] };

export async function render(ctx, el, [id]) {
  const { data: m, error } = await sb.from('mentorados').select(`*,
    programa:programas(id, nome, empresa:empresas(nome)),
    perfil:perfis!mentorados_perfil_id_fkey(id, nome, email, foto_url, whatsapp, rede_social, autorizacoes, termo_aceito_em),
    vinculos:mentor_mentorado(ordem, mentor:perfis(id, nome, foto_url)),
    sessoes(id, numero, extra, data_hora, tema, situacao, concluida_em, tarefa, tarefa_prazo, tarefa_feita_em, mentor:perfis!sessoes_mentor_id_fkey(nome))`)
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!m) { el.innerHTML = '<div class="vazio">Mentorado não encontrado, ou você não tem acesso a esta ficha.</div>'; return; }
  const { data: testes } = await sb.from('testes').select('*').eq('mentorado_id', id).order('criado_em', { ascending: false });
  const { data: enviadas } = await sb.from('ferramentas_enviadas').select('id, enviado_em, ferramenta:ferramentas(nome), por:perfis(nome)').eq('mentorado_id', id).order('enviado_em', { ascending: false });

  const sess = (m.sessoes || []).sort((a, b) => a.numero - b.numero);
  const mentores = (m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((v) => v.mentor).filter(Boolean);
  const p = m.perfil || {};
  const feitas = sess.filter((s) => s.situacao === 'realizada').length;
  const proxima = sess.find((s) => !s.concluida_em);
  const whats = (p.whatsapp || m.whatsapp || '').replace(/\D/g, '');
  const rede = p.rede_social || m.rede_social || '';
  const travaContato = p.id && !ctx.ehAdmin ? ' disabled' : ''; // depois do primeiro acesso, o contato é do mentorado (a administração ainda corrige)
  const swot = m.swot || {};
  let pontos = Array.isArray(m.pontos_desenvolver) ? m.pontos_desenvolver.map((x) => (typeof x === 'string' ? x : x.ponto)).filter(Boolean) : [];

  el.innerHTML = `
    <div class="linha" style="align-items:flex-start;gap:16px">
      ${avatar({ nome: m.nome, foto_url: p.foto_url }, true)}
      <div style="flex:1;min-width:220px">
        <h1>${esc(m.nome)}</h1>
        <p class="apagado">${esc(m.cargo || 'Cargo a preencher')}${m.programa ? ` · ${esc(m.programa.empresa.nome)} · ${esc(m.programa.nome)}` : ''}</p>
        <div class="linha mt" style="gap:6px"><span class="selo">Sessões feitas: ${feitas} de ${sess.length}</span>
          ${mentores.map((x) => `<span class="selo neutro">${esc(x.nome)}</span>`).join('')}
          ${!p.termo_aceito_em ? '<span class="selo alerta">Ainda não fez o primeiro acesso</span>' : ''}</div>
      </div>
      <div class="linha">
        ${whats ? `<a class="btn peq" href="https://wa.me/55${whats.replace(/^55/, '')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${ctx.ehAdmin ? (p.termo_aceito_em ? '<button class="btn peq" data-convite-whats title="Gera um link para criar uma senha nova">Novo link de acesso</button>' : '<button class="btn peq pri" data-convite-whats>Convite por WhatsApp</button>') : ''}
        ${(m.email || p.email) ? `<a class="btn peq" href="mailto:${esc(m.email || p.email)}">E-mail</a>` : ''}
        ${rede ? `<a class="btn peq" href="${esc(/^https?:/.test(rede) ? rede : `https://${rede}`)}" target="_blank" rel="noopener">Rede social</a>` : ''}
        ${m.sala_meet ? `<a class="btn peq escuro" href="${esc(m.sala_meet)}" target="_blank" rel="noopener">Entrar no Meet</a>` : ''}
        ${proxima ? `<a class="btn peq pri" href="#/sessao/${proxima.id}">Abrir sessão ${proxima.numero}</a>` : ''}
        <span class="salvo" id="indicador"></span>
      </div>
    </div>

    <div class="abas mt2" role="tablist">
      <button class="atual" data-aba="geral">Visão geral</button>
      <button data-aba="sessoes">Plano de sessões (${sess.length})</button>
      <button data-aba="dados">Dados e contato</button>
    </div>

    <section data-painel="geral">
      <div class="grade g2">
        <div class="cartao"><h3>Objetivo principal</h3>
          <textarea class="mt" data-m="objetivo_principal" placeholder="Fechado na sessão 1, no contrato de desenvolvimento: 1 ou 2 mudanças observáveis.">${esc(m.objetivo_principal || '')}</textarea></div>
        <div class="cartao"><h3>Pontos a desenvolver</h3>
          <div class="chips mt" id="pontos"></div>
          <div class="linha mt"><input type="text" id="novo-ponto" placeholder="Ex.: Delegação" style="flex:1"><button class="btn peq" id="add-ponto">Adicionar</button></div></div>
      </div>
      <div class="cartao mt"><h3>Forças e fraquezas · duas visões</h3>
        <div class="grade g2 mt">
          ${[['forcas_visao_mentorado', 'Forças · visão do mentorado'], ['fraquezas_visao_mentorado', 'Fraquezas · visão do mentorado'],
             ['forcas_visao_gestor', 'Forças · visão do gestor'], ['fraquezas_visao_gestor', 'Fraquezas · visão do gestor']]
            .map(([k, r]) => `<div class="campo"><label>${r}</label><textarea data-m="${k}" style="min-height:120px">${esc(m[k] || '')}</textarea></div>`).join('')}
        </div></div>
      <div class="cartao mt"><div class="linha"><h3 style="flex:1">Ferramentas enviadas</h3><a class="btn peq" href="#/arsenal">Abrir o arsenal</a></div>
        ${(enviadas || []).length ? `<div class="tabela mt"><table><tr><th>Ferramenta</th><th>Enviada em</th><th>Por</th></tr>${enviadas.map((x) => `<tr><td>${esc(x.ferramenta ? x.ferramenta.nome : '')}</td><td>${dataHoraBR(x.enviado_em)}</td><td>${esc(x.por ? x.por.nome : '')}</td></tr>`).join('')}</table></div>`
          : '<p class="apagado mt">Nenhuma ferramenta enviada ainda. No arsenal, use o botão "Enviar".</p>'}</div>
      <div class="cartao mt"><h3>Resultados das ferramentas online</h3>
        ${(testes || []).length ? `<div class="lista mt">${testes.map(htmlResultado).join('')}</div>` : '<p class="apagado mt">Quando o mentorado responder uma ferramenta online, como a Roda do Comunicador, o resultado aparece aqui.</p>'}</div>
      <div class="cartao mt"><h3>SWOT</h3>
        <div class="grade g2 mt">
          ${[['forcas', 'Forças'], ['fraquezas', 'Fraquezas'], ['oportunidades', 'Oportunidades'], ['ameacas', 'Ameaças']]
            .map(([k, r]) => `<div class="campo"><label>${r}</label><textarea data-swot="${k}">${esc(swot[k] || '')}</textarea></div>`).join('')}
        </div></div>
    </section>

    <section data-painel="sessoes" hidden>
      <div class="cartao">
        <div class="linha"><h3>Plano de sessões</h3>
          ${ctx.ehAdmin ? '<button class="btn peq" id="extra" style="margin-left:auto">+ Sessão extra</button>' : ''}</div>
        <div class="tabela mt"><table>
          <tr><th>Nº</th><th>Data</th><th>Mentor</th><th>Tema</th><th>Tarefa</th><th>Situação</th><th></th></tr>
          ${sess.map((s) => {
            const [rot, cls] = SITUACAO[s.situacao] || [s.situacao, 'neutro'];
            const tarefa = s.tarefa ? (s.tarefa_feita_em ? '<span class="selo">Entregue</span>' : (s.tarefa_prazo && s.tarefa_prazo < hojeISO() ? '<span class="selo alerta">Atrasada</span>' : '<span class="selo neutro">Pendente</span>')) : '';
            return `<tr><td>${s.numero}${s.extra ? ' <span class="selo neutro">extra</span>' : ''}</td><td>${dataHoraBR(s.data_hora)}</td>
              <td>${esc(s.mentor ? s.mentor.nome : '—')}</td><td>${esc(s.tema || '—')}</td><td>${tarefa}</td>
              <td><span class="selo ${cls}">${rot}</span>${s.concluida_em ? ' <span class="selo neutro">🔒</span>' : ''}</td>
              <td><a class="btn peq${s === proxima ? ' pri' : ''}" href="#/sessao/${s.id}">${s.concluida_em ? 'Ver' : 'Abrir'}</a></td></tr>`;
          }).join('') || '<tr><td colspan="7" class="apagado">Nenhuma sessão criada ainda.</td></tr>'}
        </table></div>
      </div>
    </section>

    <section data-painel="dados" hidden>
      <div class="cartao"><h3>Dados de trabalho e contato</h3>
        <div class="grade g2 mt">
          <div class="campo"><label>Cargo</label><input type="text" data-m="cargo" value="${esc(m.cargo || '')}"></div>
          <div class="campo"><label>Tempo de casa</label><input type="text" data-m="tempo_de_casa" value="${esc(m.tempo_de_casa || '')}"></div>
          <div class="campo"><label>Pessoas no time</label><input type="number" min="0" data-m="pessoas_no_time" value="${esc(m.pessoas_no_time ?? '')}"></div>
          <div class="campo"><label>Gestor direto</label><input type="text" data-m="gestor_direto" value="${esc(m.gestor_direto || '')}"></div>
          <div class="campo"><label>Sala do Meet</label><input type="url" data-m="sala_meet" value="${esc(m.sala_meet || '')}"></div>
          <div class="campo"><label>E-mail (vira o login)</label><input type="email" data-m="email" value="${esc(m.email || '')}"></div>
          <div class="campo"><label>WhatsApp</label><input type="tel" data-m="whatsapp" placeholder="(54) 99999-0000" value="${esc(p.whatsapp || m.whatsapp || '')}"${travaContato}></div>
          <div class="campo"><label>LinkedIn ou Instagram</label><input type="text" data-m="rede_social" value="${esc(rede)}"${travaContato}></div>
        </div></div>
      <div class="cartao"><h3>Acesso à plataforma</h3>
        ${p.termo_aceito_em ? `<table class="mt"><tr><td class="apagado">WhatsApp</td><td>${esc(p.whatsapp || '—')}</td></tr>
          <tr><td class="apagado">Aceita resumo no WhatsApp</td><td>${p.autorizacoes && p.autorizacoes.whatsapp ? 'Sim' : 'Não'}</td></tr>
          <tr><td class="apagado">Rede social</td><td>${esc(p.rede_social || '—')}</td></tr>
          <tr><td class="apagado">Termo aceito em</td><td>${dataHoraBR(p.termo_aceito_em)}</td></tr></table>`
          : `<p class="apagado mt">${p.id ? 'O convite já foi gerado, mas o mentorado ainda não criou a senha. Se ele não recebeu ou o link expirou, mande de novo.' : 'O mentorado ainda não recebeu o convite.'}</p>
             ${ctx.ehAdmin ? `<div class="linha mt"><button class="btn pri peq" data-convite-whats>Convite por WhatsApp</button><button class="btn peq" id="convidar">Convite por e-mail</button><span class="peq apagado">O e-mail acima vira o login.</span></div>` : ''}`}
      </div>
    </section>`;

  // abas
  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('[data-aba]').forEach((x) => x.classList.toggle('atual', x === b));
    el.querySelectorAll('[data-painel]').forEach((x) => { x.hidden = x.dataset.painel !== b.dataset.aba; });
  }));

  // salvamento automático
  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const mud = {};
      el.querySelectorAll('[data-m]').forEach((c) => {
        const x = c.value.trim();
        mud[c.dataset.m] = c.type === 'number' ? (x === '' ? null : Number(x)) : (x || null);
      });
      const sw = {}; el.querySelectorAll('[data-swot]').forEach((c) => { sw[c.dataset.swot] = c.value.trim(); });
      mud.swot = sw;
      mud.pontos_desenvolver = pontos.map((ponto) => ({ ponto }));
      let { error: e } = await sb.from('mentorados').update(mud).eq('id', m.id);
      if (e && /whatsapp|rede_social/.test(e.message || '')) { // banco ainda sem as colunas novas (07-contato-mentorado.sql)
        const { whatsapp: _w, rede_social: _r, ...resto } = mud;
        ({ error: e } = await sb.from('mentorados').update(resto).eq('id', m.id));
      }
      if (e) throw e;
      // a administração corrige também o contato que o mentorado informou no primeiro acesso
      if (ctx.ehAdmin && p.id) {
        const { error: e2 } = await sb.from('perfis').update({ whatsapp: mud.whatsapp, rede_social: mud.rede_social }).eq('id', p.id);
        if (e2) throw e2;
      }
    },
  });
  el.querySelectorAll('[data-m], [data-swot]').forEach((c) => c.addEventListener('input', salvador.mudou));

  const desenharPontos = () => {
    el.querySelector('#pontos').innerHTML = pontos.length ? pontos.map((x, i) => `<span class="chip">${esc(x)} <button aria-label="Remover ${esc(x)}" data-rm="${i}">×</button></span>`).join('')
      : '<span class="peq apagado">Nenhum ponto ainda.</span>';
  };
  desenharPontos();
  el.querySelector('#pontos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-rm]'); if (!b) return;
    pontos.splice(Number(b.dataset.rm), 1); desenharPontos(); salvador.mudou();
  });
  const addPonto = () => {
    const inp = el.querySelector('#novo-ponto'); const x = inp.value.trim();
    if (x && !pontos.includes(x)) { pontos.push(x); desenharPontos(); salvador.mudou(); }
    inp.value = '';
  };
  el.querySelector('#add-ponto').addEventListener('click', addPonto);
  el.querySelector('#novo-ponto').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addPonto(); } });

  // sessão extra (administração)
  el.querySelector('#extra')?.addEventListener('click', async () => {
    const quando = window.prompt('Data e hora da sessão extra (ex.: 2026-11-26 09:00). Deixe em branco para definir depois.');
    if (quando === null) return;
    const iso = quando.trim() ? localParaISO(quando.trim().replace(' ', 'T')) : null;
    const { error: e } = await sb.rpc('criar_sessao_extra', { p_mentorado: m.id, p_data: iso, p_mentor: mentores[0] ? mentores[0].id : null });
    if (e) { avisar(explicarErro(e), true); return; }
    avisar('Sessão extra criada.'); ctx.irPara(`#/mentorado/${m.id}`);
  });

  // convite do mentorado pelo WhatsApp (administração): gera o link, nenhum e-mail sai
  el.querySelectorAll('[data-convite-whats]').forEach((botao) => botao.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    await salvador.agora();
    const email = el.querySelector('[data-m="email"]').value.trim();
    if (!email) { avisar('Preencha o e-mail do mentorado: ele vira o login.', true); return; }
    btn.disabled = true;
    const { conviteWhatsApp } = await import('./equipe.js');
    await conviteWhatsApp({ email, nome: m.nome, papel: 'mentorado', mentorado_id: m.id, whatsapp: el.querySelector('[data-m="whatsapp"]').value.trim(), remetente: ctx.perfil.nome });
    btn.disabled = false;
  }));

  // convite do mentorado por e-mail (administração)
  el.querySelector('#convidar')?.addEventListener('click', async () => {
    await salvador.agora();
    const email = el.querySelector('[data-m="email"]').value.trim();
    if (!email) { avisar('Preencha o e-mail do mentorado na aba "Dados e contato".', true); return; }
    const { convidar } = await import('./equipe.js');
    await convidar({ email, nome: m.nome, papel: 'mentorado', mentorado_id: m.id });
  });

  return { sair: () => { salvador.agora(); salvador.parar(); } };
}
