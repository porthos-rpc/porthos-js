'use strict';

var defer = require('when').defer;
var amqp = require('amqplib');
var logger = require('winston');

var utils = require('../utils');

logger.level = process.env.PORTHOS_LOG_LEVEL;

class Broker {
    /**
     * Connects to the AMQP broker.
     * @param brokerUrl AMQP connection url.
     */
    connect(brokerUrl) {
        return amqp.connect(brokerUrl);
    }
}

class Call {
    constructor(client, method) {
        this.client = client;
        this.method = method;
        this.timeout = client.requestTTL;
        this.body = null;
        this.contentType = 'application/octet-stream';
    }

    /**
     * Specifies a timeout (override default client timeout) for this rpc call.
     * @param timeout to be set.
     * @returns this.
     */
    withTimeout(timeout) {
        this.timeout = timeout;
        return this;
    }

    /**
     * Sets the body of this rpc call.
     * @param bodyBuffer as a byte buffer.
     * @returns this.
     */
    withBody(bodyBuffer) {
        this.body = bodyBuffer;
        this.contentType = 'application/octet-stream';
        return this;
    }

    /**
     * Sets the body of this rpc call.
     * @param bodyArgs as a byte buffer.
     * @returns this.
     */
    withArgs(...bodyArgs) {
        this.body = new Buffer(JSON.stringify(bodyArgs));
        this.contentType = 'application/porthos-args';
        return this;
    }

    /**
     * Sets the body of this rpc call.
     * @param bodyMap as a js object map.
     * @returns this.
     */
    withMap(bodyMap) {
        this.body = new Buffer(JSON.stringify(bodyMap));
        this.contentType = 'application/porthos-map';
        return this;
    }

    /**
     * Invoke the remote method based on the attributes of this Call object.
     * @returns promise.
     */
    async() {
        logger.debug('Client of "%s" is calling "%s" with args "%s"', this.client.serviceName, this.method, this.args);

        var slot = this.client._getNewSlot();

        this.client._sendRequest(this.method, this.body, slot.correlationId, this.client.responseQueueName);

        setTimeout(() => {
            // free up the slot.
            this.client._freeSlot(slot);

            // notify the timeout error.
            slot.reply.reject({timeout: true});
        }, this.timeout);

        return slot.reply.promise;
    }

    void() {
        logger.debug('Client of "%s" is calling (void) "%s" with args "%s"', this.client.serviceName, this.method, this.body);

        this.client._sendRequest(this.method, this.body);
    }
}

class Client {
    /**
     * Creates a new porthos client.
     * @param broker AMQP Broker connection.
     * @param serviceName Name of the server which contains the methods we'll invoke.
     * @param requestTTL How long (millis) a request should be kept in the queue before getting rejected.
     */
    constructor(broker, serviceName, requestTTL) {
        this.broker = broker;
        this.serviceName = serviceName;
        this.requestTTL = requestTTL;

        this.slots = {};
        this.requestNumber = 0;
    }

    _start() {
        var self = this;

        function bootstrap(ch) {
            self.channel = ch;

            function startConsuming(queue) {
                self.responseQueueName = queue.queue;

                return ch.consume(self.responseQueueName, (msg) => self._processResponse(msg));
            }

            function returnClient() {
                logger.debug('Client of "%s" is waiting for response messages.', self.serviceName);
                return self;
            }

            var options = {exclusive: true};

            return ch.assertQueue('', options).then(startConsuming).then(returnClient);
        }

        return this.broker.createChannel().then(bootstrap);
    }

    _processResponse(msg) {
        logger.debug('Client of "%s" is processing the response message: %s', this.serviceName, msg.content.toString());

        this.channel.ack(msg);

        // get the slot for the given correlationId.
        var slot = this.slots[msg.properties.correlationId];

        // the slot might not be there anymore (timeout is a way out)
        if (slot === undefined) {
            logger.info("Slot from message not found: %s", msg)
        }

        // send back the response.
        slot.reply.resolve({
            content: msg.content,
            contentType: msg.contentType,
            statusCode: parseInt(msg.headers["statusCode"], 10),
            headers: msg.headers,
        });

        // free up the slot.
        this._freeSlot(slot);
    }

    _sendRequest(method, body, correlationId, replyTo) {
        var options = {
            expiration: this.requestTTL,
            contentType: 'application/json',
            headers: {
                'X-Method': method
            }
        };

        if (correlationId) {
            options['correlationId'] = correlationId;
        }

        if (replyTo) {
            options['replyTo'] = replyTo;
        }

        return this.channel.publish('', this.serviceName, body, options);
    }

    _getNewCorrelationId() {
        var requestNumber = ++this.requestNumber;

        // prevent overflow.
        if (requestNumber == Number.MAX_SAFE_INTEGER) {
            requestNumber = this.requestNumber = 1;
        }

        return Date.now() + '.' + requestNumber;
    }

    _getNewSlot() {
        var slot = {
            correlationId: this._getNewCorrelationId(),
            reply: defer()
        }

        this.slots[slot.correlationId] = slot;

        return slot
    }

    _freeSlot(slot) {
        delete this.slots[slot.correlationId];
    }

    /**
     * Prepares the invocation of a remote method.
     * @param method Method name to be invoked.
     * @returns Call object.
     */
    call(method) {
        return new Call(this, method);
    }

    /**
     * Closes internal resources associated with this client.
     */
    close() {
        return this.channel.close();
    }
}

/**
 * Creates the client to invoke remote methods.
 */
function createClient(broker, serviceName, requestTTL) {
    return new Client(broker, serviceName, requestTTL)._start();
}

/**
 * Creates the broker to give to clients.
 */
function createBroker(brokerUrl) {
    return new Broker().connect(brokerUrl);
}

module.exports.createClient = createClient;
module.exports.createBroker = createBroker;
