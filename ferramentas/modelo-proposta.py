# Transforma o PowerPoint-modelo da proposta (netlify/lib/modelos/proposta-modelo.pptx) no módulo
# netlify/lib/modelos/proposta-modelos.mjs, que as funções da Netlify carregam (sem depender de arquivo solto).
# Rodar sempre que o modelo mudar:  python ferramentas/modelo-proposta.py
# Antes de trocar o modelo: preparar-modelo.py (tira anotações e fotos vazias) e embutir-fontes-modelo.ps1 (fontes
# embutidas com todos os caracteres, assim o cliente vê a fonte certa).
# Os nomes das peças (Seleção → Painel de Seleção) precisam continuar os mesmos do MAPA em netlify/lib/proposta-pptx.mjs.
import base64, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
pasta = raiz / "netlify" / "lib" / "modelos"
dados = base64.b64encode((pasta / "proposta-modelo.pptx").read_bytes()).decode()
destino = pasta / "proposta-modelos.mjs"
destino.write_text("// Gerado por ferramentas/modelo-proposta.py a partir de proposta-modelo.pptx. Não editar à mão.\n"
                   f"export const MODELO_B64 = '{dados}';\n", encoding="utf-8")
print(f"ok: {destino.name} ({destino.stat().st_size // 1024} KB)")
