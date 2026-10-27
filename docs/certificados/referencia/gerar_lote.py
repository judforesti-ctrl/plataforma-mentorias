"""Gerador de referência do lote de certificados Mentorei (testado).

Mostra, de ponta a ponta, o que a plataforma precisa fazer no botão "Gerar certificados":
  1. ler os dados da turma (JSON) e a lista de nomes (CSV, XLSX salvo como CSV ou TXT, um por linha);
  2. criar um código único e aleatório por aluno e o QR code com o endereço de verificação;
  3. abrir o modelo uma vez no Chromium, desenhar cada aluno com CertificadoMentorei.render(dados)
     e salvar o PDF (frente e verso);
  4. devolver o ZIP com todos os PDFs, um codigos.csv e o registro.json (o que vai para o banco).

Uso:
  python gerar_lote.py --turma ../exemplos/turma-exemplo.json --nomes ../exemplos/nomes-exemplo.csv \
      --saida ../exemplos/saida-exemplo --base-url https://certificados.mentorei.com.br

Requer: playwright (Chromium) e pypdf (só para o PDF único de impressão, opcional).
"""
import argparse, csv, datetime, json, os, re, secrets, sys, unicodedata, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qr import QR
import assinatura

ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # sem 0, 1, I e O, que confundem na leitura


def novo_codigo(usados):
    ano = datetime.date.today().strftime("%y")
    while True:
        a = "".join(secrets.choice(ALFABETO) for _ in range(4))
        b = "".join(secrets.choice(ALFABETO) for _ in range(4))
        cod = f"MTR-{ano}-{a}-{b}"
        if cod not in usados:  # na plataforma: índice único no banco e nova tentativa se colidir
            usados.add(cod)
            return cod


def limpar_nome(n):
    return re.sub(r"\s+", " ", (n or "").replace(" ", " ")).strip()


def ler_nomes(caminho):
    with open(caminho, encoding="utf-8-sig") as fh:
        texto = fh.read()
    nomes = []
    if caminho.lower().endswith(".csv"):
        amostra = texto[:2000]
        sep = ";" if amostra.count(";") > amostra.count(",") else ","
        linhas = list(csv.reader(texto.splitlines(), delimiter=sep))
        if not linhas:
            return []
        cab = [c.strip().lower() for c in linhas[0]]
        col = cab.index("nome") if "nome" in cab else None
        corpo = linhas[1:] if col is not None else linhas
        col = col or 0
        nomes = [limpar_nome(l[col]) for l in corpo if len(l) > col]
    else:
        nomes = [limpar_nome(l) for l in texto.splitlines()]
    return [n for n in nomes if n]


def nome_arquivo(i, nome):
    base = unicodedata.normalize("NFC", nome)
    base = re.sub(r'[\\/:*?"<>|]+', "", base).strip()
    return f"{i:03d} {base}.pdf"


def gerar(turma, nomes, saida, base_url, template, pdf_unico=True):
    from playwright.sync_api import sync_playwright
    os.makedirs(saida, exist_ok=True)
    dominio = re.sub(r"^https?://", "", base_url).rstrip("/")
    usados, registros, arquivos = set(), [], []
    agora = datetime.datetime.now().isoformat(timespec="seconds")
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pg = nav.new_page()
        pg.goto("file://" + os.path.abspath(template))
        pg.wait_for_selector("body[data-pronto='1']")
        for i, nome in enumerate(nomes, 1):
            codigo = novo_codigo(usados)
            link = f"{base_url.rstrip('/')}/{codigo}"
            dados = dict(turma)
            dados.update({
                "participante": nome,
                "codigo": codigo,
                "url_verificacao": dominio,
                "qr_imagem": QR(link).data_uri(cor="#0E3B44", margem=1),
            })
            pg.evaluate("d => window.CertificadoMentorei.render(d)", dados)
            arq = os.path.join(saida, nome_arquivo(i, nome))
            pg.pdf(path=arq, print_background=True, prefer_css_page_size=True,
                   margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
            arquivos.append(arq)
            snap = {k: v for k, v in dados.items() if k not in ("qr_imagem", "resp1_assinatura", "resp2_assinatura")}
            registros.append({"codigo": codigo, "participante": nome, "status": "valido",
                              "link": link, "emitido_em": agora, "dados": snap})
            print(f"  {i:3d}/{len(nomes)}  {codigo}  {nome}")
        nav.close()

    with open(os.path.join(saida, "codigos.csv"), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Número", "Participante", "Código", "Link de verificação"])
        for i, r in enumerate(registros, 1):
            w.writerow([i, r["participante"], r["codigo"], r["link"]])
    with open(os.path.join(saida, "registro.json"), "w", encoding="utf-8") as fh:
        json.dump(registros, fh, ensure_ascii=False, indent=2)

    extras = [os.path.join(saida, "codigos.csv")]
    if pdf_unico:
        try:
            from pypdf import PdfWriter
            w = PdfWriter()
            for a in arquivos:
                w.append(a)
            unico = os.path.join(saida, "todos-para-imprimir.pdf")
            with open(unico, "wb") as fh:
                w.write(fh)
            extras.append(unico)
        except ImportError:
            pass

    cliente = re.sub(r'[\\/:*?"<>|]+', "", turma.get("cliente") or "Cliente")
    curso = re.sub(r'[\\/:*?"<>|]+', "", turma.get("curso") or "Programa")
    zip_path = os.path.join(saida, f"Certificados · {cliente} · {curso}"[:120].strip() + ".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for a in arquivos + extras:
            z.write(a, os.path.basename(a))
    return zip_path, registros


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--turma", required=True)
    ap.add_argument("--nomes", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--base-url", default="https://certificados.mentorei.com.br")
    ap.add_argument("--template", default=os.path.join(here, "..", "template", "certificado.html"))
    a = ap.parse_args()
    with open(a.turma, encoding="utf-8") as fh:
        turma = json.load(fh)
    # assinaturas: arquivo de foto ou escaneamento -> PNG transparente na cor certa da variação
    base_turma = os.path.dirname(os.path.abspath(a.turma))
    for n in (1, 2):
        arq = turma.pop(f"resp{n}_assinatura_arquivo", "")
        if arq:
            versoes = assinatura.preparar(os.path.join(base_turma, arq))
            turma[f"resp{n}_assinatura"] = assinatura.data_uri(versoes[turma.get("variacao", "clara")])
    nomes = ler_nomes(a.nomes)
    repetidos = sorted({n for n in nomes if nomes.count(n) > 1})
    if repetidos:
        print("Atenção, nomes repetidos:", ", ".join(repetidos))
    print(f"Gerando {len(nomes)} certificados ({turma.get('variacao', 'clara')})...")
    z, _ = gerar(turma, nomes, a.saida, a.base_url, a.template)
    print("Pronto:", z)
