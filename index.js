'use strict';


/* dependencies */
const fs = require('fs');
const _ = require('lodash');
const moment = require('moment');
const xml2js = require('xml2js');
const request = require('request');
const bodyParser = require('body-parser');
const { waterfall } = require('async');
const { areNotEmpty, mergeObjects } = require('@lykmapipo/common');
const { getString } = require('@lykmapipo/env');
const { parse: xmlToJson, build: jsonToXml } = require('paywell-xml');


/* constants */
const WEBHOOK_PATH = '/webhooks/tz/mpesa/ussd-push';
const ERROR_TYPE_AUTHENTICATION = 'Authentication';
const ERROR_TYPE_FAULT = 'Fault';
const ERROR_TYPE_SESSION = 'Session';
const ERROR_TYPE_VALIDATION = 'Validation';
const STATUS_PROCESSED = 'Processed';
const AUTH_FAILED = 'Authentication Failed';
const SESSION_EXPIRED = 'Session Expired';
const INVALID_CREDENTIALS = 'Invalid Credentials';
const FAULT_CLIENT_CODE = 'S:Client';
const FAULT_SERVER_CODE = 'S:Server';
const FAULT_CLIENT_MESSAGE = 'Gateway Client Fault';
const FAULT_SERVER_MESSAGE = 'Gateway Server Fault';
const RESULT_DATE_FORMAT = 'YYYYMMDD HHmmss';
const REQUEST_DATE_FORMAT = 'YYYYMMDDHH';
const REQUEST_HEADER_TAG = 'envelope.header';
const REQUEST_DATA_TAG = 'envelope.body.getGenericResult.request.dataItem';
const RESPONSE_HEADER_TAG = 'envelope.header';
const RESPONSE_FAULT_TAG = 'envelope.body.fault';
const RESPONSE_TAG = 'envelope.body.getGenericResultResponse.soapapiResult';
const RESPONSE_EVENT_DATA_TAG = `${RESPONSE_TAG}.eventInfo`;
const RESPONSE_REQUEST_DATA_TAG = `${RESPONSE_TAG}.request.dataItem`;
const RESPONSE_DATA_TAG = `${RESPONSE_TAG}.response.dataItem`;
const $ = {
  'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
  'xmlns:soap': 'http://www.4cgroup.co.za/soapauth',
  'xmlns:gen': 'http://www.4cgroup.co.za/genericsoap'
};


/**
 * @name country
 * @description Human readable country code of a payment processing entity.
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 */
const country = 'TZ';


/**
 * @name provider
 * @description Human readable name of a payment processing entity.
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 */
const provider = 'Vodacom';


/**
 * @name method
 * @description Human readable supported method of a payment.
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 */
const method = 'Mobile Money';


/**
 * @name channel
 * @description Human readable supported channel of a payment.
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 */
const channel = 'MPESA';


/**
 * @name mode
 * @description Human readable supported mode of a payment.
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 */
const mode = 'USSD Push';


/**
 * @name currency
 * @description Currency accepted for payment.
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 */
const currency = 'TZS';


/**
 * @name gateway
 * @description Machine readable name of a client as gateway.
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.6.0
 * @version 0.1.0
 * @public
 * @static
 */
const gateway = _.toLower(`${country}-${channel}-${_.kebabCase(mode)}`);


/**
 * @function withDefaults
 * @name withDefaults
 * @description Merge provided options with defaults.
 * @param {Object} [optns] provided options
 * @return {Object} merged options
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @static
 * @public
 * @example
 *
 * const { withDefaults } = require('@lykmapipo/');
 * const optns = { username: ..., loginUrl: ..., requestUrl: ...};
 * const options = withDefaults(optns)
 * // => { username: ..., loginUrl: ..., requestUrl: ...};
 *
 */
const withDefaults = optns => {
  // merge defaults
  let options = mergeObjects({
    username: getString('TZ_MPESA_USSD_PUSH_USERNAME'),
    password: getString('TZ_MPESA_USSD_PUSH_PASSWORD'),
    businessName: getString('TZ_MPESA_USSD_PUSH_BUSINESS_NAME'),
    businessNumber: getString('TZ_MPESA_USSD_PUSH_BUSINESS_NUMBER'),
    loginEventId: getString('TZ_MPESA_USSD_PUSH_LOGIN_EVENT_ID', '2500'),
    requestEventId: getString('TZ_MPESA_USSD_PUSH_REQUEST_EVENT_ID',
      '40009'),
    requestCommand: getString('TZ_MPESA_USSD_PUSH_REQUEST_COMMAND',
      'CustomerPaybill'),
    baseUrl: getString('TZ_MPESA_USSD_PUSH_BASE_URL'),
    loginPath: getString('TZ_MPESA_USSD_PUSH_LOGIN_PATH'),
    requestPath: getString('TZ_MPESA_USSD_PUSH_REQUEST_PATH'),
    callbackUrl: getString('TZ_MPESA_USSD_PUSH_CALLBACK_URL'),
    currency: getString('TZ_MPESA_USSD_PUSH_CURRENCY', currency),
    contentType: getString('TZ_MPESA_USSD_CONTENT_TYPE', 'text/xml'),
    accept: getString('TZ_MPESA_USSD_ACCEPT', 'text/xml'),
    sslCaFilePath: getString('TZ_MPESA_USSD_SSL_CA_FILE_PATH'),
    sslCertFilePath: getString('TZ_MPESA_USSD_SSL_CERT_FILE_PATH'),
    sslKeyFilePath: getString('TZ_MPESA_USSD_SSL_KEY_FILE_PATH'),
    sslPassphrase: getString('TZ_MPESA_USSD_SSL_PASSPHRASE')
  }, optns);

  // ensure business name
  options.businessName = (options.name || options.businessName);

  // ensure business number
  options.businessNumber = (options.number || options.businessNumber);

  // ensure request command
  options.requestCommand = (options.command || options.requestCommand);

  // ensure login url
  options.loginUrl =
    (options.loginUrl || `${options.baseUrl}${options.loginPath}`);

  // ensure request url
  options.requestUrl =
    (options.requestUrl || `${options.baseUrl}${options.requestPath}`);

  // compact options
  options = mergeObjects(_.omit(options, 'name', 'number', 'command'));

  // return options
  return options;
};

/**
 * @function info
 * @name info
 * @description obtain normalized client information
 * @param {Object} [optns] options overrides
 * @return {Object} client information
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.6.0
 * @version 0.1.0
 * @static
 * @public
 * @example
 *
 * const { info } = require('@lykmapipo/');
 * const options = info(optns)
 * // => { username: ..., password: ..., number: ..., name: ...};
 *
 */
const info = optns => {
  // merge overrides with defauls
  const {
    businessNumber: number,
    businessName: name,
    requestCommand: command,
    username,
    password
  } = withDefaults(optns);

  // pack normalized information
  const business = { number, name, command, username, password };
  const meta =
    ({ country, provider, method, channel, mode, currency, gateway });
  const details = mergeObjects(meta, business);

  // return normalized client information
  return details;
};

/**
 * @function transformValue
 * @name transformValue
 * @description Transform data item value to js object
 * @param {Object} item data item
 * @return {Object} transformed value
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @private
 * @example
 *
 * const { transformValue } = require('@lykmapipo/tz-mpesa-ussd-push');
 * const item = {name: 'eventId', value: 1, type: String }
 * const result = transformValue(item);
 * // => '1'
 *
 */
const transformValue = item => {
  // ensure item
  let { name, type, value } = _.merge({}, { value: undefined }, item);

  // transform date
  if (name === 'Date' && value) {
    value = moment(value, RESULT_DATE_FORMAT).toDate();
    return value;
  }

  // transform string
  if (type === 'String' && value) {
    value = value === 'null' ? undefined : value;
    return value;
  }

  // always return value
  return value;
};


/**
 * @function serialize
 * @name serialize
 * @description Build and convert given json payload to ussd push xml request
 * @param {Object} payload valid json payload
 * @param {Function} done callback to invoke on success or error
 * @return {String|Error} xml string request or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { serialize } = require('@lykmapipo/tz-mpesa-ussd-push');
 * serialize(payload, (error, request) => { ... });
 * // => String
 *
 */
const serialize = (payload, done) => {
  // prepare header params
  const { header: { token = '?', eventId } } = payload;

  // prepare request
  let { request } = payload;
  request = _.map(request, (value, key) => {
    return {
      name: key,
      type: 'String',
      value: value
    };
  });

  // prepare request payload
  const _payload = {
    'soapenv:Envelope': {
      $: $,
      'soapenv:Header': {
        'soap:Token': token,
        'soap:EventID': eventId
      },
      'soapenv:Body': {
        'gen:getGenericResult': {
          'Request': {
            'dataItem': request
          }
        }
      }
    }
  };

  // convert to xml and return
  return jsonToXml(_payload, done);
};


/**
 * @function serializeLogin
 * @name serializeLogin
 * @description Build and convert provided credentials to ussd push login
 * request xml payload.
 * @param {Object} options valid login credentials
 * @param {String} options.username valid login username
 * @param {String} options.password valid login password
 * @param {Function} done callback to invoke on success or error
 * @return {String|Error} valid xml string for login request or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { serializeLogin } = require('@lykmapipo/tz-mpesa-ussd-push');
 * serializeLogin(payload, (error, request) => { ... });
 * // => String
 *
 */
const serializeLogin = (options, done) => {
  // ensure credentials
  const credentials = withDefaults(options);

  // ensure api login url
  const { loginUrl } = credentials;
  if (_.isEmpty(loginUrl)) {
    let error = new Error('Missing API Login URL');
    error.status = 400;
    error.code = 400;
    error.type = ERROR_TYPE_VALIDATION;
    error.description = 'Missing API Login URL';
    error.data = credentials;
    return done(error);
  }

  // ensure username and password
  const { username, password, loginEventId } = credentials;
  const isValid = areNotEmpty(username, password, loginEventId);

  // back-off if invalid credentials
  if (!isValid) {
    let error = new Error('Invalid Login Credentials');
    error.status = 400;
    error.code = 400;
    error.type = ERROR_TYPE_VALIDATION;
    error.description = 'Invalid Login Credentials';
    error.data = credentials;
    return done(error);
  }

  // prepare ussd push login payload
  const payload = {
    header: { token: '?', eventId: loginEventId },
    request: { 'Username': username, 'Password': password }
  };

  // serialize login payload to xml
  return serialize(payload, done);
};


/**
 * @function serializeTransaction
 * @name serializeTransaction
 * @description Build and convert provided transaction to ussd push transaction
 * request xml payload.
 * @param {Object} options valid transaction details
 * @param {Function} done callback to invoke on success or error
 * @return {String|Error} valid xml string for transaction request or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { serializeTransaction } = require('@lykmapipo/tz-mpesa-ussd-push');
 * serializeTransaction(payload, (error, request) => { ... });
 * // => String
 *
 */
const serializeTransaction = (options, done) => {
  // ensure transaction
  const transaction = withDefaults(options);

  // ensure api request url
  const { requestUrl } = transaction;
  if (_.isEmpty(requestUrl)) {
    let error = new Error('Missing API Request URL');
    error.status = 400;
    error.code = 400;
    error.type = ERROR_TYPE_VALIDATION;
    error.description = 'Missing API Request URL';
    error.data = transaction;
    return done(error);
  }

  // obtain transaction details
  const {
    username,
    sessionId,
    msisdn,
    businessName,
    businessNumber,
    currency,
    date = new Date(),
    amount,
    reference,
    callbackUrl,
    requestEventId,
    requestCommand
  } = transaction;

  // ensure valid transaction details
  const isValid = (
    (amount > 0) &&
    areNotEmpty(username, sessionId, msisdn, currency) &&
    areNotEmpty(requestEventId, requestCommand) &&
    areNotEmpty(businessName, businessNumber, reference, callbackUrl)
  );

  // back-off if invalid transaction
  if (!isValid) {
    let error = new Error('Invalid Transaction Details');
    error.status = 400;
    error.code = 400;
    error.type = ERROR_TYPE_VALIDATION;
    error.description = 'Invalid Transaction Details';
    error.data = transaction;
    return done(error);
  }

  // prepare ussd push transaction request payload
  const payload = {
    header: { token: sessionId, eventId: requestEventId },
    request: {
      'CustomerMSISDN': msisdn,
      'BusinessName': businessName,
      'BusinessNumber': businessNumber,
      'Currency': currency,
      'Date': moment(date).format(REQUEST_DATE_FORMAT),
      'Amount': amount,
      'ThirdPartyReference': reference,
      'Command': requestCommand,
      'CallBackChannel': 1,
      'CallbackDestination': callbackUrl,
      'Username': username || businessNumber
    }
  };

  // serialize ussd push transaction request payload to xml
  return serialize(payload, done);
};


/**
 * @function deserialize
 * @name deserialize
 * @description Parse and convert generic xml request to json
 * @param {String} xml valid xml payload
 * @param {Function} done callback to invoke on success or error
 * @return {Object|Error} parsed request or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { deserialize } = require('@lykmapipo/tz-mpesa-ussd-push');
 * deserialize(xml, (error, request) => { ... });
 * // => { header: ..., event: ..., request: ..., response: ...}
 *
 */
const deserialize = (xml, done) => {
  // prepare parse options
  const { processors } = xml2js;
  const { stripPrefix } = processors;
  const tagNameProcessors = [stripPrefix, _.camelCase];
  const options = { tagNameProcessors };

  // parse request xml to json
  xmlToJson(xml, options, (error, json) => {
    // back-off on error
    if (error) { return done(error); }

    // obtain fault response
    const fault = _.get(json, RESPONSE_FAULT_TAG, {});
    const { faultcode, faultstring } = fault;

    // handle fault response
    const hasClientFault = (fault && (faultcode || faultstring));
    if (hasClientFault) {
      // obtain fault message
      const message = (faultcode === FAULT_SERVER_CODE ?
        FAULT_SERVER_MESSAGE :
        FAULT_CLIENT_MESSAGE
      );
      // build fault error
      let error = new Error(message);
      error.status = (faultcode === FAULT_CLIENT_CODE ? 400 : 500);
      error.code = faultcode;
      error.type = ERROR_TYPE_FAULT;
      error.description = faultstring;
      return done(error);
    }

    // obtain request header and normalize
    const header = (
      _.get(json, REQUEST_HEADER_TAG) ||
      _.get(json, RESPONSE_HEADER_TAG) || {}
    );
    header.eventId = (
      _.get(header, 'eventId') ||
      _.get(header, 'eventid._') ||
      _.get(header, 'eventid')
    );
    delete header.eventid;

    // obtain request event
    const event = _.get(json, RESPONSE_EVENT_DATA_TAG, {});

    // deserialize items to js objects
    const itemize = items => _.reduce(items, (accumulator, item) => {
      const value = {};
      const key = _.camelCase(item.name);
      value[key] = transformValue(item);
      return _.merge({}, accumulator, value);
    }, {});

    // obtain and transform request data
    let request = [].concat((
      _.get(json, REQUEST_DATA_TAG) ||
      _.get(json, RESPONSE_REQUEST_DATA_TAG) || []
    ));
    request = itemize(request);

    // obtain and transform response data
    let response = [].concat(_.get(json, RESPONSE_DATA_TAG, []));
    response = itemize(response);

    // handle authentication failed
    const authFailed = (event && event.detail === AUTH_FAILED);
    if (authFailed) {
      let error = new Error(AUTH_FAILED);
      error.status = 401;
      error.code = event.code;
      error.type = ERROR_TYPE_AUTHENTICATION;
      error.description = (event.detail || AUTH_FAILED);
      return done(error);
    }

    // handle session expired
    const sessionExpired = (event && event.detail === SESSION_EXPIRED);
    if (sessionExpired) {
      let error = new Error(SESSION_EXPIRED);
      error.status = 401;
      error.code = event.code;
      error.type = ERROR_TYPE_SESSION;
      error.description = (event.detail || SESSION_EXPIRED);
      return done(error);
    }

    // handle login failed
    const invalidCredentials =
      (response && response.sessionId === INVALID_CREDENTIALS);
    if (invalidCredentials) {
      let error = new Error(INVALID_CREDENTIALS);
      error.status = 401;
      error.code = event.code;
      error.type = ERROR_TYPE_AUTHENTICATION;
      error.description = INVALID_CREDENTIALS;
      return done(error);
    }

    // prepare normalize response properties
    const data = mergeObjects(header, event, response, request);
    const code = (data.resultCode || data.code);
    const type = (data.resultType || data.description);
    const description = (data.resultDesc || data.detail);
    const receipt = (data.transId || data.conversationId);
    const transaction = (data.transactionId);
    const session = (data.sessionId);
    const token = (data.insightReference);
    const reference = (data.thirdPartyReference);
    const status = _.toLower(data.transactionStatus || STATUS_PROCESSED);
    const username = (data.username);
    const password = (data.password);
    const msisdn = (data.customerMsisdn);
    const amount = (data.amount);
    const currency = (data.currency);
    const date = (data.date);
    const command = (data.command);
    const callback = (data.callbackDestination);
    const name = (data.businessName);
    const number = (data.businessNumber);
    const isSuccessful = (status === 'success');

    // re-format response
    const reply = {
      msisdn,
      amount,
      currency,
      date,
      command,
      callback,
      session,
      transaction,
      token,
      reference,
      receipt,
      status,
      isSuccessful,
      result: { status, code, type, description },
      json: { header, event, request, response },
      xml: xml,
      ...info({ name, number, username, password })
    };

    // return request
    return done(null, reply);
  });
};


/**
 * @function deserializeLogin
 * @name deserializeLogin
 * @description Parse and convert ussd push login xml result to json
 * @param {String} xml valid login xml payload
 * @param {Function} done callback to invoke on success or error
 * @return {Object|Error} parsed result or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { deserializeLogin } = require('@lykmapipo/tz-mpesa-ussd-push');
 * deserializeLogin(xml, (error, request) => { ... });
 * // => { header: ..., event: ..., request: ..., response: ...}
 *
 */
const deserializeLogin = (xml, done) => deserialize(xml, done);


/**
 * @function deserializeTransaction
 * @name deserializeTransaction
 * @description Parse and convert ussd push transaction response xml result
 * to json
 * @param {String} xml valid transaction response xml payload
 * @param {Function} done callback to invoke on success or error
 * @return {Object|Error} parsed result or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { deserializeTransaction } = require('@lykmapipo/tz-mpesa-ussd-push');
 * deserializeTransaction(xml, (error, request) => { ... });
 * // => { header: ..., request: ..., response: ...}
 *
 */
const deserializeTransaction = (xml, done) => deserialize(xml, done);


/**
 * @function deserializeResult
 * @name deserializeResult
 * @description Parse and convert ussd push transaction xml result to json
 * @param {String} xml valid transaction xml payload
 * @param {Function} done callback to invoke on success or error
 * @return {Object|Error} parsed result or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { deserializeResult } = require('@lykmapipo/tz-mpesa-ussd-push');
 * deserializeResult(xml, (error, request) => { ... });
 * // => { header: ..., request: ...}
 *
 */
const deserializeResult = (xml, done) => deserialize(xml, done);


/**
 * @function readSSLOptions
 * @name readSSLOptions
 * @description Read available ssl files
 * @param {Object} [options] valid ssl options
 * @param {String} [options.sslCaFilePath] full path to ssl root ca file
 * @param {String} [options.sslCertFilePath] full path to the ssl cert file
 * @param {String} [options.sslKeyFilePath] full path to the ssl key
 * @param {String} [options.sslPassphrase] valid passphrase
 * @return {Object} read ssl files and passphrase
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.3.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { readSSLOptions } = require('@lykmapipo/tz-mpesa-ussd-push');
 *
 * readSSLOptions(options, (error, response) => { ... });
 * // => { cert: ..., key: ..., ca: ..., passphrase: ... }
 *
 */
const readSSLOptions = options => {
  // obtain ssl options
  const {
    sslCaFilePath,
    sslCertFilePath,
    sslKeyFilePath,
    sslPassphrase
  } = withDefaults(options);

  // safe read file
  const readFileSync = filePath => {
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      return undefined;
    }
  };

  // prepare ssl options
  const sslOptions = mergeObjects({
    ca: readFileSync(sslCaFilePath),
    cert: readFileSync(sslCertFilePath),
    key: readFileSync(sslKeyFilePath),
    passphrase: sslPassphrase,
  });

  // return ssl options
  return sslOptions;
};


/**
 * @function login
 * @name login
 * @description Issue login request to ussd push API server
 * @param {Object} options valid login credentials
 * @param {String} options.username valid login username
 * @param {String} options.password valid login password
 * @param {Function} done callback to invoke on success or error
 * @return {String|Error} valid login response or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { login } = require('@lykmapipo/tz-mpesa-ussd-push');
 * const credentials = { username: ..., password: ...};
 * login(credentials, (error, response) => { ... });
 * // => { sessionId: ...}
 *
 */
const login = (options, done) => {
  // obtain login url
  const { loginUrl, contentType, accept } = withDefaults(options);

  // prepare login xml payload
  const prepareLoginPayload = next => serializeLogin(options, next);

  // prepare ssl options
  const prepareSSLOptions = (payload, next) => {
    const sslOptions = readSSLOptions(options);
    return next(null, payload, sslOptions);
  };

  // issue login request
  const issueLoginRequest = (payload, sslOptions, next) => {
    // prepare login request options
    const options = mergeObjects({
      url: loginUrl,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Accept': accept
      },
      body: payload
    }, sslOptions);

    // send login request
    return request(options, (error, response, body) => next(error, body));
  };

  // parse login response
  const parseLoginResponse = (response, next) => {
    return deserializeLogin(response, (error, payload) => {
      // back off on error
      if (error) { return next(error); }

      // continue
      return next(error, payload);
    });
  };

  // do login
  return waterfall([
    prepareLoginPayload,
    prepareSSLOptions,
    issueLoginRequest,
    parseLoginResponse
  ], done);
};


/**
 * @function charge
 * @name charge
 * @description Initiate ussd push payment request customer via ussd push API
 * server
 * @param {Object} options valid transaction options
 * @param {String} options.msisdn valid customer mobile phone number
 * @param {Number} options.amount valid transaction amount
 * @param {String} options.reference valid transaction reference number
 * @param {Function} done callback to invoke on success or error
 * @return {String|Error} valid charge response or error
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { charge } = require('@lykmapipo/tz-mpesa-ussd-push');
 *
 * const options =
 *   { msisdn: '255754001001', amount: 1500, reference: 'A5FK3170' }
 * charge(options, (error, response) => { ... });
 * // => { sessionId: ..., reference: ..., transactionId: ....}
 *
 */
const charge = (options, done) => {
  // obtain request url
  const { requestUrl, contentType, accept } = withDefaults(options);

  // issue login request
  const issueLoginRequest = next => login(options, next);

  // prepare request xml payload
  const prepareChargeRequest = (response, next) => {
    // prepare transaction
    const { session: sessionId } = response;
    const transaction = _.merge({}, { sessionId }, options);
    serializeTransaction(transaction, (error, payload) => {
      next(error, payload, sessionId);
    });
  };

  // prepare ssl options
  const prepareSSLOptions = (payload, sessionId, next) => {
    const sslOptions = readSSLOptions(options);
    return next(null, payload, sessionId, sslOptions);
  };

  // issue request
  const issueChargeRequest = (payload, sessionId, sslOptions, next) => {
    // prepare charge request options
    const options = mergeObjects({
      url: requestUrl,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Accept': accept
      },
      body: payload
    }, sslOptions);

    // send charge request
    return request(options, (error, response, body) => {
      next(error, body, sessionId);
    });
  };

  // parse charge response
  const parseChargeResponse = (response, sessionId, next) => {
    return deserializeTransaction(response, (error, payload) => {
      // back off on error
      if (error) { return next(error); }

      // prepare simplified body
      payload.session = sessionId;

      // continue
      return next(error, payload);
    });
  };

  // do charge
  return waterfall([
    issueLoginRequest,
    prepareChargeRequest,
    prepareSSLOptions,
    issueChargeRequest,
    parseChargeResponse
  ], done);
};


/**
 * @function parseHttpBody
 * @name parseHttpBody
 * @description Middleware chain to parse ussd push result
 * @param {Object} options valid text body parse options
 * @author lally elias <lallyelias87@mail.com>
 * @license MIT
 * @since 0.1.0
 * @version 0.1.0
 * @public
 * @static
 * @example
 *
 * const { parseHttpBody } = require('@lykmapipo/tz-mpesa-ussd-push');
 * const app = require('@lykmapipo/express-common');
 *
 * const handler = (request, response, next) => { ... };
 * app.all('/v1/webhooks/tz/mpesa/ussdpush', parseHttpBody(), handler);
 *
 */
const parseHttpBody = (optns) => {
  // merge options
  const options = _.merge({}, {
    type: '*/*',
    limit: getString('BODY_PARSER_LIMIT', '2mb')
  }, optns);

  // prepare text body parse
  const parseTextBody = bodyParser.text(options);

  // prepare xml deserializer
  const parseUssdPushBody = (request, response, next) => {
    // parse only if text body
    if (request.body && _.isString(request.body)) {
      // try deserializing
      try {
        // keep raw body
        const raw = _.clone(request.body);
        request.raw = raw;

        // deserialize ussd push result
        return deserializeResult(raw, (error, result) => {
          request.body = result ? result : {};
          // TODO add timestamps based on status
          // TODO add deserialize errors to response results
          return next();
        });
      }

      // back-off on deserializing error
      catch (error) {
        return next(error);
      }
    }

    // always continue
    return next();
  };

  // return middleware chain
  return [parseTextBody, parseUssdPushBody];
};


/* expose */
module.exports = exports = { // TOD reduced exposed
  WEBHOOK_PATH,
  country,
  provider,
  method,
  channel,
  mode,
  currency,
  gateway,
  withDefaults,
  serialize,
  serializeLogin,
  serializeTransaction,
  deserialize,
  deserializeLogin,
  deserializeTransaction,
  deserializeResult,
  readSSLOptions,
  info,
  login,
  charge,
  parseHttpBody
};
