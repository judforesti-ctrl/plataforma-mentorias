// Textos dos termos aceitos no primeiro acesso (versão do documento de privacidade de 06/10/2026).
// ATENÇÃO: revisar com o jurídico antes de usar com dados reais (razão social, CNPJ, encarregado, prazo de guarda).
export const CONTATO_DADOS = 'contato@mentorei.com.br';

export const TERMO_MENTORADO = `
<p><b>Bem-vindo à plataforma de mentorias da Mentorei.</b></p>
<p>Esta plataforma guarda o seu programa de mentoria: seus dados de contato, os resumos das sessões, as tarefas, as ferramentas que você recebeu e os resultados dos testes que fizer. Ela é operada pela Mentorei, que é a responsável pelos seus dados.</p>
<ul>
  <li><b>Quem vê o quê.</b> Seus mentores e a equipe de administração da Mentorei veem o seu programa completo. Você vê os resumos das sessões, as tarefas, as ferramentas e os seus resultados.</li>
  <li><b>Anotações dos mentores.</b> Os mentores fazem anotações de trabalho sobre as sessões, inclusive observações sensíveis, para conduzir a sua mentoria com cuidado. Essas anotações ficam visíveis só para os seus mentores e para a administração da Mentorei e nunca são enviadas à empresa onde você trabalha.</li>
  <li><b>O que a sua empresa recebe.</b> Quando a mentoria é contratada pela sua empresa, ela recebe apenas a frequência nas sessões, os temas trabalhados de forma geral e a evolução combinada no início do programa. O conteúdo das conversas não é compartilhado.</li>
  <li><b>Resumos automáticos.</b> Para escrever os resumos das sessões, a plataforma usa um serviço de inteligência artificial. O texto é revisado pelo seu mentor antes de chegar até você, e o serviço não usa os seus dados para treinar seus sistemas.</li>
  <li><b>Seus direitos.</b> Você pode pedir a qualquer momento uma cópia dos seus dados, a correção do que estiver errado ou o fim do uso dos seus dados, pelo e-mail ${CONTATO_DADOS}.</li>
</ul>
<p>Leia também a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a> completa.</p>`;

export const TERMO_MENTOR = `
<p><b>Compromisso de confidencialidade.</b> Como mentor da Mentorei, eu me comprometo a:</p>
<ol>
  <li>Usar os dados dos mentorados só para conduzir as mentorias, e nunca para outro fim.</li>
  <li>Não copiar, imprimir, fotografar nem enviar para fora da plataforma as fichas, os resumos e as anotações, exceto as ferramentas e resumos que a própria plataforma envia ao mentorado.</li>
  <li>Registrar no campo "Informações delicadas" apenas o necessário para a mentoria, com respeito e sem julgamentos, sabendo que o outro mentor do mesmo mentorado também lê esse campo.</li>
  <li>Não compartilhar com a empresa do mentorado, com o gestor dele nem com terceiros nada do conteúdo das sessões.</li>
  <li>Diante de um relato de risco à vida, assédio, violência ou ilegalidade, não prometer sigilo absoluto ao mentorado e avisar a administração da Mentorei no mesmo dia.</li>
  <li>Manter a minha senha em sigilo, sair da plataforma em computadores compartilhados e avisar a Mentorei se suspeitar que alguém acessou a minha conta.</li>
  <li>Manter este compromisso mesmo depois de deixar de atuar como mentor da Mentorei.</li>
</ol>
<p>Sei que a plataforma registra os meus acessos e as alterações que faço, e que as sessões concluídas só podem ser alteradas pela administração. Leia também a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</p>`;

// Aluno de turma (trilha em grupo, script 44). Mesma ressalva do jurídico acima.
export const TERMO_ALUNO = `
<p><b>Bem-vindo à área da sua trilha na Mentorei.</b></p>
<p>Aqui ficam os módulos da trilha com as datas, o link para entrar nas aulas online, os slides, as tarefas e as gravações das aulas. A plataforma é operada pela Mentorei, que é a responsável pelos seus dados.</p>
<ul>
  <li><b>O que guardamos.</b> Seu nome, e-mail, WhatsApp (se você informar), cargo, foto (se você colocar) e os seus acessos à plataforma.</li>
  <li><b>Quem vê.</b> A equipe da Mentorei e os mentores da sua turma veem o seu nome na lista de alunos. Seus colegas de turma não veem os seus dados.</li>
  <li><b>Gravações.</b> As aulas online podem ser gravadas. As gravações ficam disponíveis só para os alunos da turma, pelo link que aparece aqui. Não compartilhe esses links com quem não é da turma.</li>
  <li><b>Avaliação das aulas.</b> A avaliação de cada encontro é anônima: nem a Mentorei nem o mentor sabem quem respondeu.</li>
  <li><b>Seus direitos.</b> Você pode pedir a qualquer momento uma cópia dos seus dados, a correção do que estiver errado ou o fim do uso dos seus dados, pelo e-mail ${CONTATO_DADOS}.</li>
</ul>
<p>Leia também a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a> completa.</p>`;

export const AUTORIZACOES_ALUNO = [
  { chave: 'termo', obrigatoria: true, texto: '<b>Li e aceito</b> a Política de Privacidade e autorizo a Mentorei a tratar meus dados para conduzir a trilha.' },
  { chave: 'email', texto: 'Autorizo receber avisos da trilha (datas, materiais e gravações) por <b>e-mail</b>.' },
  { chave: 'whatsapp', texto: 'Autorizo receber avisos da trilha pelo <b>WhatsApp</b> informado no meu cadastro.' },
];

export const AUTORIZACOES_MENTORADO = [
  { chave: 'termo', obrigatoria: true, texto: '<b>Li e aceito</b> a Política de Privacidade e autorizo a Mentorei a tratar meus dados para conduzir a minha mentoria, inclusive as anotações das sessões feitas pelos meus mentores.' },
  { chave: 'whatsapp', texto: 'Autorizo receber os resumos das sessões e as tarefas também pelo <b>WhatsApp</b> informado no meu cadastro.' },
  { chave: 'email', texto: 'Autorizo receber lembretes e avisos do programa por <b>e-mail</b>.' },
  { chave: 'testes', texto: 'Autorizo que os resultados dos meus testes, como o Radar da Liderança, apareçam na minha ficha para os meus mentores.' },
];

export const AUTORIZACOES_MENTOR = [
  { chave: 'termo', obrigatoria: true, texto: '<b>Li e aceito</b> o compromisso de confidencialidade e a Política de Privacidade.' },
  { chave: 'perfil_publico', obrigatoria: true, texto: 'Autorizo que o meu perfil, com foto, trajetória e contatos, apareça para os meus mentorados.' },
];
