# Mede a largura de cada letra da fonte Inter (Regular, Bold, ExtraBold) e grava em netlify/lib/proposta-letras.mjs,
# que o montador das propostas usa para saber quanto texto cabe em cada caixa (e ajustar selos e títulos).
# Uso:  python ferramentas/larguras-inter.py <pasta com Inter-Regular.ttf, Inter-Bold.ttf, Inter-ExtraBold.ttf>
import sys, pathlib, json
from fontTools.ttLib import TTFont
raiz = pathlib.Path(__file__).resolve().parent.parent
pasta = pathlib.Path(sys.argv[1])
extras = [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2192, 0x2713]
saida = {}
for chave, arq in [("regular", "Inter-Regular.ttf"), ("bold", "Inter-Bold.ttf"), ("extrabold", "Inter-ExtraBold.ttf")]:
    f = TTFont(pasta / arq); upm = f["head"].unitsPerEm; cmap = f.getBestCmap(); hmtx = f["hmtx"]
    w = lambda cp: round(hmtx[cmap[cp]][0] * 1000 / upm) if cp in cmap else 0
    saida[chave] = {"base": ",".join(str(w(cp)) for cp in range(32, 256)), "extras": {str(cp): w(cp) for cp in extras}}
    hh = f["hhea"]; saida[chave]["linha"] = round((hh.ascent - hh.descent + hh.lineGap) / upm, 3)
(raiz / "netlify" / "lib" / "proposta-letras.mjs").write_text(
    "// Gerado por ferramentas/larguras-inter.py: largura de cada letra da Inter em milésimos do tamanho da fonte\n"
    "// (letras 32 a 255 em sequência; extras por código). Não editar à mão.\n"
    f"export const LETRAS = {json.dumps(saida, ensure_ascii=False)};\n", encoding="utf-8")
print("ok")
