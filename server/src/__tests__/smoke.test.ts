import request from 'supertest';
import { buildApp } from '../index';
import { createTestDb } from '../db/test-helpers';

describe('buildApp smoke test', () => {
  it('mounts all routes (returns non-404)', async () => {
    const db = createTestDb();
    const app = buildApp(db);

    // Implemented routes — return 200
    await request(app).get('/api/cases').expect(200);
    await request(app).get('/api/tasks').expect(200);
    // Remaining routes are stubs — returns 501, not 404
    await request(app).get('/api/templates').expect(501);
    await request(app).get('/api/contacts').expect(501);
    await request(app).get('/api/contact-schedule').expect(501);
    await request(app).get('/api/dashboard').expect(501);
    await request(app).get('/api/settings').expect(501);

    db.close();
  });
});
