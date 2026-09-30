import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

/** `/api/visits`: Wizyty with Kolizje and the Stan Wizyty (#24). */
@Module({
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
