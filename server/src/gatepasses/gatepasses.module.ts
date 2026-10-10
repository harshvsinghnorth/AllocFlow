import { Module } from '@nestjs/common';
import { GatepassesController } from './gatepasses.controller';
import { GatepassesService } from './gatepasses.service';

@Module({
  controllers: [GatepassesController],
  providers: [GatepassesService],
  exports: [GatepassesService],
})
export class GatepassesModule {}
