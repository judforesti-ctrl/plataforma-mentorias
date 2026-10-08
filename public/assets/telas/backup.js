// Cartão "Cópias de segurança" do Painel: situação da cópia semanal (Drive) e mensal (e-mail), baixar a planilha agora,
// fazer uma cópia para o Drive agora e escolher quem recebe a cópia mensal.
import { sb, esc, avisar, dataHoraBR } from '../base.js';

async function chamar(corpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session ? session.access_token : ''}` }, body: JSON.stringify(corpo) });
  return r;
}
const api = (corpo) => chamar(corpo).then((r) => r.json().then((j) => ({ ok: r.ok, ...j }))).catch(() => ({ ok: false, mensagem: 'Sem conexão com o servidor da plataforma.' }));

function textoUltimo(u, rotulo) {
  if (!u) return `<span class="selo neutro">${rotulo}: ainda não foi feita</span>`;
  const quando = dataHoraBR(u.em);
  if (u.ok) return `<span class="selo">${rotulo}: ${quando}</span> <span class="peq apagado">${u.linhas || 0} registros${u.email && u.email.ok ? ` · e-mail enviado para ${esc(u.email.para.join(', '))}` : ''}${u.drive && u.drive.link ? ` · <a href="${esc(u.drive.link)}" target="_blank" rel="noopener">ver no Drive</a>` : ''}</span>`;
  const motivo = u.erro || (u.drive && u.drive.erro) || (u.email && u.email.erro) || 'não deu certo';
  return `<span class="selo erro">${rotulo}: falhou em ${quando}</span> <span class="peq" style="color:var(--erro)">${esc(motivo)}</span>`;
}

export async function cartaoBackup(ctx, box) {
  const st = await api({ acao: 'status' });
  if (!st.ok) { box.innerHTML = `<h3>Cópias de segurança</h3><p class="peq mt" style="color:var(--erro)">${esc(st.mensagem || 'Não consegui conferir agora.')}</p>`; return; }
  const semDrive = !st.google.conectado || !st.google.drive;
  box.innerHTML = `<div class="linha"><div style="flex:1"><h3>Cópias de segurança</h3>
      <p class="peq apagado">Toda segunda-feira a plataforma gera uma planilha Excel com tudo e guarda na pasta <b>${esc(st.pasta_nome)}</b> do Google Drive
        (cópias dos últimos 6 meses). Todo dia 1, a mesma planilha vai por e-mail para as sócias. A restauração completa fica no computador da Juliana.</p></div>
      <div class="linha"><button class="btn pri" type="button" id="bk-baixar">Baixar planilha agora</button><button class="btn" type="button" id="bk-agora">Copiar para o Drive agora</button></div></div>
    ${semDrive ? `<div class="aviso erro mt"><b>${!st.google.conectado ? 'A Google Agenda não está conectada.' : 'Falta a permissão de Drive.'}</b> Para a cópia semanal ir para o Drive,
      clique em <b>${st.google.conectado ? 'Trocar conta' : 'Conectar Google Agenda'}</b> no cartão acima, entre com a conta ${esc(st.google.email || 'do Google')} e aceite a permissão
      "Ver e gerenciar arquivos do Google Drive criados por este app".</div>` : ''}
    <div class="linha mt" style="gap:8px 18px">${textoUltimo(st.ultimo, 'Última cópia')}</div>
    <div class="linha mt" style="gap:8px 18px">${textoUltimo(st.ultimo_mensal, 'Última cópia mensal por e-mail')}</div>
    ${st.pasta_link ? `<p class="peq mt"><a href="${esc(st.pasta_link)}" target="_blank" rel="noopener">Abrir a pasta de cópias no Google Drive</a></p>` : ''}
    <div class="campo mt"><label for="bk-emails">Quem recebe a cópia mensal (e-mails separados por vírgula)</label>
      <div class="linha"><input type="text" id="bk-emails" value="${esc(st.emails.join(', '))}" style="flex:1;min-width:240px"><button class="btn peq" type="button" id="bk-salvar">Salvar</button></div>
      <small>${st.emails_personalizados ? 'Lista escolhida por vocês.' : 'Sem lista escolhida, vai para a administração.'} A planilha contém dados de mentorados: mande só para quem precisa.</small></div>`;
  box.querySelector('#bk-baixar').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Montando a planilha…';
    try {
      const r = await chamar({ acao: 'baixar' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); avisar(j.mensagem || 'Não consegui montar a planilha.', true); return; }
      const nome = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = nome ? nome[1] : 'Mentorei-backup.xlsx'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      avisar('Planilha pronta: confira a pasta Downloads.');
    } finally { b.disabled = false; b.textContent = 'Baixar planilha agora'; }
  });
  box.querySelector('#bk-agora').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const r = await api({ acao: 'agora' });
    if (!r.ok) { avisar(r.mensagem || 'Não consegui pedir a cópia.', true); b.disabled = false; return; }
    avisar('Cópia pedida. Em 1 ou 2 minutos ela aparece aqui e na pasta do Drive.');
    setTimeout(() => cartaoBackup(ctx, box), 90000);
  });
  box.querySelector('#bk-salvar').addEventListener('click', async () => {
    const emails = box.querySelector('#bk-emails').value.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const r = await api({ acao: 'emails', emails });
    if (!r.ok) { avisar(r.mensagem || 'Não consegui salvar.', true); return; }
    avisar(`A cópia mensal vai para: ${r.emails.join(', ')}.`);
    cartaoBackup(ctx, box);
  });
}
