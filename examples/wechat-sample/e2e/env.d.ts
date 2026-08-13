// Allow wx / getApp globals inside mp.evaluate() callbacks.
// These are provided by the mini-program runtime, not the test environment.
declare const wx: any;
declare const getApp: any;
