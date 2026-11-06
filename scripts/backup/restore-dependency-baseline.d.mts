import type { PGlite } from '@electric-sql/pglite'
export function reviewedGuardSql(fixture: unknown): string
export function installLocalRestoreCompatibility(db: PGlite): Promise<void>
export function seedLocalRestoreSubscription(db: PGlite, kioskId: string): Promise<void>
