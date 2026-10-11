# Salva o modelo da proposta com as fontes EMBUTIDAS (todos os caracteres), para o cliente ver certo sem ter a fonte.
# A Manrope instalada no Windows é a variável, que o PowerPoint embute errado (sai a ExtraLight no lugar de todas).
# Por isso, só durante o processo e só nesta sessão do Windows (sem mexer na instalação), troca a variável pelas
# fixas geradas por manrope-fixa.py; no fim volta tudo como estava. A Inter já está instalada em TrueType.
# Uso (PowerPoint fechado):
#   powershell -File ferramentas\embutir-fontes-modelo.ps1 -Entrada preparado.pptx -Saida netlify\lib\modelos\proposta-modelo.pptx -Fontes <pasta das Manrope fixas>
param([string]$Entrada, [string]$Saida, [string]$Fontes)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Fx {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceW(string f);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern bool RemoveFontResourceW(string f);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint fl, uint t, out IntPtr r);
  public static void Aviso() { IntPtr r; SendMessageTimeout((IntPtr)0xffff, 0x001D, IntPtr.Zero, IntPtr.Zero, 2, 2000, out r); }
}
"@
if (Get-Process POWERPNT -ErrorAction SilentlyContinue) { throw 'Feche o PowerPoint antes.' }
$Entrada = (Resolve-Path $Entrada).Path; $Saida = [IO.Path]::GetFullPath($Saida)
$var = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts\Manrope-Variable.ttf"
$fixas = 'Manrope-ExtraBold','Manrope-SemiBold','Manrope-Light' | ForEach-Object { Join-Path (Resolve-Path $Fontes) "$_.ttf" }
$tirou = 0; while ([Fx]::RemoveFontResourceW($var) -and $tirou -lt 10) { $tirou++ }
foreach ($f in $fixas) { [void][Fx]::AddFontResourceW($f) }
[Fx]::Aviso()
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $p = $pp.Presentations.Open($Entrada, $false, $false, $false)
  $p.SaveAs($Saida, 24, -1)
  $p.Close(); $pp.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp) | Out-Null
} finally {
  Start-Sleep -Seconds 2
  foreach ($f in $fixas) { [void][Fx]::RemoveFontResourceW($f) }
  for ($i = 0; $i -lt [Math]::Max(1, $tirou); $i++) { [void][Fx]::AddFontResourceW($var) }
  [Fx]::Aviso()
}
"ok: $Saida"
