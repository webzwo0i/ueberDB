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
    const randomKey = randomString(10);

    before(async function () {
      db = new mysql.Database(databases.mysql);
      await db.init();
      large = randomString(10000);
      largeKey = randomString(95);
      await db.set(largeKey,large);
      let i = 0;
      // put some data in
      while (i < 5000) {
        await db.set(`${randomString(4)}${i}`, large);
        i += 1;
      }
      db.settings.queryTimeout = 1;
      db.logger = Object.setPrototypeOf({error() {}}, db.logger);
    });

    after(async function () {
      db.close();
    });

    it('get times out ', async function () {
      let errored = false;
      for (let i=0; i < 10000; i++) {
	try {
          await db.findKeys('*');
          await db.get(`${largeKey}${randomString(5)}`);
	  // intentionally no break
        } catch { errored = true; }
	assert(errored);
      }
    });
    it('set times out ', async function () {
      let errored = false;
      for (let i=0; i < 10000; i++) {
	try {
          await db.findKeys('*');
          await db.set(randomString(10), large);
	  // intentionally no break
        } catch { errored = true; }
	assert(errored);
      }
    });
    it('findKeys times out ', async function () {
      let errored = false;
      for (let i=0; i < 10000; i++) {
	try {
          await db.findKeys('*');
	  // intentionally no break
        } catch { errored = true; }
	assert(errored);
      }
      
    });
  });
});
