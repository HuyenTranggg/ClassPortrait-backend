// backend/src/classes/classes.module.ts

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { ClassQueryService } from './class-query.service';
import { ClassImportService } from './class-import.service';
import { ImportParserService } from './import/import-parser.service';
import { FileImportParserService } from './import/file-import-parser.service';
import { GoogleSheetParserService } from './import/google-sheet-parser.service';
import { ImportMappingService } from './import/import-mapping.service';
import { ImportDuplicateService } from './import/import-duplicate.service';
import { ImportHistoryService } from './import/import-history.service';
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
  providers: [
    ClassesService,
    ClassQueryService,
    ClassImportService,
    ImportParserService,
    FileImportParserService,
    GoogleSheetParserService,
    ImportMappingService,
    ImportDuplicateService,
    ImportHistoryService,
  ],
  exports: [ClassesService], // Export để có thể dùng trong module khác
})
export class ClassesModule {}
