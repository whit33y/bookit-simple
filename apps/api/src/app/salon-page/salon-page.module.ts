import { Module } from '@nestjs/common';
import { SalonPageController } from './salon-page.controller';
import { SalonPageService } from './salon-page.service';

/** `/api/salon/page`: the content of the Wizytówka (#20). */
@Module({
  controllers: [SalonPageController],
  providers: [SalonPageService],
})
export class SalonPageModule {}
