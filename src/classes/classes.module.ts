// backend/src/classes/classes.module.ts

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { ClassEntity } from '../entities/class.entity';
import { StudentEntity } from '../entities/student.entity';
import { ImportHistoryEntity } from '../entities/import-history.entity';
import { ShareLinkEntity } from '../entities/share-link.entity';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
    TypeOrmModule.forFeature([ClassEntity, StudentEntity, ImportHistoryEntity, ShareLinkEntity]),
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService], // Export để có thể dùng trong module khác
})
export class ClassesModule {}
