import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { signPhotoUrl } from '../common/utils/photo-signature.util';
import {
  resolveShareLinkExpiresAt,
  signShareLink,
  verifyShareLinkSignature,
} from '../common/utils/share-link-signature.util';
import { ClassEntity } from '../entities/class.entity';
import { ShareLinkEntity } from '../entities/share-link.entity';
import { StudentEntity } from '../entities/student.entity';

export type ShareLinkView = {
  id: string;
  token: string;
  shareUrl: string;
  isActive: boolean;
  requireLogin: boolean;
  expiresAt: Date | null;
  createdAt: Date;
};

export type SharedClassView = {
  classInfo: {
    id: string;
    classCode: string;
    courseCode?: string;
    courseName?: string;
    semester?: string;
    department?: string;
    classType?: string;
    instructor?: string;
  };
  students: Array<{
    mssv: string;
    name?: string;
    photoUrl: string;
    photoStatus: string;
    importOrder: number;
  }>;
};

@Injectable()
export class ClassShareService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    @InjectRepository(ShareLinkEntity)
    private readonly shareLinksRepository: Repository<ShareLinkEntity>,
  ) {}

  /**
   * Lấy base URL backend để dựng các URL công khai trả về cho client.
   * @returns Base URL không có dấu '/' ở cuối.
   */
  private getBaseUrl(): string {
    const port = process.env.PORT ?? '3000';
    const configuredBaseUrl = process.env.BACKEND_BASE_URL?.trim();
    const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0 ? configuredBaseUrl : `http://localhost:${port}`;
    return baseUrl.replace(/\/$/, '');
  }

  /**
   * Dựng URL public dạng mới có công khai exp và chữ ký HMAC.
   * @param shareId ID bản ghi share link.
   * @param expiresAt Unix timestamp milliseconds của thời điểm hết hạn.
   * @param signature Chữ ký HMAC của shareId và expiresAt.
   * @returns URL đầy đủ của endpoint chia sẻ.
   */
  private buildShareUrl(shareId: string, expiresAt: number, signature: string): string {
    const encodedId = encodeURIComponent(shareId);
    const encodedSig = encodeURIComponent(signature);
    return `${this.getBaseUrl()}/classes/shared/${encodedId}?exp=${expiresAt}&sig=${encodedSig}`;
  }

  /**
   * Tạo URL ảnh sinh viên có chữ ký để truy cập công khai trong thời gian ngắn.
   * @param mssv Mã số sinh viên.
   * @param classId ID lớp học chứa sinh viên.
   * @returns URL ảnh sinh viên đã ký gồm classId, exp và sig.
   */
  private buildStudentPhotoUrl(mssv: string, classId: string): string {
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
    const signature = signPhotoUrl(mssv, classId, expiresAt);
    return `${this.getBaseUrl()}/students/${encodeURIComponent(mssv)}/photo?classId=${encodeURIComponent(classId)}&exp=${expiresAt}&sig=${signature}`;
  }

  /**
   * Kiểm tra lớp có thuộc quyền quản lý của user hiện tại hay không.
   * @param classId ID lớp học cần kiểm tra.
   * @param userId ID người dùng hiện tại.
   * @returns Thực thể lớp nếu người dùng có quyền truy cập.
   */
  private async assertClassOwnership(classId: string, userId: string): Promise<ClassEntity> {
    const classEntity = await this.classesRepository.findOne({ where: { id: classId, userId } });
    if (!classEntity) {
      throw new NotFoundException('Khong tim thay lop thuoc ve nguoi dung hien tai');
    }
    return classEntity;
  }

  /**
   * Sinh token chia sẻ ngẫu nhiên và đảm bảo chưa tồn tại trong DB.
   * @returns Token chia sẻ duy nhất.
   */
  private async generateUniqueToken(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const token = randomBytes(32).toString('hex');
      const existing = await this.shareLinksRepository.findOne({ where: { token } });
      if (!existing) {
        return token;
      }
    }

    throw new ForbiddenException('Khong the tao token chia se. Vui long thu lai.');
  }

  /**
   * Chuyển thực thể ShareLink thành dạng view trả về API.
   * @param entity Thực thể share link từ database.
   * @returns Dữ liệu share link đã bao gồm shareUrl.
   */
  private toView(entity: ShareLinkEntity): ShareLinkView {
    const exp = resolveShareLinkExpiresAt(entity.expiresAt);
    const sig = signShareLink(entity.id, exp);

    return {
      id: entity.id,
      token: entity.token,
      shareUrl: this.buildShareUrl(entity.id, exp, sig),
      isActive: entity.isActive,
      requireLogin: entity.requireLogin,
      expiresAt: entity.expiresAt,
      createdAt: entity.createdAt,
    };
  }

  /**
   * Tạo mới link chia sẻ cho một lớp.
   * @param classId ID lớp cần chia sẻ.
   * @param userId ID người dùng tạo link.
   * @param expiresInDays Số ngày hiệu lực của link (nếu truyền vào).
   * @param requireLogin Yêu cầu người xem phải đăng nhập hay không.
   * @returns Thông tin link chia sẻ vừa được tạo.
   */
  async createShareLink(
    classId: string,
    userId: string,
    expiresInDays?: number,
    requireLogin = false,
  ): Promise<ShareLinkView> {
    await this.assertClassOwnership(classId, userId);

    const existing = await this.shareLinksRepository.findOne({ where: { classId } });
    if (existing) {
      throw new ConflictException('Moi lop chi duoc phep co 1 link chia se. Vui long cap nhat link hien co.');
    }

    const token = await this.generateUniqueToken();
    const expiresAt = typeof expiresInDays === 'number' ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const entity = this.shareLinksRepository.create({
      classId,
      token,
      isActive: true,
      requireLogin,
      expiresAt,
    });

    const saved = await this.shareLinksRepository.save(entity);
    return this.toView(saved);
  }

  /**
   * Lấy link chia sẻ hiện tại của lớp.
   * @param classId ID lớp cần lấy link.
   * @param userId ID người dùng sở hữu lớp.
   * @returns Link chia sẻ hiện có hoặc null nếu chưa tồn tại.
   */
  async getShareLink(classId: string, userId: string): Promise<ShareLinkView | null> {
    await this.assertClassOwnership(classId, userId);

    const entity = await this.shareLinksRepository.findOne({ where: { classId } });
    if (!entity) return null;
    return this.toView(entity);
  }

  /**
   * Cập nhật trạng thái, hạn dùng hoặc chế độ truy cập của link chia sẻ.
   * @param classId ID lớp có link cần cập nhật.
   * @param userId ID người dùng sở hữu lớp.
   * @param payload Dữ liệu cập nhật gồm isActive, expiresAt và/hoặc requireLogin.
   * @returns Thông tin link chia sẻ sau cập nhật.
   */
  async updateShareLink(
    classId: string,
    userId: string,
    payload: { isActive?: boolean; expiresAt?: string; requireLogin?: boolean },
  ): Promise<ShareLinkView> {
    await this.assertClassOwnership(classId, userId);

    const shareLink = await this.shareLinksRepository.findOne({ where: { classId } });
    if (!shareLink) {
      throw new NotFoundException('Khong tim thay link chia se');
    }

    if (typeof payload.isActive === 'boolean') {
      shareLink.isActive = payload.isActive;
    }
    if (typeof payload.requireLogin === 'boolean') {
      shareLink.requireLogin = payload.requireLogin;
    }
    if (payload.expiresAt !== undefined) {
      shareLink.expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    }

    const saved = await this.shareLinksRepository.save(shareLink);
    return this.toView(saved);
  }

  /**
   * Thu hồi (xóa) link chia sẻ của lớp.
   * @param classId ID lớp có link cần thu hồi.
   * @param userId ID người dùng sở hữu lớp.
   * @returns Kết quả thao tác thu hồi link.
   */
  async revokeShareLink(classId: string, userId: string): Promise<{ success: boolean; message: string }> {
    await this.assertClassOwnership(classId, userId);

    const shareLink = await this.shareLinksRepository.findOne({ where: { classId } });
    if (!shareLink) {
      throw new NotFoundException('Khong tim thay link chia se');
    }

    await this.shareLinksRepository.delete({ id: shareLink.id });

    return {
      success: true,
      message: 'Da xoa link chia se',
    };
  }

  /**
   * Lấy dữ liệu sổ ảnh khi người dùng truy cập bằng link đã ký.
   * @param shareId ID bản ghi share link.
   * @param exp Unix timestamp milliseconds của thời điểm hết hạn.
   * @param sig Chữ ký HMAC đảm bảo tính toàn vẹn của link.
   * @param viewerUserId ID người xem nếu đã đăng nhập, undefined nếu ẩn danh.
   * @returns Thông tin lớp và danh sách sinh viên kèm URL ảnh đã ký.
   */
  async getSharedClassBySignedLink(
    shareId: string,
    exp: number,
    sig: string,
    viewerUserId?: string,
  ): Promise<SharedClassView> {
    if (!Number.isInteger(exp) || exp <= 0) {
      throw new ForbiddenException('Thoi diem het han trong link khong hop le');
    }

    if (!sig) {
      throw new ForbiddenException('Thieu chu ky trong link chia se');
    }

    // Kiểm tra chữ ký thêm một lần ở service để tránh phụ thuộc hoàn toàn vào middleware.
    if (!verifyShareLinkSignature(shareId, exp, sig)) {
      throw new ForbiddenException('Chu ky link chia se khong hop le hoac da het han');
    }

    const shareLink = await this.shareLinksRepository.findOne({
      where: { id: shareId },
      relations: ['classEntity'],
    });

    if (!shareLink || !shareLink.classEntity) {
      throw new NotFoundException('Link chia se khong ton tai');
    }

    if (!shareLink.isActive) {
      throw new ForbiddenException('Link chia se da bi vo hieu hoa');
    }

    // Nếu link yêu cầu đăng nhập mà người xem chưa xác thực → từ chối.
    if (shareLink.requireLogin && !viewerUserId) {
      throw new UnauthorizedException('Link nay yeu cau dang nhap tai khoan HUST de xem');
    }

    const expectedExp = resolveShareLinkExpiresAt(shareLink.expiresAt);
    if (exp !== expectedExp) {
      throw new ForbiddenException('Link chia se khong con hop le voi thoi diem het han hien tai');
    }

    if (shareLink.expiresAt && Date.now() > shareLink.expiresAt.getTime()) {
      throw new ForbiddenException('Link chia se da het han');
    }

    const classEntity = shareLink.classEntity;

    const students = await this.studentsRepository.find({
      where: { classId: classEntity.id },
      order: { importOrder: 'ASC' },
    });

    return {
      classInfo: {
        id: classEntity.id,
        classCode: classEntity.classCode,
        courseCode: classEntity.courseCode ?? undefined,
        courseName: classEntity.courseName ?? undefined,
        semester: classEntity.semester ?? undefined,
        department: classEntity.department ?? undefined,
        classType: classEntity.classType ?? undefined,
        instructor: classEntity.instructor ?? undefined,
      },
      students: students.map((student) => ({
        mssv: student.mssv,
        name: student.fullName ?? undefined,
        photoUrl: this.buildStudentPhotoUrl(student.mssv, classEntity.id),
        photoStatus: student.photoStatus,
        importOrder: student.importOrder,
      })),
    };
  }
}
