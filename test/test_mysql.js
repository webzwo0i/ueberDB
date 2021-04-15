'use strict';

const assert = require('assert').strict;
const {databases} = require('./lib/databases');
const mysql = require('../databases/mysql_db');

describe(__filename, function () {
  beforeEach(async function () {
    if (databases.mysql == null) return this.skip();
  });

  it('connect error is detected during init()', async function () {
    // Use an invalid TCP port to force a connection error.
    const db = new mysql.Database({...databases.mysql, port: 65536});
    // An error is expected; prevent it from being logged.
    db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    await assert.rejects(db.init());
  });

  it('query after fatal error works', async function () {
    const db = new mysql.Database(databases.mysql);
    await db.init();
    // An error is expected; prevent it from being logged.
    db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    // Sleep longer than the timeout to force a fatal error.
    await assert.rejects(db._query({sql: 'DO SLEEP(1);', timeout: 1}), {fatal: true});
    await assert.doesNotReject(db._query({sql: 'SELECT 1;'}));
    await db.close();
  });

  it('query times out', async function () {
    const db = new mysql.Database(databases.mysql);
    await db.init();
    // Timeout error messages are expected; prevent them from being logged.
    db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    db.settings.queryTimeout = 100;
    await assert.doesNotReject(db._query({sql: 'DO SLEEP(0.090);'}));
    await assert.rejects(db._query({sql: 'DO SLEEP(0.110);'}));
    await db.close();
  });

  it('parallel requests work', async function () {
    const db = new mysql.Database(databases.mysql);
    await db.init();
    // Timeout error messages are expected; prevent them from being logged.
    db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    db.settings.queryTimeout = 100;
    const promises = [];
    const start = Date.now();
    // schedule 10 requests, that all reject after 100ms
    for (let i = 0; i < 10; i++) {
      promises.push(assert.rejects(db._query({sql: 'DO SLEEP(1);'})));
    }
    await Promise.all(promises);
    // they should have been scheduled in parallel
    assert(Date.now() - start < 190);
    await db.close();
  });

  it('pool schedules requests, when full', async function () {
    const db = new mysql.Database(databases.mysql);
    await db.init();
    // Timeout error messages are expected; prevent them from being logged.
    db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    db.settings.queryTimeout = 100;
    const promises = [];
    const start = Date.now();
    // schedule 11 requests, so one should be scheduled after 100ms
    // while the 10 others are scheduled immediately
    for (let i = 0; i < 11; i++) {
      promises.push(assert.rejects(db._query({sql: 'DO SLEEP(1);'})));
    }
    await Promise.all(promises);
    const finish = Date.now();
    assert(finish - start >= 200);
    assert(finish - start < 290);
    await db.close();
  });
});
