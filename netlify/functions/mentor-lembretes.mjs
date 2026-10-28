// Lembretes aos mentores das turmas (script 49, pedido da Juliana em 28/10/2026). Todo dia às 8h (Brasília), por módulo e mentor:
// - 3 dias antes: se os slides do mentor ainda não estão no módulo;
// - 2 dias antes: se faltam as ferramentas que ele vai usar com a turma ("Para os alunos → Tarefas e ferramentas" ou "Materiais
//   necessários") ou os slides com o QR code da avaliação (quem envia os slides confirma o QR na hora);
// - 1 dia depois: se faltam as percepções (a avaliação dele sobre a turma), a presença dos alunos ou as fotos da turma.
// Só sai e-mail quando falta alguma coisa; cada tipo sai uma vez por módulo e mentor (avisos_mentor). Se o módulo foi marcado em cima
// da hora, os lembretes do mesmo dia vão juntos num e-mail só. Recebe quem já usa a plataforma (termo aceito) e tem e-mail de verdade.
// Desligar: configuracoes.lembretes_mentor = {"ligado": false}.
import { supa, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';

export const config = { schedule: '0 11 * * *' };   // 11h UTC = 8h em Brasília

const TZ = 'America/Sao_Paulo';
const DIA = 86400000;
const diaDe = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
const quando = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' })}, às ${d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
};
const primeiro = (n) => String(n || '').split(' ')[0];

export default async () => {
  const cfg = await supa('/rest/v1/configuracoes?chave=eq.lembretes_mentor&select=valor');
  if (cfg.ok && cfg.dados && cfg.dados[0] && cfg.dados[0].valor && cfg.dados[0].valor.ligado === false) return new Response('Lembretes desligados.');
  const agora = Date.now();
  const r = await supa(`/rest/v1/modulos?data_hora=gte.${new Date(agora - 4 * DIA).toISOString()}&data_hora=lte.${new Date(agora + 4 * DIA).toISOString()}`
    + '&select=id,numero,titulo,data_hora,percepcoes_em,turma:turmas(id,nome,empresa:empresas(nome)),arquivos:modulo_arquivos(tipo),'
    + 'mentores:modulo_mentores(mentor:perfis(id,nome,email,ativo,termo_aceito_em))');
  if (!r.ok) return new Response('Não consegui ler os módulos.');
  const mods = r.dados || [];
  if (!mods.length) return new Response('Nenhum módulo perto de hoje.');
  const ids = mods.map((m) => m.id).join(',');
  const ja = await supa(`/rest/v1/avisos_mentor?modulo_id=in.(${ids})&select=modulo_id,mentor_id,tipo`);
  if (!ja.ok) return new Response('Script 49 ainda não rodado.');
  const enviado = new Set((ja.dados || []).map((x) => `${x.modulo_id}|${x.mentor_id}|${x.tipo}`));
  // ferramentas da lista "Materiais necessários" (script 40; sem ele, conta só os arquivos)
  const mat = await supa(`/rest/v1/modulo_materiais?modulo_id=in.(${ids})&categoria=eq.ferramenta&select=modulo_id`);
  const ferramentasLista = new Map();
  ((mat.ok && mat.dados) || []).forEach((x) => ferramentasLista.set(x.modulo_id, (ferramentasLista.get(x.modulo_id) || 0) + 1));
  // presença e alunos (para o lembrete de depois)
  const pres = await supa(`/rest/v1/presencas?modulo_id=in.(${ids})&select=modulo_id`);
  const comChamada = new Set(((pres.ok && pres.dados) || []).map((x) => x.modulo_id));
  const turmaIds = [...new Set(mods.map((m) => m.turma && m.turma.id).filter(Boolean))];
  const al = turmaIds.length ? await supa(`/rest/v1/turma_alunos?turma_id=in.(${turmaIds.join(',')})&ativo=eq.true&select=turma_id`) : { ok: true, dados: [] };
  const comAlunos = new Set(((al.ok && al.dados) || []).map((x) => x.turma_id));

  const hoje = Date.parse(diaDe(agora));
  let enviados = 0;
  for (const m of mods) {
    const dias = Math.round((Date.parse(diaDe(Date.parse(m.data_hora))) - hoje) / DIA);   // 3 = daqui a 3 dias; −1 = ontem
    const tipos = (m.arquivos || []).map((a) => a.tipo);
    const temSlides = tipos.includes('mentor');
    const ferramentas = tipos.filter((t) => t === 'tarefa').length + (ferramentasLista.get(m.id) || 0);
    const turma = m.turma || {};
    const empresa = turma.empresa ? turma.empresa.nome : '';
    const link = `${SITE}/app.html#/modulo/${m.id}`;
    for (const p of (m.mentores || []).map((x) => x.mentor).filter(Boolean)) {
      if (!p.ativo || !p.termo_aceito_em || !emailReal(p.email)) continue;
      const ja = (tipo) => enviado.has(`${m.id}|${p.id}|${tipo}`);
      const faltas = [];
      const tiposAgora = [];
      if (dias >= 1 && dias <= 3) {
        if (!temSlides && !ja('slides')) {
          tiposAgora.push('slides');
          faltas.push('Seus slides ainda não estão no módulo. Envie em "Slides dos mentores" (PDF ou PowerPoint).');
        }
        if (dias <= 2 && !ja('preparo') && (!temSlides || !ferramentas)) {
          tiposAgora.push('preparo');
          if (!faltas.length && !temSlides) faltas.push('Seus slides ainda não estão no módulo. Envie em "Slides dos mentores" (PDF ou PowerPoint).');
          if (!temSlides) faltas.push('Confira se o QR code da avaliação está no último slide (o QR está no cartão "Avaliação da turma", no módulo).');
          if (!ferramentas) faltas.push('Nenhuma ferramenta da aula está na plataforma. Se for usar alguma com a turma (ferramenta do Arsenal, exercício ou tarefa), coloque em "Para os alunos → Tarefas e ferramentas": os alunos baixam na área deles.');
        }
      }
      if (dias <= -1 && dias >= -3 && !ja('depois')) {
        if (!m.percepcoes_em) faltas.push('Suas percepções sobre a turma: como foi o encontro, engajamento, pontos de atenção e sugestões (cartão "Percepções sobre a aula").');
        if (turma.id && comAlunos.has(turma.id) && !comChamada.has(m.id)) faltas.push('A presença dos alunos: clique em "Puxar do Zoom" ou marque cada um no cartão "Presença dos alunos".');
        if (!tipos.includes('foto')) faltas.push('As fotos da turma: "Fotos da aula" → "Colocar fotos" (dá para escolher várias de uma vez, direto do celular).');
        if (faltas.length) tiposAgora.push('depois');
      }
      if (!tiposAgora.length || !faltas.length) continue;
      // marca antes de mandar: se a função rodar de novo, não repete
      const marca = await supa('/rest/v1/avisos_mentor?on_conflict=modulo_id,mentor_id,tipo', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=representation',
        corpo: tiposAgora.map((tipo) => ({ modulo_id: m.id, mentor_id: p.id, tipo })) });
      if (!marca.ok || !(marca.dados || []).length) continue;
      const depois = tiposAgora.includes('depois');
      const nome = `Módulo ${m.numero} · ${m.titulo}`;
      const mail = modeloEmail({
        assunto: depois ? `Como foi o ${nome}? Faltam algumas coisas na plataforma` : `${nome}: ${dias === 1 ? 'é amanhã' : `faltam ${dias} dias`}`,
        titulo: depois ? 'Fechando o encontro na plataforma' : `Preparando o encontro de ${dias === 1 ? 'amanhã' : `daqui a ${dias} dias`}`,
        blocos: [
          { p: depois
            ? `Olá, ${primeiro(p.nome)}! Obrigada pelo encontro de ${quando(m.data_hora)} com a turma ${turma.nome || ''}${empresa ? ` (${empresa})` : ''}: ${nome}.`
            : `Olá, ${primeiro(p.nome)}! Seu encontro com a turma ${turma.nome || ''}${empresa ? ` (${empresa})` : ''} é ${quando(m.data_hora)}: ${nome}.` },
          { titulo: depois ? 'Ainda falta colocar no módulo' : 'O que ainda falta no módulo' },
          { lista: faltas },
          { botao: { texto: 'Abrir o módulo', link } },
          { nota: depois ? 'Isso ajuda a coordenação a acompanhar a turma e a montar o relatório para a empresa.' : 'Se já está tudo certo, pode ignorar este lembrete.' },
        ],
      });
      const env = await enviarEmail({ para: [{ email: p.email, name: p.nome }], assunto: mail.assunto, html: mail.html, texto: mail.texto });
      if (env.enviado) enviados += 1;
    }
  }
  return new Response(`${enviados} lembrete(s) enviado(s) aos mentores.`);
};
