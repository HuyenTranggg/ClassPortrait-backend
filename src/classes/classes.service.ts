import {
  Injectable,
} from '@nestjs/common';
import { Class, Student, ClassWithStudents } from '../common/types';
import { SourceType } from '../entities/import-history.entity';
import {
  ImportClassOptions,
  ImportClassResult,
  ImportHistoryListResult,
} from './import/import.types';
import { ImportHistoryService } from './import/import-history.service';
import { ClassQueryService } from './class-query.service';
import { ClassImportService } from './class-import.service';
import { ClassShareService, SharedClassView, ShareLinkView } from './class-share.service';

@Injectable()
export class ClassesService {
  constructor(
    private readonly classQueryService: ClassQueryService,
    private readonly classImportService: ClassImportService,
    private readonly importHistoryService: ImportHistoryService,
    private readonly classShareService: ClassShareService,
  ) {}

  async getImportHistoryByUser(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      sourceType?: SourceType;
    },
  ): Promise<ImportHistoryListResult> {
    return this.importHistoryService.getImportHistoryByUser(userId, options);
  }

  async findAll(): Promise<Class[]> {
    return this.classQueryService.findAll();
  }

  async findAllWithStudentCount(userId: string): Promise<Array<Class & { studentCount: number }>> {
    return this.classQueryService.findAllWithStudentCount(userId);
  }

  async findOne(id: string, userId: string): Promise<Class> {
    return this.classQueryService.findOne(id, userId);
  }

  async findOneWithStudents(id: string, userId: string): Promise<ClassWithStudents> {
    return this.classQueryService.findOneWithStudents(id, userId);
  }

  async getStudents(classId: string, userId: string): Promise<Student[]> {
    return this.classQueryService.getStudents(classId, userId);
  }

  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    return this.classQueryService.remove(id, userId);
  }

  async importClass(
    file: Express.Multer.File,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    return this.classImportService.importClass(file, userId, options);
  }

  async importFromGoogleSheet(
    googleSheetUrl: string,
    userId: string,
    options?: ImportClassOptions,
  ): Promise<ImportClassResult> {
    return this.classImportService.importFromGoogleSheet(googleSheetUrl, userId, options);
  }

  /**
   * Tạo link chia sẻ cho lớp học.
   * @param classId ID lớp học cần chia sẻ.
   * @param userId ID người dùng thực hiện thao tác.
   * @param expiresInDays Số ngày hiệu lực của link (nếu có).
   * @returns Thông tin link chia sẻ đã được tạo.
   */
  async createShareLink(classId: string, userId: string, expiresInDays?: number): Promise<ShareLinkView> {
    return this.classShareService.createShareLink(classId, userId, expiresInDays);
  }

  /**
   * Lấy link chia sẻ hiện tại của lớp.
   * @param classId ID lớp học.
   * @param userId ID người dùng sở hữu lớp.
   * @returns Link chia sẻ hiện tại hoặc null nếu chưa có.
   */
  async getShareLink(classId: string, userId: string): Promise<ShareLinkView | null> {
    return this.classShareService.getShareLink(classId, userId);
  }

  /**
   * Cập nhật trạng thái hoặc hạn dùng của link chia sẻ.
   * @param classId ID lớp học.
   * @param userId ID người dùng sở hữu lớp.
   * @param payload Dữ liệu cập nhật link chia sẻ.
   * @returns Link chia sẻ sau khi cập nhật.
   */
  async updateShareLink(
    classId: string,
    userId: string,
    payload: { isActive?: boolean; expiresAt?: string },
  ): Promise<ShareLinkView> {
    return this.classShareService.updateShareLink(classId, userId, payload);
  }

  /**
   * Xóa link chia sẻ hiện tại của lớp.
   * @param classId ID lớp học.
   * @param userId ID người dùng sở hữu lớp.
   * @returns Kết quả thao tác xóa link chia sẻ.
   */
  async revokeShareLink(classId: string, userId: string): Promise<{ success: boolean; message: string }> {
    return this.classShareService.revokeShareLink(classId, userId);
  }

  /**
   * Lấy dữ liệu sổ ảnh công khai thông qua token chia sẻ.
   * @param token Token chia sẻ.
   * @returns Thông tin lớp và danh sách sinh viên phục vụ trang chia sẻ.
   */
  async getSharedClassByToken(token: string): Promise<SharedClassView> {
    return this.classShareService.getSharedClassByToken(token);
  }
}
