import { Module } from '@nestjs/common';
import { OpeningHoursController } from './opening-hours.controller';
import { OpeningHoursService } from './opening-hours.service';

/** `/api/opening-hours`: the Godziny otwarcia of the Salon (#18). */
@Module({
  controllers: [OpeningHoursController],
  providers: [OpeningHoursService],
})
export class OpeningHoursModule {}
