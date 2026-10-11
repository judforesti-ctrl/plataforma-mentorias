# Prepara um modelo de proposta novo antes de embutir as fontes (embutir-fontes-modelo.ps1): tira as anotações do
# apresentador, tira os espaços de foto vazios das páginas "Quem somos" (o aviso "inserir imagem" apareceria para o
# cliente) e desliga o "só as letras usadas" das fontes embutidas (a IA escreve letras que o modelo não tem).
# Uso:  python ferramentas/preparar-modelo.py <modelo.pptx> <preparado.pptx>
import sys, re, zipfile
ent, sai = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(ent)
arqs = {n: zin.read(n) for n in zin.namelist()}
notas = [n for n in arqs if n.startswith('ppt/notesSlides/')]
for n in notas: del arqs[n]
ct = arqs['[Content_Types].xml'].decode('utf8')
ct = re.sub(r'<Override PartName="/ppt/notesSlides/[^"]*"[^>]*/>', '', ct)
arqs['[Content_Types].xml'] = ct.encode('utf8')
for n in list(arqs):
    if re.match(r'ppt/slides/_rels/slide\d+\.xml\.rels$', n):
        arqs[n] = re.sub(r'<Relationship [^>]*notesSlide[^>]*/>', '', arqs[n].decode('utf8')).encode('utf8')
def tirar_foto(xml):
    i = xml.find('name="foto"')
    if i < 0: return xml
    a = xml.rfind('<p:sp>', 0, i); b = xml.find('</p:sp>', i) + len('</p:sp>')
    if 'type="pic"' not in xml[a:b] or '<a:blip' in xml[a:b]: return xml   # só o espaço de foto vazio
    return xml[:a] + xml[b:]
for s in [n for n in arqs if re.match(r'ppt/slides/slide\d+\.xml$', n)]:
    arqs[s] = tirar_foto(arqs[s].decode('utf8')).encode('utf8')
p = arqs['ppt/presentation.xml'].decode('utf8').replace(' saveSubsetFonts="1"', '')
arqs['ppt/presentation.xml'] = p.encode('utf8')
with zipfile.ZipFile(sai, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', arqs.pop('[Content_Types].xml'))
    for n, d in arqs.items(): z.writestr(n, d)
print('ok', len(notas), 'anotações removidas')
