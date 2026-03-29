import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ClassEntity } from './class.entity';

@Entity('share_links')
export class ShareLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ClassEntity, (cls) => cls.shareLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  classEntity!: ClassEntity;

  @Column({ name: 'class_id', type: 'uuid', unique: true })
  classId!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  token!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

