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
  agenda-celular (.ics), resumo-semanal (agendada: sextas 9h, com a semana seguinte), reuniao (reuniões com Meet pela Google Agenda),
  backup (status, baixar Excel, e-mails), backup-fundo (background), backup-semanal (seg 6h → Drive) e backup-mensal (dia 1, 7h → Drive + e-mail).
- Cópias de segurança (`netlify/lib/backup.mjs`, dependência `xlsx` da SheetJS): planilha Excel com uma aba por tabela (sem integracoes,
  agenda_links, google_eventos, acessos, historico) vai para a pasta "Backups da Plataforma Mentorei" do Drive da conta Google conectada
  (precisa do escopo drive.file: a Juliana reconecta uma vez) e guarda 6 meses; dia 1 vai por e-mail (anexo Brevo) para configuracoes.backup.emails
  (sem lista = admins). Cartão no Painel (`telas/backup.js`). O arquivo de RESTAURAÇÃO (todas as tabelas em JSON + fotos/PDFs) é feito
  SÓ no computador dela por `ferramentas/backup-restauracao.ps1` (tarefa agendada do Windows, segundas 8h; precisa de `.env` com
  SUPABASE_SECRET_KEY) em `programacoes sites e radares/backups-plataforma-mentorias/`. Ela decidiu: restauração não sai do PC dela;
  a planilha leva tudo. Passo a passo de restauração em `ferramentas/COMO-RESTAURAR.md`.
- Variáveis na Netlify: `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BREVO_API_KEY`
  (e-mails da agenda; sem ela os avisos ficam só na plataforma), `BREVO_API_KEY_MARKETING` (opcional: conta do Brevo dos funis de
  listas frias) e `BREVO_REMETENTE_MARKETING` (opcional). Nunca mostrar chaves.
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
  data grande à esquerda (ela pediu, 2026-10-08), dias livres em verde; "Quadro por mentor" é a vista antiga de 3 faixas, e o mês continua lá.
  As FLAGS de 2026-10-09 foram DESFEITAS em 2026-10-10 ("não ficou bom, quero voltar como estava"): Semana e Quadro voltaram às
  4 caixas de seleção (mentor, empresa, tipo, formato). A vista é redesenhada num elemento novo a cada mudança (os cliques não se acumulam).
  Filtro DE VERDADE (2026-10-10, print dela: empresa escolhida e a agenda pessoal de todos continuava aparecendo): nada passa mais
  "por fora"; empresa/tipo/formato mostram só o que combina (feriado continua). Tipo = `TIPOS_FILTRO` em agenda.js (todos, individual,
  turmas, pré-bloqueios, reuniões, agenda pessoal, bloqueios, checklist, contatos). Valem na hora (sem botão); com filtro aparecem
  "Limpar filtros" e a faixa "Filtro ligado: mostrando só…". Com filtro de empresa/tipo/formato a semana não pinta "dia livre"
  (`semLivre`; dia vazio = "Nada com esse filtro neste dia"). Na equipe toda, o mesmo compromisso da agenda pessoal de várias pessoas
  (mesmo título e horário) vira um cartão só com os nomes (`juntarRepetidos` em agenda-semana.js).
  ATALHOS (2026-10-10, lugar escolhido por ela no print): na linha de "Semana / Quadro por mentor / Planilha", à direita (`.ag-atalhos`),
  "+ Agendar reunião" (abrirFormReuniao) e "+ Atividade no checklist" (`novaAtividade()` exportada de checklist.js: o mesmo formulário,
  ali mesmo; depois de criar a agenda se redesenha). Valem nas três vistas; o botão de reunião que ficava na barra da semana da equipe saiu
  (`agendar: false`) para não repetir. Em Minha agenda do mentor nada mudou.
  PLANILHA (2026-10-10, para a Viviane, que trabalha no Excel online): terceira vista "Planilha" (`telas/agenda-planilha.js`), com a
  cara do Excel: letras das colunas, números das linhas, cabeçalho fixo e, em cada coluna, a setinha do filtro do Excel (classificar
  A→Z/Z→A, "Limpar filtro de…", pesquisar, "(Selecionar tudo)", "(Vazias)", contagem; Data em árvore mês → dia). A lista de cada coluna
  mostra só o que sobra com os outros filtros. Uma linha por compromisso DE CADA PESSOA (módulo com 2 mentores = 2 linhas; recesso e
  feriado = "Toda a equipe"; sem mentor = vazia). Colunas: Data, Dia, Horário, Período, Pessoa, Empresa, Turma ou programa, Compromisso
  (link que abre como na semana), Tipo, Formato, Local, Detalhes. No alto: pesquisa em tudo, período (padrão "De hoje em diante"),
  Limpar filtros e Baixar em Excel (o filtrado, com filtro do Excel no cabeçalho). Rodapé: "N de M registros" e horas de mentoria e aula.
  Filtros/ordem/período em localStorage "mentorei.agendaPlanilha"; a vista escolhida em "mentorei.agendaVista" (quem usa a planilha
  já entra nela). No celular a caixa do filtro vira gaveta embaixo.
  Reuniões (script 18, tabela `agenda_reunioes`, função `/api/reuniao`): botão "+ Agendar reunião" na semana e na aba Bloqueios
  (o mentor também tem, em Minha agenda). Aceita gente da equipe e e-mails de fora sem cadastro; o servidor cria o convite na
  Google Agenda conectada com link do Meet (`conferenceDataVersion=1`) e o Google avisa todos. O convite fica em
  `agenda_reunioes.google_evento_id`, FORA de `google_eventos`: a sincronização automática nunca mexe nele (senão apagaria).
  Sem Google conectado, a reunião fica na agenda e a tela oferece "Enviar convites" depois. Mudar/cancelar só quem marcou ou a administração.
  AGENDA PESSOAL (2026-10-09, script 24, `telas/agenda-pessoal.js`, `/api/agenda-pessoal`, `netlify/lib/agenda-pessoal.mjs` + `ics.mjs`):
  pedido da Juliana: reuniões que clientes marcam direto no e-mail de alguém da equipe entram na agenda. Cada pessoa cola o
  "endereço secreto no formato iCal" (Gmail) ou o link ICS publicado (Hotmail/Outlook) em Minha agenda; a administração vê a equipe e
  pode colar por alguém em Agenda → Google, celular e e-mail. O link fica em `agenda_pessoal_links` (só o servidor lê; nunca volta à tela).
  A cada 15 min (`agenda-pessoal-agendada` → `agenda-pessoal-fundo`) lê de 30 dias atrás a 6 meses à frente e troca a lista da pessoa em
  `agenda_pessoal` (rpc `trocar_agenda_pessoal`). Decisão dela: TUDO aparece com o nome (tipo `pessoal`, rosa), menos o marcado como
  Particular/Privado na origem (vira "Particular"). Ocupa o horário (choques, encaixe); o que está "disponível" na origem (TRANSP) aparece
  tracejado e não ocupa, mas dia inteiro assim (viagem no Google nasce "disponível") avisa no encaixe e nos choques. Fica de fora: cancelado,
  convite recusado pelo dono, o que a própria plataforma criou (uid `mnt…`, `google_eventos`, `agenda_reunioes.google_evento_id`) e, na tela,
  compromisso "interno" (marcado pela pessoa ou pela equipe) no mesmo horário (±10 min) de algo da plataforma. Só leitura: nunca muda a
  agenda de origem. NÃO entra no resumo semanal, na agenda do celular nem nos convites do Google (dadosAgenda do servidor não lê).
  CONVITES DA COORDENAÇÃO (2026-10-09, script 26, que já inclui o 24): a Cláudia marcou reunião no Gmail pessoal convidando o contato@
  e nada apareceu (ninguém tinha ligado link). Agora `atualizarCoordenacao()` (no mesmo ciclo de 15 min) lê a agenda principal da conta
  Google conectada pela API (singleEvents, sem link) e grava em `agenda_pessoal` com `fonte='google'` (rpc `trocar_agenda_google`; o link
  de cada um é `fonte='pessoal'`). Cada evento vai para quem da equipe está nele (organizador + convidados que não recusaram), reconhecido
  pelo e-mail do cadastro, por `perfis.outros_emails` (botão "E-mails" no quadro da equipe, só administração) ou pelo e-mail do link do
  Google; a dona da conta (contato@ = Cintia) só fica com o evento quando ninguém da equipe é reconhecido, e nunca se for convite interno
  no mesmo horário (±10 min) de sessão ou aula. A tela junta as duas fontes sem repetir (perfil + UID + início). "Ler todas agora" e salvar
  e-mails disparam a função de fundo. Situação da última leitura em `configuracoes.agenda_coordenacao`.
  VIAGENS (2026-10-09, script 25): passagem, hotel e transporte têm "quem paga" e "quem compra/reserva/combina" (Mentorei ou empresa).
  Padrão na turma (`turmas.viagem_padrao`, cartão na página da turma); cada viagem (`modulo_mentores.viagem.paga_<item>`/`compra_<item>`)
  pode mudar, vazio = padrão. Regras em agenda-regras.js (`ITENS_VIAGEM`, `quemCuidaDaViagem`); o mentor vê só leitura no dia; o resumo
  semanal da coordenação diz "(a empresa compra)" nas pendências.
- CHECKLIST (2026-10-09, script 25, tabela `atividades`, `telas/checklist.js`, menu "Checklist" para equipe e administração): atividade
  com responsáveis (quantos quiser, `responsaveis_nomes` guardado porque o mentor não lê os perfis), data de entrega opcional (muda depois;
  hora opcional), lista/projeto (`grupo`), ligada a turma ou empresa, passos com caixinhas. Decisão dela: TODOS criam e atribuem; cada um
  vê as suas e as que criou; administração vê tudo (RLS). Entrega entra na agenda de cada responsável (tipo `atividade`, não ocupa o
  horário, link `#/checklist/<id>`). E-mail ao virar responsável (`/api/atividade`, uma vez por pessoa, coluna `avisados`) e lembrete às
  8h para quem tem entrega hoje ou amanhã (`atividades-lembrete`); só para quem já usa a plataforma (termo aceito). Aviso no Painel e em
  Minha agenda (`cartaoChecklist`).
  Script 27 (pedido dela, 2026-10-09): `categoria` (operacional, gestao, estrategica; filtro e contagem por tipo na tela) e `na_agenda`:
  prazo (como antes, não ocupa), bloqueio (ocupa do início `prazo_hora` ao fim `hora_fim` na plataforma) ou convite (ocupa e o servidor
  `/api/atividade` acao `salvo` cria/muda o convite na Google Agenda conectada com sala do Meet para os responsáveis + `convidados` de fora;
  `google_evento_id`/`meet_link` na atividade, FORA de google_eventos; deixou de ser convite = convite cancelado; `apagar` cancela e apaga).
  Quem recebe o convite do Google não recebe o e-mail da plataforma. Esses convites ficam fora da leitura da conta da coordenação
  (contextoLeitura) e da procura de duplicados (marcador "Atividade do checklist da Mentorei" na descrição).
  Script 28 + decisões dela (2026-10-09): NA AGENDA SÓ ENTRA bloqueio e reunião com link ("Só no checklist" não aparece na agenda nem em
  Minha agenda). Convidados (só para bloqueio/reunião): `participantes` da equipe (horário na agenda deles, e-mail ou convite do Google,
  leem a atividade; filtro "Em que fui convidado(a)") e `externos` [{nome, email, whatsapp}] (e-mail recebe o convite do Google na
  reunião; WhatsApp e, no bloqueio, e-mail = janela "Avisar quem é de fora" com mensagem pronta via janelaWhatsApp/mailto, aberta depois
  de salvar). Na aba Checklist CADA UM VÊ SÓ O SEU (inclusive a administração); a visão de todos por pessoa fica SÓ no Painel
  (`cartaoChecklistEquipe`: a fazer, atrasadas, feitas no período, barra de equilíbrio operacional/gestão/estratégica/sem tipo com %,
  cores categóricas validadas #2a78d6/#eb6834/#1baf7a + cinza; "Ver" lista as atividades da pessoa).
- RELATÓRIO DAS TURMAS PARA A EMPRESA (2026-10-09, script 25, `relatorios_turmas`, `telas/relatorio-turmas.js`, `#/relatorio-turmas`,
  botões em Relatórios e Turmas): decisão dela: para o CLIENTE, uma empresa por vez com as turmas escolhidas. `/api/relatorio-turmas-gerar`
  (background, Claude com json_schema, fallbacks "default") calcula os números (presença = média de presentes ÷ participantes previstos;
  realizado = 2 h depois do início) e a IA reescreve as percepções dos mentores para o cliente (sem nomes de participantes, nada interno,
  sem números). Ela revisa tudo na tela (salva sozinho; o texto original do mentor aparece só ali, em "O que o mentor escreveu"), pede
  ajuste à IA ou reescreve. PDF = `public/relatorio.html?id=` + `assets/relatorio.js` (A4, capa petróleo, uma página por turma, impressão
  do navegador "Salvar como PDF"; testado com o Edge em modo headless).
- Google Agenda (script 17, `netlify/lib/google-sync.mjs`): a conta conectada no Painel cria um evento por compromisso com os
  envolvidos como convidados; a chave de cada um fica em `google_eventos` (id fixo `mnt`+sha1, nunca duplica). Liga e desliga em
  Agenda → Google, celular e e-mail (equipe e mentorados separados; começam DESLIGADOS). Sincroniza depois de cada mudança nas telas
  (`avisarGoogle()`), a cada 15 min (agendada → função de fundo) e ao remarcar. Convites feitos à mão são aproveitados (mesmo horário +
  sala do Meet, e-mail ou nome). REGRA: convites RECORRENTES nunca são apagados (nem na limpeza de duplicados, nem quando a sessão some).
  Remarcar nunca cria convite novo sozinho (isso duplicava): se não acha, a tela oferece "Criar convite novo".
  REMARCAR VÁRIAS (2026-10-10, pedido da Cintia): botão "Remarcar várias de uma vez" no Plano de sessões da ficha (com 2+ sessões em
  aberto), `telas/remarcar-varias.js`. Regra (novo horário; passar para um dia da semana, na mesma semana de cada sessão; mover ±N
  semanas) + lista "hoje está → vai ficar" editável à mão por sessão; concluída/cancelada não aparece; já vêm marcadas só as futuras;
  data que cairia no passado não conta. Confere choques (`choques()` aceita `ignorar` com LISTA de ids, para a hora antiga de uma não
  chocar com a nova de outra) e repetidos na própria lista; grava uma por uma (+ remarcacoes), chama /api/agenda por sessão (mesmo
  caminho, sem duplicar; "Criar os convites" para as não achadas) e faz UMA mensagem de WhatsApp para o mentorado e uma por mentor.

- Vendas / Fase 4 (script 19, `telas/vendas.js`, menu "Vendas", só administração; as sócias entram como administração):
  empresas ganham tipo/cidade/UF/porte/origem; `contatos` (quantos quiser, flag marketing com data e quem marcou, para a Fase 5);
  `oportunidades` (etapas: ver Prospecção abaixo; chance padrão por etapa; valor; responsável;
  próximo contato = data + quem + o que, que vira evento "contato" na agenda da semana e no Painel; ultima_interacao_em define
  🔥 quente < 20 dias e ❄ esfriando > 90 dias); `propostas` (versões); `interacoes` (histórico; trigger atualiza ultima_interacao_em);
  `modelos_mensagem` ({contato} {empresa} {responsavel} {servico} {valor}); `metas_vendas`. Toda proposta importada vira oportunidade
  sozinha (proposta.mjs → criarOportunidade; o esquema da IA ganhou "comercial": servico, valor_total, validade, contato, condicoes);
  criar a turma pela importação fecha a oportunidade e liga turma_id. E-mail ao cliente por `/api/vendas-email` (Brevo);
  WhatsApp por wa.me; reunião pelo botão da agenda (convidados pré-preenchidos). `vendas-lembrete` (agendada, 8h): e-mail dos
  contatos do dia por responsável + cria "Renovação ·" para programa/turma terminados (30 dias depois, responsável = 1º admin).

- Propostas geradas pela IA (2026-10-08, script 20, `telas/proposta.js`, rota `#/vendas/proposta/<id>`): na ficha da oportunidade,
  "✨ Gerar com a IA" → cola o pedido (briefing) → `/api/proposta-gerar` (background; Claude com json_schema) escreve o conteúdo
  nos moldes do PowerPoint da Mentorei e monta o .pptx → status gerando → rascunho (tela revisa/edita, pede ajustes à IA,
  "Salvar e montar o arquivo de novo" = `/api/proposta-arquivo`) → Aprovar (Cintia) → Enviar: contato da empresa, busca na lista
  de clientes ou pessoa nova; e-mail com anexo (`/api/proposta-email`, Brevo) ou WhatsApp (wa.me + baixar arquivo) → enviada:
  etapa "proposta", retorno na agenda 4 dias depois (dia útil, 9h; `retornoEm4Dias()` em vendas.js, também usado por
  "Registrar proposta" e pela importação). Arquivo na pasta privada `propostas/<oportunidade>/<proposta>/<nome>.pptx`.
  MODELO ÚNICO (2026-10-11, pedido dela: "Modelo de proposta Mentorei - revisado.pptx", petróleo e bege, títulos em Manrope):
  substituiu os dois modelos claro/escuro de 09/10 (ela não quer dois modelos por enquanto). Não há escolha de modelo na tela;
  `conteudo.modelo` das propostas antigas é ignorado (remontar usa o modelo novo). Ordem das páginas: capa, demanda, visão geral,
  módulos (+ páginas extras), metodologia, personalização, organização, investimento, próximos passos, quem somos, expertise,
  sócias, "Liderar pode ser inspirador" (fixa) e frase final. Os espaços de foto de "Quem somos" e "Expertise" ficaram vazios
  (as "fotos" do modelo antigo eram desenhos verdes do visual anterior): se ela mandar fotos, pôr no modelo.
  O pedido traz SÓ o conteúdo; páginas institucionais (números da Mentorei, sócias, contatos) são fixas no modelo. Preço em caixa
  separada (até 3 opções: por módulo, mentoria individual, turma, mentoria em grupo, pessoa, valor fechado ou outro; valor,
  quantidade opcional → total calculado, nome e detalhe), condições de pagamento e validade (dias; sai no selo do contato em
  "Próximos passos"). A IA NUNCA escreve valores. Logo do cliente opcional: a tela converte para PNG, corta a margem e guarda na
  pasta pública `fotos/logos/<empresa>/<data>.png` (oferece o logo da proposta anterior da mesma empresa); sem logo, o espaço some.
  Tudo isso fica em `propostas.conteudo` (`precos`, `pagamento`, `validade_dias`, `logo`) junto com o texto da IA
  (`versao: 2`); `OPCOES_DA_TELA`/`separarOpcoes` em `netlify/lib/propostas.mjs`. Regras puras (cobrança, total, ícones, conversão
  das propostas do modelo provisório) em `public/assets/proposta-comum.js`, usadas pela tela e pelo servidor.
  MOTOR: `netlify/lib/proposta-pptx.mjs` edita o XML do .pptx (jszip): `MAPA` = páginas e nomes das peças do modelo; títulos com a
  parte final destacada ({texto, destaque}), tópicos com começo em negrito ({destaque, texto}), ícones escolhidos pela IA (15
  desenhos do próprio modelo, `ICONE_PECA`), cartões da visão geral para 1 a 6 módulos, página por módulo, 0 a 2 páginas extras,
  tabela com 1 a 8 linhas (barras por período), investimento com 1 a 3 caixas. Mede cada texto com as larguras reais das fontes
  (`proposta-letras.mjs`, gerado por `ferramentas/larguras-letras.py`: Inter nos textos, Manrope ExtraBold nos títulos): diminui a
  letra se não couber (palavra mais larga que a caixa também não cabe: o PowerPoint quebraria no meio) e devolve avisos para a tela.
  Se a IA deixar item vazio, o texto do modelo (Sicoob) é apagado, nunca fica. Modelo em `netlify/lib/modelos/proposta-modelo.pptx`,
  embutido em `proposta-modelos.mjs` (`python ferramentas/modelo-proposta.py`). O PowerPoint renumera os arquivos slideN.xml pela
  ordem ao salvar: o MAPA usa a ORDEM das páginas, nunca o nome do arquivo.
  FONTES EMBUTIDAS (o cliente vê certo sem ter as fontes): Inter Regular/Bold e Manrope ExtraBold/SemiBold/Light. O PowerPoint só
  embute TrueType fixa e trata peso ≥ 600 como negrito (títulos sairiam finos): por isso as fontes embutidas têm peso 400 e não têm
  os nomes 16/17 (cada peso vira uma família "normal"). Inter: TTF convertidas da OTF dela, instaladas no Windows dela (usuário).
  Manrope: no Windows dela está a VARIÁVEL (o PowerPoint a embute errado, sai ExtraLight em todas); as fixas saem de
  `ferramentas/manrope-fixa.py`. Para trocar o modelo: `python ferramentas/preparar-modelo.py <novo.pptx> <preparado.pptx>` (tira
  anotações, espaço de foto vazio e `saveSubsetFonts`) → `ferramentas/embutir-fontes-modelo.ps1` (PowerPoint fechado; troca a
  Manrope variável pelas fixas só durante o processo, sem mexer na instalação, e salva com fontes embutidas) → conferir em
  presentation.xml que cada fonte está em `<p:regular>` → `modelo-proposta.py` e `larguras-letras.py`. Conferir a fonte embutida
  pelo PDF do PowerPoint com a fonte descarregada do Windows (o PNG de Slide.Export ignora fonte embutida).
  Teste local: o Photoshop traz um Node 22 (`C:\Program Files\Adobe\Adobe Photoshop 2026\node.exe`); jszip em node_modules
  (ignorado pelo git) com `main` apontando para `dist/jszip.min.js`; exportar páginas para PNG/PDF pelo PowerShell (COM do PowerPoint).

- ENVIO DE PROPOSTAS (2026-10-15, script 38, tabela `proposta_envios`; reclamação dela: gerava a proposta e não conseguia enviar).
  Antes: a importada não guardava o arquivo e já nascia "enviada"; a gerada só mostrava "Enviar" depois de "Aprovar"; um destinatário só.
  Agora: a importação guarda o arquivo original em `propostas/importadas/<importação>/<arquivo>` (`guardarOriginal` em
  importar-proposta.js; o servidor só aceita esse caminho) e a proposta nasce `status='aprovada'` ("Pronta para enviar"), sem
  enviada_em; a oportunidade NÃO muda de etapa na importação (nova = "contato"; próximo contato "Enviar a proposta" se não houver
  outro). "✉ Enviar proposta" aparece em rascunho, pronta e enviada ("Enviar de novo": só histórico, sem mexer em etapa/retorno);
  "Aprovar" continua opcional. Janela (`janelaEnviar` em proposta.js): contatos da empresa com e-mail em caixinhas (o principal já
  marcado), "Outros e-mails" (viram contatos da empresa com nome tirado do e-mail e "Confirmar nome e cargo", se marcado), "Mandar uma
  cópia para mim" (cópia oculta pelo Brevo), mensagem padrão se não houver modelo; proposta sem arquivo (antigas/registradas) pede o
  PDF ou .pptx ali e guarda em `<oportunidade>/<proposta>/`. `/api/proposta-email` aceita `para` em lista (até 15), anexa até 4 MB
  e acima disso (ou se o Brevo recusar o anexo) manda botão com link assinado de 60 dias (`linkAssinado` em lib/propostas.mjs), e grava
  `proposta_envios` (e-mail); WhatsApp e "mandei por fora" a tela grava. Cartão "Envios desta proposta" na página da proposta; a
  oportunidade tem no histórico "Proposta importada… Pronta para enviar", "Proposta (versão N) pedida à IA" e "Proposta enviada… para
  Fulano <e-mail>, …". Teste local: "tarefas-teste" (8804), propostas pr1/pr2 do base-falso (pôr status e `__T.proposta_envios = []`).
- DESCRITIVO DOS MÓDULOS PELA PROPOSTA (2026-10-09, pedido dela: ao entrar no módulo, ela e o mentor precisam ver o que deve ser
  abordado, que está na proposta). As turmas da planilha ficaram sem `modulos.tematica`. Botão "Descritivo da proposta" na página da
  turma (e "Trazer da proposta" no módulo sem descritivo), `telas/descritivo-proposta.js`: proposta já na plataforma
  (`importacoes_proposta` prontas ou `propostas.conteudo` da IA; as da mesma empresa primeiro) ou arquivo PDF/.pptx (mesma leitura da
  importação, `lerTextoPdf`/`lerTextoPptx` exportadas de importar-proposta.js) → `/api/proposta-modulos` (background, Claude com
  json_schema; NÃO cria oportunidade) liga cada parte da proposta ao módulo existente pelo tema → resultado em `importacoes_proposta`
  (`resultado.tipo = 'modulos'`, fora da lista de propostas) → a administração confere e marca (módulo que já tem texto vem desmarcado)
  → grava `tematica`, e se marcado `perfil_turma` e `observacoes` da turma. O mentor vê temática e recomendações como texto (não caixa
  desabilitada) e a metodologia da turma no alto do módulo. Sem script novo.

- Prospecção (2026-10-08, script 23, `telas/prospeccao.js`, aba Vendas → Prospecção, rota `#/vendas/prospeccao[/<sistema>]`):
  listas de cooperativas por sistema (1ª lista: Banco Central set/2026, 457 cooperativas; arquivo único em
  `Downloads\Cooperativas para importar na plataforma.xlsx`, mesmo modelo das planilhas "importar no RD"). Etapas do funil agora:
  prospectar (A prospectar) → contato (Primeiro contato feito) → reuniao (Reunião marcada) → apresentacao (Apresentação feita) →
  proposta → negociacao → fechado | perdido. O funil ANDA SOZINHO pelo trigger `marcar_interacao`: ligação/e-mail/WhatsApp →
  contato; reunião → reuniao; apresentação → apresentacao; proposta → proposta; só avança, nunca volta; quem registra vira
  responsável se não houver. "A prospectar" fica FORA das colunas e das contas do pipeline/Painel (`noFunil()`), só na aba.
  Empresa ganhou cnpj (único), razao_social, sistema, central, telefone, email (geral) e situacao (manual; vazio = automática:
  programa/turma em andamento ou venda fechada < 1 ano = cliente ativa; já teve = ex-cliente; senão nunca foi). Fechar venda limpa
  a situação manual. Importação: o navegador lê o .xlsx (SheetJS), compara nomes com as empresas já cadastradas (`conferirCadastradas`:
  igual = marcada; parecida/sigla de UF repetida = ela confere) e manda em blocos de 100 para `importar_prospeccao` (pula CNPJ
  já importado: dá para importar de novo). Empresa ligada só ganha "A prospectar" se não tiver venda, programa nem turma.
  Responsável por sistema: escolhida na importação, guardada em `configuracoes.prospeccao.responsaveis`, trocada por
  `definir_responsavel_sistema` (só o que está em A prospectar). "📞 Liguei" registra a ligação (ou tentativa = anotação, não anda),
  cria o contato com quem falou e o próximo passo. E-mail aceita o e-mail geral da empresa ("Olá, {contato}!" vira "Olá!").
  Relatórios têm "Prospecção: funil por sistema". Proposta importada reaproveita a oportunidade aberta mais adiantada da empresa.
- Notas fiscais e CLIENTES INATIVOS (2026-10-12, script 32, `telas/notas-fiscais.js`): botão "Importar notas fiscais" em Vendas →
  Clientes e → Prospecção. Lê a planilha de controle das notas (aba "Notas fiscais": Número NF, Data emissão, Cliente, CNPJ/CPF,
  valores e impostos, endereço, Código município, Cidade, UF, CEP, Telefone, E-mail; arquivo pronto em
  `Downloads\Notas fiscais para importar na plataforma.xlsx`, com a coluna Cidade tirada do código do IBGE). Um cliente por
  CNPJ/CPF (sem documento = "Cliente sem nome (nota N)", a Juliana completa depois). Nome curto: parte depois do " - " da razão
  social (o traço às vezes virou dois espaços ou vem depois do LTDA), "Sescoop/UF", ou a razão sem LTDA/S.A. Já cadastrada =
  mesmo CNPJ ou mesma raiz (matriz/filial), ou nome/domínio do e-mail parecido que ela confirma num select (nunca duplica).
  Tabela `notas_fiscais` (número único; reimportar não repete) e resumo na empresa (`qtd_notas`, `total_notas`,
  `primeira_nota_em`, `ultima_nota_em`, por gatilho) + `endereco`, `cep`. Nota há menos de 1 ano = cliente ativo; mais antiga =
  inativo (situação automática conta as notas; rótulos agora "Cliente ativo / Cliente inativo / Nunca foi cliente", no banco
  continua `ex_cliente`). Inativo entra em A prospectar com `oportunidades.lista = 'Clientes inativos'` (chips "Lista:" na
  Prospecção: Nunca compraram × Clientes inativos; ordenada por quem mais comprou); ativo sai de A prospectar se estava lá só por
  lista (sem nada registrado). E-mail com cara de pessoa (nome.sobrenome) vira contato "confirmar nome e cargo"; e-mail de setor
  vai para o e-mail geral. Reimportar a planilha atualizada também leva para a lista quem passou de 1 ano sem nota.
  Ficha da empresa tem o cartão "Notas fiscais". Teste local: launch.json "notas-teste" (porta 8803) do site do Radar,
  scratchpad da sessão 38fee57a (teste/ com `simularNotas` no base-falso.js).

- FUNIS DE E-MAIL (2026-10-12, script 34, `telas/funis.js`, aba Vendas → Funis de e-mail, rotas `#/vendas/funis[/<id>[/pessoas|emails|regras]]`
  e `#/vendas/funis/atualizar`): substitui o RD Station (pedido dela; RD tinha só 2 meses e os mesmos contatos da plataforma).
  Funil = sequência de e-mails (`funil_emails`, `dias_depois` = dias depois do anterior; o 1º, depois de entrar) + dias da semana e
  horário de Brasília. "+ Colocar empresas no funil": filtros situação/lista/sistema/UF/tipo; quem recebe = contatos com e-mail (sem
  contato, o e-mail geral) ou só os marcados para marketing; quem pediu para sair não entra; e-mail com formato errado vai para
  `contatos_atualizar`. Tabelas: `funis`, `funil_emails`, `funil_membros` (único funil+email), `funil_envios` (único membro+e-mail;
  a linha é criada ANTES de mandar: nunca repete), `funil_eventos` (chave única), `descadastros`, `contatos_atualizar`, view
  `funil_membros_resumo` (recebidos, abertos, automaticos, cliques, leram, sem_sinal_seguidos). Regras puras e montagem do e-mail
  (texto com **negrito**, [link](url), "## " subtítulo, "- " lista, {nome}, {empresa}, marcador `[continuar lendo]`, rodapé com
  "sair da lista") em `public/assets/funis-regras.js`, usadas pela tela (prévia) e pelo servidor.
  SERVIDOR (`netlify/lib/funis.mjs`): `funis-agendada` (minuto 7 de cada hora) → `funis-fundo` (background) → `rodarFunis()`:
  1) lê no Brevo os eventos dos últimos 3 dias (`/v3/smtp/statistics/events` por tipo) e liga pelo message_id (sem <>);
  loadedByProxy (iPhone) e clique até 120 s depois do envio (antivírus) = 'automatico', não contam como interesse; hardBounce,
  invalid, blocked e 3 softBounce seguidos = e-mail errado (sai de todos os funis + `contatos_atualizar`); spam/unsubscribed =
  descadastro (todos os funis + `contatos.marketing=false`); `recontar_envios` refaz as contas. 2) regras de cada funil:
  passagem (clique/leitura/abertura N vezes → outro funil; opcional avisar Vendas = interação tipo e-mail na oportunidade aberta
  ou oportunidade nova "Engajou no funil · X" em Primeiro contato, próximo contato no dia útil seguinte 9h, responsável da regra ou
  do sistema na Prospecção) e limpeza (N e-mails seguidos sem sinal). 3) envios devidos dentro do horário, limite por dia por conta
  (`configuracoes.funis`: principal 150, marketing 280; plano grátis do Brevo = 300/dia contando convites). Estado da última rodada em
  `configuracoes.funis_estado` (cartão "Envio dos e-mails" na lista de funis, botão "Rodar agora").
  DUAS CONTAS DO BREVO (decisão dela): funil "Clientes e conhecidos" sai pela `BREVO_API_KEY`; "Lista fria" pela
  `BREVO_API_KEY_MARKETING` (conta separada, para reclamação de spam não derrubar convites e o laudo do Radar; remetente padrão
  `BREVO_REMETENTE_MARKETING` ou contato@). Sem a chave, os funis frios não enviam e o cartão avisa ("Como ligar").
  "Leu até o fim": só pela página `public/ler.html?t=` (o e-mail mostra o texto até `[continuar lendo]`); conta 90% da página com
  tempo mínimo de leitura (palavras/7 s). `public/sair.html?t=` + cabeçalho List-Unsubscribe (1 clique do Gmail, POST
  `/api/m/sair`). Links assinados com HMAC da SUPABASE_SECRET_KEY (`token('v', envioId)`; `'e'` = prévia do e-mail de teste, não
  conta nada). Funções: `/api/funis` (admin: situacao, rodar, teste, mover) e `/api/m` (público: ler, progresso, info, sair).
  Teste local: launch.json "funis-teste" (porta 8805) do site do Radar, scratchpad da sessão 16a45b4a (base-falso.js com funis e
  `servidor-teste.mjs`, que roda `rodarFunis()` com Supabase e Brevo de mentira no Node do Photoshop).
- Visual (2026-10-08, aprovado por prévia): petróleo escuro + branco + bege escuro, contraste alto, SEM mudar layout (ela não quer
  reaprender a navegar). Tudo em `public/assets/app.css`: `--lima`/`--verde` apontam para o bege (código antigo continua valendo);
  `--ok` verde só para estados ok; `.cab` é a faixa clara de título; `.cartao.destaque` = cartão petróleo; `.cartao.numero` com borda bege.
  Barra do topo petróleo com `logo-clara.png`. Toda tela nova deve seguir essas classes, não cores soltas.
- MENU (2026-10-09, pedido dela com as Propostas 3 e 4): 3 grupos (Mentoria, Gestão, Negócio) em DOIS formatos que cada pessoa escolhe
  (topo com menus suspensos ou barra lateral de 264 px; abaixo de 900 px vira barra + gaveta). UMA lista `GRUPOS` em `app.js`
  (item: nome, ícone Lucide, rota, `pode` = mesmas permissões do menu antigo; grupo vazio some; mentorado tem Minha mentoria,
  Ferramentas e Meus dados em Mentoria). Desenho em `public/assets/menu.js` (ícones Lucide embutidos) e `menu.css` (cores em
  variáveis --mn-*: fundo #091216, destaque LIMA #C8F04A só no menu, conteúdo #F3F5F4). Escolha em localStorage
  "mentorei.formatoMenu" (topo|lateral, padrão topo), aplicada no <head> do app.html antes de desenhar. Caminho "Grupo › Página"
  (`.mn-caminho`) entra no começo de cada tela; quando a tela começa com `.cab`, ele fica dentro da faixa clara. Papel embaixo do
  nome: "Admin · Mentor(a)" (sem gênero no cadastro, então "(a)"). Para achar o item atual, app.js mapeia rotas de detalhe
  (turma, módulo, sessão, pessoa...) para o item do menu. privacidade.html ainda usa o cabeçalho antigo (.topo em app.css).
- FOTOS (2026-10-10, um mentor não conseguia colocar a foto): o envio usava `upsert: true`, que no Storage exige permissão de SELECT
  e UPDATE na pasta, e a pasta pública `fotos` (script 03) só tem INSERT da própria pasta → "Você não tem permissão". Agora
  `enviarFotoPerfil()` em `perfil-comum.js` envia com nome novo SEM upsert e já grava `perfis.foto_url` (não espera o salvamento
  automático). Abre também foto que o `createImageBitmap` não abre (tenta pela imagem comum) e reduz para 400 px. Incentivo:
  faixa "Coloque a sua foto" abaixo do título de qualquer tela para quem está sem foto (`telas/foto-lembrete.js`, ligada no app.js;
  "Agora não" = 3 dias em localStorage), foto no menu (`menu.foto(url)`, evento `mentorei:foto`), e cartão "Fotos de perfil" no
  Painel (quantos têm foto, quem já entra e está sem, "Lembrar pelo WhatsApp" e "Colocar a foto" pela administração em #/pessoa/id).
- FOTOS DA AULA (2026-10-10, script 29): cartão "Fotos da aula" no módulo da turma; mentor do módulo e administração colocam várias
  de uma vez (reduzidas no navegador: 2000 px + miniatura 480 px) em `turmas/<módulo>/foto/` e `foto-mini/`, linha em
  `modulo_arquivos` com tipo 'foto'. Foto grande com anterior/próxima (setas), Baixar; mentor apaga só as dele. Sem o script 29 a
  tela avisa (administração: "falta rodar o script 29"; mentor: "avise a Cintia"). Os nomes dos mentores no módulo aparecem com foto.
- MATERIAIS NECESSÁRIOS NO MÓDULO (2026-10-21, script 40, `telas/materiais-modulo.js`, pedido dela: lugar no módulo da turma para
  colar, preencher ou subir o checklist de ferramentas, áudio e vídeo e materiais de apoio). Cartão "Materiais necessários" na coluna
  da esquerda (depois de Recomendações): itens em `modulo_materiais` (categoria ferramenta/audio_video/apoio/outro, texto, quem
  providencia opcional mentorei/mentor/cliente, pronto com quem marcou e quando, ordem). Incluir um a um (o tipo acompanha o que se
  escreve), "Colar ou importar lista" (texto colado ou arquivo .docx/.xlsx/.csv/.pdf/.pptx/.txt lido no navegador → `lerLista`: títulos
  "Ferramentas:", "Áudio e vídeo", "Material de apoio:" separam; sem título adivinha por palavras; [x]/☑/coluna "x" = pronto; prévia com
  o tipo para trocar; repetidos não entram; opção de guardar o arquivo), "📎 Anexar arquivo" (tipo 'material' em `modulo_arquivos`,
  `turmas/<módulo>/material/`, até 50 MB; vídeo maior = link do Drive/YouTube como item, que ganha botão "Abrir") e "Copiar para outros
  módulos" da turma (sem o pronto, sem repetir). Editam e marcam: administração e mentor do módulo; outros mentores da turma só leem.
  Sem o script 40 o cartão avisa (administração: "falta rodar o script 40"; mentor: "avise a Cintia"). Teste local: launch.json
  "materiais-teste" (porta 8809) do site do Radar, scratchpad da sessão f7f49e9c (`?sem40=1` = sem o script; md1 tem itens).
- ALUNOS DAS TURMAS E ÁREA DO ALUNO (2026-10-27, script 44, pedido da Juliana: os alunos das trilhas recebem convite, entram com
  senha e veem a trilha). Papel novo `aluno` (perfis/convites). Tabela `turma_alunos` (uma linha por turma; e-mail minúsculo e ligado
  ao login pelo gatilho `ligar_aluno_perfil` e por `criar_perfil_do_convite`; `ativo` = está na turma; `convidado_em`). Página da turma:
  cartão "Alunos da trilha" (`telas/alunos-turma.js`): administração cola a lista da planilha (nome, e-mail, WhatsApp, cargo; tab, ; ou ,)
  ou IMPORTA a planilha (.xlsx/.xls/.csv/.ods, SheetJS do CDN; `linhasDaPlanilha` acha o cabeçalho Nome/E-mail/WhatsApp-Celular/Cargo
  nas 10 primeiras linhas e ignora as outras colunas; sem cabeçalho, manda a linha inteira; o resultado cai na mesma caixa e prévia),
  corrige e-mail/WhatsApp na tabela, manda convite por e-mail ("Convidar todos de uma vez" = todos ainda sem convite; ou os marcados;
  ou "Enviar convite"/"Reenviar" em cada linha, pedido dela 27/10) ou WhatsApp (link que não expira), tira/volta aluno; mentor só vê
  os nomes. Nada sai sozinho. `/api/convidar` aceita `papel: 'aluno'` + `turma_aluno_id` (e-mail do convite fala da trilha:
  `enviarLinkPorEmail({ trilha })`); quem já tem login (mentorado individual, ou aluno de outra trilha que já entrou) só é ligado, sem
  e-mail (`ja_tem_login`; `reenviar: true` força o link novo). "Ver como o aluno vê" = `#/trilha/<turma>` em PRÉVIA para equipe.
  ÁREA DO ALUNO `#/trilha[/<turma>]` (`telas/minha-trilha.js`, menu "Minha trilha" + "Meus dados"; mentorado com trilha também ganha o
  item): tudo vem da função `minhas_trilhas()` (security definer) — o aluno NUNCA lê turmas/modulos direto (percepções e recomendações
  são internas). Mostra empresa, trilha, próxima aula com "Entrar na aula" (link do módulo), módulos com data, mentores, slides para
  alunos, tarefas, gravação e "Avaliar esta aula" (janela de `avaliacao-regras.js`). Primeiro acesso do aluno: `TERMO_ALUNO` e
  `AUTORIZACOES_ALUNO` (termos.js; WhatsApp opcional); sem lembrete de foto.
  LOGO E CORES DO CLIENTE (pedido dela 27/10): `empresas.marca` jsonb { logo: {caminho, largura, altura}, principal, destaque, paleta
  ('azul'… de PALETAS, 'logo' ou 'propria'; vazio = Mentorei) }, vale para todas as trilhas da empresa. Cartão "Logo e cores da área do
  aluno" na página da turma, só administração (`telas/marca-cliente.js`): logo na pasta pública `fotos/logos/<empresa>/` (mesmo
  `paraPng`/`logoAnterior` das propostas, exportados de proposta.js; "Usar o logo da proposta"), 9 paletas, "Usar as cores do logo"
  (`coresDaImagem`), duas cores à mão e prévia. Regras em `public/assets/marca.js`: `tema()` ajusta o tom até ler bem (principal × branco
  ≥ 7; destaque × principal ≥ 4,5; texto do botão preto ou branco ≥ 4,5) e devolve as variáveis (--petroleo, --bege…, --tr-btn-texto)
  que minha-trilha.js põe no elemento da tela (classe `tr-marca`); o menu continua da Mentorei. Logo também no e-mail do convite
  (`modeloEmail({ logo })`). A tela de login é a mesma para todos (antes de entrar não se sabe a empresa).
  MÓDULO: cartão "Para os alunos" (`telas/alunos-modulo.js`): `modulo_arquivos.tipo` 'aluno' (PDF dos slides para alunos; os slides
  oficiais/do mentor continuam só da equipe, decisão dela) e 'tarefa' (tarefa/ferramenta: PDF, Office, ZIP, imagem), pastas
  `turmas/<módulo>/aluno|tarefa/`; envia administração e mentor do módulo; o aluno baixa pelo storage (política `turmas_aluno_ler`).
  GRAVAÇÕES (decisões dela: gravações do Zoom TODAS numa pasta só do Drive da contato@; link "qualquer pessoa com o link", visível só
  dentro da plataforma): tabela `gravacoes` (drive_id único; modulo_id vazio = sem aula; `ignorada`; `compartilhada`; `aviso`).
  `netlify/lib/gravacoes.mjs`: lê a pasta e subpastas (3 níveis, só vídeo), data pelo nome (GMT… do Zoom na nuvem = UTC; pasta
  "AAAA-MM-DD hh.mm.ss Tópico" = Brasília; dd-mm-aaaa = dia) ou pela chegada no Drive; liga ao módulo online cujo horário bate
  (−90 min a fim+30); empate = palavras do nome vs empresa/turma/título, senão fica para a administração; ignora antes de 25/07/2026;
  libera `anyone/reader` só no que está ligado a módulo (desligar/ignorar fecha). Regras testadas com node (scratchpad 81051e2a
  testes/regras.mjs). `/api/gravacoes` (status, pasta, ler, ligar, ignorar, colar [admin ou mentor do módulo]), `gravacoes-agendada`
  (minuto 40 de cada hora) → `gravacoes-fundo` (background). Cartão "Gravações das aulas" na lista de Turmas (`telas/gravacoes-admin.js`):
  conectar o Google de novo (o escopo passou de drive.file para `drive` completo em google-conectar), colar a pasta, procurar agora,
  "Gravações sem aula" para escolher e "Colocar gravação à mão" (escolhe a aula + link). GRAVAÇÃO À MÃO (pedido dela 27/10): também
  no módulo, botão "+ Colocar gravação à mão" (link do Drive, YouTube, Vimeo ou Zoom; `/api/gravacoes` acao colar, `gravada_em` = data
  do módulo; link do Drive é liberado sozinho); a colocada à mão tem "Apagar" (administração ou quem colocou). Vídeo só no computador:
  subir para o Drive (arquivo de vídeo não vai para o Supabase, limite de 50 MB). Se o Workspace bloquear compartilhar fora do domínio, o aviso aparece com o passo a passo do admin.
  GRAVAÇÕES DO ZOOM (script 46, 27/10; ela descobriu que as aulas ficam na NUVEM DO ZOOM, com link e senha; são 2 contas pagas e ela é
  administradora): `netlify/lib/zoom.mjs`. Cada conta = app "Server-to-Server OAuth" no marketplace.zoom.us (escopos: View all user
  recordings `cloud_recording:read:list_user_recordings:admin` e View all user information `user:read:list_users:admin`); Account ID,
  Client ID e Client Secret colados no cartão "Gravações das aulas" (Turmas) → `/api/gravacoes` acao `zoom_ligar` testa e guarda em
  `integracoes` chave 'zoom' ({contas: [...]}; nunca volta à tela; `zoom_tirar` desliga). `lerGravacoes()` lê Zoom e depois Drive
  (opcional, agora num <details>). Por conta: usuários (sem permissão = 'me') → `/users/{id}/recordings` em janelas de 30 dias (1ª
  leitura desde 25/07, depois 45 dias para trás); só reunião com MP4; `escolherModulo({ inicio: start_time, nomes: [topic] })`; SEM
  aula de turma no horário (ex.: mentoria individual) NÃO é guardada; ambígua vai para "Gravações sem aula". Guarda `zoom_id` (uuid,
  único), `senha` (password), `link` = share_url + `?pwd=` recording_play_passcode (documentado pelo Zoom). Aluno vê "Assistir" + senha
  com "Copiar" (`minhas_trilhas` do 46 devolve `senha`). Colar à mão aceita senha. Telas leem `gravacoes` com `select('*')` (funciona
  antes e depois do 46). Ajustes no Zoom para o aluno assistir: desligar "exigir autenticação para ver gravações na nuvem"; conferir
  se apaga gravações depois de N dias. Testes com Zoom e banco de mentira: scratchpad 81051e2a testes/zoom.mjs.
  Teste local: launch.json "alunos-teste" (porta 8820) do site do Radar, scratchpad da sessão 81051e2a (teste/, `?quem=u-aluno`, `?sem44`).
- VISUAL NOVO DA ÁREA DO ALUNO E DO MENTORADO (2026-10-28, opção A da prévia https://claude.ai/artifact/LpvHnCNkQNPoE4LkZHHhPK,
  fase 1 de 4). Peças em `telas/area-aluno.js` (saudação, cartão escuro com anel de %, números, bloco da data, jornada em bolinhas,
  `aplicarMarca`) e classes `.aa-*` no fim do app.css; usadas por minha-trilha.js e minha-area.js (Minha mentoria perdeu a tabela
  "Próximas sessões": a jornada mostra as sessões; falta/cancelada = bolinha riscada). Decisões dela: para aluno e mentorado o menu é
  SEMPRE lateral (sem a escolha topo/lateral; `html.area-aluno` esconde o seletor e o caminho "Grupo › Página"; o grupo se chama
  "Minha área") e o MENU TAMBÉM GANHA AS CORES DO CLIENTE (app.js chama `aplicarMarca`: --mn-fundo/--mn-destaque e as variáveis da
  tela; marca do programa do mentorado, senão a da 1ª trilha; sem marca = petróleo e bege, não o lima da equipe). A equipe não muda.
  FASE 2, FERRAMENTAS DA TRILHA (2026-10-28, script 48): `turma_ferramentas` (turma, ferramenta do arsenal, `modulo_id` = abre no DIA
  do módulo, vazio = desde o começo; só administração muda, mentor da turma lê) e `testes_alunos` (resultado do aluno: turma + perfil;
  aluno cria/atualiza/lê o dele, mentor da turma e administração leem; a empresa nunca). Cartão "Ferramentas da trilha" na página da
  turma (`telas/ferramentas-turma.js`): incluir (só as ONLINE `interna` com ficha no arsenal), escolher o módulo em que abre, tirar
  (respostas ficam), "N de M alunos já fizeram" (M = todos os ativos, até quem não entrou), "Ver respostas" (janela com quem fez,
  quem falta e o resultado por `htmlResultado`), "Ver a ferramenta" (prévia). Aluno: rpc `ferramentas_da_trilha(turma)` (security
  definer; nome, resumo, módulo, data e o `feito_em` dele) → seção "Ferramentas da sua trilha" em minha-trilha.js (feita / aberta com
  "Fazer agora" / fechada com cadeado "Abre no módulo N · data"; "Nova" = aberta há menos de 14 dias e não feita; "Ver meu resultado")
  e o número do meio do cartão vira "ferramentas feitas". A ferramenta abre em `#/ferramenta/<id>/<turma>`: ferramenta-online.js
  guarda em `testes_alunos` (aluno ou mentorado que faz a trilha), manda nome/e-mail/WhatsApp/cargo de `turma_alunos` e a empresa da
  trilha; sem turma continua o caminho do mentorado (`testes`). Sem o script 48 a seção do aluno some e o cartão avisa.
  FASE 3, "SUA PARTICIPAÇÃO" (2026-10-28, SEM script novo): a presença, o envio de tarefas e o painel do RH já tinham sido feitos no
  mesmo dia pela conversa do escopo da Cláudia (script 49, abaixo); a fase 3 só desenha a grade em cima disso. Aluno (minha-trilha.js,
  fora da prévia): linhas Presença (`presente` de cada módulo em minhas_trilhas: Presente/Faltou/Sem registro/futuro), Tarefas enviadas
  (arquivo 'tarefa' com `entregas.arquivo_id` do aluno) e Ferramentas (script 48; as "desde o começo" contam no 1º módulo), "Você fez X
  de Y combinados" e aviso de que pode ir para a empresa. Mentorado (minha-area.js): a mesma grade por sessão (presença pela situação
  da sessão: falta = Faltou, cancelada = sem bolinha; tarefas das concluídas). `grade`/`legendaGrade` em area-aluno.js, `.aa-pt
  sim|parcial|pendente|nao|sem|futuro|nada`. Uma 1ª versão desta fase (outro script 49, leitura do Zoom própria, "Marcar como feita",
  tabela da turma) foi DESCARTADA por repetir o escopo da Cláudia: ficou só na branch `claude/fase3-presenca-guardada`, nunca publicada.
  Decisão dela (28/10): a participação de cada aluno com o nome pode ir para a empresa; as respostas das ferramentas e a pausa, nunca.
  Próxima fase (decidida, ainda não feita): 4) "Pausa só para você": autoavaliação que SÓ o aluno lê (nem a administração; RLS de verdade). Teste local: launch.json "area-aluno-teste" (porta 8830) do worktree, servidor em
  `%TEMP%\aa-teste` (cópia do kit da sessão 81051e2a; caminho curto porque o Python não abre o scratchpad, longo demais);
  `?quem=u-aluno`, `?quem=u-mtd`, `&marca=verde`. Prints de página inteira: Edge headless (`--screenshot`, largura mínima ~500 px).
- ESCOPO DA CLÁUDIA (LMS), 2026-10-28, script 49 (`supabase/49-presenca-rh-envios-lembretes.sql`). A Cláudia mandou um escopo de LMS;
  a Juliana escolheu fazer: presença puxada do Zoom, aulas na agenda do aluno, envios do aluno (como o do mentorado), login e painel
  do RH, números que faltavam no Painel e lembretes aos mentores. Nada disso muda o que já existia; sem o script 49 as telas avisam.
  PRESENÇA: tabela `presencas` (módulo + `turma_aluno_id`, presente, minutos, origem manual|zoom|arquivo). Cartão "Presença dos alunos"
  no módulo (`telas/presenca-modulo.js`; admin e mentor do módulo marcam, os outros mentores da turma leem): "Puxar do Zoom"
  (`/api/presenca-zoom` → `participantesDaReuniao` em lib/zoom.mjs: número da reunião do link do módulo, `/past_meetings/{n}/instances`
  → a vez mais perto da data do módulo (±12 h) → `/report/meetings/{uuid}/participants`; precisa dos escopos
  `meeting:read:list_past_instances:admin` e `report:read:list_meeting_participants:admin` no app do Zoom, além do script 46 e das
  contas ligadas), "Importar lista de presença (arquivo)" (relatório do Zoom, Teams ou Meet, .csv/.xlsx) e Presente/Faltou à mão.
  Regras puras em `public/assets/presenca-regras.js` (juntar entradas da mesma pessoa, ler planilha, ligar participante a aluno por
  e-mail → nome igual → primeiro+último → inicial do sobrenome → apelido curto, sempre só se for um aluno só; presente = metade da
  duração; `FREQUENCIA_MINIMA` = 75%; testadas no Node). Janela "Conferir a presença" antes de gravar (não reconhecidos = escolher quem
  é). Gravar atualiza `modulos.participantes_presentes`. "Alunos da trilha" ganhou a coluna Presença e a frequência média.
  ENVIOS DOS ALUNOS: a mesma tabela `entregas` (mentorado_id virou opcional; `turma_aluno_id`, `modulo_id`, `arquivo_id`) e a mesma
  pasta privada (`<turma_aluno_id>/<envio>/…`); `entregas.js` (`abrirEnvio` com `alunoId`). Aluno: "Enviar a tarefa feita" em cada
  tarefa do módulo e "Seus envios" (+ documento). Equipe: cartão "Envios dos alunos" no módulo e na turma (`telas/envios-alunos.js`),
  bloco "Envios novos dos alunos" no Painel e em Minhas turmas. RESPOSTA DO MENTOR (vale também para o mentorado): `retorno`,
  `retorno_em`, `retorno_por`; botão "Responder" na lista da equipe; quem enviou lê na área dele e recebe e-mail na 1ª resposta
  se autorizou e-mails (`/api/entrega` acao 'retorno'). E-mail aos mentores do aluno: os do módulo (sem módulo, os da turma).
  AGENDA DO ALUNO: "Pôr no Google Agenda" em cada aula (link pronto do Google) e "As aulas na sua agenda": link secreto por pessoa
  (`/api/trilha-calendario`, POST devolve; GET `<perfil>.<hmac>.ics`) que o Google (`render?cid=webcal…`), o iPhone e o Outlook
  assinam e atualizam sozinhos. minhas_trilhas() passou a devolver `aluno_id` e `presente` por módulo ("Você esteve"/"Falta registrada").
  RH DA EMPRESA: papel `rh`; tabela `empresa_rh` (empresa, nome, e-mail, cargo, WhatsApp, `perfil_id` pelo e-mail, ativo, convidado_em).
  Administração: Painel → Empresas e programas → "Acesso do RH" (`telas/rh-acesso.js`: cadastrar, convite por e-mail ou WhatsApp,
  tirar/devolver acesso, "Ver como o RH vê" = `#/rh/<empresa>`); `/api/convidar` aceita `papel: 'rh'` + `empresa_rh_id` (RH que já
  entra só ganha a empresa). RH: menu "Painel da empresa" + "Meus dados", termo `TERMO_RH`, cores do cliente no menu e na tela.
  `telas/painel-rh.js` lê SÓ a rpc `painel_rh(empresa)` (security definer): trilhas (alunos com presença e situação, encontros com
  presentes e avaliações, nota/NPS só com 3+ respostas, certificados) e mentorias individuais (sessões feitas, faltas, tarefas);
  nunca percepções, anotações, envios ou respostas. "Baixar em Excel". O TERMO_ALUNO agora diz que o RH vê presença e conclusão.
  PAINEL: bloco de números das trilhas em "Mentoria em grupo" (rpc `numeros_trilhas(empresa)`, só admin, segue o filtro de empresa):
  alunos e quantos entraram, frequência, conclusão (75%), encontros com chamada, nota, NPS, "aprenderam bastante", certificados,
  envios e gravações.
  LEMBRETES AOS MENTORES (`netlify/functions/mentor-lembretes.mjs`, todo dia 8h): por módulo e mentor, só se falta algo: 3 dias
  antes = slides do mentor; 2 dias antes = ferramentas (arquivos "tarefa" + "Materiais necessários" de ferramenta) e slides com o QR
  (quem envia os slides confirma o QR); 1 dia depois = percepções ("avaliar a turma"), presença dos alunos e fotos. Uma vez por tipo
  (`avisos_mentor`); lembretes do mesmo dia vão juntos. Desligar: `configuracoes.lembretes_mentor = {"ligado": false}`.
  Teste local: launch.json "lms-teste" (porta 8840), servidor em `%TEMP%\lmst` (cópia do kit da área do aluno + presença, envios,
  RH: `?quem=u-claudia`, `?quem=u-aluno`, `?quem=u-rh&marca=verde`); testes de Node (regras, lembretes, agenda, Zoom) em `%TEMP%\lmsed\t`.
- AVALIAÇÃO DAS TURMAS (2026-10-11, script 31; substitui o Google Forms e o QR colado à mão do script 30, cuja tabela `qr_avaliacao`
  ficou sem uso). Proposta aprovada: https://claude.ai/artifact/7bBE6Xw7sfgMtnF5tt6JH4. Decisões dela: TUDO ANÔNIMO (não se grava
  nome, login, IP nem aparelho; nem a Mentorei sabe quem respondeu); o aluno vê no fim a MÉDIA de recomendação 0–10 e o total de
  avaliações (rpc `avaliacao_contador`); o NPS oficial (−100 a +100) só nos relatórios; comentários vão DIRETO ao mentor (ela não quer
  ler antes). Ela vai mandar a planilha das respostas antigas do Forms: importar em `avaliacoes` com origem 'google_forms', `formacao`
  = nome que o aluno escreveu, escalas antigas em `extras` (o NPS antigo ia de 1 a 10, sem o 0).
  Página pública `public/avaliar.html?m=<módulo>` (sem login; 6 telas: nota geral 0–10, carinhas 1–5 para aula, cada mentor, conteúdo e
  ferramentas, aprendeu + tempo, NPS 0–10, comentário com pergunta que muda pela nota + atalhos, temas). Grava pela função `/api/avaliar`
  (`netlify/functions/avaliar.mjs`): aceita de 24 h antes do início até as 23h59 do 10º dia depois da data do treinamento (decisão dela, 12/10; `janelaAvaliacao`); QR de um módulo de dia anterior cai no
  módulo da mesma turma que acontece hoje. Textos e contas compartilhados em `public/assets/avaliacao-regras.js`.
  QR code: desenhado no navegador a partir do link do módulo (`public/assets/vendor/qrcode.js`, qrcode-generator MIT), nada guardado;
  cartão "Avaliação da turma" no módulo (`telas/avaliacao-modulo.js`): Baixar (PNG 1200×1500 com título e nome do módulo), Copiar o
  link e o resultado do encontro (mentor vê só a PRÓPRIA nota de mentor pela regra de `avaliacao_mentores`; administração vê cada um).
  Gestão › Avaliações (`telas/avaliacoes.js`, `#/avaliacoes/<aba>`, só administração): visão geral, por módulo, por mentor,
  comentários, temas pedidos; filtros período/empresa/turma/mentor; Excel. `avaliacoes-email` (agendada, de hora em hora): 24 h depois
  do fim do módulo, cada mentor (termo aceito, e-mail real) recebe o resumo com a nota dele; marca `modulos.avaliacao_aviso_em`.
  HISTÓRICO DO GOOGLE FORMS (2026-10-12, aprovado por ela): 4.197 respostas (03/2023 a 06/10/2026) importadas com origem 'google_forms'
  por SQL gerado FORA do git (tem comentários): scratchpad da sessão cd1d8727, `historico/gerar2.py` (planilha baixada como CSV pelo link
  compartilhado). Rodado em 12/10: 4.197 importadas, 206 ligadas a módulo, contador 9,8. ATENÇÃO: o SQL Editor do Supabase roda cada
  comando separado e segue depois de erro: SQL para ela colar deve ter comandos independentes e que possam rodar de novo (sem temp table). A recomendação antiga era de 1 a 5 (apesar do texto "0 a 10"): gravada ×2 em `nps`; relevância→conteudo e
  materiais→ferramentas convertidas de 1–10 para 1–5 (ceil/2); didática vira nota do mentor (avaliacao_mentores) quando há módulo; tudo o
  original em `extras.escala_antiga`; `extras.chave` (md5) evita duplicar se importar de novo. 25 nomes de ALUNOS tirados de `formacao`.
  Ligação a módulo só desde 01/08/2026 (módulos anteriores não existem na plataforma), feita no próprio SQL: módulos até 3 dias antes da
  resposta, pontos por palavras do título/turma/empresa + apelidos ("desenvolvimento de líderes" = Sicredi Expansão; "trilha"/"lideranças"
  = Cresol Conexão); sem certeza fica sem módulo. Histórico não dispara e-mail (marca avaliacao_aviso_em). No relatório, respostas sem
  módulo aparecem agrupadas por mês ("Histórico de <mês>") e a didática conta na nota de mentor da visão geral (`notasDe`).
  FICHAS DE PAPEL (2026-10-28, script 50): quando a turma não consegue usar o QR, a equipe tabula as fichas numa planilha e elas entram
  com origem 'papel' ligadas ao módulo (1º lote: Cresol Amazônia, Formação Ativa Idade, 26/10, Viviane, 11 fichas, `extras.lote`
  = 'papel-ativa-idade-2026-10-26'). Conversão (Muito satisfeito 5 … Insatisfeito 1, marcação dupla não conta, média arredondada):
  geral = nota geral; mentor = conhecimento/esclarecimento/linguagem/relacionamento; conteúdo = conteúdo/qualidade do assunto/assuntos
  práticos; aula = qualidade da apresentação/tempo de duração; ferramentas e NPS vazios; comentário = positivos + melhorar + sugestões;
  critérios originais em `extras.criterios_1a5`; nome de aluno escrito na ficha é tirado. Não reabre o e-mail ao mentor (aviso já marcado).
  Próximo lote: gerar o SQL do mesmo jeito (scratchpad desta sessão: %TEMP%\aval\scripts\gerar.py lê a planilha sem openpyxl).
  O módulo é achado pelo DIA da ficha (Cresol + "ativa idade"; mais de um no dia = o que tem a Viviane): a Cresol tem uma turma
  "Ativa Idade" por cidade, quase todo dia; janela de vários dias deu "não achei" (1ª tentativa dela, 28/10).
  MENTORES DO HISTÓRICO (2026-10-28, script 51, planilha `mentorei_avaliacoes_por_mentor.csv`: 2.317 respostas do Forms com o mentor,
  2.337 notas; "Ju Vivi" = Juliana + Viviane; confiança Alta/Provável): liga cada linha à resposta já importada pelo horário exato
  (Brasília ou UTC, o que achar mais) + didática, e grava `extras.planilha_mentores` {id, encontro, mentores: [{nome, didatica,
  confianca, perfil_id?}]}; quem tem cadastro (mesmo 1º nome entre mentores/tambem_mentor, só se único; "Lu" = mentora "Lu…" do
  André Decker) ganha `avaliacao_mentores` (ceil(didática/2)). Respostas mais novas que a última importada (16 a 20/10) entram como
  google_forms novas (`extras.id_planilha`, sem módulo). Menos de 90% ligadas = nada gravado. Tela: `prepararMentores()` em
  avaliacoes.js junta mentores do módulo, das notas e da planilha; sem cadastro = chave "h:<nome>" ("histórico, sem cadastro"),
  vale em Por mentor e no filtro de mentor. Gerador: %TEMP%\aval\scripts\gerar51.py. Teste local: launch.json "avaliacoes-teste"
  (porta 8851), kit em %TEMP%\avt (cópia do lmst com av-h1…h5).
- LINK DE CONVITE QUE NÃO EXPIRA (2026-10-12, reclamação: quem não entrava na hora mandava "link expirado"): o código do Supabase
  vence em horas, então o convite (e-mail e WhatsApp) leva `definir-senha.html?c=<código nosso>` assinado com HMAC da
  SUPABASE_SECRET_KEY (`netlify/lib/acesso.mjs`; trocar a chave invalida os links). Ao abrir, `/api/acesso` acao `abrir` confere,
  gera na hora um código de recuperação do Supabase e a página entra com ele. Tipo 'c' (convite) vale até a pessoa criar a senha;
  tipo 's' (Esqueci minha senha) vale 7 dias. Ao salvar a senha a página chama acao `senha_criada` (app_metadata.senha_criada_em,
  hora do servidor): links anteriores passam a mostrar "Você já criou a sua senha". Perfil desativado ou login apagado bloqueia.
  E-mail do convite sai pelo Brevo (`enviarLinkPorEmail`); sem Brevo, cai no e-mail do Supabase (que vence). "Esqueci minha senha"
  e a página de link vencido usam acao `pedir` (resposta sempre igual; no máximo 1 e-mail a cada 2 min por pessoa).
- CONVITES EM LOTE (2026-10-12, `telas/convites.js`, Gestão → Convites, só administração): mentorados + equipe numa lista com a
  situação (já entrou / ainda não entrou / não convidado / sem e-mail) e "Enviar convite por e-mail para N pessoas" (um /api/convidar
  por pessoa, resultado em cada linha). `#/convites/brasdiesel,lorena` filtra e já marca: pela empresa/programa só quem ainda não
  entrou; pelo nome da pessoa marca mesmo se já entrou; nunca marca sem e-mail, inativo ou nome com "modelo"/"teste".
- VÁRIAS TAREFAS POR SESSÃO (2026-10-12, script 33, tabela `tarefas`; helper `public/assets/tarefas.js` com `juntarTarefas()`,
  que põe `s.tarefas` em cada sessão e, sem a tabela, usa a tarefa única antiga `sessoes.tarefa*`): na sessão, "+ Adicionar tarefa"
  (texto + prazo por linha, ✕ tira; salva junto com o resto). Mentorado vê só as de sessão concluída e marca cada uma como feita;
  sessão concluída só a administração muda (trigger `protege_tarefa`). O script copia as tarefas antigas uma vez (tabela vazia).
  Ficha, Painel, Meus mentorados, lembretes, relatórios/Excel, resumo com IA e WhatsApp já leem a lista.
  Teste local: launch.json "tarefas-teste" (porta 8804) do site do Radar, scratchpad da sessão b18f9662 (?sem33 = sem o script).
- TROCAR OU INCLUIR MENTOR NO MEIO DO PROCESSO (2026-10-20, a Cláudia ia atender a Dani e não via as sessões; antes não havia
  como mudar os mentores depois do cadastro). `telas/trocar-mentor.js`, só administração, sem script novo (admin_tudo). O que libera
  ficha, sessões, anotações e documentos é o vínculo `mentor_mentorado`; o que põe a sessão na agenda e no "hoje" de Meus mentorados
  é `sessoes.mentor_id`: a janela acerta os dois. Botões: "Trocar ou incluir mentor" no alto da ficha, "Trocar mentor" e ✎ por sessão
  no Plano de sessões, "Trocar mentor" na tela da sessão. Quem atende + quais sessões (só a de hoje/clicada, essa e as seguintes,
  escolher, nenhuma = só acesso) + quem já acompanha continua (padrão) ou sai (bloqueado se ficar com sessão em aberto). Concluída
  ou cancelada nunca muda de mentor. Depois: avisarGoogle() e WhatsApp pronto para quem entra (com link de senha se ainda não
  entrou), para o mentorado e para quem atendia antes.
- SUSPENDER PROGRAMA (2026-10-27, mentorado desligado da empresa; script 45, `telas/suspender.js`): botão vermelho "Suspender
  programa" no alto da ficha, só administração. Janela com o que vai acontecer, motivo obrigatório e caixa "Confirmo" (o botão só
  liga com os dois). Tudo de uma vez no banco (rpc `suspender_programa`): cancela as sessões em aberto agendadas/remarcadas de hoje
  em diante ou sem data (as que já passaram ficam como estão), apaga os vínculos `mentor_mentorado` (mentores livres; a ficha sai da
  lista deles) e marca `status='suspenso'` com `suspenso_em`, `suspenso_por`, `suspensao_motivo` e `suspensao` (jsonb: situação
  anterior, mentores, sessões canceladas com a situação de antes), e grava `historico` acao='suspender_programa'. Nada é apagado.
  Ficha suspensa: faixa vermelha com data, quem e motivo; somem suspender, trocar mentor, sessão extra, remarcar e "Abrir sessão N".
  Agenda e Google Agenda tratam 'suspenso' como 'desligado'. Lista de mentorados: filtro "Suspensos".
  REATIVAR (mesmo dia): botão "Reativar programa" na faixa vermelha (admin), caixa "Confirmo" obrigatória, motivo opcional; rpc
  `reativar_programa` (no mesmo script 45): volta `status_antes`, reinsere os mentores guardados e devolve as sessões que a suspensão
  cancelou à situação anterior (as que ficaram no passado: a janela manda usar "Remarcar várias de uma vez"). `suspensao` ganha
  reativado_em/por/por_nome/reativacao_motivo e a ficha mostra a faixa "Programa reativado em…"; historico acao='reativar_programa'.
- EDITAR SESSÃO CONCLUÍDA (2026-10-14, pedido dos mentores: voltam no fim do dia para completar): no mesmo dia a Juliana pediu
  SEM PRAZO (o script 36 dava 7 dias; o 37 substitui). `trava_sessao_concluida` e `protege_tarefa`: o mentor do mentorado completa e
  corrige qualquer sessão concluída (não muda `concluida_em`/`concluida_por`). Sem o script 37 o salvamento do mentor mostra
  "falta rodar o script 37". O WhatsApp do resumo monta a mensagem no clique (texto atual).
  A tela da sessão também mostra "Ferramentas que <nome> respondeu" (tabela `testes`, as mesmas da ficha; "novo" = depois da última
  sessão concluída).
- ENVIOS DO MENTORADO (2026-10-14, script 37, tabela `entregas` + pasta privada `entregas` em `<mentorado>/<envio>/<n>-<arquivo>`,
  helper `public/assets/entregas.js`): pedido dela: o mentorado anexa documentos e manda tarefas e ferramentas preenchidas aos mentores.
  Em Minha mentoria: "Enviar a tarefa" em cada tarefa (com "Marcar a tarefa como feita" já marcado), "Enviar preenchida" nas ferramentas
  em PDF (as online não têm: o resultado já chega pela tabela `testes`) e "+ Enviar um documento"; lista do que mandou com "Visto pelo
  mentor"/"Ainda não visto" e ✕ para apagar. Arquivos: PDF, Word, Excel, PowerPoint, LibreOffice, texto, fotos (até 25 MB cada) ou só
  recado. Equipe: cartão "Documentos enviados por <nome>" na ficha e na tela da sessão; o primeiro MENTOR DO MENTORADO que baixa um
  arquivo marca `visto_em` (administração só olhando não marca); bloco "Documentos novos dos mentorados" nas pendências (Meus mentorados
  e Painel). E-mail aos mentores por `/api/entrega` (uma vez por envio, `avisado_em`; só quem aceitou o termo e tem e-mail real; sem
  anexo). Sem o script 37 os botões não aparecem. Teste local: o "tarefas-teste" (8804) serve, criando `window.__T.entregas = []`
  (e `mentor_mentorado`) e trocando de tela.
- PEDIDOS DA CINTIA (2026-10-20, sem script novo):
  AGENDA DA COORDENAÇÃO: administração que não é mentora (`papel='admin'` e `tambem_mentor` falso/nulo = a Cintia) entra em
  `d.mentores` com `coordenacao: true` (só na leitura da administração, `carregarAgenda`). Aparece no quadro, na semana, na planilha,
  em "+ Bloqueio" (já vem ela mesma) e em Agendas pessoais da equipe; botão "Minha agenda" no alto da Agenda abre o mês dela com
  bloqueios, dias de trabalho e o cartão da agenda pessoal (Outlook/Gmail). Decisão da Juliana: a equipe vê só "ocupada" — para
  quem não é ela, `agenda_pessoal` vira "Ocupada" (sem local/link/organizador) e o bloqueio perde motivo/categoria (`oculto: true`,
  abre só uma janela informativa, sem mudar). Fica FORA de: encaixe, pré-bloqueios, conferência de módulos, Números, resumo semanal
  e WhatsApp, verde de "dia livre" da equipe toda, e convites do Google (google-sync pula bloqueio de quem não é mentor).
  MÓDULOS: na turma, "Excluir módulos" (vários de uma vez; no módulo, "Excluir este módulo"): apaga arquivos da pasta `turmas`
  (foto + miniatura), apaga os módulos (o banco apaga mentores/arquivos; avaliações ficam sem módulo) e renumera os que ficam
  em ordem crescente (único turma_id+numero). "Link da sala para vários": um link para os módulos marcados (presenciais fora);
  Zoom/Meet/Teams no link muda o "onde acontece".
  PROPOSTA SEM TURMA: Vendas → "✉ Enviar proposta (PDF)" (atalho `#/vendas/enviar-proposta`, também em Turmas): cliente da lista
  ou novo, contato, arquivo → oportunidade (reaproveita a aberta mais adiantada) + proposta `aprovada` com o arquivo em
  `propostas/<oportunidade>/<proposta>/` → `janelaEnviar` (exportada de proposta.js). Turma só depois da aprovação.
  Teste local: launch.json "cintia-teste" (porta 8808) do site do Radar, scratchpad da sessão 368789c4 (Cintia com bloqueio e
  agenda pessoal no base-falso.js; `?quem=u-ju` para ver como a Juliana).

- FINANCEIRO (2026-10-30, pedido da Juliana; proposta https://claude.ai/artifact/SboYmvuWZKXA5d62B1ntXM, 4 etapas). Fonte de hoje:
  planilha da Cintia "Controle de NF e recebimentos.xlsx" (Drive, id 1Mgz63GMTw4FAmaIsn-EYXrBxjdLQ7Wxb: Faturamento 2021–2026, Contas =
  extrato Sicoob/Unicred, Despesas/Partners, uma aba por parceiro, Precificação/distribuição). Decisões dela (30/10): só sócias e Cintia
  veem (distribuição das sócias só as sócias); mentores NÃO veem quanto vão receber (a Cintia completa o cadastro financeiro de cada
  mentor, confere valor e horas por turma/mentoria e a plataforma calcula); fatura por módulo dado OU por parcela com data (cada turma
  ou programa diz qual); extrato do banco em arquivo; nota sai pela Contabilizei (CNPJ principal) ou pela prefeitura (outro CNPJ, quase
  sem uso); margem simulada com horas dos mentores e das sócias (hora da sócia = 3 × hora de referência dos mentores) e custo
  estimado de viagem (avião: véspera e dia seguinte, 2 noites, 3 dias de refeição e transporte; carro: km; quem paga vem da turma).
  ETAPA 1 (script 52, `telas/financeiro.js`, regras puras em `public/assets/financeiro-regras.js`, Negócio › Financeiro, só admin):
  `fin_planos` (um por turma ou programa, índice único; ou avulso; modo modulo|parcelas, valor_total, valor_modulo, emissor
  principal|outro, pagador_nome/cnpj quando paga o Sescoop etc., prazo_dias, descricao_nota), `fin_receber` (linha por módulo ou
  parcela: aberto → faturado (nota_numero, emitida, vencimento) → recebido (recebido_em, valor_recebido) | cancelado; linha em aberto
  ligada a módulo acompanha a data do módulo ao abrir a tela), `fin_despesas` (manual nesta etapa; cliente/turma/módulo, reembolsável,
  pago_em, conta, origem) e `fin_despesas_fixas` (entram sozinhas no mês, uma vez: índice único fixa_id+competencia), `fin_meses`
  (faturado da planilha 2021–09/2026 e metas 2026; antes de `configuracoes.financeiro.inicio` vale a planilha, dali em diante as
  linhas da plataforma pela data). "Montar plano" lê a proposta da oportunidade ligada à turma/programa (`sugestaoDoValor`: preço
  "por módulo" da proposta da IA, senão o total da proposta ou da oportunidade); linhas de meses anteriores nascem "Recebido" (ela
  muda). Abas: Visão geral (mês: faturado × meta × mesmo mês do ano anterior, recebido, a receber/atrasado, despesas, "Para fazer",
  barras do ano e total por ano desde 2021), Emitir nota (várias linhas na mesma nota; "Copiar texto" para o emissor), A receber (por
  nota; Recebido divide o que entrou na proporção; Voltar = nota cancelada), Turmas e mentorias (sem plano + planos), Despesas.
  CONFERIR (script 53, 30/10, pedido dela: "não quero depender da Cintia"): `fin_planos.conferir` e `fin_despesas.conferir` (texto =
  recado; vazio = conferido) e origem 'planilha'. Aba Financeiro → Conferir: planos a validar ("Abrir e conferir"; salvar limpa) e
  despesas com "É de…" (turma, mentoria individual, só o cliente, "Despesa pessoal de" sócia = categoria 'socia' + pessoa_id, ou
  Mentorei geral) + Confirmar. Regra dela: despesa que não é fixa vai para um programa; senão é despesa pessoal de uma sócia (com o
  nome). Sócias = Juliana, Viviane, Cláudia (pelo nome; `configuracoes.financeiro.socias` com ids, se um dia precisar).
  CARGA DA PLANILHA (30/10): gerada fora do git (dados financeiros) por scratchpad %TEMP%\fin53\scripts (ler.py → classificar.py →
  gerar.py → dados/carga.json, ids md5 'fin53:…', rodar de novo não duplica) e gravada pelo login dela no navegador: 10 despesas
  fixas (agência desligada: último pagamento em março) + 86 lançamentos delas de jan–set/2026, 101 despesas com recado (retiradas
  das sócias ficam de fora: distribuição), 27 planos (turmas e mentorias ativas + Adidas) com 133 linhas, valores da aba
  Faturamento 2026 (antes de outubro = recebido; outubro = nota emitida; depois = em aberto; exceções no próprio recado). Groove
  cadastrada em 30/10 (nota para ELS Informação, CNPJ 03.068.339/0001-18; mentoria individual de 3 profissionais, 7 × R$ 5.400) com plano
  avulso. Isidorus Flores fica em Holambra (nota para Johannes T. J. Kortstee, CNPJ 07.947.721/0001-52). "Holambra - HUB de inovação"
  (maio a agosto na planilha, sem valor e sem nota) é outro contrato: ela decidiu deixar de fora por enquanto (30/10).
  REEMBOLSOS DAS SÓCIAS (30/10): os "Relatório de despesas de viagem" da Cintia (PDF, um por sócia e mês; o PERÍODO às vezes está
  errado: vale a DATA DE ENVIO; gasto sem data = data de envio) substituem o reembolso agrupado da aba Contas pelo detalhe (soma igual,
  conferida): 11 relatórios → 66 gastos (pessoa_id = sócia, pago_em = dia do reembolso, observacoes com envio/reembolso), ligados ao
  cliente pelo texto (Crefaz = Maringá/Cascavel/Hortolândia, Isidorus = Holambra, Groove, Adidas, Maceió = Sicredi Expansão, Fernando =
  programa dele, Curitiba 18-19/08 = Central Sicredi); sem cliente = categoria socia com recado. Gerador: %TEMP%\fin53\scripts\reembolsos.py.
  Sem relatório ainda: Cláudia 05/02 (6.570,49) e 19/03 (1.489 e 1.560), Ju março (623,56), Pix Juliana (240), Vivi-Ju 30/09 (1.910,64).
  EXTRATOS: Sicoob 01-14/10/2026 lançado (fixas de outubro pagas, 11 saídas com recado, origem "extrato"; 3 × 8.900 do Sescoop em 06/10 =
  módulos de setembro da Sicredi Expansão recebidos; CCS 8.070 em 07/10 sem plano). Conta Sicoob 74.479-4 e Unicred 87378 são da
  FSK Capital Intelectual Ltda (CNPJ 30.589.703/0001-68), que também emite NFS-e pela prefeitura de Campinas. O da Unicred veio de 2025.
  ETAPA 2 (script 54, 30/10): DESPESA POR FOTO DO RECIBO: no "+ Despesa", "📷 Ler a foto do recibo" (foto ou PDF; foto reduzida a
  1600 px no navegador) → pasta privada `financeiro` (recibos/AAAA-MM/<uuid>) + linha em `fin_recibos` → `/api/despesa-recibo`
  (background, claude-opus-5-5 com imagem/PDF e json_schema: data, valor, estabelecimento, cnpj, cidade/uf, categoria, descricao,
  pessoa, observacoes) → a tela espera e preenche; `sugerirModulo` (telas/financeiro-recibo.js) acha pela agenda o módulo de ±1 dia
  na cidade do recibo (senão o presencial mais perto; empate = não escolhe). Comprovante em `fin_despesas.comprovante` (📎 na lista,
  link de 10 min), origem "foto". MENTORES (aba Financeiro → Mentores, `telas/financeiro-mentores.js`; parceiros = papel mentor ativo;
  sócias são admin e ficam de fora): `fin_mentores` (forma hora|atendimento|modulo|mensal|percentual, valor, cidade_saida, nome para
  pagamento, documento, PIX, emite_nota), `fin_mentor_valores` (valor combinado por turma/programa + conferido), `fin_pagamentos`
  (mês: linhas calculadas por `calcularPagamento` em financeiro-regras.js com as aulas = modulo_mentores + módulos do mês já
  passados, duracao_min, e sessões realizadas, duracao_min ou do programa ou 60; ajuste por linha com motivo; aberto → aprovado →
  pago: cria uma despesa "parceiros" por turma/programa e guarda os ids em `despesas`; "Desfazer o pagamento" apaga). Extrato do
  mês para o mentor (copiar/WhatsApp). Visão geral: "N mentores parceiros sem cadastro financeiro". O mentor não vê nada.
  Próximas etapas: 3) extrato OFX;
  4) margem (com horas e viagem estimada), fechamento do mês, distribuição, caixa 90 dias, avisos. Teste local: launch.json
  "financeiro-teste" (porta 8860) do worktree, kit em %TEMP%\fint (cópia do avt com fin_* no base-falso.js; `?sem52`).
- CERTIFICADOS (2026-10-27, script 47, `telas/certificados.js`, Gestão → "Emitir certificados", só administração = Cintia e sócias;
  `#/certificados[/nova|/<pasta>[/emitir|/emitidos|/editar]]`). Pacote dela em `docs/certificados/` (ESPECIFICACAO.md, protótipos,
  referência Python, exemplos; FORA do site: a Netlify só publica `public/`). REGRA: o desenho não muda; `public/certificados/modelo/`
  é CÓPIA IDÊNTICA de `docs/certificados/template` (conferir com sha1 se mexer) e só recebe dados por `CertificadoMentorei.render(dados)`
  ou postMessage (prévia em iframe 1123×794 escalado, `montarPrevia`). ÚNICA MUDANÇA NO DESENHO, pedida por ela (28/10): verso sem o traço
  (.fio) e slogan centralizado embaixo do logo; frente com "Educação Corporativa" (`.logo-sub`, mesma letra do slogan) embaixo do logo;
  os dois centrados na palavra MENTOREI (21 mm da esquerda do logo, sem o ®). Feita nas DUAS cópias (docs e public continuam idênticas);
  os PDFs de docs/certificados/exemplos são de antes disso. Regras e textos (datas por extenso, período, horas, maiúsculas,
  retrato, QR SVG #0E3B44 margem 1, CSV com BOM e ";", nomes dos arquivos) em `public/assets/certificados-regras.js` (telas e servidor).
  Tabelas: `cert_pastas` (uma por cliente e programa; logo do cliente na pasta pública fotos/logos, o mesmo das propostas/área do aluno),
  `cert_assinaturas` (lista reaproveitável; lado mentorei/cliente; exclusão só marcada), `cert_certificados` (código único
  MTR-AA-XXXX-XXXX sorteado no banco por `cert_novo_codigo()` com gen_random_uuid, nunca sequencial; `dados_snapshot` = retrato que a
  verificação lê; `sem_assinatura`; `pdf_caminho`), `cert_lotes`; rpc `cert_emitir(pasta, nomes[], retrato, sem_assinatura)`;
  pasta privada `certificados` (assinaturas, PDFs, propostas). Sem CPF. Decisões dela (27/10): QR = https://certificados.mentorei.com.br/CODIGO;
  escolhe quem assina pela Mentorei E pelo cliente (2ª assinatura); pode gerar SEM assinatura (aviso "sem assinatura") e depois gerar de
  novo a versão final com os mesmos códigos; PDFs prontos guardados 45 dias (depois gera de novo igual, a qualquer momento, um aluno ou todos).
  ASSINATURAS (etapa 2, `telas/certificados-assinaturas.js` + `public/assets/assinatura.js`): o fundo sai NO NAVEGADOR com o mesmo
  cálculo de `referencia/assinatura.py` (mediana 31×31 em 1/4 do tamanho por histograma, piso = percentil 60, (fundo-brilho-28)/70,
  partes < max(30, 0,04% da área) saem, contorno de 3 px, margem 3%+4, PNG de até 1600 px); conferido com a referência em Node
  (scratchpad 76384cb3 ass/: mesmo recorte, diferença máxima 0,0017; foto com sombra forte num canto deixa a mesma mancha nas duas).
  HEIC pelo heic2any (CDN). Guarda original + clara + escura em `certificados/assinaturas/<id>/`; links temporários de 1 h, nunca
  públicos; "Usar" só com nome e aceite. "Não salvar na lista" = grava já com excluido_em (vale só naquela pasta).
  LOGO DO CLIENTE (28/10, reclamação dela: logo com fundo branco "bem feio"): `public/assets/logo-certificado.js` (`tratarPixels` pura):
  a cor que domina a borda vira transparente no logo todo (some também o miolo das letras; borda suave e cor descontada do fundo, sem halo),
  recorte; para cada padrão (fundo #F2EADF / #0E3B44) mede o contraste: < 55% dos pixels com contraste 2,2 OU ≥ 12% com contraste < 1,8
  (o nome que some) → sugere "Uma cor só" (silhueta na tinta do certificado, #0E3B44 no claro e #F2EADF no escuro, com o quase branco de
  dentro vazado). Guarda 3 PNG em fotos/logos/<empresa>/<ts>-cores|claro-uma-cor|escuro-uma-cor.png; `cliente_logo` = {caminho, versoes,
  clara, escura ('cores'|'uma_cor'), fundo_removido}; a pasta escolhe por padrão (botões "Cores do logo"/"Uma cor só" com amostra nos dois
  fundos). `caminhoLogo(l, variacao)` em certificados-regras.js (retrato e prévias). Logo antigo sem `versoes` é tratado sozinho ao abrir o
  editor (vale ao salvar). Certificados já emitidos mantêm o retrato antigo: "Gerar de novo todos".
  POR CAMADAS (28/10, 2º teste dela: logo da Isidorus ainda com a placa branca, que tinha margem transparente e/ou contorno em volta):
  a borda olhada é a do retângulo que ainda tem desenho; borda transparente → aperta; 1ª camada sai qualquer cor uniforme; depois (ou
  depois de margem transparente) só sai placa CLARA, ou um contorno fino (até 6 px) que tenha placa clara logo dentro; caixa colorida
  de propósito fica. `TRATAMENTO_LOGO` = 2 em `cliente_logo.trat`: logo com versão menor é tratado de novo ao abrir a pasta, a partir de
  `cliente_logo.original` (o arquivo como veio, guardado em fotos/logos/…-original.<ext> quando é PNG/JPG/WEBP até 2 MB). Testes dos 6
  casos em Node: scratchpad 76384cb3 logos-teste.mjs.
  EMISSÃO (etapa 3, `telas/certificados-emitir.js`): lista de nomes por .xlsx/.xls/.ods (SheetJS; cabeçalho "Nome"/"Nome completo" nas 5
  primeiras linhas), .csv (";" ou ","; cabeçalho só na 1ª linha), .txt ou colado; avisos Repetido / Já tem certificado nesta pasta / Nome
  muito longo (> 70) sem bloquear; "Ajustar maiúsculas"; "Ver o primeiro antes"; pasta sem assinatura pede confirmação. Gerar = rpc
  cert_emitir (códigos no banco) → `/api/certificados` (admin) → `certificados-fundo` (background; chave HMAC por lote; para aos 12 min e
  chama a si mesmo) → `netlify/lib/certificados.mjs`: @sparticuz/chromium 153 + puppeteer-core 25.13 (external_node_modules no netlify.toml),
  abre `${SITE}/certificados/modelo/certificado.html` uma vez, render → pdf (viewport 1280×720 como a referência), QR com qrcode-generator
  1.4.4 (a mesma do vendor), assinaturas/logo em data URI, PDF em `certificados/pdf/<pasta>/<código>.pdf`; "feito neste lote" = pdf_em >
  lote.criado_em. Tela acompanha `cert_lotes` (barra, "Tentar de novo"). ZIP MONTADO NO NAVEGADOR (JSZip + pdf-lib do CDN): "001 Nome.pdf"
  numerados pela ordem do ZIP, todos-para-imprimir.pdf (até 150) e codigos.csv; PDF que falta (45 dias ou mudou) é gerado de novo antes.
  Emitidos: busca por nome ou código, Ver (retrato + QR real), Baixar PDF, Copiar link, Corrigir o nome (mesmo código; regera),
  Cancelar (motivo; opção LGPD apaga o nome e o PDF, sem volta) / Reativar, "Gerar de novo todos" (válidos ganham o retrato atual da pasta
  e a assinatura, mesmos códigos). Tudo no `historico` do certificado. `certificados-limpeza` (todo dia 4h) apaga PDFs com mais de 45 dias.
  Conferido: PDFs locais (Chrome + modelo sem os local() da Manrope, porque o Windows dela tem Manrope) iguais aos de docs/certificados/exemplos
  (mesmas fontes Inter/Poppins, 842×595, 2 páginas; muda só a máscara do QR); scratchpad 76384cb3 proj/gerar-teste.mjs e comparar.py.
  VERIFICAÇÃO PÚBLICA (etapa 4): `public/verificar.html` (visual do protótipo docs/certificados/telas/verificacao.html, montado por
  scratchpad 76384cb3 verificar.py: só troca a busca, os caminhos das imagens para /certificados/modelo/assets/ e tira a barra de
  demonstração e o traço do rodapé) + `netlify/functions/certificados-verificar.mjs` (GET `/api/certificados/verificar/:codigo`, sem login,
  `rateLimit` 30 por minuto por IP na própria função (429), formato conferido antes de ir ao banco, só código exato, devolve só status,
  nome, tipo, curso, carga, período, emissão, cliente, nº de módulos e cancelado_em; `X-Robots-Tag: noindex`). netlify.toml:
  certificados.mentorei.com.br/ (forçado) e /* (só o que não existe) → verificar.html; /verificar/* idem na plataforma. O domínio
  certificados.mentorei.com.br precisa ser ALIAS do site na Netlify (Domain management → Add domain alias) + CNAME "certificados" →
  mentormentorei.netlify.app na Hostinger; HTTPS sai sozinho.
  IA LENDO A PROPOSTA (etapa 5): no passo 2 da nova pasta, "Enviar a proposta ou a trilha" (.pptx/.pdf/.docx; .ppt/.doc antigos pedem
  para salvar de novo): o navegador lê o texto (`lerTextoPptx`/`lerTextoPdf` de importar-proposta.js; `lerTextoDocx` em certificados.js),
  guarda o original em `certificados/propostas/<uuid>/<arquivo>` (vai em `cert_pastas.origem.arquivo_caminho`), cria `importacoes_proposta`
  ("Certificados · <arquivo>") e chama `/api/certificados-extrair` (background, claude-opus-5-5 com json_schema; prompt e esquema do pacote
  copiados em `netlify/lib/certificados-extracao.mjs`, com o "enum com null" do tipo trocado por descrição; o servidor confere tipo, datas,
  números) → `resultado.tipo = 'certificado'` (fora das listas de propostas) → a tela espera (3 s, até 3 min) e preenche o passo 3; as
  `observacoes` da IA aparecem em lista no aviso do alto. Cliente: liga à empresa cadastrada de nome igual ou contido (aí oferece o logo).
  Sem script novo. A leitura pela IA de verdade só roda na Netlify (a chave fica lá).
  ASSINATURA QUE NÃO ENTRAVA (30/10, reclamação dela: pôs as assinaturas das sócias e os certificados seguintes saíram sem): o PDF
  regerado ficava no MESMO nome (`pdf/<pasta>/<código>.pdf`) e o Supabase podia entregar a cópia antiga do cache por até 1 h; e
  imagem que não abria saía em branco, calada. Agora: nome novo a cada geração (`<código>-<tempo>.pdf`; o servidor apaga o anterior,
  e a tela apaga ao corrigir nome ou "Gerar de novo todos"); assinatura ou logo pedido no retrato que não abre PARA o lote com o
  motivo (resolvedorDeImagens estrito). Assinatura só entra se ESCOLHIDA na pasta (a lista "Assinaturas salvas" não aplica sozinha):
  aviso "Esta pasta está sem a imagem da assinatura" + "Escolher as assinaturas" no alto da aba Emitir e etiqueta clicável no topo.
  ESCOLHER A SALVA (30/10, ela clicava em "Enviar assinatura" e a janela pedia a imagem de novo; a lista salva era um select
  que parecia campo): no formulário da pasta as salvas aparecem como cartões com a imagem e "Usar esta" (`cartoesSalvas` em
  certificados-assinaturas.js; a em uso fica "✓ Nesta pasta"); `janelaEnviar` recebe `salvas` e mostra-as no alto ("Já está salva
  na plataforma? Escolha aqui") antes de "ou envie uma assinatura nova". Link de imagem que falha não esvazia mais a lista.
  Etapas: (1) banco, pastas e prévia [feita: turma cadastrada ou do zero]; (2) assinaturas [feita]; (3) nomes, PDFs e ZIP [feita]; (4) verificação pública [feita]; (5) IA lendo a
  proposta [feita]. O QR da plataforma (qrcode-generator) escolhe outra máscara que o `referencia/qr.py`: desenho
  diferente, mesmo conteúdo (conferido com jsQR). Teste local: launch.json "certificados-teste" (porta 8811), scratchpad da sessão
  76384cb3 (teste/ com cert_pastas no base-falso.js; `?sem47`).

## Regras do negócio
- Não enviar convite a mentor ou mentorado sem a Juliana pedir.
- Informações delicadas: campo trancado da sessão, só mentores do mentorado e administração; nunca em relatório, Excel ou IA.
- Sessão concluída: os mentores do mentorado completam e corrigem sem prazo (script 37); só a administração muda a conclusão
  (mudanças depois de concluída ficam no histórico).
- Excel do RH: só números (presença, faltas, tarefas, avaliação). Nada do conteúdo das conversas.
- Arsenal: 68 ferramentas (pacote de lotes em `Downloads\Arsenal_Mentorei_Lotes_1-11`, modelo em `Downloads\Arsenal_Mentorei_Trabalho`).
  8 ferramentas com questionário "PROPOSTA" aguardam validação dela (doc de revisão no Claude). Ferramentas online automatizadas
  da Juliana ficam em `public/ferramentas/<nome>/` e são ligadas em `public/assets/ferramentas-online.js` (resultado vai para `testes`).
  Roda da Vida (2026-10-12): MNT-AUT-10, ficha nova no script 35 (não existia); as reflexões só vão para a plataforma se o
  mentorado marcar a caixa (o mapa é pessoal); notas e próximo cuidado vão sempre.
  Versão 2 (2026-10-13, pedido de um mentor): 40 afirmativas (5 por área, escritas pelo Claude a pedido da Juliana) com régua de
  arrastar de 1 a 5 (só inteiros, começa sem resposta, encaixa no número); média por área com 1 casa decimal forma a roda; ranking.
  Roda do Profissional do Futuro (2026-10-15, TraçãoCoop · Sicoob Cooprem): MNT-AUT-11, ficha no script 39. É a primeira ferramenta
  PÚBLICA (`publica` em ferramentas-online.js): qualquer pessoa abre por QR code (https://plataforma.mentorei.com.br/ferramentas/roda-profissional-futuro/),
  sem login. Só nome, e-mail, WhatsApp e cargo saem do celular (promessa da tela): `/api/contato-ferramenta` → rpc
  `registrar_pessoa_fisica` (mesmo e-mail = mesma linha, soma `vezes`) → tabela `pessoas_fisicas` → aba Vendas › Pessoa física
  (`telas/pessoa-fisica.js`: QR para baixar, lista, busca, anotação, apagar, Excel). A página tenta de novo a cada etapa até o
  servidor confirmar (`envioContato = 'ok'`). Substituiu o FormSubmit do pacote original. Dentro da plataforma (quadro) não manda
  contato; o resultado vai para `testes`. Fonte do pacote: Documents/JULIANA PROFISSIONAL/Sicoob cooprem/roda-profissional-futuro-claude-code.zip
  (o CLAUDE.md do pacote pede: não mudar textos, perguntas, cores ou layout). Para outra ferramenta pública: código em FERRAMENTAS
  de contato-ferramenta.mjs + `publica` no mapa.
  TODAS as ferramentas mandam o contato para Pessoa física quando abertas fora da plataforma (2026-10-21, pedido dela: "todos que
  preencherem"): as sem QR (Gatilho, Escada, Diplomacia, SWOT, Roda da Vida) também abrem pelo link direto /ferramentas/<slug>/.
  As 4 do molde antigo usam o mesmo `enviarContato()` da Assertivo (depois da tela de dados; Netlify Forms continua igual).
  Roda da Vida: fora da plataforma a capa pede nome, e-mail, WhatsApp e autorização (`.so-publico`; dentro do quadro some, nome
  segue opcional); "Começar" e "Ver minha roda" só seguem com o contato; respostas continuam só no aparelho. Ferramenta nova
  = sempre ligar o contato fora da plataforma + código em FERRAMENTAS.
  No mesmo dia ela pediu QR code e link de TODAS em Pessoa física: as 10 do mapa ONLINE têm `publica` (grade de QR em
  telas/pessoa-fisica.js). Radar da Liderança (MNT-JOR-06, outro site/repo) entra com `linkPublico` …/radar/ e código
  'radar-da-lideranca': a função radar-enviar do Radar manda o contato do servidor (receber = aceitou marketing; no corporativo só
  quem aceitou, a mesma regra do RD).
  Você é Assertivo? (MNT-COM-07) também é PÚBLICA desde 2026-10-16: o QR que a Juliana já imprimiu aponta para
  app.html#/ferramenta/MNT-COM-07; o app.js manda quem NÃO tem login para a versão aberta (`publica` no mapa) e quem tem login segue
  na plataforma. A página manda o contato (S.contatoOk) para Pessoa física e continua mandando o resultado como antes (Netlify Forms).
  QUAL É O SEU CANAL? (MNT-COM-12, 2026-10-21, ficha no script 41; pedido dela: teste não monótono de 3 a 4 min com laudo) —
  visual, auditivo ou cinestésico (com C: ela pediu a correção em 21/10/2026, script 43; "sinestésico" só nas palavras-chave da ficha, para a busca). Feita do zero pelo Claude (não veio em
  zip): `public/ferramentas/qual-e-o-seu-canal/` + textos e contas em `public/assets/canal-regras.js` (perguntas, laudo, também usado
  pelo servidor). 15 perguntas em 3 formatos misturados (primeira impressão com figuras, o que você faria, qual frase é a sua cara),
  1 ponto por canal, ordem das opções sorteada por pergunta e guardada; recados no caminho (MARCOS). Laudo: canal (ou dois empatados =
  combinado; três = equilibrado), % de cada um (arredondadas; empatados mostram o mesmo número), leitura, como aprende, como falar com a
  pessoa, fortes, atenção, palavras, "como falar com cada canal" (para líderes e donos de negócio) e 3 atitudes (a 3ª exercita o canal
  menos usado). PÚBLICA: decisões dela — guarda SÓ o contato (as respostas não saem do celular) e o laudo vai por tela, PDF (impressão do
  navegador) e e-mail: `/api/canal-laudo` recebe só a contagem ("8-4-3"), confere que o e-mail está em `pessoas_fisicas` com esta
  ferramenta nas últimas 6 h, monta o e-mail (Brevo, conta principal) e não grava nada; o botão do e-mail abre
  `…/qual-e-o-seu-canal/?r=8-4-3` (laudo sem nome). Na plataforma não pede cadastro nem manda e-mail; resultado vai para `testes`.
  RODA DO COMUNICADOR INFLUENTE versão 3 (MNT-COM-06, 2026-10-21, script 42; conteúdo escrito pelo Claude e aprovado por ela;
  "estava chata e sem direcionamento"): 8 habilidades × 3 frases (HABILIDADES[].perguntas; ~1/3 com situações pessoais, viés
  profissional), nota 1 a 10 por frase, média com 1 casa = ponto na roda. Telas: abertura → dados (só nome, WhatsApp, e-mail; caixa
  DESMARCADA "Quero receber ferramentas práticas e conteúdos") → "Como responder" (régua, por que ser sincero, 3 dicas) → frases → resultado.
  PÚBLICA: a promessa da tela é que respostas e resultado NÃO são guardados: fora da plataforma só o contato sai (`/api/contato-ferramenta`
  com `receber`), nada de Netlify Forms; só "Baixar em PDF". Na plataforma, resultado para `testes` (com `respostas_por_frase`).
  `receber` → rpc `registrar_pessoa_fisica(..., p_conteudos)` → `pessoas_fisicas.quer_conteudos` (antes do script 42 grava sem ele);
  em Pessoa física aparece "📩 Quer receber conteúdos", filtro e coluna no Excel; quem disse NÃO não entra no funil.
- PESSOA FÍSICA → FUNIL (2026-10-21, pedido dela: mandar outras informações para quem preencheu as ferramentas): caixinhas na lista
  (a do cabeçalho marca todas da busca) + "Colocar N no funil" (`colocarNoFunil` em telas/pessoa-fisica.js): escolhe o funil, mostra
  quantos entram, já estão, pediram para sair (`descadastros`) ou têm e-mail errado; grava `funil_membros` com origem
  "Pessoa física · <ferramentas>". Sem script novo (precisa do 34).
  Teste local: launch.json "canal-teste" (porta 8810) do site do Radar, scratchpad da sessão 24669ad7 (`teste-canal/`, funis falsos;
  `?sem34`).
- Linguagem da Mentorei: sem jargão de coaching em inglês ("accountability", "follow-up", "macaco nas costas").

## Testar antes de publicar
CRÉDITOS DA NETLIFY (2026-10-13): a conta é por créditos e CADA publicação (push no `main`) gasta 15 créditos; no plano grátis
(300/mês, sem compra extra) os créditos acabaram em 12/10 e as publicações ficaram "Skipped due to account credit usage exceeded"
(o site seguiu no ar com a reserva "créditos operacionais"; se ela acaba, TODOS os sites da conta saem do ar até o próximo ciclo).
Em 13/10 ela assinou o plano Pro (US$ 20/mês, 3.000 créditos; a mesma conta tem o Radar e o Calendário). Publicação pulada
("Skipped") NÃO é refeita sozinha depois: é preciso um push novo ou "Trigger deploy" na Netlify.
Por isso: juntar as mudanças e fazer UM push por pedido (nada de vários commits publicados em sequência, nem commit vazio para
"republicar"). Depois de um push, conferir se entrou no ar (ex.: WebFetch de um arquivo de `public/` com `?v=<commit>`).
Não há servidor de desenvolvimento: para testar uma tela, servir `public/` localmente e trocar `/assets/base.js` por um
arquivo de dados falsos (import map), conferir no navegador e apagar os arquivos de teste antes do commit.
Não há Node instalado, mas o Photoshop traz um (`C:\Program Files\Adobe\Adobe Photoshop 2026\node.exe`, v22): serve para
`node --check` e para rodar módulos puros como o motor das propostas. Funções com Supabase/Claude continuam sendo testadas no navegador.
Não trabalhar em duas conversas ao mesmo tempo nesta pasta (uma desfaz a outra): antes de editar, `git pull` e ler o arquivo atual.

## Pendências conhecidas
- FINANCEIRO (2026-10-30): scripts 52 e 53 rodados; ela conferir na aba Conferir os planos e despesas que vieram da planilha;
  conferir em "Ajustes" o mês de início (padrão 11/2026) e o nome do outro CNPJ; Etapa 2 feita (falta rodar o script 54 e completar o cadastro financeiro dos mentores); etapas 3 e 4 não feitas (HUB de inovação de Holambra fica de fora por enquanto).
  LEMBRAR A JULIANA NA ETAPA FINAL (4) DO FINANCEIRO (pedido dela, 30/10): mandar os relatórios de reembolso que faltam (Cláudia
  05/02 R$ 6.570,49 e 19/03 R$ 1.489 e R$ 1.560; Juliana março R$ 623,56; "Pix Juliana" R$ 240; "Vivi - Ju" 30/09 R$ 1.910,64) e os
  extratos do Sicoob e da Unicred de janeiro de 2026 até hoje (só veio Sicoob 01-14/10).
- ESCOPO DA CLÁUDIA (2026-10-28): o script 37 NUNCA tinha sido rodado (o 49 deu "relation public.entregas does not exist"): rodar o 37 e
  DEPOIS o 49 inteiro de novo (o 37 recria protege_entrega e pode_ver_entregas na versão antiga); para "Puxar do Zoom": rodar o 46, ligar as contas e acrescentar os 2 escopos
  de presença em cada app do Zoom; revisão jurídica do TERMO_RH e do novo trecho do TERMO_ALUNO. Nada testado com login real.
- FERRAMENTAS DA TRILHA (2026-10-28): ela rodar o script 48 no Supabase (até lá o cartão da turma avisa e o aluno não vê a seção).
- CERTIFICADOS: concluído e aprovado por ela em 28/10 (as 5 etapas, certificados.mentorei.com.br com HTTPS e QR lido no celular → "Certificado válido"). Nada pendente.
- ALUNOS/GRAVAÇÕES (2026-10-27): script 44 RODADO por ela; falta rodar o 46 e ligar as 2 contas do Zoom; (opcional) reconectar o Google e colar a pasta das
  gravações em Turmas; conferir se o Workspace deixa "qualquer pessoa com o link"; revisão jurídica do TERMO_ALUNO. Nada testado com
  login real nem com a pasta real (sem acesso daqui).
- CONTRATO DE PRESTAÇÃO DE SERVIÇO DO MENTOR (pedido da Juliana em 2026-10-07, ela ainda vai mandar o texto): o mentor precisa
  concordar no primeiro acesso (cadastro); se escolher "ler depois", depois de 7 dias aparece uma mensagem pedindo para assinar.
  Perguntar a ela pelo contrato antes de mandar os convites aos mentores. Ainda NÃO implementado.
- Cadastro simples (convidados das trilhas): mentor com e-mail provisório `…@pendente.mentorei.com.br`, que nunca recebe nada
  (`emailReal()` no servidor, `emailPendente()` nas telas). A administração coloca o e-mail real em Mentores → Editar dados
  (`/api/convidar` acao trocar_email) e só então manda o convite.
- Revisão das 8 ferramentas PROPOSTA; outras ferramentas online automatizadas a ligar; revisão jurídica do texto de privacidade.
- "mentorado modelo" de teste criado dentro do programa real da Brasdiesel: apagar depois dos testes.
- Funis de e-mail (2026-10-12): ela rodar o script 34; criar a conta de MARKETING do Brevo (e-mail diferente), verificar o remetente
  nela e pôr `BREVO_API_KEY_MARKETING` na Netlify (guiar clique por clique); usar junto com o RD por um mês antes de cancelar.
