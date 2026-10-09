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
  data grande à esquerda (ela pediu, 2026-10-08), dias livres em verde; "Quadro por mentor" é a vista antiga de 3 faixas, e o mês continua lá.
  FLAGS (2026-10-09, pedido dela: "escolher tudo por flag, não por filtro"): no lugar das 4 caixas de seleção, linhas de flags
  (Mentores, Empresas + "Sem empresa", Tipos com a amostra de cor, Formato), várias ao mesmo tempo, com "Todos" e "Limpar";
  `flags` em agenda.js (null = todos; Set = marcados), lembradas em localStorage "mentorei.agendaFlags". Nenhum tipo passa mais
  "por fora" (antes bloqueio, reunião e agenda pessoal sempre apareciam). Vários mentores marcados: "Dia livre para Juliana e Cláudia"
  (`rotulo` na vistaSemana); um só: comportamento antigo (mês no quadro, "Não atende"). A vista é redesenhada num elemento novo a
  cada mudança (os cliques não se acumulam).
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
  MODELOS OFICIAIS (2026-10-09): dois, CLARO e ESCURO (mesmas peças e nomes, só cores), escolhidos ao gerar e trocáveis no editor.
  O pedido traz SÓ o conteúdo; páginas institucionais (números da Mentorei, sócias, contatos) são fixas no modelo. Preço em caixa
  separada (até 3 opções: por módulo, mentoria individual, turma, mentoria em grupo, pessoa, valor fechado ou outro; valor,
  quantidade opcional → total calculado, nome e detalhe), condições de pagamento e validade (dias; sai no selo do contato em
  "Próximos passos"). A IA NUNCA escreve valores. Logo do cliente opcional: a tela converte para PNG, corta a margem e guarda na
  pasta pública `fotos/logos/<empresa>/<data>.png` (oferece o logo da proposta anterior da mesma empresa); sem logo, o espaço some.
  Tudo isso fica em `propostas.conteudo` (`modelo`, `precos`, `pagamento`, `validade_dias`, `logo`) junto com o texto da IA
  (`versao: 2`); `OPCOES_DA_TELA`/`separarOpcoes` em `netlify/lib/propostas.mjs`. Regras puras (cobrança, total, ícones, conversão
  das propostas do modelo provisório) em `public/assets/proposta-comum.js`, usadas pela tela e pelo servidor.
  MOTOR: `netlify/lib/proposta-pptx.mjs` edita o XML do .pptx (jszip): `MAPA` = páginas e nomes das peças do modelo; títulos com a
  parte final destacada ({texto, destaque}), tópicos com começo em negrito ({destaque, texto}), ícones escolhidos pela IA (15
  desenhos do próprio modelo, `ICONE_PECA`), cartões da visão geral para 1 a 6 módulos, página por módulo, 0 a 2 páginas extras,
  tabela com 1 a 8 linhas (barras por período), investimento com 1 a 3 caixas. Mede cada texto com as larguras reais da Inter
  (`proposta-letras.mjs`, gerado por `ferramentas/larguras-inter.py`): diminui a letra se não couber e devolve avisos para a tela.
  Se a IA deixar item vazio, o texto do modelo (Sicoob) é apagado, nunca fica. Modelos em `netlify/lib/modelos/proposta-clara.pptx`
  e `proposta-escura.pptx`, embutidos em `proposta-modelos.mjs` (`python ferramentas/modelo-proposta.py`).
  FONTE: os modelos levam a Inter EMBUTIDA (o cliente vê certo sem ter a fonte). O PowerPoint só embute TrueType: a Inter OTF que a
  Juliana mandou foi convertida (fontTools, subconjunto latino) e a ExtraBold ficou com peso 400 e sem nomes 16/17 para entrar como
  "Inter ExtraBold" normal (senão os títulos saem finos sem a fonte). Essas TTF estão instaladas no Windows dela (usuário). Para trocar
  um modelo: abrir no PowerPoint com essas fontes, tirar as anotações do apresentador e salvar com fontes embutidas (todos os
  caracteres; `embedTrueTypeFonts="1"` sem `saveSubsetFonts`); conferir em presentation.xml que "Inter ExtraBold" está em `<p:regular>`.
  Conferir a fonte embutida pelo PDF do PowerPoint (o PNG de Slide.Export ignora fonte embutida).
  Teste local: o Photoshop traz um Node 22 (`C:\Program Files\Adobe\Adobe Photoshop 2026\node.exe`); jszip em node_modules
  (ignorado pelo git) com `main` apontando para `dist/jszip.min.js`; exportar páginas para PNG/PDF pelo PowerShell (COM do PowerPoint).

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
Não há Node instalado, mas o Photoshop traz um (`C:\Program Files\Adobe\Adobe Photoshop 2026\node.exe`, v22): serve para
`node --check` e para rodar módulos puros como o motor das propostas. Funções com Supabase/Claude continuam sendo testadas no navegador.
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
