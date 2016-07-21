WorkTimeSurvey Backend
=====================

[![Build Status](https://travis-ci.org/goodjoblife/WorkTimeSurvey-backend.svg?branch=master)](https://travis-ci.org/goodjoblife/WorkTimeSurvey-backend)

* Environment: nodejs 6
* DB: mongo

## Contirbution

See our [Contribution Guide](CONTRIBUTING.md)

## Install and Run

### Use docker-compose

```
npm install
```

```
docker-compose up
```

### Manual

```
npm install
```

```
MONGODB_URI=xxx npm start
```
where xxx is your mongodb url

## Test

> 注意：請不要拿正式的資料庫做網址，測試將會清除一切資料
> Notice: The test will clean all the data in db, please DON'T use db in production

```
MONGODB_URI=xxx npm test
```
