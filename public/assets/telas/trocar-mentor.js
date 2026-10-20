// Trocar ou incluir mentor de um mentorado no meio do processo (pedido da Juliana, 2026-10-20: a Cláudia ia atender
// a Dani naquele dia e não via as sessões). Só a administração.
// Duas coisas decidem o que o mentor vê, e esta janela acerta as duas:
//   - o vínculo em mentor_mentorado dá acesso à ficha, às sessões, às anotações e aos documentos (regras do banco);
//   - sessoes.mentor_id põe a sessão na agenda e no "hoje" de Meus mentorados de quem atende, e no convite do Google.
// Passos: inclui a pessoa no mentorado (se ainda não estiver), passa para ela as sessões escolhidas e, se a administração
// desmarcar, tira quem atendia antes (só se não sobrar sessão em aberto com essa pessoa). Sessão concluída ou cancelada
// nunca muda de mentor (o histórico continua com quem atendeu). Sem script novo: a administração já pode tudo nessas
// tabelas (admin_tudo), e as mudanças ficam no histórico pelos gatilhos que já existem.
import { sb, esc, avisar, explicarErro, hojeISO, mesmoDia } from '../base.js';
import { janela, limparCache, avisarGoogle } from './agenda-dados.js';

const quando = (iso) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
};
const quandoTxt = (s) => (s.data_hora ? `${mesmoDia(s.data_hora, hojeISO()) ? 'hoje, ' : ''}${quando(s.data_hora)}` : 'sem data ainda');
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0];
const aberta = (s) => !s.concluida_em && s.situacao !== 'cancelada';

export async function abrirTrocarMentor(ctx, mentoradoId, { sessaoId = null, aoSalvar = () => {} } = {}) {
  if (!ctx.ehAdmin) { avisar('Só a administração troca o mentor de um mentorado.', true); return; }
  const [{ data: m, error }, { data: equipe, error: e2 }] = await Promise.all([
    sb.from('mentorados').select(`*, programa:programas(nome, empresa:empresas(nome)),
      perfil:perfis!mentorados_perfil_id_fkey(whatsapp),
      vinculos:mentor_mentorado(ordem, mentor_id, mentor:perfis(id, nome, email, whatsapp, papel, tambem_mentor, termo_aceito_em)),
      sessoes(id, numero, data_hora, situacao, concluida_em, mentor_id, mentor:perfis!sessoes_mentor_id_fkey(id, nome))`)
      .eq('id', mentoradoId).maybeSingle(),
    sb.from('perfis').select('id, nome, email, whatsapp, papel, tambem_mentor, termo_aceito_em')
      .or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome'),
  ]);
  if (error || e2 || !m) { avisar(error || e2 ? explicarErro(error || e2) : 'Mentorado não encontrado.', true); return; }

  // todas as pessoas que podem aparecer (equipe ativa, quem já está no mentorado, quem conduziu sessões)
  const pessoas = new Map();
  (equipe || []).forEach((x) => pessoas.set(x.id, x));
  (m.vinculos || []).forEach((v) => { if (v.mentor && !pessoas.has(v.mentor.id)) pessoas.set(v.mentor.id, v.mentor); });
  (m.sessoes || []).forEach((s) => { if (s.mentor && !pessoas.has(s.mentor.id)) pessoas.set(s.mentor.id, s.mentor); });
  const nomeDe = (id) => (pessoas.get(id) || {}).nome || 'sem mentor';

  const vinculos = (m.vinculos || []).slice().sort((a, b) => a.ordem - b.ordem);
  const sess = (m.sessoes || []).slice().sort((a, b) => a.numero - b.numero);
  const abertas = sess.filter(aberta);
  const agora = Date.now();
  // a sessão de referência: a que foi clicada, a de hoje, a próxima no calendário ou a primeira em aberto
  const alvo = (sessaoId && abertas.find((s) => s.id === sessaoId))
    || abertas.find((s) => mesmoDia(s.data_hora, hojeISO()))
    || abertas.filter((s) => s.data_hora && Date.parse(s.data_hora) >= agora).sort((a, b) => Date.parse(a.data_hora) - Date.parse(b.data_hora))[0]
    || abertas[0] || null;
  const seguintes = alvo ? abertas.filter((s) => s.numero >= alvo.numero) : [];
  const nomeM = esc(m.nome), primeiroM = esc(primeiro(m.nome));

  const opcoes = [
    alvo ? ['uma', `Só a sessão ${alvo.numero} · ${quandoTxt(alvo)}`] : null,
    seguintes.length > 1 ? ['seguintes', `A sessão ${alvo.numero} e todas as seguintes que ainda não aconteceram (${seguintes.length} sessões)`] : null,
    abertas.length > 1 ? ['escolher', 'Escolher as sessões'] : null,
    ['nenhuma', 'Nenhuma sessão: só dar acesso à ficha, para acompanhar junto'],
  ].filter(Boolean);
  const padrao = opcoes[0][0];

  const j = janela(`Quem atende ${m.nome}`, `
    <p class="peq apagado">Hoje com ${nomeM}: <b>${vinculos.length ? vinculos.map((v) => esc(nomeDe(v.mentor_id))).join(' e ') : 'ninguém'}</b>.
      Sessões em aberto: ${abertas.length}.</p>
    <div class="campo mt"><label for="tm-quem">Quem vai atender?</label>
      <select id="tm-quem"><option value="">Escolha…</option>
        ${(equipe || []).map((x) => `<option value="${x.id}">${esc(x.nome)}${vinculos.some((v) => v.mentor_id === x.id) ? ' (já acompanha)' : ''}</option>`).join('')}
      </select></div>
    <div class="campo mt"><label>Quais sessões passam para essa pessoa?</label>
      ${abertas.length ? '' : `<p class="peq apagado">${primeiroM} não tem sessões em aberto.</p>`}
      <div style="display:grid;gap:8px;margin-top:6px">
        ${opcoes.map(([k, rot]) => `<label class="check"><input type="radio" name="tm-quais" value="${k}"${k === padrao ? ' checked' : ''}> <span>${esc(rot)}</span></label>`).join('')}
      </div>
      <div id="tm-lista" hidden><div style="display:grid;gap:6px;margin:10px 0 0 28px">
        ${abertas.map((s) => `<label class="check"><input type="checkbox" data-sessao="${s.id}"${alvo && s.id === alvo.id ? ' checked' : ''}>
          <span>Sessão ${s.numero} · ${esc(quandoTxt(s))} <span class="apagado">· hoje com ${esc(nomeDe(s.mentor_id))}</span></span></label>`).join('')}
      </div></div></div>
    <div id="tm-antes" class="campo mt"></div>
    <p id="tm-nota" class="peq apagado mt"></p>
    <div id="tm-erro" class="mt"></div>
    <div class="linha mt"><button class="btn pri" id="tm-salvar" type="button">Salvar</button></div>
    <div id="tm-depois" class="mt"></div>`, { largura: 620, aoFechar: () => { if (mudou) aoSalvar(); } });
  const f = j.corpo;
  let mudou = false;

  const escolhido = () => f.querySelector('#tm-quem').value;
  const quais = () => (f.querySelector('[name="tm-quais"]:checked') || {}).value;
  const idsEscolhidos = () => {
    const q = quais();
    if (q === 'uma') return [alvo.id];
    if (q === 'seguintes') return seguintes.map((s) => s.id);
    if (q === 'escolher') return [...f.querySelectorAll('[data-sessao]:checked')].map((c) => c.dataset.sessao);
    return [];
  };

  // quem já acompanha: continua (padrão) ou sai deste mentorado
  const desenharAntes = () => {
    const novo = escolhido();
    const outros = vinculos.filter((v) => v.mentor_id !== novo);
    const caixa = f.querySelector('#tm-antes');
    caixa.innerHTML = novo && outros.length ? `<label>E quem já acompanha ${nomeM}?</label>
      <div style="display:grid;gap:8px;margin-top:6px">${outros.map((v) => `<label class="check"><input type="checkbox" data-fica="${v.mentor_id}" checked>
        <span>${esc(nomeDe(v.mentor_id))} continua acompanhando (vê a ficha e as sessões)</span></label>`).join('')}</div>
      <small>Desmarque para tirar a pessoa deste mentorado: ela deixa de ver a ficha. As sessões já feitas continuam com o nome de quem atendeu.</small>` : '';
    const ja = vinculos.some((v) => v.mentor_id === novo);
    f.querySelector('#tm-nota').innerHTML = novo && !ja
      ? `${esc(primeiro(nomeDe(novo)))} passa a ver a ficha de ${primeiroM}, o histórico das sessões e as anotações internas, como quem já acompanha.` : '';
  };
  f.querySelector('#tm-quem').addEventListener('input', () => { desenharAntes(); f.querySelector('#tm-erro').innerHTML = ''; });
  f.querySelectorAll('[name="tm-quais"]').forEach((r) => r.addEventListener('input', () => {
    f.querySelector('#tm-lista').hidden = quais() !== 'escolher';
    f.querySelector('#tm-erro').innerHTML = '';
  }));
  desenharAntes();

  const erro = (msg) => { f.querySelector('#tm-erro').innerHTML = `<div class="aviso erro">${msg}</div>`; };

  f.querySelector('#tm-salvar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    f.querySelector('#tm-erro').innerHTML = '';
    const novoId = escolhido();
    if (!novoId) { erro('Escolha quem vai atender.'); return; }
    const ids = idsEscolhidos();
    if (quais() === 'escolher' && !ids.length) { erro('Marque pelo menos uma sessão, ou escolha "Nenhuma sessão".'); return; }
    const jaLigado = vinculos.some((v) => v.mentor_id === novoId);
    const muda = abertas.filter((s) => ids.includes(s.id) && s.mentor_id !== novoId);
    const saem = [...f.querySelectorAll('[data-fica]')].filter((c) => !c.checked).map((c) => c.dataset.fica);
    // quem sai não pode ficar com sessão em aberto (ninguém mais veria a sessão na agenda)
    for (const x of saem) {
      const resta = abertas.filter((s) => s.mentor_id === x && !ids.includes(s.id));
      if (resta.length) {
        erro(`${esc(nomeDe(x))} ainda fica com ${resta.length === 1 ? `a sessão ${resta[0].numero}` : `as sessões ${resta.map((s) => s.numero).join(', ')}`} em aberto com ${nomeM}.
          Passe ${resta.length === 1 ? 'essa sessão' : 'essas sessões'} também (opção "Escolher as sessões"), ou deixe a caixa de ${esc(primeiro(nomeDe(x)))} marcada.`);
        return;
      }
    }
    if (jaLigado && !muda.length && !saem.length) { erro(`Nada para mudar: ${esc(nomeDe(novoId))} já acompanha ${nomeM}${ids.length ? ' e já é quem atende essas sessões' : ''}.`); return; }

    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      // 1. inclui a pessoa no mentorado (é isso que libera a ficha e as sessões para ela)
      if (!jaLigado) {
        const saindo = vinculos.filter((v) => saem.includes(v.mentor_id));
        const ordem = saindo.length === 1 ? saindo[0].ordem : Math.max(0, ...vinculos.map((v) => v.ordem || 0)) + 1;
        const { error: e } = await sb.from('mentor_mentorado').insert({ mentorado_id: m.id, mentor_id: novoId, ordem });
        if (e && e.code !== '23505') throw e; // 23505: já estava ligada (outra tela salvou antes)
        mudou = true;
      }
      // 2. passa as sessões escolhidas (põe na agenda de quem atende)
      if (muda.length) {
        const { data: feitas, error: e } = await sb.from('sessoes').update({ mentor_id: novoId }).in('id', muda.map((s) => s.id)).select('id');
        if (e) throw e;
        mudou = true;
        if ((feitas || []).length !== muda.length) throw new Error(`Só ${(feitas || []).length} de ${muda.length} sessões mudaram. Atualize a página e confira o plano de sessões.`);
      }
      // 3. tira quem a administração desmarcou
      for (const x of saem) {
        const { error: e } = await sb.from('mentor_mentorado').delete().eq('mentorado_id', m.id).eq('mentor_id', x);
        if (e) throw e;
        mudou = true;
      }
    } catch (e) {
      erro(esc(explicarErro(e)));
      btn.disabled = false; btn.textContent = 'Salvar';
      return;
    }
    limparCache();
    avisarGoogle(); // com os convites automáticos ligados, o convite da sessão troca de convidado sozinho
    btn.textContent = 'Salvo';
    f.querySelectorAll('select, input').forEach((c) => { c.disabled = true; });
    depois({ novo: pessoas.get(novoId), muda, saem });
  });

  // ---------- depois de salvar: o que mudou e os avisos pelo WhatsApp ----------
  async function depois({ novo, muda, saem }) {
    const nomeNovo = primeiro(novo.nome);
    const eu = primeiro(ctx.perfil.nome);
    const onde = m.programa ? ` (${[m.programa.empresa && m.programa.empresa.nome, m.programa.nome].filter(Boolean).join(' · ')})` : '';
    const lista = (ss) => ss.map((s) => `• Sessão ${s.numero}: ${quandoTxt(s)}`).join('\n');
    const sala = String(m.sala_meet || '').trim();
    const linkFicha = `${location.origin}/app.html#/mentorado/${m.id}`;

    const oQue = muda.length === 1 ? `Você vai atender ${m.nome}${onde} na sessão ${muda[0].numero}: ${quandoTxt(muda[0])}.`
      : muda.length ? `Você passa a atender ${m.nome}${onde} nestas sessões:\n${lista(muda)}`
        : `Você passa a acompanhar ${m.nome}${onde} junto com a equipe.`;
    const meet = sala ? `\n\nSala do Google Meet de ${primeiro(m.nome)}:\n${sala}` : '';
    const txtNovo = `Olá, ${nomeNovo}! Aqui é ${eu}, da Mentorei. ${oQue}${meet}\n\nA ficha de ${primeiro(m.nome)}, com o histórico das sessões anteriores, já está na sua área da plataforma:\n${linkFicha}`;

    const txtMentorado = muda.length === 1
      ? `Olá, ${primeiro(m.nome)}! Aqui é ${eu}, da Mentorei. A sua sessão ${muda[0].numero} de mentoria (${quandoTxt(muda[0])}) vai ser com ${novo.nome}. O horário${sala ? ' e a sala do Google Meet continuam os mesmos' : ' continua o mesmo'}.\n\nQualquer dúvida, é só responder aqui.`
      : `Olá, ${primeiro(m.nome)}! Aqui é ${eu}, da Mentorei. A partir da sessão ${muda[0] ? muda[0].numero : ''}, as suas sessões de mentoria vão ser com ${novo.nome}:\n${lista(muda)}\n\nOs dias, os horários${sala ? ' e a sala do Google Meet' : ''} continuam os mesmos.\n\nQualquer dúvida, é só responder aqui.`;

    // quem atendia as sessões que mudaram (ou saiu do mentorado) também recebe um aviso
    const antigos = [...new Set([...muda.map((s) => s.mentor_id), ...saem].filter((x) => x && x !== novo.id))].map((id) => pessoas.get(id)).filter(Boolean);
    const txtAntigo = (x) => {
      const delas = muda.filter((s) => s.mentor_id === x.id);
      const parte = delas.length === 1 ? `A sessão ${delas[0].numero} de ${m.nome} (${quandoTxt(delas[0])}) passou para ${novo.nome}.`
        : delas.length ? `Estas sessões de ${m.nome} passaram para ${novo.nome}:\n${lista(delas)}` : '';
      const saiu = saem.includes(x.id) ? `${parte ? '\n\n' : ''}A partir de agora, quem acompanha ${m.nome} é ${novo.nome}.` : '';
      return `Olá, ${primeiro(x.nome)}! Aqui é ${eu}, da Mentorei. ${parte}${saiu}`;
    };

    const naAgenda = muda.length === 1 ? `a sessão ${muda[0].numero} na própria agenda` : muda.length ? `as ${muda.length} sessões na própria agenda` : '';
    const area = f.querySelector('#tm-depois');
    area.innerHTML = `<div class="aviso ok"><b>Pronto!</b> ${esc(novo.nome)} já vê ${nomeM} em "Meus mentorados"${naAgenda ? ` e ${naAgenda}` : ''}.
        Se ${esc(nomeNovo)} estiver com a plataforma aberta, é só atualizar a página (tecla F5).
        ${muda.length ? 'Se os convites automáticos da Google Agenda estiverem ligados, o convite troca de convidado sozinho.' : ''}
        ${novo.termo_aceito_em ? '' : `<br><b>${esc(nomeNovo)} ainda não entrou na plataforma:</b> o aviso abaixo já leva o link para criar a senha.`}</div>
      <p class="peq mt"><b>Agora avise pelo WhatsApp:</b></p>
      <div class="linha mt">
        <button class="btn pri" type="button" id="tm-w-novo">Avisar ${esc(nomeNovo)}</button>
        ${muda.length ? `<button class="btn pri" type="button" id="tm-w-mentorado">Avisar ${primeiroM}</button>` : ''}
        ${antigos.map((x, k) => `<button class="btn" type="button" data-w-antigo="${k}">Avisar ${esc(primeiro(x.nome))}</button>`).join('')}
      </div>`;
    const { janelaWhatsApp, conviteWhatsApp } = await import('./equipe.js');
    area.querySelector('#tm-w-novo').addEventListener('click', async (e) => {
      if (novo.termo_aceito_em) { janelaWhatsApp({ titulo: `Aviso · ${novo.nome}`, whatsapp: novo.whatsapp || '', texto: txtNovo }); return; }
      const b = e.currentTarget; b.disabled = true; // ainda sem senha: gera o link de acesso junto (nenhum e-mail sai)
      await conviteWhatsApp({ email: novo.email, nome: novo.nome, papel: novo.papel, tambem_mentor: novo.tambem_mentor, whatsapp: novo.whatsapp || '',
        remetente: ctx.perfil.nome, contexto: `${oQue}${meet}` });
      b.disabled = false;
    });
    area.querySelector('#tm-w-mentorado')?.addEventListener('click', () => janelaWhatsApp({ titulo: `Aviso · ${m.nome}`,
      whatsapp: (m.perfil && m.perfil.whatsapp) || m.whatsapp || '', texto: txtMentorado }));
    area.querySelectorAll('[data-w-antigo]').forEach((b) => b.addEventListener('click', () => {
      const x = antigos[Number(b.dataset.wAntigo)];
      janelaWhatsApp({ titulo: `Aviso · ${x.nome}`, whatsapp: x.whatsapp || '', texto: txtAntigo(x) });
    }));
  }
}
