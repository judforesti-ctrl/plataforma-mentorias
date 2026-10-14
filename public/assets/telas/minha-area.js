// Área do mentorado: programa, próxima sessão, tarefas, resumos liberados e os mentores.
// Envios (script 37): o mentorado manda a tarefa, a ferramenta preenchida ou outro documento aos mentores (entregas.js).
import { sb, esc, avatar, dataHoraBR, diaMes, avisar, explicarErro } from '../base.js';
import { ONLINE, linkOnline, htmlResultado } from '../ferramentas-online.js';
import { juntarTarefas, prazoBR, atrasada } from '../tarefas.js';
import { carregarEntregas, htmlEntregas, ligarEntregas, abrirEnvio } from '../entregas.js';

export async function render(ctx, el) {
  const { data: m, error } = await sb.from('mentorados').select(`id, nome, sala_meet,
    programa:programas(nome, empresa:empresas(nome)),
    vinculos:mentor_mentorado(ordem, mentor:perfis(id, nome, foto_url, whatsapp, rede_social, resumo_apresentacao, resumo_aprovado_em, trajetoria)),
    sessoes(id, numero, data_hora, tema, situacao, concluida_em, resumo_mentorado, tarefa, tarefa_prazo, tarefa_feita_em, tarefa_comentario,
      mentor:perfis!sessoes_mentor_id_fkey(nome), avaliacao:avaliacoes_sessao(nota))`)
    .eq('perfil_id', ctx.perfil.id).maybeSingle();
  if (error) throw error;
  // ferramentas recebidas: nome, resumo e PDF vêm do catálogo (a ficha técnica é só da equipe)
  const [{ data: enviadas }, { data: catalogo }] = await Promise.all([
    sb.from('ferramentas_enviadas').select('id, enviado_em, ferramenta_id, sessao_id').order('enviado_em', { ascending: false }),
    sb.rpc('catalogo_ferramentas'),
  ]);
  const porId = Object.fromEntries((catalogo || []).map((f) => [f.id, { id: f.id, nome: f.nome, arquivo: f.arquivo, dados: { resumo: f.resumo } }]));
  const recebidas = (enviadas || []).map((r) => ({ ...r, ferramenta: porId[r.ferramenta_id] || null }));
  const { data: testes } = m ? await sb.from('testes').select('*').eq('mentorado_id', m.id).order('criado_em', { ascending: false }) : { data: [] };
  if (!m) { el.innerHTML = '<div class="vazio">Seu programa ainda não foi ligado ao seu acesso. Fale com a Mentorei.</div>'; return; }

  const sess = (m.sessoes || []).sort((a, b) => a.numero - b.numero);
  const agora = Date.now();
  const proxima = sess.find((s) => !s.concluida_em && s.data_hora && new Date(s.data_hora).getTime() > agora - 2 * 3600 * 1000);
  const feitas = sess.filter((s) => s.situacao === 'realizada').length;
  await juntarTarefas(sess, (q) => q.eq('mentorado_id', m.id));
  // as que faltam fazer primeiro (pelo prazo); as feitas no fim
  const tarefas = sess.filter((s) => s.concluida_em).flatMap((s) => s.tarefas.map((t) => ({ ...t, numero: s.numero })))
    .sort((a, b) => (!!a.feita_em - !!b.feita_em) || String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')) || b.numero - a.numero);
  const resumos = sess.filter((s) => s.concluida_em && s.resumo_mentorado).reverse();
  const mentores = (m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((v) => v.mentor).filter(Boolean);
  // envios aos mentores (sem o script 37 os botões não aparecem)
  const { existe: podeEnviar, lista: entregas } = await carregarEntregas((q) => q.eq('mentorado_id', m.id));
  const enviosDaTarefa = (t) => entregas.filter((e) => e.tipo === 'tarefa' && (t.id ? e.tarefa_id === t.id : !e.tarefa_id && e.sessao_id === t.sessao_id));
  const enviosDaFerramenta = (fid) => entregas.filter((e) => e.tipo === 'ferramenta' && e.ferramenta_id === fid);
  const seloEnviado = (lista) => (lista.length ? ` · <span class="selo">📎 Enviada em ${diaMes(lista[0].enviado_em)}</span>` : '');
  const paraOMentor = mentores.length > 1 ? 'aos seus mentores' : 'ao seu mentor';

  el.innerHTML = `
    <div class="cartao" style="background:var(--petroleo);color:#fff;border:0">
      <div class="linha" style="gap:16px">
        ${avatar(ctx.perfil, true)}
        <div style="flex:1;min-width:200px"><p class="peq" style="color:var(--lima);font-weight:700;letter-spacing:.06em;text-transform:uppercase">Seu programa de mentoria</p>
          <h1 style="color:#fff">Olá, ${esc(ctx.perfil.nome.split(' ')[0])}</h1>
          <p style="opacity:.8">${m.programa ? `${esc(m.programa.nome)} · ` : ''}Sessões feitas: ${feitas} de ${sess.length}${proxima ? ` · Próxima: ${diaMes(proxima.data_hora)} às ${new Date(proxima.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}${proxima.mentor ? ` com ${esc(proxima.mentor.nome)}` : ''}` : ''}</p></div>
        ${m.sala_meet ? `<a class="btn pri" href="${esc(/^https?:\/\//i.test(m.sala_meet) ? m.sala_meet : `https://${m.sala_meet}`)}" target="_blank" rel="noopener">Entrar na sala do Meet</a>` : ''}
      </div></div>

    <div class="grade g2 mt">
      <div class="cartao"><h3>Suas tarefas</h3>
        ${tarefas.length ? `<div class="lista mt">${tarefas.map((t, i) => `<div class="cartao" style="background:var(--bg);border:0">
          <p style="white-space:pre-wrap"><b>${esc(t.texto)}</b></p>
          <p class="peq apagado">Sessão ${t.numero}${t.prazo ? ` · prazo ${prazoBR(t.prazo)}` : ''}
            ${t.feita_em ? ' · <span class="selo">Feita</span>' : (atrasada(t) ? ' · <span class="selo alerta">Atrasada</span>' : '')}${seloEnviado(enviosDaTarefa(t))}</p>
          ${t.feita_em && !podeEnviar ? '' : `<div class="linha mt" style="gap:6px">
            ${podeEnviar ? `<button class="btn peq${t.feita_em ? '' : ' pri'}" data-enviar-tarefa="${i}" title="Mande o que você fez (arquivo, foto ou recado) ${paraOMentor}">${enviosDaTarefa(t).length ? 'Enviar mais' : 'Enviar a tarefa'}</button>` : ''}
            ${t.feita_em ? '' : `<button class="btn peq${podeEnviar ? '' : ' pri'}" data-feita="${t.id || `sessao:${t.sessao_id}`}">Marcar como feita</button>`}</div>`}</div>`).join('')}</div>`
          : '<p class="apagado mt">Quando o seu mentor passar uma tarefa, ela aparece aqui.</p>'}</div>
      <div class="cartao"><h3>${mentores.length > 1 ? 'Seus mentores' : 'Seu mentor'}</h3>
        <div class="lista mt">${mentores.map((x) => {
          const w = (x.whatsapp || '').replace(/\D/g, '');
          const t = x.trajetoria || {};
          return `<div><div class="linha" style="align-items:flex-start">${avatar(x)}<div style="flex:1;min-width:0"><b>${esc(x.nome)}</b>
            ${t.cargo_atual ? `<p class="peq" style="color:var(--verde-esc);font-weight:600">${esc(t.cargo_atual)}</p>` : ''}
            ${x.resumo_aprovado_em && x.resumo_apresentacao ? `<p class="peq mt" style="white-space:pre-wrap">${esc(x.resumo_apresentacao)}</p>` : ''}</div></div>
            <div class="linha mt">${w ? `<a class="btn peq" href="https://wa.me/55${w.replace(/^55/, '')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></div>`;
        }).join('') || '<p class="apagado">Ainda não definidos.</p>'}</div></div>
    </div>

    <div class="cartao mt"><h3>Resumo das suas sessões</h3>
      ${resumos.length ? `<div class="lista mt">${resumos.map((s) => `<div class="item" style="grid-template-columns:80px 1fr">
        <div><b>${diaMes(s.data_hora)}</b><br><span class="peq apagado">Sessão ${s.numero}</span></div>
        <div><p class="peq apagado">${esc(s.tema || '')}${s.mentor ? ` · ${esc(s.mentor.nome)}` : ''}</p><p style="white-space:pre-wrap">${esc(s.resumo_mentorado)}</p>
          <div class="linha mt" style="gap:8px"><span class="peq apagado">Como foi esta sessão para você?</span>
            <span class="estrelas" data-avaliar="${s.id}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-nota="${n}" class="${s.avaliacao && s.avaliacao.nota >= n ? 'on' : ''}" aria-label="Nota ${n} de 5">★</button>`).join('')}</span></div></div></div>`).join('')}</div>`
        : '<p class="apagado mt">Os resumos aparecem aqui depois de cada sessão concluída.</p>'}
    </div>

    <div class="cartao"><h3>Ferramentas que você recebeu</h3>
      ${(recebidas || []).length ? `<div class="lista mt">${recebidas.filter((r) => r.ferramenta).map((r) => `<div class="item" style="grid-template-columns:1fr auto">
        <div><b>${esc(r.ferramenta.nome)}</b>${enviosDaFerramenta(r.ferramenta.id).length ? ` <span class="selo">📎 Enviada em ${diaMes(enviosDaFerramenta(r.ferramenta.id)[0].enviado_em)}</span>` : ''}
          <p class="peq apagado">${esc((r.ferramenta.dados && r.ferramenta.dados.resumo) || '')}</p></div>
        <div class="linha" style="gap:6px">
          ${ONLINE[r.ferramenta.id] ? linkOnline(r.ferramenta.id, (testes || []).some((t) => t.ferramenta_id === r.ferramenta.id) ? 'Fazer de novo' : 'Fazer agora', 'btn peq pri') : ''}
          ${r.ferramenta.arquivo ? `<button class="btn peq${ONLINE[r.ferramenta.id] ? '' : ' pri'}" data-baixar="${esc(r.ferramenta.arquivo)}">Baixar PDF</button>` : ''}
          ${podeEnviar && !ONLINE[r.ferramenta.id] ? `<button class="btn peq" data-enviar-ferr="${r.id}" title="Depois de preencher, mande o arquivo ou a foto ${paraOMentor}">Enviar preenchida</button>` : ''}</div></div>`).join('')}</div>`
        : '<p class="apagado mt">Quando o seu mentor enviar uma ferramenta, ela aparece aqui.</p>'}</div>

    ${(testes || []).length ? `<div class="cartao"><h3>Resultados das suas ferramentas</h3><div class="lista mt">${testes.map(htmlResultado).join('')}</div></div>` : ''}

    ${podeEnviar ? `<div class="cartao" id="envios"><div class="linha"><h3 style="flex:1">Documentos enviados ${paraOMentor}</h3>
        <button class="btn peq pri" data-enviar-doc>+ Enviar um documento</button></div>
      <p class="peq apagado">Tarefas, ferramentas preenchidas ou qualquer documento que você queira mostrar. Só ${mentores.length > 1 ? 'seus mentores' : 'seu mentor'} e a equipe da Mentorei veem.</p>
      ${entregas.length ? htmlEntregas(entregas) : '<p class="apagado mt">Você ainda não enviou nada.</p>'}</div>` : ''}

    <div class="cartao"><h3>Próximas sessões</h3>
      <div class="tabela mt"><table><tr><th>Nº</th><th>Data</th><th>Mentor</th><th>Tema</th></tr>
        ${sess.filter((s) => !s.concluida_em).map((s) => `<tr><td>${s.numero}</td><td>${dataHoraBR(s.data_hora)}</td><td>${esc(s.mentor ? s.mentor.nome : '—')}</td><td>${esc(s.tema || '—')}</td></tr>`).join('')
          || '<tr><td colspan="4" class="apagado">Nenhuma sessão futura.</td></tr>'}</table></div></div>`;

  const recarregar = () => ctx.irPara('#/minha-area');
  const envios = el.querySelector('#envios');
  if (envios) ligarEntregas(envios, entregas, { aoMudar: recarregar });

  el.addEventListener('click', async (ev) => {
    const et = ev.target.closest('[data-enviar-tarefa]');
    if (et) { abrirEnvio(ctx, { mentoradoId: m.id, tipo: 'tarefa', tarefa: tarefas[Number(et.dataset.enviarTarefa)], aoEnviar: recarregar }); return; }
    const ef = ev.target.closest('[data-enviar-ferr]');
    if (ef) {
      const r = recebidas.find((x) => x.id === ef.dataset.enviarFerr);
      if (r) abrirEnvio(ctx, { mentoradoId: m.id, tipo: 'ferramenta', ferramenta: r.ferramenta, sessaoId: r.sessao_id, aoEnviar: recarregar });
      return;
    }
    if (ev.target.closest('[data-enviar-doc]')) { abrirEnvio(ctx, { mentoradoId: m.id, tipo: 'documento', aoEnviar: recarregar }); return; }
    const est = ev.target.closest('[data-nota]');
    if (est) {
      const box = est.closest('[data-avaliar]'); const nota = Number(est.dataset.nota);
      const { error: e } = await sb.from('avaliacoes_sessao').upsert({ sessao_id: box.dataset.avaliar, nota }, { onConflict: 'sessao_id' });
      if (e) { avisar(explicarErro(e), true); return; }
      box.querySelectorAll('[data-nota]').forEach((b) => b.classList.toggle('on', Number(b.dataset.nota) <= nota));
      avisar('Avaliação registrada.');
      return;
    }
    const dl = ev.target.closest('[data-baixar]');
    if (dl) {
      const aba = window.open('', '_blank');
      const { data, error: e } = await sb.storage.from('arsenal').createSignedUrl(dl.dataset.baixar, 120, { download: dl.dataset.baixar });
      if (e) { if (aba) aba.close(); avisar(explicarErro(e), true); return; }
      if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
      return;
    }
    const b = ev.target.closest('[data-feita]'); if (!b) return;
    b.disabled = true;
    const agoraISO = new Date().toISOString();
    const [tipo, sessaoId] = b.dataset.feita.split(':');
    const { error: e } = sessaoId // tarefa única antiga (antes do script 33)
      ? await sb.from('sessoes').update({ tarefa_feita_em: agoraISO }).eq('id', sessaoId)
      : await sb.from('tarefas').update({ feita_em: agoraISO }).eq('id', tipo);
    if (e) { avisar(explicarErro(e), true); b.disabled = false; return; }
    avisar('Tarefa marcada como feita. Seu mentor vai ver.'); ctx.irPara('#/minha-area');
  });
}
