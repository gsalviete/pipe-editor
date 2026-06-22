import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  hello(): string {
    return 'pipe-editor fixture is running';
  }
}
