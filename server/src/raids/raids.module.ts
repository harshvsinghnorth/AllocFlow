import { Module } from '@nestjs/common';
import { RaidsController } from './raids.controller';
import { RaidsService } from './raids.service';

@Module({
  controllers: [RaidsController],
  providers: [RaidsService],
  exports: [RaidsService],
})
export class RaidsModule {}
