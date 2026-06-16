import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XhsConnectorClient } from './xhs-connector.client';

@Module({
  exports: [XhsConnectorClient],
  imports: [ConfigModule],
  providers: [XhsConnectorClient],
})
export class XhsConnectorModule {}
