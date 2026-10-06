// Ficha do mentorado: visão geral (objetivo, pontos, duas visões, SWOT), plano de sessões e dados.
// Mentor e administração editam; o salvamento é automático.
import { sb, esc, avatar, dataHoraBR, autoSalvar, avisar, explicarErro, localParaISO, hojeISO } from '../base.js';

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

  const sess = (m.sessoes || []).sort((a, b) => a.numero - b.numero);
  const mentores = (m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((v) => v.mentor).filter(Boolean);
  const p = m.perfil || {};
  const feitas = sess.filter((s) => s.situacao === 'realizada').length;
  const whats = (p.whatsapp || '').replace(/\D/g, '');
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
          ${!p.id ? '<span class="selo alerta">Ainda não fez o primeiro acesso</span>' : ''}</div>
      </div>
      <div class="linha">
        ${whats ? `<a class="btn peq" href="https://wa.me/55${whats.replace(/^55/, '')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${(m.email || p.email) ? `<a class="btn peq" href="mailto:${esc(m.email || p.email)}">E-mail</a>` : ''}
        ${p.rede_social ? `<a class="btn peq" href="${esc(/^https?:/.test(p.rede_social) ? p.rede_social : `https://${p.rede_social}`)}" target="_blank" rel="noopener">Rede social</a>` : ''}
        ${m.sala_meet ? `<a class="btn peq escuro" href="${esc(m.sala_meet)}" target="_blank" rel="noopener">Entrar no Meet</a>` : ''}
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
          <tr><th>Nº</th><th>Data</th><th>Mentor</th><th>Tema</th><th>Tarefa</th><th>Situação</th></tr>
          ${sess.map((s) => {
            const [rot, cls] = SITUACAO[s.situacao] || [s.situacao, 'neutro'];
            const tarefa = s.tarefa ? (s.tarefa_feita_em ? '<span class="selo">Entregue</span>' : (s.tarefa_prazo && s.tarefa_prazo < hojeISO() ? '<span class="selo alerta">Atrasada</span>' : '<span class="selo neutro">Pendente</span>')) : '';
            return `<tr><td>${s.numero}${s.extra ? ' <span class="selo neutro">extra</span>' : ''}</td><td>${dataHoraBR(s.data_hora)}</td>
              <td>${esc(s.mentor ? s.mentor.nome : '—')}</td><td>${esc(s.tema || '—')}</td><td>${tarefa}</td>
              <td><span class="selo ${cls}">${rot}</span>${s.concluida_em ? ' <span class="selo neutro">🔒</span>' : ''}</td></tr>`;
          }).join('') || '<tr><td colspan="6" class="apagado">Nenhuma sessão criada ainda.</td></tr>'}
        </table></div>
        <p class="peq apagado mt">A tela de registro da sessão (resumo, voz, informações delicadas e tarefa) chega na próxima etapa da plataforma.</p>
      </div>
    </section>

    <section data-painel="dados" hidden>
      <div class="cartao"><h3>Dados de trabalho</h3>
        <div class="grade g2 mt">
          <div class="campo"><label>Cargo</label><input type="text" data-m="cargo" value="${esc(m.cargo || '')}"></div>
          <div class="campo"><label>Tempo de casa</label><input type="text" data-m="tempo_de_casa" value="${esc(m.tempo_de_casa || '')}"></div>
          <div class="campo"><label>Pessoas no time</label><input type="number" min="0" data-m="pessoas_no_time" value="${esc(m.pessoas_no_time ?? '')}"></div>
          <div class="campo"><label>Gestor direto</label><input type="text" data-m="gestor_direto" value="${esc(m.gestor_direto || '')}"></div>
          <div class="campo"><label>Sala do Meet</label><input type="url" data-m="sala_meet" value="${esc(m.sala_meet || '')}"></div>
          <div class="campo"><label>E-mail</label><input type="email" data-m="email" value="${esc(m.email || '')}"></div>
        </div></div>
      <div class="cartao"><h3>Contato informado pelo mentorado</h3>
        ${p.id ? `<table class="mt"><tr><td class="apagado">WhatsApp</td><td>${esc(p.whatsapp || '—')}</td></tr>
          <tr><td class="apagado">Aceita resumo no WhatsApp</td><td>${p.autorizacoes && p.autorizacoes.whatsapp ? 'Sim' : 'Não'}</td></tr>
          <tr><td class="apagado">Rede social</td><td>${esc(p.rede_social || '—')}</td></tr>
          <tr><td class="apagado">Termo aceito em</td><td>${dataHoraBR(p.termo_aceito_em)}</td></tr></table>`
          : `<p class="apagado mt">Aparece aqui depois do primeiro acesso do mentorado.</p>
             ${ctx.ehAdmin ? `<div class="linha mt"><button class="btn pri peq" id="convidar">Enviar convite de acesso</button><span class="peq apagado">Usa o e-mail acima.</span></div>` : ''}`}
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
      const { error: e } = await sb.from('mentorados').update(mud).eq('id', m.id);
      if (e) throw e;
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

  // convite do mentorado (administração)
  el.querySelector('#convidar')?.addEventListener('click', async () => {
    await salvador.agora();
    const email = el.querySelector('[data-m="email"]').value.trim();
    if (!email) { avisar('Preencha o e-mail do mentorado na aba "Dados e contato".', true); return; }
    const { convidar } = await import('./equipe.js');
    await convidar({ email, nome: m.nome, papel: 'mentorado', mentorado_id: m.id });
  });

  return { sair: () => { salvador.agora(); salvador.parar(); } };
}
