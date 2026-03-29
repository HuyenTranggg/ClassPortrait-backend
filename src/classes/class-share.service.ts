import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { signPhotoUrl } from '../common/utils/photo-signature.util';
import { ClassEntity } from '../entities/class.entity';
import { ShareLinkEntity } from '../entities/share-link.entity';
import { StudentEntity } from '../entities/student.entity';

export type ShareLinkView = {
  id: string;
  token: string;
  shareUrl: string;
  isActive: boolean;
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

  private getBaseUrl(): string {
    const port = process.env.PORT ?? '3000';
    const configuredBaseUrl = process.env.BACKEND_BASE_URL?.trim();
    const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0 ? configuredBaseUrl : `http://localhost:${port}`;
    return baseUrl.replace(/\/$/, '');
  }

  private buildShareUrl(token: string): string {
    return `${this.getBaseUrl()}/classes/shared/${token}`;
  }

  private buildStudentPhotoUrl(mssv: string, classId: string): string {
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
    const signature = signPhotoUrl(mssv, classId, expiresAt);
    return `${this.getBaseUrl()}/students/${encodeURIComponent(mssv)}/photo?classId=${encodeURIComponent(classId)}&exp=${expiresAt}&sig=${signature}`;
  }

  private async assertClassOwnership(classId: string, userId: string): Promise<ClassEntity> {
    const classEntity = await this.classesRepository.findOne({ where: { id: classId, userId } });
    if (!classEntity) {
      throw new NotFoundException('Khong tim thay lop thuoc ve nguoi dung hien tai');
    }
    return classEntity;
  }

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

  private toView(entity: ShareLinkEntity): ShareLinkView {
    return {
      id: entity.id,
      token: entity.token,
      shareUrl: this.buildShareUrl(entity.token),
      isActive: entity.isActive,
      expiresAt: entity.expiresAt,
      createdAt: entity.createdAt,
    };
  }

  async createShareLink(classId: string, userId: string, expiresInDays?: number): Promise<ShareLinkView> {
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
      expiresAt,
    });

    const saved = await this.shareLinksRepository.save(entity);
    return this.toView(saved);
  }

  async getShareLink(classId: string, userId: string): Promise<ShareLinkView | null> {
    await this.assertClassOwnership(classId, userId);

    const entity = await this.shareLinksRepository.findOne({ where: { classId } });
    if (!entity) return null;
    return this.toView(entity);
  }

  async updateShareLink(
    classId: string,
    userId: string,
    payload: { isActive?: boolean; expiresAt?: string },
  ): Promise<ShareLinkView> {
    await this.assertClassOwnership(classId, userId);

    const shareLink = await this.shareLinksRepository.findOne({ where: { classId } });
    if (!shareLink) {
      throw new NotFoundException('Khong tim thay link chia se');
    }

    if (typeof payload.isActive === 'boolean') {
      shareLink.isActive = payload.isActive;
    }
    if (payload.expiresAt !== undefined) {
      shareLink.expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    }

    const saved = await this.shareLinksRepository.save(shareLink);
    return this.toView(saved);
  }

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

  async getSharedClassByToken(token: string): Promise<SharedClassView> {
    const shareLink = await this.shareLinksRepository.findOne({
      where: { token },
      relations: ['classEntity'],
    });

    if (!shareLink || !shareLink.classEntity) {
      throw new NotFoundException('Link chia se khong ton tai');
    }

    if (!shareLink.isActive) {
      throw new ForbiddenException('Link chia se da bi vo hieu hoa');
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
