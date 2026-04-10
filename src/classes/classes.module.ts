// backend/src/classes/classes.module.ts

import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { ClassQueryService } from './class-query.service';
import { ClassImportService } from './class-import.service';
import { ClassShareService } from './class-share.service';
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
import { AttendanceEntity } from '../entities/attendance.entity';
import { ShareLinkSignatureMiddleware } from './middlewares/share-link-signature.middleware';
import { ClassAttendanceService } from './class-attendance.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
    TypeOrmModule.forFeature([ClassEntity, StudentEntity, ImportHistoryEntity, ShareLinkEntity, AttendanceEntity]),
  ],
  controllers: [ClassesController],
  providers: [
    ClassesService,
    ClassQueryService,
    ClassImportService,
    ClassShareService,
    ClassAttendanceService,
    ImportParserService,
    FileImportParserService,
    GoogleSheetParserService,
    ImportMappingService,
    ImportDuplicateService,
    ImportHistoryService,
  ],
  exports: [ClassesService], // Export để có thể dùng trong module khác
})
export class ClassesModule implements NestModule {
  /**
   * Cấu hình middleware xác thực chữ ký cho endpoint chia sẻ công khai.
   * @param consumer Middleware consumer của NestJS.
   * @returns Không trả dữ liệu; đăng ký middleware theo route.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ShareLinkSignatureMiddleware)
      .forRoutes({ path: 'classes/shared/:id', method: RequestMethod.GET });
  }
}
