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

describe('Client', function() {
    describe('_start', function() {
        it('it should start and fill all attributes', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                assert.equal(client.broker, fakeBroker);
                assert.equal(client.serviceName, serviceName);
                assert.equal(client.requestTTL, requestTTL);

                done();
            });
        });
    });

    describe('_getCorrelationId', function() {
        it('it should create a valid correlationId', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                assert.ok(client._getNewCorrelationId().endsWith('.1'));
                assert.ok(client._getNewCorrelationId().endsWith('.2'));

                client.requestNumber = Number.MAX_SAFE_INTEGER - 1; 
                assert.ok(client._getNewCorrelationId().endsWith('.1'));

                done();
            });
        });
    });

    describe('_getNewSlot', function() {
        it('it should create and store a new slot', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                var slot = client._getNewSlot(); 

                assert.ok(slot.reply !== undefined);
                assert.ok(slot.correlationId !== undefined);
                assert.ok(client.slots[slot.correlationId] !== undefined);

                done();
            });
        });
    });

    describe('_freeSlot', function() {
        it('it should free up the given slot', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                var slot = client._getNewSlot(); 
                assert.ok(client.slots[slot.correlationId] !== undefined);

                client._freeSlot(slot);
                assert.ok(client.slots[slot.correlationId] === undefined);

                done();
            });
        });
    });

    describe('_processResponse', function() {
        it('it should process the msg response and resolve the promise', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                var slot = client._getNewSlot(); 
                slot.reply.promise.then(function(response) {
                    assert.equal(response, 'someContent');
                    done();
                });

                client._processResponse({
                    content: 'someContent',
                    properties: {
                        correlationId: slot.correlationId
                    }
                });
            });
        });
    });

    describe('_sendRequest', function() {
        it('it should prepare and sent the request message to the broker', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                var ok = client._sendRequest('someMethod', [1, 'string arg'], 'correlationId', 'replyTo');
                ok.then(function(response) { 
                    var exchange = response[0],
                        routingKey = response[1],
                        message = response[2],
                        options = response[3];

                    assert.equal(exchange, '');
                    assert.equal(routingKey, serviceName);
                    assert.equal(message.toString(), '{"method":"someMethod","args":[1,"string arg"]}');
                    assert.equal(options['correlationId'], 'correlationId');
                    assert.equal(options['replyTo'], 'replyTo');

                    done();
                });
            });
        });
    });

    describe('call', function() {
        it('it should call and get a timeout error', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 10;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                var ok = client.call('someMethod', "string arg");
                ok.catch(function(error) {
                    done();
                });
            });
        });

        it('it should call a fake remote method and receive the response', function(done) {
            var inMemoryBroker = new InMemoryBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 100;

            porthos.createClient(inMemoryBroker, serviceName, requestTTL).then(function(client) {
                var ok = client.call('someMethod', "string arg");
                ok.then(function(response) {
                    done();
                });
            });
        });
    });

     describe('callVoid', function() {
        it('it should call a void method', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 10;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                client.callVoid('someMethod', "string arg");
                done();
            });
        });
    });

    describe('close', function() {
        it('it should close and dispose resources', function(done) {
            var fakeBroker = new DummyBroker();
            var serviceName = 'ServiceName';
            var requestTTL = 1500;

            porthos.createClient(fakeBroker, serviceName, requestTTL).then(function(client) {
                var ok = client.close();
                ok.then(function() { 
                    done();
                });
            });
        });
    });
});
