import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { Readable, Stream } from 'stream';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity, PhotoStatus } from '../entities/student.entity';
import { ClassEntity } from '../entities/class.entity';
import { verifyPhotoSignature } from '../common/utils/photo-signature.util';

export type StudentPhotoResult = {
  stream: Stream;
  contentType: string;
};

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentsRepository: Repository<StudentEntity>,
    @InjectRepository(ClassEntity)
    private readonly classesRepository: Repository<ClassEntity>,
  ) {}

  /**
   * Lấy ảnh sinh viên theo lớp, có kiểm tra quyền bằng JWT hoặc chữ ký URL.
   * @param mssv Mã số sinh viên cần lấy ảnh.
   * @param classId ID lớp học chứa sinh viên.
   * @param userId ID người dùng nếu truy cập bằng JWT (tùy chọn).
   * @param exp Thời điểm hết hạn của URL đã ký (timestamp ms, tùy chọn).
   * @param sig Chữ ký URL ảnh (tùy chọn).
   * @returns Stream dữ liệu ảnh và content-type tương ứng.
   */
  async getStudentPhoto(
    mssv: string,
    classId: string,
    userId?: string,
    exp?: number,
    sig?: string,
  ): Promise<StudentPhotoResult> {
    if (!classId) {
      throw new NotFoundException('Thiếu classId khi lấy ảnh sinh viên');
    }

    // Nhánh private: user đăng nhập thì kiểm tra quyền sở hữu lớp.
    if (userId) {
      const classOwned = await this.classesRepository.exists({ where: { id: classId, userId } });
      if (!classOwned) {
        throw new ForbiddenException('Bạn không có quyền xem ảnh sinh viên của lớp này');
      }
    } else {
      // Nhánh public: bắt buộc URL ảnh phải có chữ ký hợp lệ và chưa hết hạn.
      const isValidSignature = verifyPhotoSignature(mssv, classId, exp ?? NaN, sig ?? '');
      if (!isValidSignature) {
        throw new ForbiddenException('URL ảnh không hợp lệ hoặc đã hết hạn');
      }
    }

    const student = await this.studentsRepository.findOne({ where: { mssv, classId } });
    if (!student) {
      throw new NotFoundException('Không tìm thấy sinh viên trong lớp này');
    }

    try {
      const url = `https://api.toolhub.app/hust/AnhDaiDien?mssv=${mssv}`;

      // Gọi API toolhub và yêu cầu trả về dữ liệu dạng stream
      const response = await axios.get(url, {
        responseType: 'stream',
      });

      // Trả về stream dữ liệu (chính là cái ảnh)
      await this.studentsRepository.update(
        { id: student.id },
        { photoStatus: PhotoStatus.LOADED },
      );

      return {
        stream: response.data,
        contentType: response.headers['content-type'] ?? 'image/jpeg',
      };
    } catch (error) {
      // Fallback ảnh placeholder để frontend luôn nhận được URL/response hợp lệ
      console.error(`Could not fetch photo for MSSV: ${mssv}`, error.message);
      await this.studentsRepository.update(
        { id: student.id },
        { photoStatus: PhotoStatus.NOT_FOUND },
      );
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="#6c757d"/><text x="120" y="108" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" fill="#ffffff">No Photo</text><text x="120" y="140" text-anchor="middle" font-size="14" font-family="Arial, sans-serif" fill="#ffffff">${mssv}</text></svg>`;
      return {
        stream: Readable.from(Buffer.from(svg, 'utf-8')),
        contentType: 'image/svg+xml; charset=utf-8',
      };
    }
  }
}
