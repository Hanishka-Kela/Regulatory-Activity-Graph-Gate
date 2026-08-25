import partnerXClient from "partner-x-sdk";

export function configureBlockedFlow() {
  partnerXClient.transfer("acc:customer:wallet", "acc:treasury:pool", "POOL_PASS_THROUGH", "actor:customer", "CUSTOMER", "CUSTOMER", "actor:treasury", "THIRD_PARTY", "THIRD_PARTY");
  return partnerXClient.transfer("acc:treasury:pool", "acc:merchant:bank", "DIRECT_BANK_TRANSFER", "actor:treasury", "THIRD_PARTY", "THIRD_PARTY", "actor:merchant", "MERCHANT", "MERCHANT");
}
