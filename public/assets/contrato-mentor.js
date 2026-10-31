// Contrato de prestação de serviço do mentor parceiro com a Mentorei (pedido da Juliana, 30/10/2026: "não tenho pronto, crie um
// padrão e refinamos depois"). MODELO PADRÃO, ainda sem revisão jurídica. Para mudar o texto, troque também a VERSAO: quem assinou a
// versão anterior é chamado a assinar a nova (o aceite fica guardado com a versão e o resumo do texto em contratos_mentor).
// Campos entre chaves são preenchidos na hora da assinatura: {NOME}, {DOCUMENTO}, {EMAIL}, {DATA}.

export const VERSAO = '2026-10-30';
// Desligado até a Juliana revisar o texto: os mentores só passam a ver o contrato quando isto virar true.
export const LIBERADO = true;
export const PRAZO_LER_DEPOIS = 7;   // dias em que o mentor pode deixar para depois sem o lembrete a cada entrada

export const CONTRATANTE = {
  razao: 'FSK Capital Intelectual Ltda.',
  marca: 'Mentorei',
  cnpj: '30.589.703/0001-68',
  cidade: 'Campinas/SP',
  foro: 'Campinas/SP',
};

export const TITULO = 'Contrato de prestação de serviços de mentoria e facilitação';

export const TEXTO = `
<p><b>CONTRATANTE:</b> ${CONTRATANTE.razao} ("${CONTRATANTE.marca}"), CNPJ ${CONTRATANTE.cnpj}, com sede em ${CONTRATANTE.cidade}.</p>
<p><b>CONTRATADO(A):</b> {NOME}, CPF ou CNPJ {DOCUMENTO}, e-mail {EMAIL} ("Mentor").</p>

<h4>1. O que é contratado</h4>
<p>1.1. O Mentor presta à Mentorei, sob demanda, serviços de mentoria individual, facilitação de módulos e turmas (online ou presenciais) e, quando combinado por escrito, criação de conteúdo, para clientes da Mentorei.</p>
<p>1.2. Cada trabalho (programa, turma, módulo ou sessão) é oferecido pela plataforma da Mentorei ou pela coordenação. O Mentor é livre para aceitar ou não cada convite; depois de aceito, compromete-se com data, horário, formato e local combinados.</p>

<h4>2. Natureza da relação</h4>
<p>2.1. O Mentor atua de forma autônoma, sem vínculo empregatício, sem subordinação e sem horário fixo, podendo prestar serviços a outras empresas, respeitadas as cláusulas 8, 9 e 10.</p>
<p>2.2. Os tributos e encargos sobre o que o Mentor recebe são de responsabilidade dele.</p>

<h4>3. Remuneração e pagamento</h4>
<p>3.1. O valor e a forma de remuneração (por hora, por atendimento ou aula, por módulo, valor mensal ou percentual) são combinados por escrito com a Mentorei para cada trabalho e ficam registrados pela coordenação.</p>
<p>3.2. O Mentor envia pela plataforma a nota fiscal de serviço (ou recibo, quando aplicável) dos serviços de cada mês. A Mentorei paga nos dias 5, 15 e 25 de cada mês (em fim de semana ou feriado, no dia útil seguinte): a nota entra no primeiro desses dias que vier pelo menos 3 dias depois do envio e depois do fim do mês dos serviços, conforme o extrato do mês. Situações fora do comum podem ter outra data, combinada com o Mentor.</p>
<p>3.3. Sessão ou aula não realizada por motivo do Mentor não é paga. Quando o cliente cancelar ou remarcar, vale o que estiver combinado no programa.</p>

<h4>4. Despesas e viagens</h4>
<p>4.1. Viagens e despesas só acontecem com autorização prévia da Mentorei, que compra passagens e hospedagem ou reembolsa o Mentor mediante comprovante, enviado em até 30 dias da despesa.</p>

<h4>5. Compromissos do Mentor</h4>
<p>5.1. Ser pontual, seguir a metodologia, os materiais e a identidade da Mentorei e manter postura ética e respeitosa com clientes, mentorados e alunos.</p>
<p>5.2. Registrar na plataforma, nos prazos combinados, as sessões, a presença dos alunos, as percepções das aulas e o que mais for pedido pela coordenação.</p>
<p>5.3. Avisar a coordenação com pelo menos 48 horas de antecedência sobre qualquer impedimento, salvo emergência.</p>

<h4>6. Compromissos da Mentorei</h4>
<p>6.1. Informar com antecedência os trabalhos, os objetivos do cliente e os materiais; dar acesso à plataforma; apoiar o Mentor pela coordenação; e pagar em dia.</p>

<h4>7. Confidencialidade e dados pessoais</h4>
<p>7.1. O Mentor mantém em sigilo tudo o que souber dos clientes, mentorados, alunos e da Mentorei, inclusive o conteúdo das sessões, e cumpre o Termo de Confidencialidade da plataforma, que faz parte deste contrato.</p>
<p>7.2. O Mentor trata dados pessoais só para executar os serviços, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), e avisa a Mentorei em até 24 horas sobre qualquer suspeita de vazamento.</p>
<p>7.3. Estas obrigações continuam valendo por 5 (cinco) anos depois do fim deste contrato.</p>

<h4>8. Propriedade intelectual</h4>
<p>8.1. A metodologia, os materiais, as ferramentas, a plataforma e a marca Mentorei pertencem à Mentorei e só podem ser usados nos trabalhos da Mentorei.</p>
<p>8.2. O conteúdo criado pelo Mentor por encomenda da Mentorei tem os direitos patrimoniais cedidos à Mentorei, com o crédito de autoria preservado. O que o Mentor já tinha antes continua sendo dele.</p>

<h4>9. Clientes da Mentorei</h4>
<p>9.1. Durante este contrato e por 12 (doze) meses depois do último trabalho, o Mentor não oferece diretamente os seus serviços aos clientes que conheceu pela Mentorei, salvo com autorização escrita da Mentorei.</p>

<h4>10. Imagem e gravações</h4>
<p>10.1. O Mentor autoriza, sem custo, o uso da sua imagem e voz nas gravações e fotos das aulas, para entrega aos clientes e para a divulgação institucional da Mentorei. O uso para divulgação pode ser revogado a qualquer momento para o que vier depois do pedido.</p>

<h4>11. Prazo e encerramento</h4>
<p>11.1. Este contrato vale por prazo indeterminado e pode ser encerrado por qualquer das partes com aviso de 30 (trinta) dias, cumprindo os trabalhos já aceitos ou combinando a substituição.</p>
<p>11.2. Quebra de confidencialidade ou conduta grave permitem o encerramento imediato.</p>

<h4>12. Assinatura eletrônica e foro</h4>
<p>12.1. As partes reconhecem a validade da assinatura eletrônica deste contrato na plataforma da Mentorei (art. 10, § 2º, da Medida Provisória 2.200-2/2001), com o registro de data, hora, versão do texto e dos dados informados pelo Mentor.</p>
<p>12.2. Fica eleito o foro de ${CONTRATANTE.foro} para resolver qualquer questão deste contrato.</p>
<p>${CONTRATANTE.cidade.split('/')[0]}, {DATA}.</p>`;

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Texto com os dados de quem assina (ou com os espaços em branco, na prévia)
export function preencher({ nome, documento, email, data } = {}) {
  const vazio = '<span style="border-bottom:1px solid currentColor;display:inline-block;min-width:140px">&nbsp;</span>';
  const v = (x) => (x ? `<b>${esc(x)}</b>` : vazio);
  return TEXTO.replace(/\{NOME\}/g, v(nome)).replace(/\{DOCUMENTO\}/g, v(documento)).replace(/\{EMAIL\}/g, v(email)).replace(/\{DATA\}/g, v(data));
}
// Resumo do texto assinado (guardado com o aceite: prova de qual texto foi assinado)
export async function resumo(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const documentoValido = (d) => { const n = String(d || '').replace(/\D/g, ''); return n.length === 11 || n.length === 14; };
