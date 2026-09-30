import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

/** `/api/clients`: the Kartoteka Klientów (#23). */
@Module({
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
