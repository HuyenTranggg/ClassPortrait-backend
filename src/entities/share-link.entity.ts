import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ClassEntity } from './class.entity';

@Entity('share_links')
export class ShareLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Quan hệ về lớp học sở hữu link chia sẻ.
  @ManyToOne(() => ClassEntity, (cls) => cls.shareLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  classEntity!: ClassEntity;

  // Mỗi lớp chỉ có tối đa một link chia sẻ.
  @Column({ name: 'class_id', type: 'uuid', unique: true })
  classId!: string;

  // Token công khai dùng trong URL /classes/shared/:token.
  @Column({ type: 'varchar', length: 255, unique: true })
  token!: string;

  // Cờ bật/tắt link chia sẻ mà không cần xóa bản ghi.
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  // Mốc hết hạn của link; null nghĩa là không hết hạn.
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

