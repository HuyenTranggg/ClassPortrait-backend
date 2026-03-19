import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { ClassEntity } from './class.entity';

export enum PhotoStatus {
  PENDING = 'pending',
  LOADED = 'loaded',
  NOT_FOUND = 'not_found',
}

@Entity('students')
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

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName!: string | null;

  @Column({
    name: 'photo_status',
    type: 'enum',
    enum: PhotoStatus,
    enumName: 'photo_status_enum',
    default: PhotoStatus.PENDING,
  })
  photoStatus!: PhotoStatus;
}

