import { PhotosModule } from '../photos/photos.module';
import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

/** `/api/announcements`: the Ogłoszenia of the Wizytówka (#22). */
@Module({
  imports: [PhotosModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
