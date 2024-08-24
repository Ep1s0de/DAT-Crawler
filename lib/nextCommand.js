module.exports = class {
  constructor() {
    this.nextCommand = {};
  }

  setNext(data) {
    this.nextCommand[data.email] = data.command;
    console.log('SET NEXT')
    console.log(this.nextCommand)
  }

  removeNext(email) {
    return delete this.nextCommand[email];
  }
};