import { Module } from '@nestjs/common';
import { PublicPagesController } from './public-pages.controller';
import { PublicPagesService } from './public-pages.service';
import { SalonResolver } from './salon-resolver';

/** `/api/public/pages`: the Wizytówka and finding its Salon (ADR 0002). */
@Module({
  controllers: [PublicPagesController],
  providers: [SalonResolver, PublicPagesService],
  exports: [SalonResolver],
})
export class PublicPagesModule {}
