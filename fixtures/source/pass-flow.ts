import partnerXClient from "partner-x-sdk";

export function configureApprovedPaymentFlow() {
  partnerXClient.transfer("acc:customer:wallet", "acc:razorpay:escrow", "ESCROW", "actor:customer", "CUSTOMER", "CUSTOMER", "actor:razorpay", "PAYMENT_PROVIDER", "ESCROW_BANK");
  return partnerXClient.transfer("acc:razorpay:escrow", "acc:merchant:bank", "DIRECT_BANK_TRANSFER", "actor:razorpay", "PAYMENT_PROVIDER", "ESCROW_BANK", "actor:merchant", "MERCHANT", "MERCHANT", 1);
}
