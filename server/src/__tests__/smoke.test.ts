import request from 'supertest';
import { buildApp } from '../index';
import { createTestDb } from '../db/test-helpers';

describe('buildApp smoke test', () => {
  it('mounts all routes (returns 501, not 404)', async () => {
    const db = createTestDb();
    const app = buildApp(db);

    // All routes should be mounted (501, not 404)
    await request(app).get('/api/cases').expect(501);
    await request(app).get('/api/tasks').expect(501);
    await request(app).get('/api/templates').expect(501);
    await request(app).get('/api/contacts').expect(501);
    await request(app).get('/api/contact-schedule').expect(501);
    await request(app).get('/api/dashboard').expect(501);
    await request(app).get('/api/settings').expect(501);

    db.close();
  });
});
