import { Module } from '@nestjs/common';
import { VisitChangeRecorder } from './visit-change-recorder';
import { VisitChangesController } from './visit-changes.controller';
import { VisitChangesService } from './visit-changes.service';

/** The Historia zmian (#25): the recorder for the Wizyty and the Właściciel's endpoints. */
@Module({
  controllers: [VisitChangesController],
  providers: [VisitChangeRecorder, VisitChangesService],
  exports: [VisitChangeRecorder],
})
export class VisitChangesModule {}
