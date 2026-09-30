import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { SalonPageSettings } from '@bookit/shared';
import { Roles } from '../auth/access.decorators';
import { parseChanges } from './salon-page.schema';
import { SalonPageService } from './salon-page.service';

/** `/api/salon/page`: the Właściciel edits what the Wizytówka shows. */
@Controller('salon/page')
@Roles('OWNER')
export class SalonPageController {
  constructor(
    @Inject(SalonPageService) private readonly page: SalonPageService,
  ) {}

  @Get()
  get(): Promise<SalonPageSettings> {
    return this.page.get();
  }

  @Patch()
  update(@Body() body: unknown): Promise<SalonPageSettings> {
    return this.page.update(parseChanges(body));
  }
}
