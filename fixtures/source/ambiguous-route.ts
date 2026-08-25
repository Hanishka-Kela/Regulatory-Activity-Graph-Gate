export async function handler(paymentConfig: { destination: string }, payload: unknown) {
  return await routePayment(paymentConfig.destination, payload);
}

declare function routePayment(destination: string, payload: unknown): Promise<void>;
