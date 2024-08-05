module.exports = class {
  constructor() {
    this.currentOtp = null;
  }

  setCurrent(otp) {
    this.currentOtp = otp;
  }

  removeCurrent() {
    this.currentOtp = null;
  }
};