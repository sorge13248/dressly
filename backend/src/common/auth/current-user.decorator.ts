import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './auth.types';

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!request.user) {
    throw new Error('Current user unavailable');
  }

  return request.user;
});