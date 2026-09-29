import { execFileSync } from 'node:child_process';

// Temporary: proves the CI Postgres service is reachable with DATABASE_URL.
describe('CI database', () => {
  it('answers a query', () => {
    const out = execFileSync('psql', [process.env.DATABASE_URL ?? '', '-tAc', 'select 1']);
    expect(out.toString().trim()).toBe('1');
  });
});

// Temporary lint error: no-unused-vars / prefer-const
let unused = 1;
