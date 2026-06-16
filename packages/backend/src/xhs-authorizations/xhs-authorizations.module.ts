import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { XhsConnectorModule } from '../xhs-connector/xhs-connector.module';
import { XhsAuthorizationsController } from './xhs-authorizations.controller';
import { XhsAuthorizationsService } from './xhs-authorizations.service';

@Module({
  controllers: [XhsAuthorizationsController],
  exports: [XhsAuthorizationsService],
  imports: [AuthModule, PrismaModule, XhsConnectorModule],
  providers: [XhsAuthorizationsService],
})
export class XhsAuthorizationsModule {}
