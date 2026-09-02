const { EventEmitter } = require('node:events')

const unavailableMessage =
  '@gilbarcoafs/doms-pos-jpl is unavailable in this test environment; inject a test client for runtime operations or run npm run test:vendor with authenticated packages.'

class JplClient extends EventEmitter {
  constructor(options = {}) {
    super()
    this.opts = options
  }

  connect() {
    return Promise.reject(new Error(unavailableMessage))
  }

  disconnect() {
    return Promise.resolve()
  }

  close() {
    return Promise.resolve()
  }

  logon() {
    return Promise.reject(new Error(unavailableMessage))
  }

  request() {
    return Promise.reject(new Error(unavailableMessage))
  }

  send() {
    throw new Error(unavailableMessage)
  }

  getServerSupportsCorrelationIds() {
    return null
  }

  getRequestDispatchMode() {
    return 'strict-single-flight-when-uncorrelated'
  }
}

const buildFcLogonEnvelope = (input = {}) => ({
  name: 'FcLogon_req',
  subCode: input.subCode || '00H',
  data: {
    PosId: input.posId || input.PosId || '01',
    AccessCode: input.accessCode || input.AccessCode || '',
    CountryCode: input.countryCode || input.CountryCode || '1',
    PosVersionId: input.posVersionId || input.PosVersionId || '',
  },
})

module.exports = {
  JplClient,
  createForecourt: (options) => new JplClient(options),
  buildFcLogonEnvelope,
  forecourtLogon: buildFcLogonEnvelope,
  fcLogon: buildFcLogonEnvelope,
  __isVposTestStub: true,
}
