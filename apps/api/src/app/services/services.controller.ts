import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ServiceView } from '@bookit/shared';
import { Roles } from '../auth/access.decorators';
import {
  createSchema,
  orderSchema,
  parse,
  updateSchema,
} from './services.schemas';
import { ServicesService } from './services.service';

/**
 * `/api/services`: the Właściciel manages the Usługi of the Cennik; the Pracownik only
 * sees them, to pick them for a Wizyta.
 */
@Controller('services')
@Roles('OWNER')
export class ServicesController {
  constructor(
    @Inject(ServicesService) private readonly services: ServicesService,
  ) {}

  /** Without archived Usługi, unless `?includeArchived=true`. */
  @Get()
  @Roles('OWNER', 'EMPLOYEE')
  list(
    @Query('includeArchived') includeArchived?: string,
  ): Promise<ServiceView[]> {
    return this.services.list(includeArchived === 'true');
  }

  @Post()
  create(@Body() body: unknown): Promise<ServiceView> {
    return this.services.create(parse(createSchema, body));
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() body: unknown): Promise<void> {
    const { categoryId, ids } = parse(orderSchema, body);
    return this.services.reorder(categoryId, ids);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ServiceView> {
    return this.services.update(id, parse(updateSchema, body));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceView> {
    return this.services.archive(id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceView> {
    return this.services.unarchive(id);
  }
}
