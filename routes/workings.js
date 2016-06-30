var express = require('express');
var router = express.Router();
var cors = require('./cors');
var HttpError = require('./errors').HttpError;
var db = require('../libs/db');

router.use(cors);

/*
 * Show the newest company, week_work_time, job_title
 * GET /
 * [page = 0]
 */
router.get('/', function(req, res, next) {
    var page = req.query.page || 0;

    var collection = db.get().collection('workings');
    var q = {};
    var opt = {
            company: 1,
            week_work_time: 1,
            job_title: 1,
            created_at: 1,
        };
    collection.find(q, opt).sort({created_at: -1}).skip(25 * page).limit(25).toArray().then(function(results) {
        res.send(results);
    }).catch(function(err) {
        next(new HttpError("Internal Server Error", 500));
    });
});

module.exports = router;
