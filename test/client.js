'use strict'

var assert = require('assert');
var defer = require('when').defer;
var porthos = require('../lib/client/client');

class InMemoryChannel {

    assertQueue() {
        var reply = defer();

        reply.resolve({queue: 'fakeQueue'});
        return reply.promise;
    }

    consume(queue, callback) {
        this.map = {};
        this.map[queue] = callback;

        var reply = defer();

        reply.resolve();
        return reply.promise;
    }

    ack() {

    }

    publish(exchange, routingKey, message, options) {
        var reply = defer();

        reply.resolve([exchange, routingKey, message, options]);

        var replyTo = options['replyTo'];

        if (replyTo) {
            var callback = this.map[replyTo];

            if (callback) {
                callback({
                    content: '{"method":"someMethod","args":[1,"string arg"]}',
                    contentType: 'application/json',
                    headers: {
                        statusCode: 200
                    }, 
                    properties: {
                        correlationId: options['correlationId'] 
                    }
                });
            }
        }

        return reply.promise;
    }

    close() {
       var reply = defer();

        reply.resolve();
        return reply.promise;
    }
}

class InMemoryBroker {

    createChannel() {
        var reply = defer();

        reply.resolve(new InMemoryChannel());
        return reply.promise;
    }

}

class DummyChannel {

    assertQueue() {
        var reply = defer();

        reply.resolve({queue: 'fakeQueue'});
        return reply.promise;
    }

    consume(queue, callback) {
        var reply = defer();

        reply.resolve();
        return reply.promise;
    }

    ack() {

    }

    publish(exchange, routingKey, message, options) {
        var reply = defer();

        reply.resolve([exchange, routingKey, message, options]);
        return reply.promise;
    }

    close() {
       var reply = defer();

        reply.resolve();
        return reply.promise;
    }
}

class DummyBroker {

    createChannel() {
        var reply = defer();

        reply.resolve(new DummyChannel());
        return reply.promise;
    }

}

class DummyClient {

}

describe('Client', () => {
    describe('_start', () => {
        it('it should start and fill all attributes', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                assert.equal(client.broker, fakeBroker);
                assert.equal(client.serviceName, serviceName);
                assert.equal(client.requestTTL, requestTTL);

                done();
            });
        });
    });

    describe('_getCorrelationId', () => {
        it('it should create a valid correlationId', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                assert.ok(client._getNewCorrelationId().endsWith('.1'));
                assert.ok(client._getNewCorrelationId().endsWith('.2'));

                client.requestNumber = Number.MAX_SAFE_INTEGER - 1; 
                assert.ok(client._getNewCorrelationId().endsWith('.1'));

                done();
            });
        });
    });

    describe('_getNewSlot', () => {
        it('it should create and store a new slot', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                var slot = client._getNewSlot(); 

                assert.ok(slot.reply !== undefined);
                assert.ok(slot.correlationId !== undefined);
                assert.ok(client.slots[slot.correlationId] !== undefined);

                done();
            });
        });
    });

    describe('_freeSlot', () => {
        it('it should free up the given slot', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                var slot = client._getNewSlot(); 
                assert.ok(client.slots[slot.correlationId] !== undefined);

                client._freeSlot(slot);
                assert.ok(client.slots[slot.correlationId] === undefined);

                done();
            });
        });
    });

    describe('_processResponse', () => {
        it('it should process the msg response and resolve the promise', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                var slot = client._getNewSlot(); 
                slot.reply.promise.then((response) => {
                    assert.equal(response.content, 'someContent');
                    done();
                });

                client._processResponse({
                    content: 'someContent',
                    contentType: 'text/plain',
                    headers: {
                        statusCode: 200
                    },
                    properties: {
                        correlationId: slot.correlationId
                    }
                });
            });
        });
    });

    describe('_sendRequest', () => {
        it('it should prepare and sent the request message to the broker', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                var ok = client._sendRequest('someMethod', new Buffer(JSON.stringify([1,"string arg"])), 'correlationId', 'replyTo');
                ok.then((response) => { 
                    var exchange = response[0],
                        routingKey = response[1],
                        message = response[2],
                        options = response[3];

                    assert.equal(exchange, '');
                    assert.equal(routingKey, serviceName);
                    assert.equal(message.toString(), JSON.stringify([1,"string arg"]));
                    assert.equal(options.headers['X-Method'], 'someMethod');
                    assert.equal(options['correlationId'], 'correlationId');
                    assert.equal(options['replyTo'], 'replyTo');

                    done();
                });
            });
        });
    });

    describe('close', () => {
        it('it should close and dispose resources', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                var ok = client.close();
                ok.then(() => { 
                    done();
                });
            });
        });
    });

    describe('async', () => {
        it('it should call and get a timeout error', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 10;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                var ok = client.call('someMethod').withArgs("string arg").async();
                ok.catch((error) => done());
            });
        });

        it('it should call a fake remote method and receive the response', (done) => {
            var inMemoryBroker = new InMemoryBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 100;

            porthos.createClient(inMemoryBroker, serviceName, requestTTL).then((client) => {
                var ok = client.call('someMethod').withMap({foo: 'bar'}).async();
                ok.then((response) => {
                    done();
                });
            });
        });
    });

    describe('void', () => {
        it('it should call a void method with args', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 10;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                client.call('someMethod').withBody(new Buffer("raw data")).void();
                done();
            });
        });

        it('it should call a void method without args', (done) => {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 10;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then((client) => {
                client.call('someMethod').void();
                done();
            });
        });
    });

});

