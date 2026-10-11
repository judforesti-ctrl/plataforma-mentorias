# Gera Manrope ExtraBold / SemiBold / Light fixas a partir da Manrope variável, cada uma como família "normal"
# (peso 400, sem nomes 16/17, subconjunto latino), para o PowerPoint embutir no modelo da proposta como "regular"
# (senão os títulos saem finos no computador do cliente). Também servem para larguras-letras.py.
# Uso:  python ferramentas/manrope-fixa.py <pasta com Manrope-Variable.ttf>   (grava as fixas na mesma pasta)
import sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
pasta = pathlib.Path(sys.argv[1])
var = pasta / "Manrope-Variable.ttf"
uni = list(range(0x20, 0x250)) + [0x2013,0x2014,0x2018,0x2019,0x201A,0x201C,0x201D,0x201E,0x2022,0x2026,0x20AC,0x2122,0x2192,0x2713,0x00A0,0x2212]
for peso, nome in [(800, "ExtraBold"), (600, "SemiBold"), (300, "Light")]:
    f = instancer.instantiateVariableFont(TTFont(var), {"wght": peso}, updateFontNames=False)
    opts = subset.Options(); opts.layout_features = ["*"]; opts.name_IDs = ["*"]; opts.name_languages = ["*"]; opts.notdef_outline = True; opts.glyph_names = False
    sub = subset.Subsetter(opts); sub.populate(unicodes=uni); sub.subset(f)
    fam = f"Manrope {nome}"; ps = f"Manrope-{nome}"
    nt = f["name"]
    for rec in list(nt.names):
        if rec.nameID in (16, 17, 21, 22, 25) or rec.nameID >= 256: nt.removeNames(nameID=rec.nameID)
    for pid, eid, lid in [(3, 1, 0x409), (1, 0, 0)]:
        nt.setName(fam, 1, pid, eid, lid); nt.setName("Regular", 2, pid, eid, lid)
        nt.setName(f"{fam};Mentorei", 3, pid, eid, lid); nt.setName(fam, 4, pid, eid, lid); nt.setName(ps, 6, pid, eid, lid)
    os2 = f["OS/2"]; os2.usWeightClass = 400
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | 0b1000000   # tira itálico/negrito, liga REGULAR
    os2.fsType = 0
    f["head"].macStyle = 0
    for t in ("STAT", "fvar", "gvar", "avar", "HVAR", "MVAR"):
        if t in f: del f[t]
    out = pasta / f"{ps}.ttf"; f.save(out)
    print(out.name, out.stat().st_size, os2.usWeightClass)
