// backend/src/classes/classes.module.ts

import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassesController } from './classes.controller';
import { ClassImportController } from './import/import.controller';
import { ClassDashboardController } from './dashboard/dashboard.controller';
import { ClassShareController } from './share/share.controller';
import { ClassAttendanceController } from './attendance/attendance.controller';
import { ClassesService } from './classes.service';
import { ClassQueryService } from './class-query.service';
import { ClassImportService } from './import/import.service';
import { ClassShareService } from './share/share.service';
import { ImportParserService } from './import/services/import-parser.service';
import { FileImportParserService } from './import/services/file-import-parser.service';
import { GoogleSheetParserService } from './import/services/google-sheet-parser.service';
import { ImportMappingService } from './import/services/import-mapping.service';
import { ImportDuplicateService } from './import/services/import-duplicate.service';
import { ImportHistoryService } from './import/services/import-history.service';
import { ClassEntity } from './entities/class.entity';
import { StudentEntity } from '../students/entities/student.entity';
import { ImportHistoryEntity } from './import/entities/import-history.entity';
import { ShareLinkEntity } from './share/entities/share-link.entity';
import { AttendanceEntity } from './attendance/entities/attendance.entity';
import { ShareLinkSignatureMiddleware } from './share/middlewares/share-link-signature.middleware';
import { ClassAttendanceService } from './attendance/attendance.service';
import { ClassDashboardService } from './dashboard/dashboard.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
    TypeOrmModule.forFeature([ClassEntity, StudentEntity, ImportHistoryEntity, ShareLinkEntity, AttendanceEntity]),
  ],
  controllers: [
    ClassImportController,
    ClassDashboardController,
    ClassShareController,
    ClassAttendanceController,
    ClassesController,
  ],
  providers: [
    ClassesService,
    ClassQueryService,
    ClassImportService,
    ClassShareService,
    ClassAttendanceService,
    ClassDashboardService,
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
