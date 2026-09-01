// Offline candidate-triage evaluation set. Labels are in the function names.
declare const paymentRouter: any;
declare const paymentService: any;
declare const paymentGateway: any;
declare const transferService: any;
declare const creditLine: any;
declare const loanService: any;
declare const installmentPlan: any;
declare const payOut: any;
declare const routing: any;
declare const account: any;
declare const disbursement: any;
declare const settlement: any;
declare const remittance: any;
declare const refund: any;
declare const withdrawal: any;
declare const text: any;
declare const logger: any;
declare const database: any;
declare const http: any;
declare const profile: any;
declare const config: any;
declare const cache: any;
declare const metrics: any;
declare const parser: any;
declare const date: any;
declare const file: any;
declare const queue: any;
declare const validator: any;
declare const user: any;
declare const feature: any;
declare const customer: any;
declare const notification: any;
declare const array: any;
declare const storage: any;
declare const report: any;

// 20 labelled financially relevant calls. The first 15 are in the current vocabulary.
export function relevant01() { paymentRouter.routePayment({}, {}); }
export function relevant02() { paymentService.create({}); }
export function relevant03() { paymentGateway.process({}); }
export function relevant04() { transferService.submit({}); }
export function relevant05() { creditLine.open({}); }
export function relevant06() { loanService.approve({}); }
export function relevant07() { installmentPlan.schedule({}); }
export function relevant08() { payOut.execute({}); }
export function relevant09() { routing.route({}); }
export function relevant10() { account.transfer({}); }
export function relevant11() { paymentRouter.cancel({}); }
export function relevant12() { paymentService.authorize({}); }
export function relevant13() { transferService.reverse({}); }
export function relevant14() { creditLine.close({}); }
export function relevant15() { loanService.quote({}); }
export function relevant16() { disbursement.send({}); }
export function relevant17() { settlement.complete({}); }
export function relevant18() { remittance.send({}); }
export function relevant19() { refund.issue({}); }
export function relevant20() { withdrawal.request({}); }

// 20 labelled non-financial calls.
export function irrelevant01() { text.localeCompare("a"); }
export function irrelevant02() { logger.info("ready"); }
export function irrelevant03() { database.query("select 1"); }
export function irrelevant04() { http.get("/health"); }
export function irrelevant05() { profile.load(); }
export function irrelevant06() { config.read(); }
export function irrelevant07() { cache.clear(); }
export function irrelevant08() { metrics.increment("runs"); }
export function irrelevant09() { parser.parse("{}"); }
export function irrelevant10() { date.toISOString(); }
export function irrelevant11() { file.read(); }
export function irrelevant12() { queue.shift(); }
export function irrelevant13() { validator.check({}); }
export function irrelevant14() { user.getProfile(); }
export function irrelevant15() { feature.isEnabled("x"); }
export function irrelevant16() { customer.getEmail(); }
export function irrelevant17() { notification.sendEmail(); }
export function irrelevant18() { array.filter(Boolean); }
export function irrelevant19() { storage.remove("key"); }
export function irrelevant20() { report.render(); }
