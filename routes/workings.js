const express = require('express');
const router = express.Router();
const HttpError = require('./errors').HttpError;
const facebook = require('../libs/facebook');
const winston = require('winston');
const nodejieba = require("nodejieba");

/*
 * Show the newest company, week_work_time, job_title
 * GET /
 * [page = 0]
 */
router.get('/latest', function(req, res, next) {
    winston.info("/workings/latest", {query: req.query, ip: req.ip, ips: req.ips});

    var page = req.query.page || 0;
    var limit = req.query.limit || 25;

    limit = parseInt(limit);
    if (isNaN(limit) || limit > 50) {
        throw new HttpError("limit is not allow");
    }

    var collection = req.db.collection('workings');
    var q = {};
    var opt = {
            company: 1,
            week_work_time: 1,
            job_title: 1,
            created_at: 1,
        };

    const data = {};

    collection.find().count().then(function(count) {
        data.total = count;

        return collection.find(q, opt).sort({created_at: -1}).skip(limit * page).limit(limit).toArray();
    }).then(function(results) {
        data.workings = results;

        res.send(data);
    }).catch(function(err) {
        next(new HttpError("Internal Server Error", 500));
    });
});

/*
 *  When developing, you can set environment to skip facebook auth
 */
if (! process.env.SKIP_FACEBOOK_AUTH) {

router.post('/', function(req, res, next) {
    var access_token = req.body.access_token;

    facebook.access_token_auth(access_token).then(function(facebook) {
        winston.info("facebook auth success", {access_token: access_token, ip: req.ip, ips: req.ips});

        req.facebook = facebook;
        next();
    }).catch(function(err) {
        winston.info("facebook auth fail", {access_token: access_token, ip: req.ip, ips: req.ips});

        next(new HttpError("Unauthorized", 401));
    });
});

}

/*
 * POST /
 * company_id | company_name
 * job_title: string
 * week_work_time: integer
 * [salary_min]
 * [salary_max]
 * [salary_type]: suggest "hour", "month", "year"
 * [work_year]
 * [review]
 */
router.post('/', function(req, res, next) {
    /*
     * Prepare and collect the data from request
     */
    var author = {};

    if (req.body.email && (typeof req.body.email === "string") && req.body.email !== "") {
        author.email = req.body.email;
    }

    if (req.facebook) {
        author.id = req.facebook.id,
        author.name = req.facebook.name,
        author.type = "facebook";
    } else {
        author.id = "-1";
        author.type = "test";
    }

    const working = {
        author: author,
        company: {},
        created_at: new Date(),
    };

    const data = {
        working: working,
    };

    // pick these fields only
    // make sure the field is string
    [
        "job_title", "week_work_time",
        "overtime_frequency",
        "day_promised_work_time", "day_real_work_time",
    ].forEach(function(field, i) {
        if (req.body[field] && (typeof req.body[field] === "string") && req.body[field] !== "") {
            working[field] = req.body[field];
        }
    });
    if (req.body.company_id && (typeof req.body.company_id === "string") && req.body.company_id !== "") {
        working.company.id = req.body.company_id;
    }
    if (req.body.company && (typeof req.body.company === "string") && req.body.company !== "") {
        working.query = req.body.company;
    }

    /*
     * Check all the required fields, or raise an 422 http error
     */
    try {
        validateWorking(working);
    } catch (err) {
        winston.info("validating fail", {id: data._id, ip: req.ip, ips: req.ips});

        next(err);
        return;
    }

    /*
     * Normalize the data
     */
    working.job_title = working.job_title.toUpperCase();
    working.job_title_fts = nodejieba.cut(working.job_title, true);

    /*
     * So, here, the data are well-down
     */

    var collection = req.db.collection("workings");
    var companyCollection = req.db.collection("companies");

    // use company id to search company
    function searchCompanyById(id) {
        return companyCollection.find({
            id: id,
        }).toArray();
    }

    // use company name to search company
    function searchCompanyByName(name) {
        return companyCollection.find({
            name: name,
        }).toArray();
    }

    Promise.resolve(data).then(function(data) {
        /*
         * 如果使用者有給定 company id，將 company name 補成查詢到的公司
         *
         * 如果使用者是給定 company name，如果只找到一間公司，才補上 id
         *
         * 其他情況看 issue #7
         */
        const working = data.working;

        if (working.company.id) {
            return searchCompanyById(working.company.id).then(function(results) {
                if (results.length === 0) {
                    throw new HttpError("公司統編不正確", 422);
                }

                working.company.name = results[0].name;
                return data;
            });
        } else {
            return searchCompanyById(working.query).then(function(results) {
                if (results.length === 0) {
                    return searchCompanyByName(working.query.toUpperCase()).then(function(results) {
                        if (results.length === 1) {
                            working.company.id = results[0].id;
                            working.company.name = results[0].name;
                            return data;
                        } else {
                            working.company.name = working.query.toUpperCase();
                            return data;
                        }
                    });
                } else {
                    working.company.id = results[0].id;
                    working.company.name = results[0].name;
                    return data;
                }
            });
        }
    }).then(function(data) {
        const author = data.working.author;

        return checkQuota(req.db, {id: author.id, type: author.type}).then(function(queries_count) {
            data.queries_count = queries_count;

            return data;
        });
    }).then(function(data) {
        return collection.insert(data.working);
    }).then(function(result) {
        winston.info("workings insert data success", {id: data.working._id, ip: req.ip, ips: req.ips});

        collection.ensureIndex({
            job_title_fts: 1
        });
        res.send(data);
    }).catch(function(err) {
        winston.info("workings insert data fail", {id: data._id, ip: req.ip, ips: req.ips, err: err});

        next(err);
    });
});

function validateWorking(data) {
    if (! data.job_title) {
        throw new HttpError("職稱未填", 422);
    }

    if (! data.week_work_time) {
        throw new HttpError("最近一週實際工時未填", 422);
    }
    data.week_work_time = parseInt(data.week_work_time);
    if (isNaN(data.week_work_time)) {
        throw new HttpError("最近一週實際工時必須是數字", 422);
    }
    if (data.week_work_time < 0 || data.week_work_time > 168) {
        throw new HttpError("最近一週實際工時必須在0~168之間", 422);
    }

    if (! data.overtime_frequency) {
        throw new HttpError("加班頻率必填", 422);
    }
    if (["0", "1", "2", "3"].indexOf(data.overtime_frequency) === -1) {
        throw new HttpError("加班頻率格式錯誤", 422);
    }
    data.overtime_frequency = parseInt(data.overtime_frequency);

    if (! data.day_promised_work_time) {
        throw new HttpError("工作日表訂工時未填", 422);
    }
    data.day_promised_work_time = parseInt(data.day_promised_work_time);
    if (isNaN(data.day_promised_work_time)) {
        throw new HttpError("工作日表訂工時必須是數字", 422);
    }
    if (data.day_promised_work_time < 0 || data.day_promised_work_time > 24) {
        throw new HttpError("工作日表訂工時必須在0~24之間", 422);
    }

    if (! data.day_real_work_time) {
        throw new HttpError("工作日實際工時必填", 422);
    }
    data.day_real_work_time = parseInt(data.day_real_work_time);
    if (isNaN(data.day_real_work_time)) {
        throw new HttpError("工作日實際工時必須是數字", 422);
    }
    if (data.day_real_work_time < 0 || data.day_real_work_time > 24) {
        throw new HttpError("工作日實際工時必須在0~24之間", 422);
    }

    if (! data.company.id) {
        if (! data.query) {
            throw new HttpError("公司/單位名稱必填", 422);
        }
    }
}

/*
 * Check the quota, limit queries <= 10
 *
 * The quota checker use author as _id
 *
 * @return  Promise
 *
 * Fullfilled with newest queries_count
 * Rejected with HttpError
 */
function checkQuota(db, author) {
    var collection = db.collection('authors');
    var quota = 5;

    return collection.findAndModify(
        {
            _id: author,
            queries_count: {$lt: quota},
        },
        [
        ],
        {
            $inc: { queries_count: 1 },
        },
        {
            upsert: true,
            new: true,
        }
    ).then(function(result) {
        if (result.value.queries_count > quota) {
            throw new HttpError(`您已經上傳${quota}次，已達最高上限`, 429);
        }

        return result.value.queries_count;
    }).catch(function(err) {
        throw new HttpError(`您已經上傳${quota}次，已達最高上限`, 429);
    });

}

module.exports = router;
