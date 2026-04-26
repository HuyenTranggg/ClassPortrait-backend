import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { ParsedImportData } from '../import.types';
import { SourceType } from '../entities/import-history.entity';

@Injectable()
export class FileImportParserService {
  private cleanCellValue(value: unknown): string {
    return String(value ?? '').trim();
  }

  private detectHeaderRow(rawRows: unknown[][]): number {
    const limit = Math.min(rawRows.length, 10);
    for (let index = 0; index < limit; index += 1) {
      const row = rawRows[index] ?? [];
      const nonEmptyCount = row.filter((cell) => this.cleanCellValue(cell).length > 0).length;
      if (nonEmptyCount >= 2) {
        return index;
      }
    }
    return 0;
  }

  inferSourceType(fileExtension?: string): SourceType {
    switch ((fileExtension ?? '').toLowerCase()) {
      case 'xlsx':
      case 'xls':
      case 'csv':
      case 'json':
      default:
        return SourceType.EXCEL;
    }
  }

  async parseFile(file: Express.Multer.File): Promise<{ parsedData: ParsedImportData; sourceType: SourceType }> {
    if (!file) {
      throw new BadRequestException('Không có file nào được upload');
    }

    const fileExtension = file.originalname.split('.').pop()?.toLowerCase();

    let parsedData: ParsedImportData;
    switch (fileExtension) {
      case 'xlsx':
      case 'xls':
        parsedData = await this.parseExcelFile(file.buffer);
        break;
      case 'csv':
        parsedData = await this.parseCsvFile(file.buffer);
        break;
      case 'json':
        parsedData = this.parseJsonFile(file.buffer);
        break;
      default:
        throw new BadRequestException('Định dạng file không được hỗ trợ. Vui lòng sử dụng .xlsx, .csv hoặc .json');
    }

    return {
      parsedData,
      sourceType: this.inferSourceType(fileExtension),
    };
  }

  async parseCsvBuffer(buffer: Buffer): Promise<ParsedImportData> {
    return this.parseCsvFile(buffer);
  }

  private async parseExcelFile(buffer: Buffer): Promise<ParsedImportData> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('File Excel không có sheet dữ liệu');
    }

    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });

    const headerRowIndex = this.detectHeaderRow(matrix);
    const rawHeaders = matrix[headerRowIndex] ?? [];
    const headers = rawHeaders
      .map((cell, index) => this.cleanCellValue(cell) || `Column ${index + 1}`)
      .map((header) => header.trim());

    const rows: Array<Record<string, any> & { __rowNumber: number }> = [];
    for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const sourceRow = matrix[rowIndex] ?? [];
      const rowObject: Record<string, any> & { __rowNumber: number } = {
        __rowNumber: rowIndex + 1,
      };

      headers.forEach((header, cellIndex) => {
        rowObject[header] = sourceRow[cellIndex];
      });

      rows.push(rowObject);
    }

    return {
      rows,
      headers,
      sourceType: SourceType.EXCEL,
    };
  }

  private async parseCsvFile(buffer: Buffer): Promise<ParsedImportData> {
    return new Promise((resolve, reject) => {
      const results: Array<Record<string, any> & { __rowNumber: number }> = [];
      const headersSet = new Set<string>();
      const stream = Readable.from(buffer);
      let dataRowIndex = 0;

      stream
        .pipe(csvParser())
        .on('data', (data) => {
          dataRowIndex += 1;
          const row: Record<string, any> & { __rowNumber: number } = {
            __rowNumber: dataRowIndex + 1,
          };

          Object.entries(data).forEach(([key, value]) => {
            const cleanedKey = this.cleanCellValue(key);
            headersSet.add(cleanedKey);
            row[cleanedKey] = value;
          });

          results.push(row);
        })
        .on('end', () =>
          resolve({
            rows: results,
            headers: Array.from(headersSet),
            sourceType: SourceType.EXCEL,
          }),
        )
        .on('error', (error) => reject(error));
    });
  }

  private parseJsonFile(buffer: Buffer): ParsedImportData {
    const jsonString = buffer.toString('utf-8');
    const data = JSON.parse(jsonString);
    const list = Array.isArray(data) ? data : [data];
    const rows: Array<Record<string, any> & { __rowNumber: number }> = [];
    const headersSet = new Set<string>();

    list.forEach((item, index) => {
      const row: Record<string, any> & { __rowNumber: number } = {
        __rowNumber: index + 1,
      };

      if (item && typeof item === 'object') {
        Object.entries(item).forEach(([key, value]) => {
          const cleanedKey = this.cleanCellValue(key);
          headersSet.add(cleanedKey);
          row[cleanedKey] = value;
        });
      }

      rows.push(row);
    });

    return {
      rows,
      headers: Array.from(headersSet),
      sourceType: SourceType.EXCEL,
    };
  }
}
