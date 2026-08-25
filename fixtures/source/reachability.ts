import razorpayClient from "razorpay";

function unreachable() {
  razorpayClient.payments.create("dead");
}

function oneHop() {
  return razorpayClient.payments.create("live");
}

export function handler() {
  return oneHop();
}
