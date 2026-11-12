import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { diskStorage } from 'multer';
import { join, resolve } from 'path';

export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED: Record<string, { ext: string; magic: number[] }> = {
  'image/jpeg': { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: '.webp', magic: [0x52, 0x49, 0x46, 0x46] },
};

/** Multer config for product images (field name `image`). Limited to 5 MB and three image types. */
export const productImageUpload: MulterOptions = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => {
      const name = `${Date.now()}-${randomBytes(8).toString('hex')}`;
      const type = _file.mimetype;
      cb(null, `${name}${ALLOWED[type]?.ext ?? '.bin'}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new BadRequestException({ code: 'UNSUPPORTED_IMAGE', message: 'Only JPEG, PNG or WebP images are allowed.' }), false);
  },
};

/** Checks the file's leading bytes match its declared type. Call after the upload is saved. */
export function imageMatchesMagicBytes(path: string, mimetype: string): boolean {
  const rule = ALLOWED[mimetype];
  if (!rule) return false;
  const head = readFileSync(path).subarray(0, 12);
  if (rule.magic.some((b, i) => head[i] !== b)) return false;
  if (mimetype === 'image/webp') return head.subarray(8, 12).toString('ascii') === 'WEBP';
  return true;
}
