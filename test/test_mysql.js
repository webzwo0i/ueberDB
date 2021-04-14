'use strict';
const Randexp = require('randexp');
const randomString = (length = maxKeyLength) => new Randexp(new RegExp(`.{${length}}`)).gen();
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

  it('reconnect after fatal error', async function () {
    const db = new mysql.Database(databases.mysql);
    await db.init();
    const before = await db._connection;
    // An error is expected; prevent it from being logged.
    db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    // Sleep longer than the timeout to force a fatal error.
    await assert.rejects(db._query({sql: 'DO SLEEP(1);', timeout: 1}), {fatal: true});
    const after = await db._connection;
    assert.notEqual(after, before);
    await db.close();
  });

  describe('timeouts', function () {
    this.timeout(100000);
    let large;
    let largeKey;
    let db;
    const errors = [];

    before(async function () {
      db = new mysql.Database(databases.mysql);
      await db.init();
      large = randomString(10000);
      largeKey = randomString(95);
      await db.set(largeKey, large);
      db.settings.queryTimeout = 1;
      db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    });

    after(async function () {
      db.close();
      console.log('Accumulated errors', errors);
    });

    it('get times out ', async function () {
      const p = [];
      for (let i = 0; i < 10000; i++) {
        p.push(db.findKeys('*'));
        p.push(db.get(`${largeKey}${randomString(5)}`));
        p.push(db.set(randomString(10), large));
      }
      try {
        await Promise.all(p);
      } catch (e) {
        errors.push(e);
      }

      assert.strictEqual(errors.length, 0);
    });
  });
});
