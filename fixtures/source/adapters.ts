import razorpayClient from "razorpay";
import partnerXClient from "partner-x-sdk";

declare const customerId: string;
declare const condition: boolean;
const amount = 500;
const paymentConfig = { destination: "merchant" };

export async function createPayment() {
  await razorpayClient.payments.create("order-1", amount, paymentConfig.destination);
}

export function createPlan() {
  return partnerXClient.credit.createInstallmentPlan(90, customerId, condition ? "three" : "one");
}

export function transfer() {
  partnerXClient.transfer({ amount });
}
