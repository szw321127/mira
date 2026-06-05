import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';

@Module({
  exports: [PrismaService],
  imports: [ConfigModule],
  providers: [PrismaService],
})
export class PrismaModule {}
