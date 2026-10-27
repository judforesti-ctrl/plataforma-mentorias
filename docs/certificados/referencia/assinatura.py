"""Prepara a imagem de uma assinatura para o certificado (referência testada).

Entrada: foto ou escaneamento da assinatura em papel claro (JPG, PNG, HEIC convertido), ou PNG transparente.
Saída: duas imagens PNG transparentes, recortadas na assinatura:
  * tinta azul-petróleo #0E3B44, para o padrão CLARO;
  * tinta bege #F2EADF, para o padrão ESCURO (caneta escura não aparece no fundo azul-petróleo).

Passos: estimar a cor do papel, transformar a diferença de brilho em transparência (bordas suaves),
limpar pontinhos soltos, recortar com uma pequena margem e pintar a tinta com a cor da marca.

Uso:  python assinatura.py foto.jpg saida_prefixo
"""
import base64, io, sys
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi

TINTAS = {"clara": (14, 59, 68), "escura": (242, 234, 223)}


def mascara_tinta(img):
    img = ImageOps.exif_transpose(img)
    rgba = img.convert("RGBA")
    if max(rgba.size) > 2400:
        rgba.thumbnail((2400, 2400), Image.LANCZOS)
    a = np.asarray(rgba).astype(np.float32)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    alfa_orig = a[..., 3] / 255.0
    # papel: brilho típico do fundo, com correção de iluminação desigual (fotos de celular)
    fundo = ndi.median_filter(lum[::4, ::4], size=31)
    fundo = np.asarray(Image.fromarray(fundo).resize(lum.shape[::-1], Image.BILINEAR))
    fundo = np.maximum(fundo, np.percentile(lum[alfa_orig > 0.5], 60) if (alfa_orig > 0.5).any() else 255)
    escuro = fundo - lum
    alfa = np.clip((escuro - 28) / 70.0, 0, 1)
    # PNG já transparente: respeita a transparência original
    if (alfa_orig < 0.99).mean() > 0.05:
        alfa = np.maximum(alfa * (alfa_orig > 0.5), alfa_orig * (lum < 200))
    # remove pontinhos soltos (poeira, textura do papel)
    rot, n = ndi.label(alfa > 0.35)
    if n:
        tam = ndi.sum(np.ones_like(alfa), rot, index=np.arange(1, n + 1))
        minimo = max(30, 0.0004 * alfa.size)
        manter = np.isin(rot, np.where(tam >= minimo)[0] + 1)
        alfa = alfa * ndi.binary_dilation(manter, iterations=3)
    ys, xs = np.where(alfa > 0.15)
    if not len(xs):
        raise ValueError("Não encontramos a assinatura na imagem. Use fundo claro e caneta escura.")
    m = int(0.03 * max(np.ptp(xs), np.ptp(ys))) + 4
    y0, y1 = max(0, ys.min() - m), min(alfa.shape[0], ys.max() + m)
    x0, x1 = max(0, xs.min() - m), min(alfa.shape[1], xs.max() + m)
    return alfa[y0:y1, x0:x1]


def pintar(alfa, cor):
    h, w = alfa.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = cor
    out[..., 3] = np.round(alfa * 255).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    if w > 1600:
        im = im.resize((1600, round(h * 1600 / w)), Image.LANCZOS)
    return im


def preparar(caminho_ou_bytes):
    img = Image.open(io.BytesIO(caminho_ou_bytes) if isinstance(caminho_ou_bytes, bytes) else caminho_ou_bytes)
    alfa = mascara_tinta(img)
    return {v: pintar(alfa, cor) for v, cor in TINTAS.items()}


def data_uri(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    origem, prefixo = sys.argv[1], sys.argv[2]
    for v, im in preparar(origem).items():
        im.save(f"{prefixo}-{v}.png", optimize=True)
        print(f"{prefixo}-{v}.png", im.size)
