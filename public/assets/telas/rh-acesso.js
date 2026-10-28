// "Acesso do RH" de uma empresa cliente (script 49), aberto em Painel → Empresas e programas. Só administração.
// Cadastra quem do RH acompanha a empresa (nome, e-mail, cargo), manda o convite por e-mail ou WhatsApp quando ela quiser
// (nada sai sozinho), tira o acesso e abre "Ver como o RH vê" (#/rh/<empresa>). O RH vê só números (painel_rh).
import { sb, esc, avisar, explicarErro, dataBR } from '../base.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const faltaScript = (e) => /empresa_rh|schema cache|42P01|PGRST20/.test(`${e && e.code} ${e && e.message}`);
const situacao = (r) => (!r.ativo ? ['Sem acesso', 'neutro'] : r.perfil && r.perfil.termo_aceito_em ? ['Já entrou', ''] : r.convidado_em ? ['Convidado, ainda não entrou', 'alerta'] : ['Ainda não convidado', 'neutro']);

async function convidar(corpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/api/convidar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.mensagem || 'Não foi possível.');
  return j;
}

export async function janelaRh(ctx, empresa) {
  const { janela } = await import('./agenda-dados.js');
  const j = janela(`Acesso do RH · ${empresa.nome}`, '<p class="peq apagado">Carregando…</p>', { largura: 760 });
  let lista = [];
  const porId = (id) => lista.find((r) => r.id === id);
  const desenhar = async () => {
    const { data, error } = await sb.from('empresa_rh').select('*, perfil:perfis!empresa_rh_perfil_id_fkey(termo_aceito_em)').eq('empresa_id', empresa.id).order('nome');
    if (error) {
      j.corpo.innerHTML = faltaScript(error) ? '<div class="aviso">Para dar acesso ao RH, falta rodar o script <b>49-presenca-rh-envios-lembretes.sql</b> no Supabase.</div>' : `<div class="aviso erro">${esc(explicarErro(error))}</div>`;
      return;
    }
    lista = data || [];
    j.corpo.innerHTML = `<div class="grade" style="gap:12px">
      <p class="peq">Quem do RH da empresa acompanha os programas. Essa pessoa entra com senha e vê <b>só números</b>: alunos, presença em cada encontro,
        conclusão, nota média das avaliações (a partir de 3 respostas), certificados e, nas mentorias individuais, sessões feitas, faltas e tarefas cumpridas.
        Nunca vê percepções, anotações, envios nem as respostas das avaliações.</p>
      <div class="linha"><a class="btn peq" href="#/rh/${empresa.id}" data-ver>Ver como o RH vê</a></div>
      ${lista.length ? `<div class="tabela"><table><tr><th>Pessoa</th><th>E-mail (login)</th><th>Situação</th><th></th></tr>
        ${lista.map((r) => { const [st, cls] = situacao(r); return `<tr${r.ativo ? '' : ' class="apagado"'}><td><b>${esc(r.nome)}</b>${r.cargo ? `<br><span class="peq apagado">${esc(r.cargo)}</span>` : ''}</td>
          <td class="peq">${esc(r.email || 'sem e-mail')}</td>
          <td><span class="selo ${cls}">${st}</span>${r.convidado_em && st.startsWith('Convidado') ? `<br><span class="peq apagado">convite em ${dataBR(r.convidado_em)}</span>` : ''}<div class="peq" data-res="${r.id}"></div></td>
          <td style="white-space:nowrap">${r.ativo ? `<button class="btn peq${r.convidado_em ? '' : ' pri'}" type="button" data-conv="${r.id}"${r.email ? '' : ' disabled'}>${r.convidado_em ? 'Reenviar' : 'Enviar convite'}</button>
            <button class="btn peq" type="button" data-whats="${r.id}"${r.email ? '' : ' disabled'}>WhatsApp</button>
            <button class="btn peq" type="button" data-tirar="${r.id}">Tirar acesso</button>` : `<button class="btn peq" type="button" data-voltar="${r.id}">Devolver acesso</button>`}</td></tr>`; }).join('')}</table></div>`
        : '<p class="apagado peq">Ninguém do RH cadastrado ainda.</p>'}
      <form id="rh-novo" class="grade g2" style="gap:10px;background:var(--bg);border-radius:12px;padding:12px">
        <div class="campo"><label for="rh-nome">Nome</label><input id="rh-nome" type="text" required></div>
        <div class="campo"><label for="rh-email">E-mail (vai ser o login)</label><input id="rh-email" type="email" required></div>
        <div class="campo"><label for="rh-cargo">Cargo (opcional)</label><input id="rh-cargo" type="text" placeholder="Ex.: Analista de T&amp;D"></div>
        <div class="campo"><label for="rh-whats">WhatsApp (opcional)</label><input id="rh-whats" type="tel" placeholder="(DDD) número"></div>
        <div class="linha"><button class="btn pri peq" type="submit">+ Cadastrar</button><span class="peq apagado">Ninguém recebe nada agora: o convite sai só quando você clicar.</span></div>
      </form></div>`;
    j.corpo.querySelector('[data-ver]').addEventListener('click', () => j.fechar());
    j.corpo.querySelector('#rh-novo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nome = j.corpo.querySelector('#rh-nome').value.trim(), email = j.corpo.querySelector('#rh-email').value.trim().toLowerCase();
      if (!nome || !EMAIL.test(email)) { avisar('Preencha o nome e um e-mail válido.', true); return; }
      const { error: e } = await sb.from('empresa_rh').insert({ empresa_id: empresa.id, nome, email,
        cargo: j.corpo.querySelector('#rh-cargo').value.trim() || null, whatsapp: j.corpo.querySelector('#rh-whats').value.trim() || null });
      if (e) { avisar(/duplicate/.test(e.message || '') ? 'Esse e-mail já está cadastrado nesta empresa.' : explicarErro(e), true); return; }
      avisar(`${nome} cadastrado(a). Quando quiser, clique em "Enviar convite".`);
      desenhar();
    });
  };
  // cliques da lista (ligados uma vez só: a lista é redesenhada dentro da mesma janela)
  j.corpo.addEventListener('click', async (ev) => {
      const c = ev.target.closest('[data-conv]');
      if (c) {
        const r = porId(c.dataset.conv);
        if (!window.confirm(`Mandar agora o convite por e-mail para ${r.nome} (${r.email})?\n\nEla vai ver só os números da ${empresa.nome}.`)) return;
        c.disabled = true;
        const res = j.corpo.querySelector(`[data-res="${r.id}"]`);
        try { const x = await convidar({ email: r.email, nome: r.nome, papel: 'rh', empresa_rh_id: r.id, reenviar: !!(r.perfil && r.perfil.termo_aceito_em) }); res.innerHTML = `<span class="selo">✓ ${x.ja_tem_login ? 'Empresa liberada' : 'Enviado'}</span>`; avisar(x.mensagem); setTimeout(desenhar, 2000); }
        catch (e) { res.innerHTML = `<span class="selo erro">Não enviado</span> ${esc(explicarErro(e))}`; c.disabled = false; }
        return;
      }
      const w = ev.target.closest('[data-whats]');
      if (w) {
        const r = porId(w.dataset.whats);
        w.disabled = true;
        try {
          const x = await convidar({ email: r.email, nome: r.nome, papel: 'rh', empresa_rh_id: r.id, canal: 'link' });
          const { janelaWhatsApp } = await import('./equipe.js');
          const primeiro = r.nome.split(' ')[0];
          janelaWhatsApp({
            titulo: `Convite de ${r.nome} por WhatsApp`, whatsapp: r.whatsapp || '',
            nota: x.ja_tem_login ? 'Esta pessoa já entra na plataforma: a mensagem só avisa que a empresa está no painel.' : 'O link não expira: vale até a pessoa criar a senha. Nenhum e-mail foi enviado.',
            texto: x.ja_tem_login
              ? `Oi, ${primeiro}! Aqui é da Mentorei. O acompanhamento da ${empresa.nome} já está no seu painel da plataforma, com a mesma senha.\n\nhttps://plataforma.mentorei.com.br`
              : `Oi, ${primeiro}! Aqui é da Mentorei. Preparamos para você o painel de acompanhamento da ${empresa.nome}: presença, conclusão e avaliação dos programas.\n\nCrie a sua senha neste link (ele não expira):\n${x.link}\n\nDepois é só entrar em plataforma.mentorei.com.br com o e-mail ${r.email}.`,
          });
        } catch (e) { avisar(explicarErro(e), true); }
        w.disabled = false;
        return;
      }
      const t = ev.target.closest('[data-tirar], [data-voltar]');
      if (t) {
        const r = porId(t.dataset.tirar || t.dataset.voltar);
        const tira = !!t.dataset.tirar;
        if (tira && !window.confirm(`Tirar o acesso de ${r.nome} ao painel da ${empresa.nome}? O login continua, sem nada dentro. Dá para devolver depois.`)) return;
        const { error: e } = await sb.from('empresa_rh').update({ ativo: !tira }).eq('id', r.id);
        if (e) { avisar(explicarErro(e), true); return; }
        avisar(tira ? 'Acesso tirado.' : 'Acesso devolvido.');
        desenhar();
      }
  });
  desenhar();
}
