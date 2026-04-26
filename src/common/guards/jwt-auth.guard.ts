import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { LOCAL_USER } from '../local-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.user = LOCAL_USER;
    return true;
  }
}
