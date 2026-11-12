import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(PHONE, { message: 'Enter a valid phone number.' })
  phone?: string | null;
}

export class AddressDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName: string;

  @Transform(trim)
  @Matches(PHONE, { message: 'Enter a valid phone number.' })
  phone: string;

  @Transform(trim)
  @IsString()
  @Length(3, 200)
  line1: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  line2?: string | null;

  @Transform(trim)
  @IsString()
  @Length(2, 100)
  city: string;

  @Transform(trim)
  @IsString()
  @Length(2, 100)
  state: string;

  /** Six-digit Indian PIN code. */
  @Transform(trim)
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Enter a valid 6-digit pincode.' })
  pincode: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  @IsString()
  @Length(8, 72)
  newPassword: string;
}
