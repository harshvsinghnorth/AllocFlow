import { Module } from '@nestjs/common';
import { MessController } from './mess.controller';
import { MessService } from './mess.service';

@Module({
  controllers: [MessController],
  providers: [MessService],
  exports: [MessService],
})
export class MessModule {}
