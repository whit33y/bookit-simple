import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AbsencesModule } from './absences/absences.module';
import { AdminSalonsModule } from './admin-salons/admin-salons.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { validateEnv } from './config/env';
import { GalleryModule } from './gallery/gallery.module';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { OpeningHoursModule } from './opening-hours/opening-hours.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { PhotosModule } from './photos/photos.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicPagesModule } from './public-pages/public-pages.module';
import { SalonPageModule } from './salon-page/salon-page.module';
import { SalonContextModule } from './salon-context/salon-context.module';
import { ServiceCategoriesModule } from './service-categories/service-categories.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { VisitsModule } from './visits/visits.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SalonContextModule,
    PrismaModule,
    AuthModule,
    InvitationsModule,
    AdminSalonsModule,
    PasswordResetModule,
    PublicPagesModule,
    StaffModule,
    ServiceCategoriesModule,
    ServicesModule,
    OpeningHoursModule,
    PhotosModule,
    AnnouncementsModule,
    GalleryModule,
    SalonPageModule,
    ClientsModule,
    VisitsModule,
    AbsencesModule,
    HealthModule.register(),
  ],
})
export class AppModule {}
