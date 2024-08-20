module.exports = class {
  constructor() {
    this.currentOtp = null;
    this.currentCPOtp = {};
  }

  setCurrent(otp) {
    this.currentOtp = otp;
  }

  removeCurrent() {
    this.currentOtp = null;
  }

  setCPCurrent(data) {
    console.log(data, 'SET')
    this.currentCPOtp[data.email] = data.otp;
  }

  removeCPCurrent(email) {
    return delete this.currentCPOtp[email];
  }
};