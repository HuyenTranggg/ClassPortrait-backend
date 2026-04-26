import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClassesService } from '../classes.service';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { UpdateShareLinkDto } from './dto/update-share-link.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { extractUserId } from '../../common/utils/request-parser.util';

@ApiTags('class-share')
@ApiBearerAuth('bearer')
@Controller('classes')
export class ClassShareController {
  constructor(private readonly classesService: ClassesService) {}

  @Post(':id/share-link')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo link chia sẻ sổ ảnh cho lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 201, description: 'Tạo link chia sẻ thành công' })
  @ApiResponse({ status: 409, description: 'Lớp đã có link chia sẻ, cần dùng API cập nhật' })
  /**
   * Tạo link chia sẻ cho một lớp thuộc quyền sở hữu của người dùng hiện tại.
   * @param id ID lớp học.
   * @param body Dữ liệu tạo link (số ngày hết hạn, chế độ truy cập).
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Thông tin link chia sẻ vừa tạo.
   */
  async createShareLink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateShareLinkDto,
    @Req() req: any,
  ) {
    const userId = extractUserId(req);
    return this.classesService.createShareLink(id, userId, body.expiresInDays, body.requireLogin);
  }

  @Get(':id/share-link')
  @ApiOperation({ summary: 'Lấy link chia sẻ hiện tại của lớp' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Trả về link chia sẻ hiện tại (hoặc null nếu chưa có)' })
  /**
   * Lấy link chia sẻ hiện có của lớp.
   * @param id ID lớp học.
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Dữ liệu link chia sẻ hoặc null nếu lớp chưa được chia sẻ.
   */
  async getShareLink(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = extractUserId(req);
    return this.classesService.getShareLink(id, userId);
  }

  @Patch(':id/share-link')
  @ApiOperation({ summary: 'Cập nhật trạng thái/hạn dùng link chia sẻ' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Cập nhật link chia sẻ thành công' })
  /**
   * Cập nhật trạng thái hoạt động, hạn dùng hoặc chế độ truy cập của link chia sẻ.
   * @param id ID lớp học.
   * @param body Dữ liệu cập nhật link (isActive, expiresAt, requireLogin).
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Thông tin link sau khi cập nhật.
   */
  async updateShareLink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateShareLinkDto,
    @Req() req: any,
  ) {
    const userId = extractUserId(req);
    return this.classesService.updateShareLink(id, userId, {
      isActive: body.isActive,
      expiresAt: body.expiresAt,
      requireLogin: body.requireLogin,
    });
  }

  @Delete(':id/share-link')
  @ApiOperation({ summary: 'Xóa hẳn link chia sẻ' })
  @ApiParam({ name: 'id', description: 'ID của lớp' })
  @ApiResponse({ status: 200, description: 'Xóa link thành công' })
  /**
   * Thu hồi hoàn toàn link chia sẻ của lớp.
   * @param id ID lớp học.
   * @param req Request chứa thông tin người dùng đã xác thực.
   * @returns Kết quả thao tác thu hồi link.
   */
  async revokeShareLink(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    const userId = extractUserId(req);
    return this.classesService.revokeShareLink(id, userId);
  }

  @Public()
  @Get('shared/:id')
  @ApiOperation({ summary: 'Xem sổ ảnh qua link chia sẻ công khai' })
  @ApiParam({ name: 'id', description: 'ID của share link' })
  @ApiQuery({ name: 'exp', required: true, description: 'Unix timestamp milliseconds của thời điểm hết hạn' })
  @ApiQuery({ name: 'sig', required: true, description: 'Chữ ký HMAC-SHA256 của id + exp' })
  @ApiResponse({ status: 200, description: 'Trả về dữ liệu lớp và danh sách sinh viên' })
  /**
   * Trả về dữ liệu sổ ảnh cho người dùng truy cập bằng link đã ký.
   * Nếu link có requireLogin=true, cần đăng nhập trước (trả 401 nếu chưa).
   * @param id ID của share link.
   * @param exp Unix timestamp milliseconds biểu diễn thời điểm hết hạn.
   * @param sig Chữ ký HMAC đảm bảo id và exp không bị chỉnh sửa.
   * @param req Request hiện tại (có thể có JWT nếu người dùng đang đăng nhập).
   * @returns Thông tin lớp và danh sách sinh viên kèm URL ảnh đã ký.
   */
  async getSharedClass(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: any,
  ) {
    const viewerUserId: string | undefined = req.user?.userId ?? req.user?.sub ?? undefined;
    return this.classesService.getSharedClassBySignedLink(id, Number(exp), sig, viewerUserId);
  }
}
