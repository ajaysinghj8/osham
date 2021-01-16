/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
/* eslint-disable no-console */
const supertest = require('supertest');
const client = supertest('http://localhost:26192');

describe('Specifications', function () {
  it('Multiple requests to same resource should queue', async function () {
    await Promise.all([
      client.get('/api/v1/employees').expect('x-osham-hit', 'false').expect('x-osham-pooled-main', 'true'),
      ...new Array(100).fill(1).map(() =>
        client
          .get('/api/v1/employees')
          .expect('x-osham-hit', 'false')
          .expect('x-osham-pooled', 'true')
          .expect('x-osham-pooled-wait', /[0-9]ms/),
      ),
    ]);
  });

  it('Should be a hit', async function () {
    await client.get('/api/v1/employees').expect('x-osham-hit', 'true');
  });

  it('Should be a miss', async function () {
    await client.get('/api/v1/employee/1').expect('x-osham-hit', 'false');
  });

  it('Should be no config', async function () {
    await client.get('/api/v1/employee/2').expect('x-osham-cache', 'no-config');
  });
});
