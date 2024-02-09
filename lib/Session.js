module.exports = class Session {
  constructor(user, token, expirationDate) {
    this.token = token;
    this.user = user;
    this.sockets = [];
    this.expirtaionDate = expirationDate;
    this.lastFilter = null;
  }

  addSocket(socket) {
    this.sockets.push(socket);
  }

  emitToSockets(event, data) {
    this.sockets.forEach(socket => {
      socket.emit(event, data);
    });
  }

  setTab(tab) {
    this.tab = tab;
  }

  getTab() {
    return this.tab;
  }

  setIsIdle(isIdle) {
    this.isIdle = isIdle;
  }

  getIsIdle() {
    return this.isIdle;
  }

  setLastFilter(filter) {
    this.lastFilter = filter;
  }

  getLastFilter() {
    return this.lastFilter;
  }

  closeTab() {
    this.tab?.page.close();
    this.tab = null;
    this.setIsIdle(false);
  }

  removeSocket(socket) {
    this.sockets = this.sockets.filter(s => s !== socket);
  }

  isExpired() {
    return this.expirtaionDate < new Date();
  }
};
