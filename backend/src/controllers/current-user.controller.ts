import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { AuthUser } from '../common/auth/auth.types';
import { UsersService } from '../services/users.service';

@Controller()
@UseGuards(BearerJwtGuard)
export class CurrentUserController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const persisted = await this.usersService.ensureUser(user);
    return {
      id: persisted.id,
      subject: persisted.subject,
      email: persisted.email,
      displayName: persisted.displayName,
      pictureUrl: persisted.pictureUrl,
    };
  }
}