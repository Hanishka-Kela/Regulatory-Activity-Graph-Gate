import partnerXClient from "partner-x-sdk";

export function configureBlockedFlow() {
  partnerXClient.credit.createInstallmentPlan("actor:borrower", "actor:partner_x", 90, 3, 150);
  partnerXClient.transfer("acc:partner_x:disbursement", "acc:treasury:pool", "POOL_PASS_THROUGH", "actor:partner_x", "FINANCING_PROVIDER", "RE", "actor:treasury", "THIRD_PARTY", "THIRD_PARTY");
  return partnerXClient.transfer("acc:treasury:pool", "acc:borrower:bank", "DIRECT_BANK_TRANSFER", "actor:treasury", "THIRD_PARTY", "THIRD_PARTY", "actor:borrower", "CUSTOMER", "CUSTOMER");
}
