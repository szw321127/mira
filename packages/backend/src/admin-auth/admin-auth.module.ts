import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';

@Module({
  controllers: [AdminAuthController],
  exports: [AdminJwtAuthGuard, JwtModule],
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('ADMIN_JWT_SECRET') ??
          config.get<string>('JWT_SECRET') ??
          'rednote-local-admin-jwt-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [AdminAuthService, AdminJwtAuthGuard],
})
export class AdminAuthModule {}
