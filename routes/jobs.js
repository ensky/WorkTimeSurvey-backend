var express = require('express');
var router = express.Router();
var request = require('request');
var HttpError = require('./errors').HttpError;
var lodash = require('lodash');
var winston = require('winston');
const nodejieba = require("nodejieba");
/*
 * GET /
 * [page = 0]
 * [key = ""]: on empty, it will search all company
 * Show 25 results per page
 */
router.get('/search', function(req, res, next) {
    winston.info("/jobs/search", {query: req.query, ip: req.ip, ips: req.ips});

    var search = req.query.key || "";
    var page = req.query.page || 0;
    var q;

    if (search == "") {
        q = {isFinal: true};
    } else {
        q = {des: new RegExp(lodash.escapeRegExp(search.toUpperCase())), isFinal: true};
    }

    var collection = req.db.collection('job_titles');

    collection.find(q, {isFinal: 0}).skip(25 * page).limit(25).toArray().then(function(results) {
        res.send(results);
    }).catch(function(err) {
        next(new HttpError("Internal Server Error", 500));
    });
});

/*
 * GET /:job_title
 * [page = 0]
 * Show 10 results per page
 */
router.get('/:job_title/statistics', function(req, res, next) {
    winston.info("/jobs/xxx/statistics", {job_title: req.params.job_title, ip: req.ip, ips: req.ips});

    var job_title = req.params.job_title;
    var collection = req.db.collection('workings');

    var page = req.query.page || 0;

    collection.aggregate([
        {
            $match: {
                job_title_fts: {
                    $all: nodejieba.cut(job_title, true)
                }
            }
        },
        {
            $group: {
                _id: "$company",
                week_work_times: {$push: "$week_work_time"},
                average_week_work_time: {$avg: "$week_work_time"},
                count: {$sum: 1},
            }
        },
        {
            $sort: {
                average_week_work_time: -1,
            }
        },
        {
            $limit: page * 10 + 10,
        },
        {
            $skip: page * 10,
        },
    ]).toArray().then(function(results) {
        res.send(results);
    }).catch(function(err) {
        winston.error(err);
        next(new HttpError("Internal Server Error", 500));
    });
});

module.exports = router;
