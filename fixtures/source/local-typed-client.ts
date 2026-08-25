interface RazorpayClient {
  payments: { create(value: string): unknown };
}

declare const buildClient: () => RazorpayClient;
const razorpayClient: RazorpayClient = buildClient();

export function handler() {
  return razorpayClient.payments.create("locally-typed");
}
