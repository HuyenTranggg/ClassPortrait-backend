import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentEntity } from './entities/student.entity';
import { ClassEntity } from '../classes/entities/class.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StudentEntity, ClassEntity])],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
