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

                return ch.consume(self.responseQueueName, function(msg) {
                    self._processResponse(msg);
                });
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
        slot.reply.resolve(msg.content);

        // free up the slot.
        this._freeSlot(slot);
    }

    _sendRequest(method, args, correlationId, replyTo) {
        var message = {
            method: method,
            args: args
        };

        var options = {
            expiration: this.requestTTL,
            contentType: 'application/json'
        };

        if (correlationId) {
            options['correlationId'] = correlationId;
        }

        if (replyTo) {
            options['replyTo'] = replyTo;
        }

        return this.channel.publish('', this.serviceName, utils.messageToBuffer(message), options);
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
     * Invoke a remote method.
     * @param method Method name to be invoked.
     * @param any extra argument will be passed along to the remote method.
     * @returns promise.
     */
    call(method) {
        var self = this;
        var args = [].slice.call(arguments, 1);

        logger.debug('Client of "%s" is calling "%s" with args "%s"', this.serviceName, method, args);

        var slot = this._getNewSlot();

        this._sendRequest(method, args, slot.correlationId, this.responseQueueName);

        setTimeout(function() {
            // free up the slot.
            self._freeSlot(slot);

            // notify the timeout error.
            slot.reply.reject({timeout: true});
        }, this.requestTTL);

        return slot.reply.promise;
    }

    /**
     * Invoke a remote method.
     * @param method Method name to be invoked.
     * @param any extra argument will be passed along to the remote method.
     */
    callVoid(method) {
        var args = [].slice.call(arguments, 1);

        logger.debug('Client of "%s" is calling (void) "%s" with args "%s"', this.serviceName, method, args);

        this._sendRequest(method, args);
    }

    close() {
        return this.channel.close();
    }
}

function createClient(broker, serviceName, requestTTL) {
    return new Client(broker, serviceName, requestTTL)._start();
}

function createBroker() {
    return new Broker();
}

module.exports.createClient = createClient;
module.exports.createBroker = createBroker;
