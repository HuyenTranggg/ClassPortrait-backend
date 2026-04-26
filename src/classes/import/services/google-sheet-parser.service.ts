import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GoogleSheetParserService {
  async downloadGoogleSheetCsvBuffer(googleSheetUrl: string): Promise<Buffer> {
    const { spreadsheetId, gid } = this.parseGoogleSheetLink(googleSheetUrl);
    const csvExportUrl = this.buildGoogleSheetCsvExportUrl(spreadsheetId, gid);

    try {
      const response = await axios.get<ArrayBuffer>(csvExportUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new BadRequestException(
          'Không thể truy cập Google Sheet dưới dạng CSV. Vui lòng chia sẻ sheet ở chế độ có thể xem bằng link.',
        );
      }

      return Buffer.from(response.data);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Không thể tải dữ liệu từ Google Sheet. Vui lòng kiểm tra link và quyền truy cập.');
    }
  }

  private parseGoogleSheetLink(googleSheetUrl: string): { spreadsheetId: string; gid: string } {
    const normalizedUrl = googleSheetUrl.trim();
    if (!normalizedUrl) {
      throw new BadRequestException('URL Google Sheet không được để trống');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      throw new BadRequestException('URL Google Sheet không hợp lệ');
    }

    if (parsedUrl.hostname !== 'docs.google.com') {
      throw new BadRequestException('Chi ho tro URL thuoc domain docs.google.com');
    }

    const match = parsedUrl.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = match?.[1];
    if (!spreadsheetId) {
      throw new BadRequestException('Không tìm thấy spreadsheetId trong URL Google Sheet');
    }

    const gid = parsedUrl.searchParams.get('gid')?.trim() || '0';
    return { spreadsheetId, gid };
  }

  private buildGoogleSheetCsvExportUrl(spreadsheetId: string, gid: string): string {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }
}
