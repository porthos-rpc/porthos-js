// handy method to log the error and exit.
function exit(error) {
    console.warn(error);
    process.exit(1);
}

module.exports.exit = exit;
