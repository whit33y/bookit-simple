import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { PublicPage, PublicPageRedirect } from '@bookit/shared';
import { Request, Response } from 'express';
import { Public } from '../auth/access.decorators';
import { AdminScope } from '../salon-context/admin-scope.decorator';
import { PublicPagesService } from './public-pages.service';
import { SalonResolver } from './salon-resolver';

/** Short, so a change by the Właściciel shows up within a minute. */
const CACHE_CONTROL = 'public, max-age=60';

/** `/api/public/pages`: the Wizytówka for Klienci, without a login. */
@Controller('public/pages')
@Public()
@AdminScope()
export class PublicPagesController {
  constructor(
    @Inject(SalonResolver) private readonly resolver: SalonResolver,
    @Inject(PublicPagesService) private readonly pages: PublicPagesService,
  ) {}

  /** `301` for an old Adres wizytówki, `404` for an unknown one and a suspended Salon. */
  @Get(':slug')
  async page(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicPage | PublicPageRedirect> {
    const resolved = await this.resolver.resolve({
      host: req.hostname,
      path: `/${slug}`,
    });
    if (!resolved) throw new NotFoundException();

    res.setHeader('Cache-Control', CACHE_CONTROL);
    if ('redirectTo' in resolved) {
      const moved = resolved.redirectTo;
      res
        .status(HttpStatus.MOVED_PERMANENTLY)
        .location(`/api/public/pages/${moved}`);
      return { slug: moved };
    }
    return this.pages.page(resolved.salon);
  }
}
