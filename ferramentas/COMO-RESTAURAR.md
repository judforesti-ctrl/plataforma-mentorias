# Cópias de segurança e restauração da plataforma

## Onde está cada coisa (nada mora no computador)
- **Dados** (mentorados, sessões, agenda, arsenal): no Supabase (nuvem), projeto `mixnubenhaleohkcanma`.
- **Código**: no GitHub (`judforesti-ctrl/plataforma-mentorias`) e publicado na Netlify (site "mentormentorei").
- **Arquivos enviados** (fotos, PDFs do arsenal, materiais das turmas): no Storage do Supabase.
Se o computador quebrar, basta entrar em outro: o site e os dados continuam lá.

## As três cópias
1. **Semanal, no Google Drive** (toda segunda, 6h): planilha Excel com todas as tabelas, na pasta
   "Backups da Plataforma Mentorei" da conta Google conectada no Painel. Guarda 6 meses. Para consulta.
2. **Mensal, por e-mail** (dia 1, 7h): a mesma planilha, para os e-mails escolhidos no Painel → Cópias de segurança.
3. **Restauração, no computador da Juliana** (toda segunda, 8h, tarefa agendada do Windows "Mentorei - backup da plataforma"):
   `ferramentas\backup-restauracao.ps1` salva em `programacoes sites e radares\backups-plataforma-mentorias\AAAA-MM-DD\tabelas\*.json`
   todas as tabelas, e em `backups-plataforma-mentorias\arquivos\` os arquivos enviados. Guarda 6 meses. O que foi feito fica em `registro.txt`.
   Precisa do arquivo `.env` na pasta `plataforma-mentorias` com `SUPABASE_SECRET_KEY=sb_secret_...` (Supabase → Project Settings → API Keys → Secret keys).
   Esse arquivo nunca vai para o GitHub. Também dá para rodar à mão com dois cliques em `ferramentas\backup-restauracao.cmd`.

## Como restaurar (se um dia for preciso)
Peça ajuda ao Claude com esta pasta aberta. O caminho é:
1. Criar um projeto novo no Supabase (São Paulo) e rodar os scripts `supabase/01-...sql` em ordem (01, 02, 03, 04, ... 18).
2. Carregar as tabelas a partir de `backups-plataforma-mentorias\<data>\tabelas\*.json`, nesta ordem (por causa das ligações entre elas):
   perfis, convites, empresas, programas, programa_temas, mentorados, mentor_mentorado, sessoes, sessoes_interno, avaliacoes_sessao, testes,
   ferramentas, arsenal_tags, ferramentas_enviadas, turmas, modulos, modulo_mentores, modulo_arquivos, importacoes_proposta,
   agenda_bloqueios, agenda_reservas, agenda_reserva_datas, agenda_reserva_mentores, agenda_reunioes, agenda_links, configuracoes, google_eventos, historico, acessos.
   (Cada arquivo é uma lista de registros; pode ser enviado pela API REST do Supabase com a chave secreta, 1000 por vez.)
3. Enviar os arquivos de `backups-plataforma-mentorias\arquivos\<bucket>\...` para os buckets `fotos`, `arsenal` e `turmas`.
4. Os logins (senhas) não entram na cópia: cada pessoa recebe um e-mail "Crie a sua senha" de novo. Os ids dos perfis são mantidos.
5. Na Netlify, trocar `SUPABASE_SECRET_KEY` e, em `public/assets/config.js`, a URL e a chave publicável do projeto novo. Conectar a Google Agenda de novo.

## Outras medidas de segurança (não dependem de programação)
- Senhas do Supabase, Netlify, GitHub, Brevo e Google num cofre compartilhado entre as sócias; e-mail de recuperação de uma sócia em cada conta.
- Verificação em duas etapas no GitHub, Netlify e Supabase.
- Uma vez por mês, abrir a pasta do Drive e conferir se a cópia da semana está lá.
