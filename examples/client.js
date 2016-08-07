var porthos = require('../client_api');

function bootstrapClient(broker) {
    porthos.createClient(broker, 'UserService', 5000).then(function(client) {
        client.call('doSomething', 20).then(function(response) {
            console.log('Response: %s', response);
        }).catch(function(error) {
            console.log('Error', error);
        });
    })
};

porthos.createBroker().connect(process.env.AMQP_URL).then(bootstrapClient).catch(console.warn);
