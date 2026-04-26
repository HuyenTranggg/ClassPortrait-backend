import { Injectable } from '@nestjs/common';
import { ParsedImportData } from '../import.types';
import { SourceType } from '../entities/import-history.entity';
import { FileImportParserService } from './file-import-parser.service';
import { GoogleSheetParserService } from './google-sheet-parser.service';

@Injectable()
export class ImportParserService {
  constructor(
    private readonly fileImportParserService: FileImportParserService,
    private readonly googleSheetParserService: GoogleSheetParserService,
  ) {}

  inferSourceType(fileExtension?: string): SourceType {
    return this.fileImportParserService.inferSourceType(fileExtension);
  }

  async parseFile(file: Express.Multer.File): Promise<{ parsedData: ParsedImportData; sourceType: SourceType }> {
    return this.fileImportParserService.parseFile(file);
  }

  async parseGoogleSheet(googleSheetUrl: string): Promise<ParsedImportData> {
    const csvBuffer = await this.googleSheetParserService.downloadGoogleSheetCsvBuffer(googleSheetUrl);
    return this.fileImportParserService.parseCsvBuffer(csvBuffer);
  }
}
