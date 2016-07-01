var express = require('express');
var router = express.Router();
var request = require('request');
var cors = require('./cors');
var HttpError = require('./errors').HttpError;
var db = require('../libs/db');
var facebook = require('../libs/facebook');

router.use(cors);

function createError(message, status) {
    var err = new Error(message);
    err.status = status;

    return err;
}

if (! process.env.SKIP_FACEBOOK_AUTH) {

router.post('/', function(req, res, next) {
    var access_token = req.body.access_token;

    console.log("facebook auth with access_token " + access_token);

    facebook.access_token_auth(access_token).then(function(facebook) {
        req.facebook = facebook;
        next();
    }).catch(function(err) {
        next(new HttpError("Unauthorized", 401));
    });
});

}

router.post('/', function(req, res, next) {
    var author = {};

    if (req.body.email && (typeof req.body.email === "string") && req.body.email !== "") {
        author.email = req.body.email;
    }

    if (req.facebook) {
        author.id = req.facebook.id,
        author.name = req.facebook.name,
        author.type = "facebook";
    } else {
        author.type = "test";
    }

    var data = {
        author: author,
        company: {},
        created_at: new Date(),
    };

    // pick these fields only
    // make sure the field is string
    [
        "job_title", "week_work_time",
        "salary_min", "salary_max", "salary_type",
        "work_year", "review",
    ].forEach(function(field, i) {
        if (req.body[field] && (typeof req.body[field] === "string") && req.body[field] !== "") {
            data[field] = req.body[field];
        }
    });
    if (req.body.company_id && (typeof req.body.company_id === "string") && req.body.company_id !== "") {
        data.company.id = req.body.company_id;
    }
    if (req.body.company_name && (typeof req.body.company_name === "string") && req.body.company_name !== "") {
        data.company.name = req.body.company_name;
    }

    try {
        if (! data.job_title) {
            throw new HttpError("job_title is required", 422);
        }
        if (! data.week_work_time) {
            throw new HttpError("week_work_time is required", 422);
        }
        data.week_work_time = parseInt(data.week_work_time);
        if (isNaN(data.week_work_time)) {
            throw new HttpError("week_work_time need to be a number", 422);
        }

        if (! (data.company.id || data.company.name)) {
            throw new HttpError("company_id or company_name is required", 422);
        }
    } catch (err) {
        next(err);
        return;
    }

    var collection = db.get().collection("workings");
    var companyCollection = db.get().collection("companies");

    function searchCompanyById(id) {
        return companyCollection.find({
            $or: [
                {company_id: id},
                {business_id: id},
            ]
        }).toArray();
    }
    function searchCompanyByName(name) {
        return companyCollection.find({
            name: name,
        }).toArray();
    }

    Promise.resolve(data).then(function(data) {
        console.log("autocompletion company");
        if (data.company.id) {
            return searchCompanyById(data.company.id).then(function(results) {
                if (results.length === 0) {
                    throw new HttpError("company_id is invalid", 429);
                }

                data.company.name = results[0].name;
                return data;
            });
        } else {
            return searchCompanyByName(data.company.name).then(function(results) {
                if (results.length === 1) {
                    data.company.id = results[0].company_id || result[0].business_id;
                    return data;
                } else {
                    return data;
                }
            });
        }
    }).then(function(data) {
        return collection.insert(data);
    }).then(function(result) {
        res.send(data);
    }).catch(next);
});

module.exports = router;
