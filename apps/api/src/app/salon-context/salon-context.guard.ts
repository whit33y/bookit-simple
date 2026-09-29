import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { StaffRole } from '../../generated/prisma/client';
import { Access, ACCESS } from '../auth/access.decorators';
import { ADMIN_SCOPE } from './admin-scope.decorator';
import { SalonContext } from './salon-context';

/** The logged-in person as `req.user`, filled in from the session by `CurrentUserMiddleware`. */
export interface AuthenticatedUser {
  userId: string;
  isAdministrator: boolean;
  /** The Salon of the person from the Personel; absent for the Administrator. */
  salonId?: string;
  staffMemberId?: string;
  role?: StaffRole;
}

/**
 * Copies the logged-in person into the request context, which the Prisma extension
 * uses to limit queries to their Salon. It does not authenticate; without `req.user`
 * the context has no Salon and every query on a Salon's data throws.
 */
@Injectable()
export class SalonContextGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService<SalonContext>,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    const targets = [context.getHandler(), context.getClass()];
    const adminScope = this.reflector.getAllAndOverride<boolean | undefined>(
      ADMIN_SCOPE,
      targets,
    );

    // A public read across Salons, e.g. the Wizytówka. Both decorators must sit on the
    // same handler or class, so a `@Public()` handler of an Administrator controller
    // does not open every Salon to anyone.
    const publicAcrossSalons = targets.some(
      (target) =>
        this.reflector.get<boolean | undefined>(ADMIN_SCOPE, target) &&
        this.reflector.get<Access | undefined>(ACCESS, target) === 'public',
    );
    if (publicAcrossSalons) {
      this.cls.set('adminScope', true);
      return true;
    }

    if (adminScope) {
      // Same answers as `AccessGuard` for `@AdminOnly()`, whichever guard runs first;
      // checked here too because the Salon filter goes off.
      if (!user) throw new UnauthorizedException();
      if (!user.isAdministrator) throw new ForbiddenException();
      this.cls.set('isAdministrator', true);
      this.cls.set('adminScope', true);
      return true;
    }

    if (user) {
      this.cls.set('isAdministrator', user.isAdministrator);
      this.cls.set('salonId', user.salonId);
      this.cls.set('staffMemberId', user.staffMemberId);
      this.cls.set('role', user.role);
    }
    return true;
  }
}
