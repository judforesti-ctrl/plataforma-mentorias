// Lembretes: sessões de hoje, sessões que já passaram sem registro, tarefas atrasadas e mentorados sem próxima sessão marcada.
// Usado no Painel (administração, tudo) e em Meus mentorados (só os do mentor).
import { sb, esc, diaMes, horaBR, hojeISO, mesmoDia } from '../base.js';

const MAX = 8;
const lista = (itens) => `${itens.slice(0, MAX).join('')}${itens.length > MAX ? `<p class="peq apagado">e mais ${itens.length - MAX}.</p>` : ''}`;

export async function pendencias(el, { mentoradoIds = null, mostrarMentor = true } = {}) {
  let q = sb.from('sessoes').select(`id, numero, data_hora, situacao, concluida_em, tarefa, tarefa_prazo, tarefa_feita_em,
    mentorado:mentorados(id, nome, status), mentor:perfis!sessoes_mentor_id_fkey(nome)`);
  if (mentoradoIds) q = q.in('mentorado_id', mentoradoIds);
  const { data, error } = await q;
  if (error) { el.innerHTML = ''; return; }
  const sess = (data || []).filter((s) => s.mentorado && s.mentorado.status === 'ativo');
  const agora = Date.now(), hoje = hojeISO();
  const quem = (s) => `${esc(s.mentorado.nome)} · sessão ${s.numero}${mostrarMentor && s.mentor ? ` · ${esc(s.mentor.nome)}` : ''}`;

  const deHoje = sess.filter((s) => !s.concluida_em && mesmoDia(s.data_hora, hoje))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    .map((s) => `<a class="pend" href="#/sessao/${s.id}"><b>${horaBR(s.data_hora)}</b><span>${quem(s)}</span></a>`);
  const semRegistro = sess.filter((s) => !s.concluida_em && s.data_hora && new Date(s.data_hora).getTime() < agora - 3 * 3600 * 1000 && !mesmoDia(s.data_hora, hoje))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    .map((s) => `<a class="pend" href="#/sessao/${s.id}"><b>${diaMes(s.data_hora)}</b><span>${quem(s)}</span></a>`);
  const atrasadas = sess.filter((s) => s.concluida_em && s.tarefa && !s.tarefa_feita_em && s.tarefa_prazo && s.tarefa_prazo < hoje)
    .sort((a, b) => a.tarefa_prazo.localeCompare(b.tarefa_prazo))
    .map((s) => `<a class="pend" href="#/mentorado/${s.mentorado.id}"><b>${diaMes(`${s.tarefa_prazo}T12:00:00-03:00`)}</b><span>${esc(s.mentorado.nome)} · ${esc(s.tarefa.length > 60 ? `${s.tarefa.slice(0, 60)}…` : s.tarefa)}</span></a>`);
  const porMentorado = new Map();
  sess.forEach((s) => { if (!porMentorado.has(s.mentorado.id)) porMentorado.set(s.mentorado.id, []); porMentorado.get(s.mentorado.id).push(s); });
  const semProxima = [...porMentorado.values()].filter((ss) => {
    const abertas = ss.filter((s) => !s.concluida_em);
    return abertas.length && !abertas.some((s) => s.data_hora && new Date(s.data_hora).getTime() > agora);
  }).map((ss) => { const n = ss.filter((s) => !s.concluida_em).length; return `<a class="pend" href="#/mentorado/${ss[0].mentorado.id}"><b>${n}</b><span>${esc(ss[0].mentorado.nome)} · ${n === 1 ? 'falta 1 sessão' : `faltam ${n} sessões`}</span></a>`; });

  if (!deHoje.length && !semRegistro.length && !atrasadas.length && !semProxima.length) {
    el.innerHTML = '<div class="aviso ok">Nada pendente: nenhuma sessão hoje, nenhuma sessão sem registro e nenhuma tarefa atrasada.</div>';
    return;
  }
  const bloco = (titulo, dica, itens, cls = '') => (itens.length ? `<div class="cartao pend-bloco ${cls}"><h3>${titulo} <span class="selo ${cls === 'urgente' ? 'erro' : 'neutro'}">${itens.length}</span></h3>
    <p class="peq apagado">${dica}</p><div class="lista mt">${lista(itens)}</div></div>` : '');
  el.innerHTML = `<div class="grade g2">
    ${bloco('Sessões de hoje', 'Clique para abrir a tela da sessão.', deHoje)}
    ${bloco('Sessões sem registro', 'Já passaram e não foram concluídas. Registre o que aconteceu ou marque a falta.', semRegistro, 'urgente')}
    ${bloco('Tarefas atrasadas', 'O mentorado ainda não marcou como feita.', atrasadas)}
    ${bloco('Sem próxima sessão marcada', 'Ainda há sessões no programa, mas nenhuma com data futura.', semProxima)}
  </div>`;
}
