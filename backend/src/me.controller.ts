import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class MeController {
  @Get('me')
  me() {
    return {
      id: 'placeholder-user',
      displayName: 'Wardrobe user',
    };
  }
}