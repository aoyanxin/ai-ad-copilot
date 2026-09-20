import { Test } from '@nestjs/testing';

import { SERVER_VERSION } from '../../common/constants/app';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('返回 ok 状态与服务版本', () => {
    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.version).toBe(SERVER_VERSION);
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
