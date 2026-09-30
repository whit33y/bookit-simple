import { Module } from '@nestjs/common';
import { VisitChangesModule } from '../visit-changes/visit-changes.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

/** `/api/clients`: the Kartoteka Klientów (#23). */
@Module({
  imports: [VisitChangesModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
