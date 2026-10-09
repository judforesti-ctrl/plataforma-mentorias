# Transforma os dois PowerPoints-modelo da proposta (netlify/lib/modelos/proposta-clara.pptx e proposta-escura.pptx)
# no módulo netlify/lib/modelos/proposta-modelos.mjs, que as funções da Netlify carregam (sem depender de arquivo solto).
# Rodar sempre que um modelo mudar:  python ferramentas/modelo-proposta.py
# Antes de trocar um modelo: abrir no PowerPoint com a fonte Inter (TrueType) instalada e salvar com
# "Inserir fontes no arquivo" + "todos os caracteres" (assim o cliente vê a fonte certa), sem anotações do apresentador.
# Os nomes das peças (Seleção → Painel de Seleção) precisam continuar os mesmos do MAPA em netlify/lib/proposta-pptx.mjs.
import base64, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
pasta = raiz / "netlify" / "lib" / "modelos"
linhas = ["// Gerado por ferramentas/modelo-proposta.py a partir de proposta-clara.pptx e proposta-escura.pptx. Não editar à mão.",
          "export const MODELOS_B64 = {"]
for nome in ["clara", "escura"]:
    dados = base64.b64encode((pasta / f"proposta-{nome}.pptx").read_bytes()).decode()
    linhas.append(f"  {nome}: '{dados}',")
linhas.append("};")
destino = pasta / "proposta-modelos.mjs"
destino.write_text("\n".join(linhas) + "\n", encoding="utf-8")
print(f"ok: {destino.name} ({destino.stat().st_size // 1024} KB)")
