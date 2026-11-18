import { Global, Module } from '@nestjs/common';
import { AuthController } from '../auth.controller';
import { CurrentUserController } from '../controllers/current-user.controller';
import { PublicController } from '../public.controller';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { UsersService } from '../services/users.service';

@Global()
@Module({
  controllers: [AuthController, CurrentUserController, PublicController],
  providers: [BearerJwtGuard, UsersService],
  exports: [BearerJwtGuard, UsersService],
})
export class AuthModule {}
