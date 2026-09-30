import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

/** `/api/services`: the Usługi of the Cennik (#17). */
@Module({
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
