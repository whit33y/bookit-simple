import { Module } from '@nestjs/common';
import { VisitChangesModule } from '../visit-changes/visit-changes.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

/** `/api/visits`: Wizyty with Kolizje and the Stan Wizyty (#24). */
@Module({
  imports: [VisitChangesModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
