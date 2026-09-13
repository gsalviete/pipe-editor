import { HealthController } from './health.controller';

describe('HealthController (PRODUCT-AC-009)', () => {
  it('returns a small, stable and non-sensitive liveness document', () => {
    expect(new HealthController().health()).toEqual({
      status: 'ok',
      service: 'pipe-editor-api',
      version: '0.1.0',
    });
  });
});
