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
import { ImportHistoryEntity } from '../import/entities/import-history.entity';
import { ShareLinkEntity } from '../share/entities/share-link.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';

@Entity('classes')
export class ClassEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => UserEntity, (user) => user.classes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'class_code', type: 'varchar', length: 50 })
  classCode!: string;

  @Column({ name: 'course_code', type: 'varchar', length: 50, nullable: true })
  courseCode!: string | null;

  @Column({ name: 'course_name', type: 'varchar', length: 255, nullable: true })
  courseName!: string | null;

  @Column({ name: 'semester', type: 'varchar', length: 20, nullable: true })
  semester!: string | null;

  @Column({ name: 'department', type: 'varchar', length: 255, nullable: true })
  department!: string | null;

  @Column({ name: 'class_type', type: 'varchar', length: 20, nullable: true })
  classType!: string | null;

  @Column({ name: 'instructor', type: 'varchar', length: 255, nullable: true })
  instructor!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @OneToMany(() => StudentEntity, (student) => student.classEntity)
  students!: StudentEntity[];

  @OneToMany(() => ImportHistoryEntity, (history) => history.classEntity)
  importHistories!: ImportHistoryEntity[];

  @OneToMany(() => ShareLinkEntity, (share) => share.classEntity)
  shareLinks!: ShareLinkEntity[];

  @OneToMany(() => AttendanceEntity, (attendance) => attendance.classEntity)
  attendances!: AttendanceEntity[];
}

