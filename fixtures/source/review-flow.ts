import partnerXClient from "partner-x-sdk";

export function configureReviewFlow() {
  partnerXClient.transfer("acc:customer:wallet", "acc:partner_x:loan_pool", "EXTERNAL_API_ROUTING", "actor:customer", "CUSTOMER", "CUSTOMER", "actor:partner_x", "FINANCING_PROVIDER", "RE");
  return partnerXClient.credit.createInstallmentPlan("actor:customer", "actor:partner_x", 90, 3, 150);
}
