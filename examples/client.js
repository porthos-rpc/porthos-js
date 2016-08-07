var porthos = require('../client_api');

function bootstrapClient(broker) {
    porthos.createClient(broker, 'UserService', 5000).then(function(client) {
        // call the remote method and log the response when it's available.
        client.call('doSomethingThatReturnsValue', 20).then(function(response) {
            console.log('Response: %s', response);
        }).catch(function(error) {
            console.log('Error', error);
        });

        // call a void method.
        client.callVoid('doSomething', 20);
    })
};

porthos.createBroker().connect(process.env.AMQP_URL).then(bootstrapClient).catch(console.warn);
