import { execSync } from 'node:child_process';
import { join } from 'node:path';

// Integration tests run on a real Postgres (DATABASE_URL). Bring its schema up to date first.
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '../..'),
    stdio: 'inherit',
  });
}
