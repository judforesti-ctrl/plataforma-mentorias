// A cada hora: módulos que terminaram há mais de 24 horas e ainda não tiveram o resumo enviado → cada mentor do módulo
// recebe por e-mail como a turma avaliou o encontro. Cada um vê a nota do encontro e a PRÓPRIA nota, nunca a do colega.
// Comentários vão como a turma escreveu, sem nome (a avaliação é anônima). Sem respostas, nada é enviado.
// Recebe quem já usa a plataforma (termo aceito), como os outros e-mails da equipe.
import { supa, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal } from '../lib/email.mjs';
import { janelaAvaliacao, resumir, num1, APRENDEU, TEMPO, HORAS_ATE_EMAIL } from '../../public/assets/avaliacao-regras.js';

export const config = { schedule: '20 * * * *' };

const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const pares = (lista, rotulos) => lista.filter(([, n]) => n).map(([k, n]) => `${rotulos ? rotulos[k] : k} (${n})`).join(', ');

export default async () => {
  const agora = Date.now();
  const desde = new Date(agora - 9 * 86400000).toISOString(), ate = new Date(agora - HORAS_ATE_EMAIL * 3600000).toISOString();
  const r = await supa(`/rest/v1/modulos?avaliacao_aviso_em=is.null&data_hora=gte.${desde}&data_hora=lte.${ate}`
    + '&select=id,numero,titulo,data_hora,duracao_min,participantes_presentes,turma:turmas(nome,empresa:empresas(nome)),mentores:modulo_mentores(mentor:perfis(id,nome,email,ativo,termo_aceito_em))');
  if (!r.ok) return new Response('Script 31 ainda não rodado.');
  let enviados = 0;
  for (const m of r.dados || []) {
    const j = janelaAvaliacao(m, agora);
    if (j.fim && agora < j.fim + HORAS_ATE_EMAIL * 3600000) continue;
    const a = await supa(`/rest/v1/avaliacoes?modulo_id=eq.${m.id}&select=geral,aula,conteudo,ferramentas,aprendeu,tempo,nps,marcas,comentario,temas,notas:avaliacao_mentores(mentor_id,nota)`);
    if (!a.ok) continue;
    const respostas = a.dados || [];
    if (respostas.length) {
      const res = resumir(respostas);
      const empresa = (m.turma && m.turma.empresa && m.turma.empresa.nome) || '';
      for (const p of (m.mentores || []).map((x) => x.mentor).filter(Boolean)) {
        if (!p.ativo || !p.termo_aceito_em || !emailReal(p.email)) continue;
        const meu = res.mentores.find((x) => x.id === p.id);
        const nome = String(p.nome || '').split(' ')[0];
        const blocos = [
          { p: `${nome}, ${respostas.length} ${respostas.length === 1 ? 'pessoa avaliou' : 'pessoas avaliaram'}${m.participantes_presentes ? ` (de ${m.participantes_presentes} presentes)` : ''} o encontro de ${dataBR(m.data_hora)}: Módulo ${m.numero} · ${m.titulo}.` },
          { titulo: 'As notas' },
          { lista: [
            `Nota geral do encontro: ${num1(res.geral)} de 10`,
            ...(meu ? [`Sua nota como mentor(a): ${num1(meu.media)} de 5`] : []),
            `Conteúdo: ${num1(res.conteudo)} de 5`,
            `Aula (ritmo e dinâmica): ${num1(res.aula)} de 5`,
            `Ferramentas e materiais: ${num1(res.ferramentas)} de 5`,
            ...(res.nps ? [`Recomendariam a Mentorei: NPS ${res.nps.valor} (vai de −100 a +100)`] : []),
          ] },
        ];
        const extras = [
          pares(res.aprendeu, APRENDEU) && `Quanto aprenderam: ${pares(res.aprendeu, APRENDEU)}`,
          pares(res.tempo, TEMPO) && `Tempo do encontro: ${pares(res.tempo, TEMPO)}`,
          res.marcas.length && `O que marcaram: ${pares(res.marcas)}`,
        ].filter(Boolean);
        if (extras.length) blocos.push({ titulo: 'O que a turma disse' }, { lista: extras });
        if (res.comentarios.length) blocos.push({ titulo: 'Comentários' }, { lista: res.comentarios.slice(0, 20).map((c) => `“${String(c.comentario).trim()}”`) });
        if (res.comentarios.length > 20) blocos.push({ p: `E mais ${res.comentarios.length - 20} comentários no módulo, na plataforma.` });
        blocos.push({ botao: { texto: 'Ver no módulo', link: `${SITE}/app.html#/modulo/${m.id}` } });
        blocos.push({ nota: 'A avaliação é anônima: nem a Mentorei sabe quem escreveu cada resposta. Obrigada pelo encontro!' });
        const e = modeloEmail({ assunto: `Como a turma avaliou o Módulo ${m.numero}${m.turma ? ` · ${m.turma.nome}` : ''}`,
          titulo: `${empresa ? `${empresa}: ` : ''}a turma avaliou o encontro`, blocos });
        const env = await enviarEmail({ para: [{ email: p.email, name: p.nome }], assunto: e.assunto, html: e.html, texto: e.texto });
        if (env.enviado) enviados += 1;
      }
    }
    await supa(`/rest/v1/modulos?id=eq.${m.id}`, { metodo: 'PATCH', corpo: { avaliacao_aviso_em: new Date().toISOString(), avaliacao_aviso_qtd: respostas.length } });
  }
  return new Response(`${enviados} resumo(s) de avaliação enviado(s).`);
};
