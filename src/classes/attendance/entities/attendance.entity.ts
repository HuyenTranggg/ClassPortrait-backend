import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { ClassEntity } from '../../entities/class.entity';
import { StudentEntity } from '../../../students/entities/student.entity';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
}

@Entity('attendance')
@Unique(['classId', 'studentId'])
export class AttendanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ClassEntity, (cls) => cls.attendances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  classEntity!: ClassEntity;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => StudentEntity, (student) => student.attendances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  studentEntity!: StudentEntity;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceStatus,
    enumName: 'attendance_status_enum',
    default: AttendanceStatus.ABSENT,
  })
  status!: AttendanceStatus;

  @Column({ name: 'marked_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  markedAt!: Date;
}
