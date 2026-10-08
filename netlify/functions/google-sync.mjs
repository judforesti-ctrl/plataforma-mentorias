// Convites na Google Agenda, pedidos pela plataforma:
//  (sem ação)  qualquer pessoa da equipe, depois de mudar algo na agenda: acerta os convites (rápido; o resto fica para o fundo)
//  status      (administração) como está a ligação e a última sincronização
//  tudo        (administração) sincroniza tudo agora, em segundo plano
//  conferir    (administração) procura convites duplicados ou que ficaram no horário antigo
//  apagar      (administração) apaga os convites escolhidos na conferência
import { json, supa, quemPede, contaGoogle, SITE } from '../lib/google.mjs';
import { sincronizar, salvarResultado, lerConfig, chaveFundo, conferirConvites, apagarConvites } from '../lib/google-sync.mjs';

export const config = { path: '/api/google-sync', method: 'POST' };

const chamarFundo = () => fetch(`${SITE}/api/google-sync-fundo`, { method: 'POST', headers: { 'x-mentorei-sync': chaveFundo() } }).catch(() => null);

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel === 'mentorado') return json({ mensagem: 'Só a equipe.' }, 403);
  let b = {}; try { b = await req.json(); } catch (_) { /* sem corpo */ }
  const adm = eu.papel === 'admin';

  if (b.acao === 'status') {
    if (!adm) return json({ mensagem: 'Só a administração.' }, 403);
    const [cfg, conta, ult, tab] = await Promise.all([lerConfig(), contaGoogle(), supa('/rest/v1/configuracoes?chave=eq.google_sync&select=valor'),
      supa('/rest/v1/google_eventos?select=chave&limit=1')]);
    return json({ ...cfg, conectado: !!(conta && conta.refresh_token), conta: conta ? conta.email : null, script: tab.ok,
      ultimo: (ult.ok && ult.dados && ult.dados[0] && ult.dados[0].valor) || null });
  }
  if (b.acao === 'tudo') {
    if (!adm) return json({ mensagem: 'Só a administração.' }, 403);
    await chamarFundo();
    return json({ ok: true, fundo: true });
  }
  if (b.acao === 'conferir') {
    if (!adm) return json({ mensagem: 'Só a administração.' }, 403);
    return json(await conferirConvites());
  }
  if (b.acao === 'apagar') {
    if (!adm) return json({ mensagem: 'Só a administração.' }, 403);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x) => /^[\w-]{5,1024}$/.test(x));
    return json(await apagarConvites(ids));
  }

  // depois de uma mudança na agenda: o que der em poucos segundos; se sobrar, o fundo termina
  const res = await sincronizar({ limiteMs: 7000 });
  if (!res.desligado && !res.erro) {
    if (res.pendentes) await chamarFundo();
    await salvarResultado(res);
  }
  return json(res);
};
