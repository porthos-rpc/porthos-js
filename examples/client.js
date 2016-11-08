var porthos = require('../client_api');

function bootstrapClient(broker) {
    porthos.createClient(broker, 'UserService', 5000).then((client) => {
        // call the remote method and log the response when it's available.
        client.call('doSomethingThatReturnsValue', 20).then((response) => {
            console.log('Response: %s', response);
        }).catch((error) => console.log('Error', error));

        // call a void method.
        client.callVoid('doSomething', 20);
    })
};

porthos.createBroker(process.env.AMQP_URL).then(bootstrapClient).catch(console.warn);
