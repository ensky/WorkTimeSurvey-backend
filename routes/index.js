var express = require('express');
var router = express.Router();
var request = require('request');
var HttpError = require('./errors').HttpError;
var facebook = require('../libs/facebook');
var winston = require('winston');

function createError(message, status) {
    var err = new Error(message);
    err.status = status;

    return err;
}

module.exports = router;
