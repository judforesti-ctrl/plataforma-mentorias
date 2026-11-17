// Mais de um mentor na mesma sessão individual (script 83; pedido da Juliana, 17/11/2026: "às vezes atendemos dois mentores
// na mesma sessão com o mentorado; faça como nas turmas, que dá para flegar os mentores").
// sessoes.mentor_id = o principal (o primeiro marcado); sessoes.outros_mentores = quem atende junto. Só a administração marca.
// Marcar alguém que ainda não acompanha o mentorado: o próprio banco já liga a pessoa ao mentorado (vê a ficha e as sessões).
// Usado na tela da sessão (cartão "Quem atende esta sessão") e no plano de sessões da ficha (✎ de cada sessão).
import { sb, esc, avisar, explicarErro, hojeISO, mesmoDia } from '../base.js';
import { mentoresDaSessao, juntarNomes } from '../agenda-regras.js';

export { mentoresDaSessao, juntarNomes };

const primeiro = (n) => String(n || '').trim().split(/\s+/)[0];
const SEL_EQUIPE = 'id, nome, foto_url, email, whatsapp, papel, tambem_mentor, termo_aceito_em';

// A equipe que atende (a mesma lista do "Trocar ou incluir mentor") e quem já está na sessão mesmo que tenha saído da equipe.
export async function equipeDaSessao(s) {
  const { data, error } = await sb.from('perfis').select(SEL_EQUIPE).or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome');
  if (error) throw error;
  const lista = data || [];
  const faltam = mentoresDaSessao(s).filter((id) => !lista.some((x) => x.id === id));
  if (faltam.length) {
    const r = await sb.from('perfis').select(SEL_EQUIPE).in('id', faltam);
    if (!r.error) lista.push(...(r.data || []));
  }
  return lista;
}

// Nova escolha a partir das caixinhas marcadas (na ordem em que foram marcadas): o principal continua se ainda estiver
// marcado; senão, passa a ser o primeiro marcado. Nenhum marcado = null (a sessão precisa de alguém).
export function escolhaDasCaixas(s, marcados) {
  const ids = [...new Set((marcados || []).filter(Boolean))];
  if (!ids.length) return null;
  const principal = s.mentor_id && ids.includes(s.mentor_id) ? s.mentor_id : ids[0];
  return { mentor_id: principal, outros_mentores: ids.filter((x) => x !== principal) };
}

// As caixinhas, como em "Mentor(es) do módulo" na turma.
export function htmlMentoresSessao(equipe, s) {
  const marcados = new Set(mentoresDaSessao(s));
  return `<div class="chips mt" data-ms-caixas>${(equipe || []).map((x) => `<label class="check" style="margin-right:12px"><input type="checkbox" value="${esc(x.id)}"${marcados.has(x.id) ? ' checked' : ''}><span>${esc(x.nome)}</span></label>`).join('')}</div>
    <div data-ms-choques class="mt"></div>
    <div data-ms-depois class="mt"></div>`;
}

const quando = (iso) => {
  if (!iso) return 'sem data ainda';
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${mesmoDia(iso, hojeISO()) ? 'hoje, ' : ''}${dia} às ${hora}`;
};

// Liga as caixinhas: cada clique grava na hora (como no módulo da turma), confere a agenda de quem foi marcado e
// oferece o aviso pelo WhatsApp para quem entrou. s = sessão (id, numero, data_hora, duracao_min, situacao, concluida_em,
// mentor_id, outros_mentores); mentorado = { id, nome, sala_meet?, programa? }.
export function ligarMentoresSessao(ctx, raiz, s, mentorado, equipe, { aoMudar = () => {} } = {}) {
  const caixas = raiz.querySelector('[data-ms-caixas]');
  if (!caixas) return;
  const pessoa = (id) => (equipe || []).find((x) => x.id === id) || { id, nome: 'Mentor' };
  const futura = () => s.data_hora && !s.concluida_em && s.situacao !== 'cancelada' && Date.parse(s.data_hora) > Date.now() - 3 * 3600000;

  const conferirAgenda = async () => {
    const box = raiz.querySelector('[data-ms-choques]');
    if (!box) return;
    const ids = mentoresDaSessao(s);
    if (!futura() || ids.length < 2) { box.innerHTML = ''; return; }
    const { verificarChoques, limparCache } = await import('./agenda-dados.js');
    limparCache();
    const lista = await verificarChoques(ctx, { mentorIds: ids, inicio: s.data_hora, duracaoMin: Number(s.duracao_min) || 60, ignorar: s.id });
    box.innerHTML = lista.length ? `<div class="aviso"><b>Atenção na agenda:</b><ul class="peq">${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
      : '<p class="peq" style="color:var(--verde-esc)">✓ Sem choques na agenda dos mentores.</p>';
  };
  conferirAgenda();

  caixas.addEventListener('change', async (ev) => {
    const c = ev.target.closest('input[type=checkbox]');
    if (!c) return;
    const antes = mentoresDaSessao(s);
    const marcados = [...caixas.querySelectorAll('input:checked')].map((x) => x.value);
    // quem já estava mantém o lugar; quem acabou de ser marcado entra no fim
    const ordem = [...antes.filter((x) => marcados.includes(x)), ...marcados.filter((x) => !antes.includes(x))];
    const nova = escolhaDasCaixas(s, ordem);
    if (!nova) {
      c.checked = true;
      avisar('A sessão precisa de pelo menos um mentor. Marque primeiro quem vai atender e depois desmarque.', true);
      return;
    }
    caixas.querySelectorAll('input').forEach((x) => { x.disabled = true; });
    const { data: feita, error } = await sb.from('sessoes').update(nova).eq('id', s.id).select('id, mentor_id, outros_mentores').maybeSingle();
    caixas.querySelectorAll('input').forEach((x) => { x.disabled = false; });
    if (error || !feita) {
      c.checked = !c.checked;
      avisar(error ? explicarErro(error) : 'Não foi possível mudar os mentores desta sessão. Atualize a página e tente de novo.', true);
      return;
    }
    Object.assign(s, { mentor_id: feita.mentor_id, outros_mentores: feita.outros_mentores || [] });
    const x = pessoa(c.value);
    const depois = raiz.querySelector('[data-ms-depois]');
    if (c.checked) {
      avisar(`${primeiro(x.nome)} também atende esta sessão.`);
      if (depois) mostrarAviso(ctx, depois, { quem: x, s, mentorado, equipe });
    } else {
      avisar(`${primeiro(x.nome)} saiu desta sessão.`);
      if (depois) depois.innerHTML = '';
    }
    import('./agenda-dados.js').then(({ avisarGoogle, limparCache }) => { limparCache(); avisarGoogle(); });
    conferirAgenda();
    aoMudar(s);
  });
}

// Depois de incluir alguém: o que acontece e o aviso pelo WhatsApp (nada sai sozinho).
function mostrarAviso(ctx, area, { quem, s, mentorado, equipe }) {
  if (quem.id === ctx.perfil.id) {   // a própria pessoa se marcou: não há quem avisar
    area.innerHTML = `<div class="aviso ok"><b>Pronto!</b> Esta sessão já está na sua agenda. Se os convites automáticos da Google Agenda estiverem ligados, o convite chega para cada mentor marcado.</div>`;
    return;
  }
  const nomeQ = primeiro(quem.nome), nomeM = primeiro(mentorado.nome);
  const outros = mentoresDaSessao(s).filter((id) => id !== quem.id && id !== ctx.perfil.id)
    .map((id) => ((equipe || []).find((y) => y.id === id) || {}).nome).filter(Boolean).map(primeiro);
  const eu = primeiro(ctx.perfil.nome);
  const comQuem = mentoresDaSessao(s).includes(ctx.perfil.id) ? `comigo${outros.length ? ` e com ${juntarNomes(outros)}` : ''}`
    : outros.length ? `com ${juntarNomes(outros)}` : 'junto';
  const p = mentorado.programa;
  const onde = p ? ` (${[p.empresa && p.empresa.nome, p.nome].filter(Boolean).join(' · ')})` : '';
  const sala = String(mentorado.sala_meet || '').trim();
  const contexto = `Você vai atender ${comQuem} a sessão ${s.numero} de ${mentorado.nome}${onde}: ${quando(s.data_hora)}.${sala ? `\n\nSala do Google Meet de ${nomeM}:\n${sala}` : ''}`;
  const texto = `Olá, ${nomeQ}! Aqui é ${eu}, da Mentorei. ${contexto}\n\nA ficha de ${nomeM}, com o histórico das sessões, já está na sua área da plataforma:\n${location.origin}/app.html#/mentorado/${mentorado.id}`;
  area.innerHTML = `<div class="aviso ok"><b>Pronto!</b> ${esc(quem.nome)} já vê ${esc(mentorado.nome)} em "Meus mentorados" e esta sessão na própria agenda.
      Se os convites automáticos da Google Agenda estiverem ligados, o convite chega para cada mentor marcado.
      ${quem.termo_aceito_em ? '' : `<br><b>${esc(nomeQ)} ainda não entrou na plataforma:</b> o aviso já leva o link para criar a senha.`}</div>
    <div class="linha mt"><button class="btn peq pri" type="button" data-ms-whats>Avisar ${esc(nomeQ)} pelo WhatsApp</button></div>`;
  area.querySelector('[data-ms-whats]').addEventListener('click', async (e) => {
    const { janelaWhatsApp, conviteWhatsApp } = await import('./equipe.js');
    if (quem.termo_aceito_em) { janelaWhatsApp({ titulo: `Aviso · ${quem.nome}`, whatsapp: quem.whatsapp || '', texto }); return; }
    const b = e.currentTarget; b.disabled = true;   // ainda sem senha: gera o link de acesso junto (nenhum e-mail sai)
    await conviteWhatsApp({ email: quem.email, nome: quem.nome, papel: quem.papel, tambem_mentor: quem.tambem_mentor, whatsapp: quem.whatsapp || '',
      remetente: ctx.perfil.nome, contexto, tutorial: true });
    b.disabled = false;
  });
}

// Janela pequena (ficha → plano de sessões → ✎): as mesmas caixinhas para uma sessão.
export async function abrirMentoresSessao(ctx, sessaoId, { aoSalvar = () => {} } = {}) {
  if (!ctx.ehAdmin) { avisar('Só a administração escolhe os mentores da sessão.', true); return; }
  const { data: s, error } = await sb.from('sessoes').select(`id, numero, data_hora, duracao_min, situacao, concluida_em, mentor_id, outros_mentores,
    mentorado:mentorados(id, nome, sala_meet, programa:programas(nome, empresa:empresas(nome)))`).eq('id', sessaoId).maybeSingle();
  if (error || !s) { avisar(error ? explicarErro(error) : 'Sessão não encontrada.', true); return; }
  let equipe;
  try { equipe = await equipeDaSessao(s); } catch (e) { avisar(explicarErro(e), true); return; }
  const { janela } = await import('./agenda-dados.js');
  let mudou = false;
  const aberta = !s.concluida_em && s.situacao !== 'cancelada';
  const j = janela(`Quem atende a sessão ${s.numero} de ${s.mentorado.nome}`, `
    <p class="peq apagado">${esc(quando(s.data_hora))}. Marque quem atende. Quando dois mentores atendem juntos, marque os dois: a sessão entra na agenda de cada um${s.situacao === 'realizada' ? ' e conta no extrato de cada um' : ''}.</p>
    ${htmlMentoresSessao(equipe, s)}
    ${aberta ? `<p class="peq apagado mt2">Para passar esta e as próximas sessões para outra pessoa, com os avisos prontos:
      <button class="btn peq" type="button" data-ms-trocar>Trocar mentor</button></p>` : ''}`, { largura: 620, aoFechar: () => { if (mudou) aoSalvar(); } });
  ligarMentoresSessao(ctx, j.corpo, s, s.mentorado, equipe, { aoMudar: () => { mudou = true; } });
  j.corpo.querySelector('[data-ms-trocar]')?.addEventListener('click', async () => {
    j.fechar();
    const { abrirTrocarMentor } = await import('./trocar-mentor.js');
    abrirTrocarMentor(ctx, s.mentorado.id, { sessaoId: s.id, aoSalvar });
  });
}
