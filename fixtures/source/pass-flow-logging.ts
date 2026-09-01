import partnerXClient from "partner-x-sdk";

export function configureApprovedPaymentFlow() {
  console.info("Configuring the approved payment topology");
  partnerXClient.transfer("acc:customer:wallet", "acc:razorpay:escrow", "ESCROW", "actor:customer", "CUSTOMER", "CUSTOMER", "actor:razorpay", "PAYMENT_PROVIDER", "ESCROW_BANK");
  console.info("Scheduling merchant settlement");
  return partnerXClient.transfer("acc:razorpay:escrow", "acc:merchant:bank", "DIRECT_BANK_TRANSFER", "actor:razorpay", "PAYMENT_PROVIDER", "ESCROW_BANK", "actor:merchant", "MERCHANT", "MERCHANT", 1);
}
