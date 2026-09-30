import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateServiceCategoryRequest,
  SERVICE_CATEGORY_NAME_MAX_LENGTH,
  SERVICE_CATEGORY_NAME_REQUIRED,
  SERVICE_CATEGORY_NAME_TOO_LONG,
  ServiceCategoryOrderRequest,
  ServiceCategoryView,
  UpdateServiceCategoryRequest,
} from '@bookit/shared';
import { z } from 'zod';
import { Roles } from '../auth/access.decorators';
import { ServiceCategoriesService } from './service-categories.service';

const nameSchema = z.object({
  name: z
    .string({ error: SERVICE_CATEGORY_NAME_REQUIRED })
    .trim()
    .min(1, SERVICE_CATEGORY_NAME_REQUIRED)
    .max(SERVICE_CATEGORY_NAME_MAX_LENGTH, SERVICE_CATEGORY_NAME_TOO_LONG),
}) satisfies z.ZodType<
  CreateServiceCategoryRequest & UpdateServiceCategoryRequest
>;

const orderSchema = z.object({
  ids: z.array(z.string()),
}) satisfies z.ZodType<ServiceCategoryOrderRequest>;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message);
  }
  return parsed.data;
}

/** `/api/service-categories`: the Właściciel manages the Kategorie; the Pracownik only sees them. */
@Controller('service-categories')
@Roles('OWNER')
export class ServiceCategoriesController {
  constructor(
    @Inject(ServiceCategoriesService)
    private readonly categories: ServiceCategoriesService,
  ) {}

  @Get()
  @Roles('OWNER', 'EMPLOYEE')
  list(): Promise<ServiceCategoryView[]> {
    return this.categories.list();
  }

  @Post()
  create(@Body() body: unknown): Promise<ServiceCategoryView> {
    return this.categories.create(parse(nameSchema, body).name);
  }

  @Put('order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorder(@Body() body: unknown): Promise<void> {
    return this.categories.reorder(parse(orderSchema, body).ids);
  }

  @Patch(':id')
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<ServiceCategoryView> {
    return this.categories.rename(id, parse(nameSchema, body).name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
