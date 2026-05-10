import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, PrimaryColumn, JoinColumn } from 'typeorm';
import { ClassEntity } from '../../entities/class.entity';
import { ImportHistoryEntity } from './import-history.entity';

@Entity('import_history_classes')
export class ImportHistoryClassEntity {
  @PrimaryColumn({ name: 'import_history_id', type: 'uuid' })
  importHistoryId!: string;

  @PrimaryColumn({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  classEntity!: ClassEntity;

  @Column({ name: 'import_order_in_file', type: 'int' })
  importOrderInFile!: number;
}
