var express = require('express');
var router = express.Router();
var HttpError = require('./errors').HttpError;
var lodash = require('lodash');

/*
 * GET /
 * [page = 0]
 * [key = ""]: on empty, it will search all company
 * Show 25 results per page
 */
router.get('/search', function(req, res, next) {
    var search = req.query.key || "";
    var page = req.query.page || 0;
    var q;

    if (search == "") {
        throw new HttpError("key is required", 429);
    } else {
        q = {
            $or: [
                {name: new RegExp("^" + lodash.escapeRegExp(search))},
                {id: search},
            ]
        };
    }

    var s = {
        capital: -1,
        type: -1,
        name: 1,
        id: 1,
    };

    var collection = req.db.collection('companies');

    collection.find(q).sort(s).skip(25 * page).limit(25).toArray().then(function(results) {
        res.send(results);
    }).catch(function(err) {
        next(new HttpError("Internal Server Error", 500));
    });
});

module.exports = router;
