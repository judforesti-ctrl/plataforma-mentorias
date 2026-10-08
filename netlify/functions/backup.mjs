// Cópias de segurança, pedidas pela administração no Painel:
//  status   como estão as cópias (última semanal, última mensal, pasta do Drive, e-mails)
//  agora    faz uma cópia para o Drive agora (em segundo plano)
//  baixar   devolve a planilha Excel na hora, para salvar no computador
//  emails   guarda a lista de e-mails que recebem a cópia mensal
import { json, quemPede, contaGoogle, SITE } from '../lib/google.mjs';
import { montarPlanilha, lerConfigBackup, gravarConfigBackup, emailsBackup, chaveBackup, temPermissaoDrive, PASTA_DRIVE } from '../lib/backup.mjs';

export const config = { path: '/api/backup', method: 'POST' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel !== 'admin') return json({ mensagem: 'Só a administração.' }, 403);
  let b = {}; try { b = await req.json(); } catch (_) { /* sem corpo */ }

  if (b.acao === 'status') {
    const [cfg, conta] = await Promise.all([lerConfigBackup(), contaGoogle()]);
    return json({ ok: true, ultimo: cfg.ultimo || null, ultimo_mensal: cfg.ultimo_mensal || null, pasta_link: cfg.pasta_link || null, pasta_nome: PASTA_DRIVE,
      emails: await emailsBackup(cfg), emails_personalizados: Array.isArray(cfg.emails) && cfg.emails.length > 0,
      google: { conectado: !!(conta && conta.refresh_token), email: conta ? conta.email : null, drive: temPermissaoDrive(conta) } });
  }
  if (b.acao === 'agora') {
    await fetch(`${SITE}/api/backup-fundo`, { method: 'POST', headers: { 'x-mentorei-backup': chaveBackup(), 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'manual' }) }).catch(() => null);
    return json({ ok: true, fundo: true });
  }
  if (b.acao === 'emails') {
    const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map((x) => String(x).trim().toLowerCase()).filter((x) => EMAIL.test(x)))].slice(0, 20);
    const cfg = await gravarConfigBackup({ emails });
    return json({ ok: true, emails: await emailsBackup(cfg) });
  }
  if (b.acao === 'baixar') {
    try {
      const p = await montarPlanilha();
      return new Response(p.buffer, { status: 200, headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${p.nome}"`, 'Cache-Control': 'no-store', 'X-Linhas': String(p.linhas) } });
    } catch (e) { return json({ mensagem: `Não consegui montar a planilha: ${e.message}` }, 500); }
  }
  return json({ mensagem: 'Ação desconhecida.' }, 400);
};
