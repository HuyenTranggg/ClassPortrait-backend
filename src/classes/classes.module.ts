// backend/src/classes/classes.module.ts

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService], // Export để có thể dùng trong module khác
})
export class ClassesModule {}
