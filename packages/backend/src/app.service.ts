import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      name: '@rednote/backend',
      ok: true,
    };
  }
}
