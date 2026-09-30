import { Module } from '@nestjs/common';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';

/** `/api/absences`: Nieobecności, which count to Kolizje of Wizyty (#26). */
@Module({
  controllers: [AbsencesController],
  providers: [AbsencesService],
})
export class AbsencesModule {}
