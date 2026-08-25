const razorpayClient = {
  payments: { create: (_value: string) => undefined },
};

// razorpayClient.payments.create("comment-only")
interface PretendClient {
  payments: { create(value: string): void };
}

export function handler() {
  razorpayClient.payments.create("not-an-sdk-call");
}
