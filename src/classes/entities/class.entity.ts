import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity';
import { StudentEntity } from '../../students/entities/student.entity';
import { ImportHistoryClassEntity } from '../import/entities/import-history-class.entity';
import { ShareLinkEntity } from '../share/entities/share-link.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';

@Entity('classes')
export class ClassEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'class_exam_code', type: 'varchar', length: 50, nullable: true })
  classExamCode!: string | null;

  @Column({ name: 'exam_date', type: 'date', nullable: true })
  examDate!: Date | null;

  @Column({ name: 'exam_room', type: 'varchar', length: 50, nullable: true })
  examRoom!: string | null;

  @Column({ name: 'exam_time', type: 'varchar', length: 20, nullable: true })
  examTime!: string | null;

  @Column({ name: 'exam_shift', type: 'varchar', length: 20, nullable: true })
  examShift!: string | null;

  @Column({ name: 'is_fallback', type: 'boolean', default: false })
  isFallback!: boolean;

  @Column({ name: 'semester', type: 'varchar', length: 20 })
  semester!: string;

  @Column({ name: 'course_code', type: 'varchar', length: 50 })
  courseCode!: string;

  @Column({ name: 'course_name', type: 'varchar', length: 255 })
  courseName!: string;

  @Column({ name: 'department', type: 'varchar', length: 255 })
  department!: string;

  @Column({ name: 'instructor', type: 'varchar', length: 255 })
  instructor!: string;

  @Column({ name: 'import_order', type: 'int', default: 0 })
  importOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @OneToMany(() => StudentEntity, (student) => student.classEntity)
  students!: StudentEntity[];

  // @OneToMany(() => ImportHistoryClassEntity, (ihc) => ihc.classEntity) // Not needed
  // importHistoryClasses!: ImportHistoryClassEntity[];

  @OneToMany(() => ShareLinkEntity, (share) => share.classEntity)
  shareLinks!: ShareLinkEntity[];

  @OneToMany(() => AttendanceEntity, (attendance) => attendance.classEntity)
  attendances!: AttendanceEntity[];
}
