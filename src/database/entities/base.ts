import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

export abstract class TimestampedEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

/** Postgres returns numeric columns as strings. This converts them to numbers. */
export const numericToNumber = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : Number(v)),
};
