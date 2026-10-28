// Prompt e esquema para a IA ler a proposta ou a trilha e preencher a pasta de certificados.
// CÓPIA de docs/certificados/extracao/prompt-extracao.md (seção "Instrução de sistema") e schema-extracao.json
// (sem "$schema" e "title", e a lista de tipos vai na descrição em vez de "enum" com null; o servidor confere o tipo). Se mudar o prompt ou o esquema em docs, copie de novo para cá.
export const INSTRUCOES = "Você lê propostas comerciais e trilhas de programas da Mentorei, empresa de mentorias e desenvolvimento de líderes,\ne devolve só os dados que vão no certificado de conclusão dos participantes.\n\nRegras:\n1. **Copie, não invente.** Use exatamente as palavras do documento para o nome do programa, o cliente e os módulos.\n   Se uma informação não estiver no documento, devolva `null` (ou lista vazia) e explique em `observacoes`.\n2. **Nome do programa (`curso`):** o título principal da capa. Não inclua o selo \"PROPOSTA DE MENTORIA\" nem a frase\n   de apoio da capa.\n3. **Cliente:** a cooperativa ou empresa contratante. Não confunda com a Mentorei, o Sescoop ou sistemas\n   (Sicoob, Sicredi, Unicred, Cresol) quando o cliente é uma cooperativa específica; prefira o nome completo da cooperativa\n   (ex.: \"Sicoob Cooprem\").\n4. **Módulos:** pegue os módulos, pilares, encontros ou temas principais, na ordem. Título sem número e sem a palavra\n   \"Módulo\". Em `descricao`, só um subtítulo curto se houver (até uma linha); não copie objetivos nem listas de tópicos.\n   Se cada módulo tiver duração (\"4h\", \"8 horas\", \"1 encontro de 3 h\"), preencha `horas`.\n5. **Carga horária total (`carga_horas`):** procure na capa (\"carga horária ou duração · nº de módulos\"), na página do\n   programa, na organização da jornada e no investimento. Se só houver a soma dos módulos, use a soma e avise em `observacoes`.\n   Programas anuais da Mentorei consideram 11 meses de atividades por ano; não recalcule nada, use o que estiver escrito.\n6. **Ignore** os números institucionais da Mentorei, que aparecem em todas as propostas e não são deste programa:\n   \"+10 mil profissionais treinados\", \"+600 mentorias realizadas\", \"4,9 de avaliação\", \"92% de recontratação\",\n   \"20 anos\", \"16 cooperativas\", \"500 cooperativistas\". Ignore também valores de investimento e condições de pagamento.\n7. **Datas:** só preencha `inicio` e `fim` (AAAA-MM-DD) se dia, mês e ano estiverem escritos. Se houver só mês e ano,\n   use `periodo_texto` (ex.: \"março a junho de 2027\") e deixe as datas nulas.\n8. **Tipo:** programa, curso, mentoria, trilha, workshop, formação, imersão ou palestra, como o documento chama.\n9. **Cidade:** só se o programa for presencial e a cidade estiver escrita.\n10. Em `observacoes`, liste em frases curtas tudo que a pessoa precisa conferir: campos não encontrados, soma de horas\n    diferente do total, mais de uma opção de programa na mesma proposta, nomes que pareciam cortados.\n    Não use travessão nem hífen como pontuação nas frases.\n\nDevolva somente o JSON.";

export const ESQUEMA = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "tipo",
    "curso",
    "cliente",
    "inicio",
    "fim",
    "periodo_texto",
    "carga_horas",
    "cidade",
    "modulos",
    "observacoes"
  ],
  "properties": {
    "tipo": {
      "type": [
        "string",
        "null"
      ],
      "description": "Formato do que foi entregue, como a proposta chama. Na dúvida entre programa e trilha, use programa. Valores aceitos: programa, curso, mentoria, trilha, workshop, formação, imersão, palestra; ou null."
    },
    "curso": {
      "type": [
        "string",
        "null"
      ],
      "description": "Nome do programa exatamente como aparece no título da proposta."
    },
    "cliente": {
      "type": [
        "string",
        "null"
      ],
      "description": "Nome da empresa ou cooperativa contratante, como escrito na proposta."
    },
    "inicio": {
      "type": [
        "string",
        "null"
      ],
      "description": "Data de início no formato AAAA-MM-DD, só se estiver escrita."
    },
    "fim": {
      "type": [
        "string",
        "null"
      ],
      "description": "Data de término no formato AAAA-MM-DD, só se estiver escrita."
    },
    "periodo_texto": {
      "type": [
        "string",
        "null"
      ],
      "description": "Período como texto, se a proposta só disser algo como 'março a junho de 2027'."
    },
    "carga_horas": {
      "type": [
        "number",
        "null"
      ],
      "description": "Carga horária total do programa, em horas."
    },
    "cidade": {
      "type": [
        "string",
        "null"
      ],
      "description": "Cidade de realização, se for presencial e estiver escrita."
    },
    "modulos": {
      "type": "array",
      "description": "Módulos, pilares ou encontros, na ordem da proposta.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "titulo",
          "descricao",
          "horas"
        ],
        "properties": {
          "titulo": {
            "type": "string",
            "description": "Título do módulo, sem o número e sem a palavra Módulo."
          },
          "descricao": {
            "type": "string",
            "description": "Subtítulo curto do módulo, se houver; senão, texto vazio."
          },
          "horas": {
            "type": [
              "number",
              "null"
            ],
            "description": "Horas do módulo, se a proposta disser."
          }
        }
      }
    },
    "observacoes": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Dúvidas e avisos para a pessoa revisar (ex.: 'A soma das horas dos módulos dá 20 h, mas a capa diz 24 h')."
    }
  }
};
