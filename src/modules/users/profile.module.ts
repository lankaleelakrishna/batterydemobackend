import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../../database/entities/address.entity';
import { User } from '../../database/entities/user.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Address])],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
