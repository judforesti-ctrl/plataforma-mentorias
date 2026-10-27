# Especificação: Emissor de certificados da Mentorei

Documento para o Claude Code implementar o módulo **Gestão > Emitir certificados** na plataforma
(plataforma.mentorei.com.br) e a **página pública de verificação** (certificados.mentorei.com.br).

Tudo o que é visual já está pronto e testado neste pacote. O trabalho é integrar à plataforma:
telas, banco de dados, geração dos PDFs no servidor, leitura da proposta e verificação pública.

> **Regra principal:** o desenho do certificado não muda. O código só preenche dados no modelo
> `template/certificado.html`. Não redesenhar, não trocar fontes, cores, posições nem textos fixos.

---

## 1. Como usar este pacote

| Pasta ou arquivo | Para que serve |
|---|---|
| `template/` | **Modelo do certificado** (frente e verso, claro e escuro) com fontes, logos e selo. Contrato na seção 8. |
| `telas/emitir-certificados.html` | Protótipo navegável da tela da Gestão. É a referência de fluxo, textos e comportamento. |
| `telas/verificacao.html` | Página pública de verificação (visual final; trocar só a busca de dados). |
| `telas/qr.js` | Gerador de QR mínimo usado nos protótipos. Na plataforma, usar biblioteca (seção 7). |
| `referencia/gerar_lote.py` | **Gerador de referência testado**: dados da turma + lista de nomes → PDFs, ZIP, planilha e registro. |
| `referencia/qr.py` | QR usado pelo gerador de referência (validado lendo o QR de volta). |
| `extracao/` | Prompt e esquema JSON para a IA ler a proposta ou a trilha e preencher os campos. |
| `referencia/assinatura.py` | Tira o fundo da foto da assinatura e gera as versões clara e escura (testado). |
| `exemplos/` | Turma de exemplo, lista de nomes, assinatura fictícia e PDFs gerados nas duas variações (resultado esperado). |

Para rodar a referência (precisa de Python e Playwright com Chromium):

```bash
cd referencia
python gerar_lote.py --turma ../exemplos/turma-exemplo.json --nomes ../exemplos/nomes-exemplo.csv \
  --saida /tmp/teste --base-url https://certificados.mentorei.com.br
```

---

## 2. Quem usa e onde fica

* Fica no menu **Gestão**, item **Emitir certificados**.
* Quem acessa: usuários com perfil de gestão/administração (hoje, a Cintia e as sócias). Mentores e alunos não veem.
* A página de verificação é **pública** (sem login).

---

## 3. Fluxo das telas (ver o protótipo)

### 3.1 Lista de pastas
* Título "Emitir certificados", botão **Nova pasta**, busca por cliente ou programa.
* Tabela: nome da pasta (com cliente e tipo embaixo), padrão (claro ou escuro), quantos certificados válidos, data de criação.
* Clique na linha abre a pasta.

### 3.2 Nova pasta (assistente em 3 passos)
1. **Padrão:** escolher **Claro** (fundo bege) ou **Escuro** (fundo azul-petróleo), com miniaturas.
2. **Importar proposta ou trilha**, três caminhos:
   * **Enviar arquivo** (PPTX, PDF ou DOCX). O servidor extrai o texto e a IA devolve os campos (seção 9).
   * **Usar uma trilha cadastrada** na plataforma: puxar nome, módulos e horas direto do banco.
   * **Preencher do zero.**
3. **Revisar e criar:** formulário à esquerda e **prévia ao vivo** à direita (frente e verso), com campo "Testar com um nome".
   Campos: nome da pasta (sugerido "Cliente · Programa · Ano", editável), padrão, tipo, nome do programa, cliente,
   logo do cliente (opcional), início, fim, texto do período (gerado das datas, editável), carga horária total,
   cidade, data de emissão, módulos (título, descrição opcional, horas; adicionar, remover, reordenar),
   assinatura 1 (nome, cargo, imagem: ver 3.4), assinatura 2 opcional.
   * Aviso quando a soma das horas dos módulos for diferente da carga total (avisa, não bloqueia).
   * Obrigatórios: nome do programa, carga horária, período, cidade, data de emissão, título de cada módulo.
   * Ao criar, abre a pasta já na aba de emissão.

### 3.3 Pasta
Cabeçalho com nome, etiquetas (padrão, tipo, carga, nº de módulos, cliente) e botão **Editar informações**.
Duas abas:

**Emitir certificados**
* Importar nomes: planilha **Excel (.xlsx)** ou **CSV** com coluna "Nome" (ou "Nome completo"; sem cabeçalho,
  usa a primeira coluna), arquivo de texto com um nome por linha, ou colar.
* Limpeza automática: espaços duplicados, espaço inicial e final, espaço não separável.
* Botão **Ajustar maiúsculas** (ANA PAULA DE SOUZA → Ana Paula de Souza; de, da, do, das, dos, e ficam minúsculos).
* Avisos por linha: **Repetido**, **Já tem certificado nesta pasta**, **Nome muito longo** (> 70 caracteres).
  Avisos não bloqueiam.
* Nome editável na própria lista; remover linha; limpar lista.
* **Ver o primeiro antes** (prévia com o primeiro nome).
* **Gerar N certificados**: roda em segundo plano com barra de progresso. Ao terminar:
  **Baixar todos (ZIP)** e **Baixar só a planilha de códigos**.

**Emitidos**
* Tabela: participante, código, emitido em, situação (Válido ou Cancelado), ações:
  **Ver** (prévia frente e verso com o QR real), **copiar link de verificação**, **baixar PDF**,
  **Corrigir o nome** (mantém o mesmo código e QR e gera o PDF de novo), **Cancelar** ou **Reativar**.
* Busca por nome ou código. Botões **Baixar planilha de códigos** e **Baixar todos (ZIP)**.

### 3.4 Assinaturas (enviar uma vez, usar sempre)
Ninguém assina certificado por certificado: a assinatura entra como **imagem** e é aplicada em todos.
* Em cada responsável (1 e 2) da pasta: **Usar uma assinatura salva** (lista) ou **Enviar assinatura**.
* **Enviar assinatura** abre uma janela: escolher foto de celular ou escaneamento (JPG, PNG, WEBP; HEIC convertido no servidor),
  nome de quem assina, cargo, **Salvar na lista de assinaturas** (marcado) e o aceite obrigatório
  **"Tenho autorização desta pessoa para usar a assinatura dela nos certificados"**.
* O servidor **tira o fundo e ajusta a cor** (referência testada: `referencia/assinatura.py`; o protótipo faz o mesmo no navegador):
  estima o brilho do papel por regiões (corrige sombra de foto), transforma a tinta em transparência com bordas suaves,
  remove pontinhos soltos, recorta com margem pequena e gera **duas versões PNG**:
  tinta **#0E3B44** para o padrão claro e tinta **#F2EADF** para o padrão escuro. A janela mostra as duas antes de usar.
* Se não achar tinta, avisar: "Use caneta escura em papel branco, sem pauta".
* Escolher uma assinatura salva preenche também o nome e o cargo.
* Na lista de pastas, botão **Assinaturas salvas**: ver, adicionar e excluir. Excluir não altera certificados já emitidos
  (o retrato guarda a imagem usada).
* Assinatura de cliente: enviar com o nome e o cargo da pessoa do cliente (ex.: "Diretora de Pessoas · Sicoob Exemplo").
* Importante: é uma **imagem** de assinatura (acabamento visual). Não é assinatura digital com validade jurídica (ICP-Brasil);
  quem dá autenticidade ao certificado é a verificação pelo código.

### 3.5 Editar pasta
Mesmo formulário com prévia. Se já houver emitidos, mostrar aviso: as mudanças valem para as próximas emissões;
para atualizar os já emitidos, usar "gerar de novo" (individual) ou oferecer **Gerar de novo todos** (mantém os códigos,
atualiza o retrato dos dados e os PDFs).

---

## 4. Página pública de verificação

* Endereço impresso no QR: **`https://certificados.mentorei.com.br/{CODIGO}`**. Esse endereço fica impresso para
  sempre: confirmar com a Ju antes de emitir o primeiro certificado. Se a plataforma não puder atender esse subdomínio,
  ele pode redirecionar (301) para uma rota da plataforma, por exemplo `/verificar/{CODIGO}`, mas o QR continua
  apontando para o subdomínio.
* Estados (todos desenhados em `telas/verificacao.html`):
  * **Válido:** "A Mentorei certifica que [nome] concluiu o [tipo] [programa]" + carga, período, emitido em,
    realizado para, nº de módulos, código.
  * **Cancelado:** aviso de que não é mais válido e data do cancelamento.
  * **Não encontrado:** orientação de digitação e campo para tentar de novo.
  * **Sem código:** campo de busca ("Verificar um certificado").
* Normalizar o código digitado: maiúsculas, sem espaços.
* `<meta name="robots" content="noindex, nofollow">`. Não existe listagem pública, só consulta por código exato.
* Limite de consultas por IP (ex.: 30 por minuto) para dificultar varredura.
* A resposta da API pública traz só o necessário (ver 6.5). Nunca e-mail, CPF ou dados internos.

---

## 5. Regras de texto (já implementadas no modelo; repetir no servidor onde formatar)

* Datas por extenso: `30 de outubro de 2026`.
* Período a partir de início e fim: mesmo mês `8 a 27 de outubro de 2026`; mesmo ano `8 de setembro a 27 de outubro de 2026`;
  anos diferentes `8 de setembro de 2026 a 27 de fevereiro de 2027`. O texto pode ser editado à mão.
* Carga total: `23 horas` (1 → `1 hora`; decimais com vírgula: `7,5 horas`). Módulos: `3h`.
* Artigo pelo tipo (o modelo resolve sozinho): mentoria, trilha, formação, jornada, palestra, imersão, oficina →
  "concluiu **a** mentoria", "Conteúdo **da** trilha"; os demais → "concluiu **o** programa", "Conteúdo **do** curso".
* Preferência da Mentorei: **não usar travessão nem hífen como pontuação** em nenhum texto da interface ou do certificado.
  Use dois-pontos, ponto, vírgula ou o ponto médio " · ".
* Na interface, usar "mentorias" em vez de "formações" quando falar dos produtos da Mentorei.

---

## 6. Modelo de dados (adaptar ao banco e ao ORM da plataforma)

### 6.1 `cert_pastas`
| campo | tipo | observação |
|---|---|---|
| id | uuid | |
| nome | texto | "Cliente · Programa · Ano" |
| variacao | texto | `clara` ou `escura` |
| tipo | texto | programa, curso, mentoria, trilha, workshop, formação, imersão, palestra |
| curso | texto | nome do programa |
| cliente_id | fk opcional | se a plataforma já tiver cadastro de clientes |
| cliente_nome | texto | |
| cliente_logo_url | texto | arquivo no armazenamento da plataforma |
| inicio, fim | data | |
| periodo_texto | texto | como sai no certificado |
| carga_horas | decimal | |
| cidade | texto | |
| data_emissao | data | |
| resp1_nome, resp1_cargo | texto | |
| resp1_assinatura_id | fk opcional | aponta para `cert_assinaturas` |
| mostrar_resp2 | booleano | |
| resp2_nome, resp2_cargo, resp2_assinatura_id | | |
| modulos | json | `[{titulo, descricao, horas}]` na ordem |
| origem | json | `tipo` (arquivo, trilha ou manual), `nome_arquivo`, `trilha_id`, `arquivo_url` |
| criado_por, criado_em, atualizado_em | | |

### 6.2 `cert_assinaturas`
| campo | tipo | observação |
|---|---|---|
| id | uuid | |
| nome, cargo | texto | de quem assina |
| original_url | texto | arquivo enviado (privado) |
| img_clara_url | texto | PNG transparente, tinta #0E3B44 |
| img_escura_url | texto | PNG transparente, tinta #F2EADF |
| autorizacao_confirmada_por, autorizacao_em | | quem marcou o aceite e quando |
| criado_por, criado_em, excluido_em | | exclusão lógica |

### 6.3 `cert_certificados`
| campo | tipo | observação |
|---|---|---|
| id | uuid | |
| codigo | texto **único** | `MTR-26-7KQ4-9XPA` (seção 7) |
| pasta_id | fk | |
| lote_id | fk | |
| participante | texto | |
| email | texto opcional | só uso interno (envio futuro); nunca na verificação |
| status | texto | `valido` ou `cancelado` |
| dados_snapshot | json | **retrato completo** dos dados usados no PDF (o JSON da seção 8). A verificação lê daqui. |
| emitido_em, emitido_por | | |
| cancelado_em, cancelado_por, motivo_cancelamento | | |
| historico | json | correções de nome e regerações (quem, quando, antes e depois) |

O retrato garante que o certificado continue igual ao que foi impresso, mesmo se a pasta for editada depois.

### 6.4 `cert_lotes`
`id, pasta_id, criado_por, criado_em, quantidade, status (fila|gerando|pronto|erro), progresso, zip_url, zip_expira_em, erro`.

### 6.5 API sugerida
| método e rota | quem | faz |
|---|---|---|
| `GET /api/certificados/pastas` | gestão | lista |
| `POST /api/certificados/pastas` | gestão | cria |
| `GET/PUT /api/certificados/pastas/:id` | gestão | lê e edita |
| `POST /api/certificados/extrair` | gestão | recebe o arquivo, devolve campos (seção 9) |
| `GET/POST/DELETE /api/certificados/assinaturas` | gestão | lista, envia (processa e devolve as duas versões) e exclui |
| `POST /api/certificados/pastas/:id/lotes` | gestão | recebe a lista de nomes, cria o lote e dispara o job |
| `GET /api/certificados/lotes/:id` | gestão | progresso e link do ZIP |
| `GET /api/certificados/:codigo/pdf` | gestão | gera (ou devolve) o PDF individual |
| `PATCH /api/certificados/:codigo` | gestão | corrigir nome, cancelar, reativar |
| `GET /api/certificados/verificar/:codigo` | **pública** | `{status, participante, tipo, curso, carga, periodo, data_emissao, cliente, modulos (qtd), cancelado_em}` ou 404 |

---

## 7. Código e QR code

* Formato: `MTR-AA-XXXX-XXXX` (AA = ano com 2 dígitos). Alfabeto sem caracteres ambíguos:
  `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sem 0, 1, I, O). Cerca de 1 trilhão de combinações por ano.
* Gerar com gerador **criptográfico** (`crypto.randomInt` no Node, `secrets` no Python). **Nunca sequencial.**
* Índice único no banco; se colidir, sortear de novo.
* Conteúdo do QR: `https://certificados.mentorei.com.br/{CODIGO}` (só isso, sem parâmetros).
* Biblioteca: `qrcode` (Node) ou `segno` (Python). Correção de erro **M**, saída **SVG**, módulos **#0E3B44**,
  fundo transparente, margem de 1 módulo (o quadro bege do modelo completa a zona de silêncio).
  Passar ao modelo como `data:image/svg+xml;base64,...` no campo `qr_imagem`.
* O QR fica num quadro claro também no padrão escuro, de propósito: escuro sobre claro é o que todo celular lê.

---

## 8. Contrato do modelo (`template/`)

* `template/certificado.html` + `template/assets/` (fontes WOFF, logos, selo JPEG, sombras). Servir a pasta inteira
  (ou abrir por `file://` no servidor). Página A4 paisagem, **2 páginas** (frente e verso).
* API no navegador: `window.CertificadoMentorei.render(dados)` devolve uma Promise. Ao terminar, o `<body>` recebe
  `data-pronto="1"` e `data-render="N"`.
* Prévia na tela de edição: `<iframe src="template/certificado.html?previa=frente">` e
  `iframe.contentWindow.postMessage({tipo:'certificado:dados', dados}, '*')`;
  para virar a face: `{tipo:'certificado:face', face:'verso'}`. O iframe tem 1123 × 794 px; escalar com CSS.
* Campos do `dados`:

| campo | exemplo | obs. |
|---|---|---|
| variacao | `"clara"` ou `"escura"` | troca todas as cores |
| participante | `"Ana Paula Souza"` | encolhe sozinho até 2 linhas |
| tipo | `"programa"` | define o artigo |
| curso | `"Programa de Desenvolvimento..."` | frente (até 2 linhas) e verso (até 3) |
| periodo | `"8 de setembro a 27 de outubro de 2026"` | texto pronto |
| carga | `"23 horas"` | texto pronto |
| cidade | `"Florianópolis"` | |
| data_emissao | `"30 de outubro de 2026"` | texto pronto |
| resp1_nome, resp1_cargo | | |
| resp1_assinatura | data URI ou URL de PNG transparente | opcional; mandar a versão da variação (clara: tinta azul-petróleo; escura: tinta bege) |
| mostrar_resp2 | `true` ou `false` | |
| resp2_nome, resp2_cargo, resp2_assinatura | | |
| codigo | `"MTR-26-7KQ4-9XPA"` | frente e verso |
| url_verificacao | `"certificados.mentorei.com.br"` | texto impresso (sem https) |
| qr_imagem | `data:image/svg+xml;base64,...` | vazio mostra "QR code pendente" |
| cliente | `"Sicoob Exemplo"` | vazio esconde a linha "Realizado para" |
| cliente_logo | data URI ou URL | opcional; substitui o nome |
| modulos | `[{"titulo":"...","descricao":"","horas":"3h"}]` | numeração automática; encolhe até uns 10 itens |

* PDF: `page.pdf({ printBackground: true, preferCSSPageSize: true, margin: 0 })` (Puppeteer ou Playwright).
  Esperar `data-pronto="1"` depois de cada `render`. Fontes embutidas como TrueType; selo embutido como JPEG.
  Cada certificado tem cerca de **1,2 MB**.

---

## 9. Ler a proposta ou a trilha (extração)

* **Trilha cadastrada:** mapear direto do banco (nome, tipo, módulos, horas). Sem IA.
* **Arquivo enviado:**
  1. Extrair o texto: PPTX (`python-pptx` ou equivalente em Node), PDF (`pdf-parse`/`pdfplumber`), DOCX (`mammoth`/`python-docx`).
     Guardar o arquivo original em `origem.arquivo_url`.
  2. Enviar o texto à API do Claude com o prompt `extracao/prompt-extracao.md` e o esquema `extracao/schema-extracao.json`
     (pedir saída JSON validada pelo esquema). A chave da API fica no servidor, nunca no navegador.
  3. Devolver os campos ao formulário. **Nada é salvo sem a revisão da pessoa.** O que a IA não encontrar vem vazio, e as
     dúvidas aparecem num aviso acima do formulário (campo `observacoes`).
* As propostas da Mentorei seguem o modelo oficial em PowerPoint (18 páginas): o nome do programa está na capa;
  há uma página "programa em N módulos/pilares" e uma página por módulo, com título e selo "período · duração";
  a carga total costuma aparecer na capa ("carga horária ou duração · nº de módulos") e no investimento.
  **Ignorar** números institucionais da Mentorei (ex.: "+10 mil profissionais treinados", "+600 mentorias"): não são carga horária.

---

## 10. Geração do lote (servidor)

1. `POST /lotes` com a lista de nomes. Validar: lista não vazia; limite por lote (ex.: 500).
2. Criar os registros `cert_certificados` com código, `dados_snapshot` e status `valido` (dentro de uma transação).
3. Job em segundo plano (fila da plataforma, ou worker simples):
   abrir **um** navegador e **uma** página com o modelo; para cada aluno: `render(dados)` → `pdf()` → salvar.
   Atualizar o progresso do lote. Na referência, 4 certificados levam cerca de 4 s no total.
4. Montar o ZIP: `001 Nome do Aluno.pdf` para cada um, `todos-para-imprimir.pdf` (todos juntos, na ordem)
   e `codigos.csv` (separador `;`, UTF-8 com BOM para abrir certo no Excel: número, participante, código, link).
   Nome do ZIP: `Certificados · Cliente · Programa.zip`.
5. Guardar o ZIP por um tempo (ex.: 30 dias) ou gerar de novo sob demanda a partir dos retratos.
   PDFs individuais podem ser sempre gerados sob demanda.
* Hospedagem: o Chromium precisa rodar no servidor. Em serviço sem servidor (Vercel, Netlify Functions), usar
  `@sparticuz/chromium` com `puppeteer-core`, ou um worker separado. Verificar o limite de tempo da função e
  dividir lotes grandes se for preciso.

---

## 11. Segurança e LGPD

* Só dados necessários: nome do aluno e dados do curso. **Sem CPF.** E-mail opcional e só interno.
* A verificação mostra o nome porque essa é a finalidade (confirmar a conclusão para quem recebeu o certificado).
* Sem listagem pública, `noindex`, limite de consultas.
* Log de auditoria: quem criou a pasta, emitiu, corrigiu, cancelou, reativou (data e usuário).
* Atender pedido de remoção: cancelar o certificado e anonimizar o nome no retrato.
* Arquivos enviados (propostas, logos, assinaturas) em armazenamento privado; só gestão acessa.
  Assinaturas são sensíveis: acesso restrito, links temporários, nunca públicas. Só usar com o aceite de autorização.
  No retrato do certificado, guardar a referência da imagem usada (não precisa duplicar o arquivo).

---

## 12. Domínio

* Criar `certificados.mentorei.com.br` no DNS da **Hostinger** (onde está `mentorei.com.br`), apontando para onde a
  plataforma estiver hospedada (registro CNAME ou A, conforme a hospedagem). Ativar HTTPS.
* Testar antes da primeira emissão real: abrir `https://certificados.mentorei.com.br/MTR-26-TEST-TEST` deve mostrar
  "Não encontramos este código".

---

## 13. Critérios de aceite

* [ ] Menu Gestão mostra "Emitir certificados" só para quem tem permissão.
* [ ] Criar pasta pelos 3 caminhos (arquivo, trilha, do zero) e ver a prévia mudar ao digitar, nas duas variações.
* [ ] Ler uma proposta real da Mentorei (PPTX) e preencher nome, cliente, módulos e horas sem inventar nada.
* [ ] Importar `exemplos/nomes-exemplo.csv` e um Excel com coluna "Nome"; ver avisos de repetido.
* [ ] Gerar o lote e baixar o ZIP; abrir os PDFs: 2 páginas, A4 paisagem, visual igual a `exemplos/saida-exemplo-*`.
* [ ] Ler o QR de um PDF impresso com a câmera do celular e cair na página "Certificado válido" com os dados certos.
* [ ] Nome longo (2 linhas) e programa longo não quebram o layout.
* [ ] Cancelar um certificado e ver "Certificado cancelado" na verificação. Reativar e voltar a "válido".
* [ ] Corrigir um nome mantém o mesmo código e QR.
* [ ] Enviar `exemplos/assinatura-exemplo.jpg` (foto com fundo cinza claro): sai sem fundo, nas duas cores, e aparece certa nos dois padrões.
* [ ] Assinatura salva aparece na lista das outras pastas; o botão "Usar" só libera com o aceite de autorização.
* [ ] Editar a pasta depois de emitir não altera o que a verificação mostra dos já emitidos.
* [ ] Código digitado com espaços ou minúsculas é encontrado.
* [ ] Nenhum texto novo da interface usa travessão ou hífen como pontuação.

---

## 14. Fora do escopo agora (ideias para depois)

* Enviar o certificado por e-mail a cada aluno.
* Botão "Adicionar ao LinkedIn" na página de verificação.
* Painel com totais de certificados por cliente e por mês.
* Assinatura digital com certificado ICP-Brasil no PDF.
