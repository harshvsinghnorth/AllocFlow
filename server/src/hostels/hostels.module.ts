import { Module } from '@nestjs/common';
import { HostelsController } from './hostels.controller';
import { HostelsService } from './hostels.service';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [HostelsController],
  providers: [HostelsService, RoomsService],
  exports: [HostelsService, RoomsService],
})
export class HostelsModule {}
