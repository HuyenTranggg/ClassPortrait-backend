import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ClassEntity } from '../../entities/class.entity';
import { UserEntity } from '../../../auth/entities/user.entity';

export enum SourceType {
  EXCEL = 'excel',
  GOOGLE_SHEET = 'google_sheet',
  ONEDRIVE = 'onedrive',
}

export enum ImportAction {
  CREATED = 'created',
  UPDATED = 'updated',
}

export type ImportClassFieldChangeSummary = {
  field: string;
  oldValue?: string;
  newValue?: string;
};

export type ImportChangesSummary = {
  classFieldChanges: ImportClassFieldChangeSummary[];
  studentChanges: {
    added: number;
    removed: number;
    renamed: number;
  };
};

@Entity('import_history')
export class ImportHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ClassEntity, (cls) => cls.importHistories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  classEntity!: ClassEntity;

  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => UserEntity, (user) => user.importHistories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({
    name: 'action',
    type: 'enum',
    enum: ImportAction,
    enumName: 'import_action_enum',
    default: ImportAction.CREATED,
  })
  action!: ImportAction;

  @Column({ name: 'duplicate_detected', type: 'boolean', default: false })
  duplicateDetected!: boolean;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: SourceType,
    enumName: 'source_type_enum',
  })
  sourceType!: SourceType;

  @Column({ name: 'source_name', type: 'varchar', length: 500 })
  sourceName!: string;

  @Column({ name: 'total_count', type: 'int' })
  totalCount!: number;

  @Column({ name: 'column_mapping', type: 'jsonb', nullable: true })
  columnMapping!: Record<string, any> | null;

  @Column({ name: 'changes_summary', type: 'jsonb', nullable: true })
  changesSummary!: ImportChangesSummary | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

