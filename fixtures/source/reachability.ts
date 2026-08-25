import razorpayClient from "razorpay";

function unreachable() {
  razorpayClient.payments.create("dead");
}

function oneHop() {
  return razorpayClient.payments.create("live");
}

function twoHops() {
  return razorpayClient.payments.create("too-far");
}

function intermediate() {
  return twoHops();
}

export function handler() {
  return [oneHop(), intermediate()];
}
