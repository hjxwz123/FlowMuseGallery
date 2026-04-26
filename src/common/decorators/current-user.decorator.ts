import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { LOCAL_USER } from '../local-user';

export const CurrentUser = createParamDecorator((property: string | undefined, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  const user = request.user ?? LOCAL_USER;

  if (!property) return user;
  return user[property as keyof typeof user];
});
