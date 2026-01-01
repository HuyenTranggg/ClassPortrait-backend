import { Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { Stream } from 'stream';

@Injectable()
export class StudentsService {
  /**
   * Lấy ảnh sinh viên từ API Toolhub
   */
  async getStudentPhoto(mssv: string): Promise<Stream> {
    try {
      const url = `https://api.toolhub.app/hust/AnhDaiDien?mssv=${mssv}`;

      // Gọi API toolhub và yêu cầu trả về dữ liệu dạng stream
      const response = await axios.get(url, {
        responseType: 'stream',
      });

      // Trả về stream dữ liệu (chính là cái ảnh)
      return response.data;
    } catch (error) {
      // Nếu API toolhub báo lỗi (ví dụ sai MSSV), ném ra lỗi 404
      console.error(`Could not fetch photo for MSSV: ${mssv}`, error.message);
      throw new NotFoundException(`Không tìm thấy ảnh cho MSSV ${mssv}`);
    }
  }
}
