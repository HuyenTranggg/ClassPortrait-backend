import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ClassEntity } from './class.entity';
import { ImportHistoryEntity } from './import-history.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  lastLoginAt!: Date | null;

  @OneToMany(() => ClassEntity, (cls) => cls.user)
  classes!: ClassEntity[];

  @OneToMany(() => ImportHistoryEntity, (history) => history.user)
  importHistories!: ImportHistoryEntity[];
}

