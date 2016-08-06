// handy method to log the error and exit.
function exit(error) {
    console.warn(error);
    process.exit(1);
}

function messageToBuffer(message) {
    return new Buffer(JSON.stringify(message));
}

module.exports.exit = exit;
module.exports.messageToBuffer = messageToBuffer;
