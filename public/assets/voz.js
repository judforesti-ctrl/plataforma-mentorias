// Ditado por voz: o mentor clica em "🎤 Falar", fala, e o texto entra na caixa (reconhecimento do próprio navegador,
// gratuito; melhor no Chrome). Mesmo comportamento das anotações da sessão individual (telas/sessao.js, que tem a
// própria cópia desta lógica). Usado nas percepções do módulo da turma (telas/turmas.js).
// ditado({ avisar }) devolve { ligar(botao, area, aviso), parar() }: um ditado por vez na página; clicar de novo para.

export function ditado({ avisar }) {
  const Reconhecer = window.SpeechRecognition || window.webkitSpeechRecognition;
  let voz = null;

  const parar = () => {
    if (!voz) return;
    const v = voz; voz = null;
    v.ativo = false;
    try { v.rec.stop(); } catch (_) { /* já parado */ }
    v.botao.textContent = '🎤 Falar'; v.botao.classList.remove('gravando'); v.botao.setAttribute('aria-pressed', 'false');
    if (v.aviso) v.aviso.textContent = '';
  };

  const ligar = (botao, area, aviso) => {
    if (!botao || !area) return;
    botao.setAttribute('aria-pressed', 'false');
    botao.addEventListener('click', () => {
      if (voz && voz.botao === botao) { parar(); return; }
      parar();
      if (!Reconhecer) { avisar('Este navegador não transcreve voz. Use o Google Chrome.', true); return; }
      const rec = new Reconhecer();
      rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
      const atual = { rec, botao, aviso, ativo: true };
      voz = atual;
      rec.onresult = (e) => {
        let parcial = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript.trim();
          if (!t) continue;
          if (e.results[i].isFinal) {
            const frase = t.charAt(0).toUpperCase() + t.slice(1);
            const antes = area.value.replace(/\s+$/, '');
            // texto digitado sem ponto no fim ganha o ponto antes da frase falada
            const junta = !antes.trim() ? '' : /[.!?…:;,\-–(]$/.test(antes) ? ' ' : '. ';
            area.value = `${antes}${junta}${frase}${/[.!?]$/.test(frase) ? '' : '.'}`;
            area.dispatchEvent(new Event('input'));   // o salvamento automático da página percebe
          } else parcial += `${t} `;
        }
        if (aviso) aviso.textContent = parcial ? `Ouvindo: ${parcial}` : 'Ouvindo…';
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          avisar('O navegador não deixou usar o microfone. Clique no cadeado ao lado do endereço e permita o microfone.', true);
          atual.ativo = false;
        }
      };
      // o navegador para sozinho depois de um silêncio: enquanto o botão estiver ligado, volta a ouvir
      rec.onend = () => { if (atual.ativo) { try { rec.start(); } catch (_) { /* já reiniciando */ } } else if (voz === atual) parar(); };
      try { rec.start(); } catch (_) { voz = null; avisar('Não consegui ligar o microfone. Tente de novo.', true); return; }
      botao.textContent = '⏹ Parar'; botao.classList.add('gravando'); botao.setAttribute('aria-pressed', 'true');
      if (aviso) aviso.textContent = 'Ouvindo… pode falar.';
    });
  };

  return { ligar, parar };
}
