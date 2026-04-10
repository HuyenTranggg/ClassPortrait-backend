import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AttendanceStatus } from '../../entities/attendance.entity';

export class SetAttendanceStatusDto {
  @ApiProperty({
    enum: ['present', 'absent'],
    example: 'present',
    description: 'Trang thai diem danh cua sinh vien',
  })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}
