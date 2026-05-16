import { buildApp } from '../index';

describe('buildApp', () => {
  it('returns a truthy Express app', () => {
    const app = buildApp();
    expect(app).toBeTruthy();
  });
});
