// TypeORM's deep-partial insert type rejects `unknown` and recurses without end on a JSON
// type, so JSON columns cannot pass it. Rows are typed where they are built; only this check is skipped.
export function asInsertable<T>(row: T): never {
  return row as never;
}

export function isDuplicateKeyError(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string } } | null)?.driverError;
  return driverError?.code === 'ER_DUP_ENTRY';
}
