# Porthos

A RPC over AMQP library for server-side JavaScript.

## Status

[![Build Status](https://travis-ci.org/porthos-rpc/porthos-js.svg?branch=master)](https://travis-ci.org/porthos-rpc/porthos-js)

Beta. Server and Client API may change a bit.

## Goal

Provide a language-agnostic RPC library to write distributed systems.

## Client

The client is very simple. The method `porthos.createClient` takes a broker, a `service name` and a timeout value (request message TTL). The `service name` is only intended to serve as the request `routing key` (meaning every `service name` (or microservice) has its own queue). Each client declares only one `response queue`, in order to prevent broker's resources wastage.


```javascript
var porthos = require('porthos/client_api');

function bootstrapClient(broker) {
    porthos.createClient(broker, 'UserService').then((client) => {
        client.call('doSomething', 20).then((response) => {
            console.log('Got response: %s', response.content);
        });
    })
};

porthos.createBroker(process.env.AMQP_URL).then(bootstrapClient).catch(console.warn);
```

## Server

Not implemented yet.

## Contributing

Pull requests are very much welcomed. Make sure a test or example is included that covers your change.

Docker is being used for the local environment. To build/run/test your code you can bash into the server container:

```sh
$ docker-compose run client bash
root@porthos:/usr/src/app# node exampls/client.js
```
