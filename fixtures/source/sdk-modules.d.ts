declare module "razorpay" {
  const razorpayClient: {
    payments: { create(...args: unknown[]): unknown };
  };
  export default razorpayClient;
}

declare module "partner-x-sdk" {
  const partnerXClient: {
    credit: { createInstallmentPlan(...args: unknown[]): unknown };
    transfer(...args: unknown[]): unknown;
  };
  export default partnerXClient;
}
