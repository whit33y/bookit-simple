import { Module } from '@nestjs/common';
import { OpeningHoursModule } from '../opening-hours/opening-hours.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/** `/api/calendar`: one read of a range for the calendar views (#28). */
@Module({
  imports: [OpeningHoursModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
