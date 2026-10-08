# Cópia de RESTAURAÇÃO da Plataforma de Mentorias Mentorei, feita no computador da Juliana.
# Baixa todas as tabelas do Supabase (formato que o banco entende, para recriar a plataforma inteira) e os arquivos
# enviados (fotos, PDFs do arsenal, materiais das turmas). Guarda em:
#   ..\..\backups-plataforma-mentorias\AAAA-MM-DD\   (dentro de "programacoes sites e radares")
# Cópias com mais de 6 meses são apagadas. Os arquivos (fotos, PDFs) só são baixados uma vez: os já baixados são aproveitados.
# Roda sozinho toda segunda-feira (tarefa agendada do Windows "Mentorei - backup da plataforma").
# Para rodar à mão: powershell -ExecutionPolicy Bypass -File ferramentas\backup-restauracao.ps1
# Precisa do arquivo .env na pasta plataforma-mentorias com a linha: SUPABASE_SECRET_KEY=sb_secret_...
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pastaBackups = Join-Path (Split-Path $raiz -Parent) 'backups-plataforma-mentorias'
$registro = Join-Path $pastaBackups 'registro.txt'
New-Item -ItemType Directory -Force $pastaBackups | Out-Null
function Log($t) { $linha = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $t; Write-Host $linha; Add-Content -Path $registro -Value $linha -Encoding UTF8 }

try {
  $envArq = Join-Path $raiz '.env'
  if (-not (Test-Path $envArq)) { throw "Falta o arquivo .env em $raiz (com a linha SUPABASE_SECRET_KEY=...). Veja ferramentas\COMO-RESTAURAR.md." }
  $env_ = @{}
  Get-Content $envArq -Encoding UTF8 | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object { $env_[$Matches[1]] = $Matches[2].Trim().Trim('"') }
  $chave = $env_['SUPABASE_SECRET_KEY']
  if (-not $chave) { throw 'O .env não tem a linha SUPABASE_SECRET_KEY=...' }
  $url = if ($env_['SUPABASE_URL']) { $env_['SUPABASE_URL'].TrimEnd('/') } else { 'https://mixnubenhaleohkcanma.supabase.co' }
  $cab = @{ apikey = $chave; Authorization = "Bearer $chave" }
  $agente = 'mentorei-plataforma-backup/1.0'   # o Supabase recusa a chave secreta vinda de navegador
  $utf8 = New-Object Text.UTF8Encoding $false

  $hoje = Get-Date -Format 'yyyy-MM-dd'
  $destino = Join-Path $pastaBackups $hoje
  New-Item -ItemType Directory -Force (Join-Path $destino 'tabelas') | Out-Null

  # 1. Tabelas (todas, menos "integracoes", que guarda a chave do Google e se refaz conectando de novo)
  $tabelas = 'perfis', 'convites', 'empresas', 'programas', 'programa_temas', 'mentorados', 'mentor_mentorado', 'sessoes', 'sessoes_interno',
    'avaliacoes_sessao', 'testes', 'acessos', 'historico', 'ferramentas', 'arsenal_tags', 'ferramentas_enviadas', 'turmas', 'modulos',
    'modulo_mentores', 'modulo_arquivos', 'importacoes_proposta', 'agenda_bloqueios', 'agenda_reservas', 'agenda_reserva_datas',
    'agenda_reserva_mentores', 'agenda_links', 'configuracoes', 'google_eventos', 'agenda_reunioes'
  $totais = @{}
  foreach ($t in $tabelas) {
    $linhas = New-Object Collections.ArrayList
    $offset = 0
    while ($true) {
      try { $r = Invoke-WebRequest -UseBasicParsing -UserAgent $agente -Uri "$url/rest/v1/$($t)?select=*&limit=1000&offset=$offset" -Headers $cab }
      catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { $r = $null; break } else { throw } }
      $texto = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
      $parte = $texto | ConvertFrom-Json
      if ($parte) { [void]$linhas.AddRange(@($parte)) }
      if (@($parte).Count -lt 1000) { break }
      $offset += 1000
    }
    if ($null -eq $r) { Log "  ${t}: tabela ainda não existe (script não rodado), pulada"; continue }
    $json = ConvertTo-Json -InputObject @($linhas) -Depth 30
    [IO.File]::WriteAllText((Join-Path $destino "tabelas\$t.json"), $json, $utf8)
    $totais[$t] = $linhas.Count
  }
  Log ("Tabelas salvas em {0}: {1} registros em {2} tabelas" -f $destino, ($totais.Values | Measure-Object -Sum).Sum, $totais.Count)

  # 2. Arquivos enviados (fotos, PDFs do arsenal, materiais das turmas): baixa só o que ainda não tem
  $arquivos = Join-Path $pastaBackups 'arquivos'
  $baixados = 0
  foreach ($bucket in 'fotos', 'arsenal', 'turmas') {
    $fila = New-Object Collections.Queue; $fila.Enqueue('')
    while ($fila.Count) {
      $prefixo = $fila.Dequeue()
      $corpo = @{ prefix = $prefixo; limit = 1000; offset = 0; sortBy = @{ column = 'name'; order = 'asc' } } | ConvertTo-Json -Compress
      try { $l = Invoke-WebRequest -UseBasicParsing -UserAgent $agente -Method Post -Uri "$url/storage/v1/object/list/$bucket" -Headers ($cab + @{ 'Content-Type' = 'application/json' }) -Body $corpo }
      catch { Log "  $bucket/${prefixo}: não consegui listar ($($_.Exception.Message))"; continue }
      $itens = [Text.Encoding]::UTF8.GetString($l.RawContentStream.ToArray()) | ConvertFrom-Json
      foreach ($it in $itens) {
        $caminho = if ($prefixo) { "$prefixo/$($it.name)" } else { $it.name }
        if (-not $it.id) { $fila.Enqueue($caminho); continue }   # pasta
        $local = Join-Path $arquivos (Join-Path $bucket ($caminho -replace '/', '\'))
        if (Test-Path $local) { continue }
        New-Item -ItemType Directory -Force (Split-Path $local -Parent) | Out-Null
        $enc = ($caminho -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
        Invoke-WebRequest -UseBasicParsing -UserAgent $agente -Uri "$url/storage/v1/object/$bucket/$enc" -Headers $cab -OutFile $local
        $baixados += 1
      }
    }
  }
  Log "Arquivos novos baixados: $baixados (pasta $arquivos)"

  # 3. Apaga cópias de tabelas com mais de 6 meses (os arquivos ficam, pois são aproveitados)
  $limite = (Get-Date).AddDays(-183)
  Get-ChildItem $pastaBackups -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' -and [datetime]$_.Name -lt $limite } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force; Log "Cópia antiga apagada: $($_.Name)" }
  Set-Content -Path (Join-Path $pastaBackups 'ultimo-ok.txt') -Value $hoje -Encoding UTF8
  Log 'Cópia de restauração concluída.'
} catch {
  Log ("ERRO: " + $_.Exception.Message)
  exit 1
}
