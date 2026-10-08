# Transforma o PowerPoint-modelo da proposta (netlify/lib/modelos/proposta-modelo.pptx) no módulo
# netlify/lib/modelos/proposta-modelo.mjs, que as funções da Netlify carregam (sem depender de arquivo solto no servidor).
# Rodar sempre que o modelo mudar:  python ferramentas/modelo-proposta.py
import base64, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
origem = raiz / "netlify" / "lib" / "modelos" / "proposta-modelo.pptx"
destino = raiz / "netlify" / "lib" / "modelos" / "proposta-modelo.mjs"
dados = base64.b64encode(origem.read_bytes()).decode()
destino.write_text("// Gerado por ferramentas/modelo-proposta.py a partir de proposta-modelo.pptx. Não editar à mão.\n"
                   f"export const MODELO_B64 = '{dados}';\n", encoding="utf-8")
print(f"ok: {destino.name} ({destino.stat().st_size // 1024} KB)")
