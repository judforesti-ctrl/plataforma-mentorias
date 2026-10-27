// Suspender o programa de mentoria de um mentorado (pedido da Juliana, 2026-10-27: mentorado desligado da empresa).
// Só a administração. A janela mostra o que vai acontecer e só libera o botão com o motivo escrito e a caixa de confirmação
// marcada. O trabalho todo é feito de uma vez no banco (rpc suspender_programa, script 45): cancela as sessões que ainda
// não aconteceram, tira os mentores do mentorado e marca "suspenso", guardando quem clicou, quando e por quê.
// Nada é apagado. Depois a Google Agenda é sincronizada (os convites das sessões canceladas saem; os recorrentes ficam).
import { sb, esc, avisar, explicarErro, dataHoraBR } from '../base.js';
import { janela, limparCache, avisarGoogle } from './agenda-dados.js';

const vaiCancelar = (s) => !s.concluida_em && ['agendada', 'remarcada'].includes(s.situacao)
  && (!s.data_hora || Date.parse(s.data_hora) >= Date.now());
const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : xs.join(''));

export function abrirSuspender(ctx, m, { sessoes = [], mentores = [], aoSalvar = () => {} } = {}) {
  if (!ctx.ehAdmin) { avisar('Só a administração suspende um programa de mentoria.', true); return; }
  const canceladas = sessoes.filter(vaiCancelar);
  const primeiro = esc(String(m.nome || '').split(' ')[0]);
  const j = janela(`Suspender o programa de ${m.nome}`, `
    <div class="aviso erro"><b>O que acontece ao suspender:</b>
      <ul style="margin:8px 0 0 18px;padding:0">
        <li>${canceladas.length ? `${canceladas.length === 1 ? 'A sessão que ainda não aconteceu é cancelada' : `As ${canceladas.length} sessões que ainda não aconteceram são canceladas`} e os horários ficam livres na agenda (e na Google Agenda).` : 'Não há sessões futuras para cancelar.'}</li>
        <li>${mentores.length ? `${lista(mentores.map((x) => `<b>${esc(x.nome)}</b>`))} ${mentores.length > 1 ? 'deixam' : 'deixa'} de acompanhar ${primeiro} e ${mentores.length > 1 ? 'ficam livres' : 'fica livre'}.` : 'Não há mentores ligados a este mentorado.'}</li>
        <li>Nada é apagado: a ficha, as sessões feitas, as anotações e os resultados continuam guardados para a administração.</li>
        <li>Fica registrado que <b>${esc(ctx.perfil.nome)}</b> suspendeu, com a data, a hora e o motivo.</li>
      </ul></div>
    ${canceladas.length ? `<p class="peq apagado mt">Sessões que serão canceladas: ${canceladas.map((s) => `${s.numero} (${s.data_hora ? dataHoraBR(s.data_hora) : 'sem data'})`).join(', ')}.</p>` : ''}
    <div class="campo mt"><label for="sp-motivo">Motivo da suspensão</label>
      <textarea id="sp-motivo" style="min-height:70px" placeholder="Ex.: desligado da empresa em 27/10/2026"></textarea></div>
    <label class="check mt"><input type="checkbox" id="sp-ok"> <span>Confirmo que quero suspender o programa de mentoria de <b>${esc(m.nome)}</b>.</span></label>
    <div class="linha mt" style="justify-content:flex-end;gap:8px">
      <button class="btn" type="button" data-fechar>Voltar sem suspender</button>
      <button class="btn pri" type="button" id="sp-sim" disabled style="background:var(--erro);border-color:var(--erro);color:#fff">Suspender o programa</button>
    </div>`, { largura: 620 });

  const motivo = j.corpo.querySelector('#sp-motivo'), ok = j.corpo.querySelector('#sp-ok'), sim = j.corpo.querySelector('#sp-sim');
  const conferir = () => { sim.disabled = !(ok.checked && motivo.value.trim()); };
  motivo.addEventListener('input', conferir); ok.addEventListener('change', conferir);
  motivo.focus();

  sim.addEventListener('click', async () => {
    sim.disabled = true; sim.textContent = 'Suspendendo…';
    const { data, error } = await sb.rpc('suspender_programa', { p_mentorado: m.id, p_motivo: motivo.value.trim() });
    if (error) {
      const falta = /suspender_programa|PGRST202|Could not find the function/i.test(`${error.code} ${error.message}`);
      avisar(falta ? 'Falta rodar o script 45-suspender-programa.sql no Supabase. Nada foi mudado.' : explicarErro(error), true);
      sim.textContent = 'Suspender o programa'; conferir();
      return;
    }
    const n = (data && data.sessoes) || 0;
    avisar(`Programa suspenso. ${n ? `${n} ${n === 1 ? 'sessão cancelada' : 'sessões canceladas'} e horários liberados. ` : ''}Mentores liberados.`);
    limparCache(); avisarGoogle();
    j.fechar(); aoSalvar();
  });
}
