import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AttendanceStatus } from '../../entities/attendance.entity';

export class ResetAttendanceDto {
  @ApiProperty({
    required: false,
    enum: ['absent'],
    example: 'absent',
    description: 'Trang thai reset cho toan bo lop, mac dinh absent',
  })
  @IsOptional()
  @IsIn(['absent'])
  status?: AttendanceStatus.ABSENT;
}
