import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../salon-context/salon-context.guard';
import { Access, ACCESS, STAFF_ACCESS, Role } from './access.decorators';

/** An Administrator who is also in the Personel of a Salon gets in as both. */
function rolesOf(user: AuthenticatedUser): Role[] {
  const roles: Role[] = user.role ? [user.role] : [];
  return user.isAdministrator ? [...roles, 'ADMINISTRATOR'] : roles;
}

/**
 * Global guard: every endpoint needs a login (`401`) and one of its roles (`403`),
 * unless it is `@Public()`. A decorator on a route replaces the one on its controller.
 * Without a decorator only the Personel gets in (`STAFF_ACCESS`).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const access =
      this.reflector.getAllAndOverride<Access | undefined>(ACCESS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? STAFF_ACCESS;
    if (access === 'public') return true;

    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new UnauthorizedException();
    if (!rolesOf(user).some((role) => access.includes(role))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
