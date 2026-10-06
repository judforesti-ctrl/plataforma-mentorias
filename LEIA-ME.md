# Plataforma de Mentorias Mentorei

Site: Netlify (pasta `public`) · Banco, login e fotos: Supabase (projeto `mixnubenhaleohkcanma`, São Paulo).

## Como funciona
- Cada pessoa entra com e-mail e senha. O acesso só existe por convite da administração.
- Três papéis: administração, mentor e mentorado. Quem vê e muda o quê é garantido no banco
  (Row Level Security em `supabase/01-estrutura.sql`), não só nas telas.
- O mentorado nunca lê as anotações internas nem o campo "Informações delicadas" (tabela `sessoes_interno`).
- Sessão concluída fica trancada: só a administração altera, e a alteração vai para o histórico.
- Empresa → programa (quantidade de sessões livre) → mentorado → sessões.

## Onde está cada coisa
| Arquivo | O que é |
|---|---|
| `public/index.html` | Entrar e "esqueci minha senha" |
| `public/definir-senha.html` | Criar a senha pelo link do convite |
| `public/app.html` + `assets/app.js` | A plataforma (menu e telas por papel) |
| `public/assets/telas/` | Uma tela por arquivo (painel, equipe, importar, mentorados, ficha, perfil, minha área, primeiro acesso) |
| `public/privacidade.html` | Política de privacidade (em revisão jurídica) |
| `netlify/functions/convidar.mjs` | Envia os convites (usa a chave secreta) |
| `supabase/*.sql` | Rodar no SQL Editor, na ordem 01, 02, 03, 04 |

## Variáveis de ambiente na Netlify
| Nome | Para quê |
|---|---|
| `SUPABASE_SECRET_KEY` | Chave secreta do Supabase (sb_secret_…), usada só para enviar convites |
| `ANTHROPIC_API_KEY` | Chave da API do Claude, para o resumo da sessão gerado por IA (função /api/resumo) |

## Configuração do Supabase (uma vez)
- Authentication → URL Configuration: Site URL = endereço da Netlify; Redirect URLs = `<endereço>/definir-senha.html`.
- Authentication → Emails → SMTP: usar o Brevo (o e-mail padrão do Supabase só envia para a equipe do projeto).

## Etapas
1. Fase 1 (pronta): login, primeiro acesso, equipe e convites, empresas e programas, mentorados, ficha, importação da planilha.
2. Fase 2: tela da sessão (resumo por voz, informações delicadas, tarefa, presença, conclusão, resumo automático, WhatsApp).
3. Fase 3 (arsenal pronto): arsenal com busca, ficha, PDF privado e envio ao mentorado; carregar arsenal (admin). Falta: área do mentorado completa.
4. Fase 4: painel completo, relatórios por empresa, alertas e exportação.
