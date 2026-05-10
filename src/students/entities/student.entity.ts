import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn, Unique } from 'typeorm';
import { ClassEntity } from '../../classes/entities/class.entity';
import { AttendanceEntity } from '../../classes/attendance/entities/attendance.entity';

export enum PhotoStatus {
  PENDING = 'pending',
  LOADED = 'loaded',
  NOT_FOUND = 'not_found',
}

@Entity('students')
@Unique(['classId', 'mssv', 'classCode'])
export class StudentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ClassEntity, (cls) => cls.students, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  classEntity!: ClassEntity;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @Column({ type: 'varchar', length: 50 })
  mssv!: string;

  @Column({ name: 'import_order', type: 'int', default: 0 })
  importOrder!: number;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({
    name: 'photo_status',
    type: 'enum',
    enum: PhotoStatus,
    enumName: 'photo_status_enum',
    default: PhotoStatus.PENDING,
  })
  photoStatus!: PhotoStatus;

  @Column({ name: 'class_code', type: 'varchar', length: 50 })
  classCode!: string;

  @Column({ name: 'class_name', type: 'varchar', length: 255, nullable: true })
  className!: string | null;

  @Column({ name: 'gender', type: 'varchar', length: 10, nullable: true })
  gender!: string | null;

  @Column({ name: 'dob', type: 'date', nullable: true })
  dob!: Date | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @OneToMany(() => AttendanceEntity, (attendance) => attendance.studentEntity)
  attendances!: AttendanceEntity[];
}
