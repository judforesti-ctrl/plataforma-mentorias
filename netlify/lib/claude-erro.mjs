// Explica para a tela por que o Claude recusou o pedido. Os casos comuns em português; os outros levam a mensagem
// original do Claude, para dar para saber o que aconteceu (antes só aparecia o número, ex.: "erro (400)").
// Falta de créditos chega como 400 (invalid_request_error), não como 402.
export function motivoClaude(e) {
  const msg = String((e && e.error && e.error.error && e.error.error.message) || (e && e.message) || '').trim();
  if ((e && e.status === 402) || /credit balance|purchase credits|billing/i.test(msg)) {
    return 'Acabaram os créditos da conta do Claude. Coloque créditos em console.anthropic.com → Billing e tente de novo.';
  }
  if (e && (e.status === 529 || e.status >= 500)) return 'O Claude está sobrecarregado agora. Espere alguns minutos e tente de novo.';
  return `O Claude respondeu com erro (${e && e.status}): ${msg.slice(0, 400) || 'sem detalhe'}`;
}
