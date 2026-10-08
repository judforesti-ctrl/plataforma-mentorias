# Plataforma de Mentorias Mentorei — instruções para o Claude

Site no ar: https://plataforma.mentorei.com.br (Netlify, projeto "mentormentorei"; publica sozinho a cada push no `main`
de github.com/judforesti-ctrl/plataforma-mentorias). Os endereços antigos (mentorias.mentorei.com.br e
mentormentorei.netlify.app) redirecionam pelo `netlify.toml`. O DNS do mentorei.com.br fica na Hostinger.
Banco: Supabase próprio (projeto `mixnubenhaleohkcanma`, São Paulo), separado do Radar e do Calendário.

## Quem pede
A Juliana (sócia da Mentorei, também é mentora) é leiga em tecnologia: responda em português, passo a passo, sem jargão,
um clique por passo, dizendo onde clicar e o que vai aparecer. Faça você o que der; peça a ela só o mínimo.
Administração: Cintia (contato@mentorei.com.br) e Juliana (judforesti@gmail.com). Mentores: Cláudia, Isaac, Lorena, Luciane, Viviane.
Commits: `git -c user.name=judforesti-ctrl -c user.email=judforesti@gmail.com commit ...` (o Git desta máquina não tem identidade).

## Como é feita
- Site estático em `public/` (módulos JS sem build, rotas por `#/rota/parametros` em `public/assets/app.js`; cada tela em `public/assets/telas/`).
- Funções do servidor em `netlify/functions/*.mjs` (`export const config = { path, method }`): convidar, resumo e apresentacao (IA),
  agenda, google-conectar/retorno (Google Agenda), proposta (importar proposta em PDF), agenda-email, reserva-resposta (link sem senha),
  agenda-celular (.ics), resumo-semanal (agendada: sextas 9h, com a semana seguinte), reuniao (reuniões com Meet pela Google Agenda).
- Variáveis na Netlify: `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BREVO_API_KEY`
  (e-mails da agenda; sem ela os avisos ficam só na plataforma). Nunca mostrar chaves.
- Banco: scripts numerados em `supabase/` (01, 02...). A Juliana roda cada script novo no Supabase (SQL Editor → New query → colar → Run):
  entregue o bloco SQL completo na conversa, pronto para copiar. Segurança por Row Level Security (admin vê tudo; mentor só os seus
  mentorados; mentorado só o que é dele). Código novo deve funcionar mesmo antes de ela rodar o script (ou avisar claramente).
- IA: modelo `claude-opus-5-5` pelo SDK oficial `@anthropic-ai/sdk`. Informações delicadas da sessão NUNCA vão para a IA.
- E-mail: Supabase Auth com SMTP do Brevo, remetente contato@mentorei.com.br (domínio autenticado). Modelos em `supabase/emails/`
  (link para `{{ .SiteURL }}/definir-senha.html?token_hash=...`). E-mail pode cair no spam: o convite também sai por WhatsApp
  (botão "Convite por WhatsApp", que gera o link sem mandar e-mail).
- WhatsApp: só links wa.me com mensagem pronta (sem API). Mensagem ao mentorado só se ele autorizou.
- Agenda (`#/agenda`, script 14): regras puras em `public/assets/agenda-regras.js`, usadas pelas telas e pelas funções
  (manhã/tarde/noite; presencial ocupa o dia e reserva véspera e dia seguinte de deslocamento; feriados nacionais calculados).
  Telas em `telas/agenda*.js`. Pré-bloqueio: mentor aceita pelo link `reserva.html?t=<token>` (e-mail e WhatsApp); depois de
  5 dias pede confirmar ou liberar. Mentor só vê a própria agenda. Resumo semanal começa DESLIGADO (só a administração liga).
  Resumo pelo WhatsApp: sem API, são mensagens prontas por mentor (wa.me) em Agenda → Google, celular e e-mail, com lembrete
  às sextas no Painel/Agenda (configuracoes.resumo_semanal.whatsapp).
  Turma tem formato obrigatório (online, presencial, misto; script 15) e módulo nunca nasce "indefinido"; ao criar ou importar
  (PDF ou .pptx) a plataforma confere a agenda e mostra os conflitos. Bloqueio do mentor tem tipo: pessoal, tempo de criação,
  tempo operacional, reunião entre mentores, férias ou outro (texto dele).
  Vista padrão da aba "Agenda da equipe" é a SEMANA (`telas/agenda-semana.js`): um dia por linha (seg a sáb; domingo só se tiver algo),
  data grande à direita, dias livres em verde, filtro por mentor; "Quadro por mentor" é a vista antiga de 3 faixas, e o mês continua lá.
  Reuniões (script 18, tabela `agenda_reunioes`, função `/api/reuniao`): botão "+ Agendar reunião" na semana e na aba Bloqueios
  (o mentor também tem, em Minha agenda). Aceita gente da equipe e e-mails de fora sem cadastro; o servidor cria o convite na
  Google Agenda conectada com link do Meet (`conferenceDataVersion=1`) e o Google avisa todos. O convite fica em
  `agenda_reunioes.google_evento_id`, FORA de `google_eventos`: a sincronização automática nunca mexe nele (senão apagaria).
  Sem Google conectado, a reunião fica na agenda e a tela oferece "Enviar convites" depois. Mudar/cancelar só quem marcou ou a administração.
- Google Agenda (script 17, `netlify/lib/google-sync.mjs`): a conta conectada no Painel cria um evento por compromisso com os
  envolvidos como convidados; a chave de cada um fica em `google_eventos` (id fixo `mnt`+sha1, nunca duplica). Liga e desliga em
  Agenda → Google, celular e e-mail (equipe e mentorados separados; começam DESLIGADOS). Sincroniza depois de cada mudança nas telas
  (`avisarGoogle()`), a cada 15 min (agendada → função de fundo) e ao remarcar. Convites feitos à mão são aproveitados (mesmo horário +
  sala do Meet, e-mail ou nome). REGRA: convites RECORRENTES nunca são apagados (nem na limpeza de duplicados, nem quando a sessão some).
  Remarcar nunca cria convite novo sozinho (isso duplicava): se não acha, a tela oferece "Criar convite novo".

## Regras do negócio
- Não enviar convite a mentor ou mentorado sem a Juliana pedir.
- Informações delicadas: campo trancado da sessão, só mentores do mentorado e administração; nunca em relatório, Excel ou IA.
- Sessão concluída fica trancada; só a administração altera (fica no histórico).
- Excel do RH: só números (presença, faltas, tarefas, avaliação). Nada do conteúdo das conversas.
- Arsenal: 68 ferramentas (pacote de lotes em `Downloads\Arsenal_Mentorei_Lotes_1-11`, modelo em `Downloads\Arsenal_Mentorei_Trabalho`).
  8 ferramentas com questionário "PROPOSTA" aguardam validação dela (doc de revisão no Claude). Ferramentas online automatizadas
  da Juliana ficam em `public/ferramentas/<nome>/` e são ligadas em `public/assets/ferramentas-online.js` (resultado vai para `testes`).
- Linguagem da Mentorei: sem jargão de coaching em inglês ("accountability", "follow-up", "macaco nas costas").

## Testar antes de publicar
Não há servidor de desenvolvimento: para testar uma tela, servir `public/` localmente e trocar `/assets/base.js` por um
arquivo de dados falsos (import map), conferir no navegador e apagar os arquivos de teste antes do commit.
Não há Node nesta máquina: as funções `.mjs` foram testadas no navegador com import map (`node:crypto` falso) e `fetch` simulado.
Não trabalhar em duas conversas ao mesmo tempo nesta pasta (uma desfaz a outra): antes de editar, `git pull` e ler o arquivo atual.

## Pendências conhecidas
- CONTRATO DE PRESTAÇÃO DE SERVIÇO DO MENTOR (pedido da Juliana em 2026-10-07, ela ainda vai mandar o texto): o mentor precisa
  concordar no primeiro acesso (cadastro); se escolher "ler depois", depois de 7 dias aparece uma mensagem pedindo para assinar.
  Perguntar a ela pelo contrato antes de mandar os convites aos mentores. Ainda NÃO implementado.
- Cadastro simples (convidados das trilhas): mentor com e-mail provisório `…@pendente.mentorei.com.br`, que nunca recebe nada
  (`emailReal()` no servidor, `emailPendente()` nas telas). A administração coloca o e-mail real em Mentores → Editar dados
  (`/api/convidar` acao trocar_email) e só então manda o convite.
- Revisão das 8 ferramentas PROPOSTA; outras ferramentas online automatizadas a ligar; revisão jurídica do texto de privacidade.
- "mentorado modelo" de teste criado dentro do programa real da Brasdiesel: apagar depois dos testes.
