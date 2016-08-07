'use strict'

var assert = require('assert');
var defer = require('when').defer;
var porthos = require('../lib/client/client');

class FakeChannel {

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
}

class FakeBroker {

    createChannel() {
        var reply = defer();

        reply.resolve(new FakeChannel());
        return reply.promise;
    }

}

describe('Client', function() {
  describe('_start', function() {
    it('it should start and fill all attributes', function(done) {
        var fakeBroker = new FakeBroker();
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

  describe('_processResponse', function() {
    it('it should process the msg response and resolve the promise', function(done) {
        var fakeBroker = new FakeBroker();
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
});
