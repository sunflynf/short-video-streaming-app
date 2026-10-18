/**
 * Field names behind a P2002 unique violation. Prisma 7 with a driver adapter reports only
 * the index name (e.g. `User_email_key`) under `driverAdapterError`, not `meta.target`.
 */
export function uniqueViolationFields(meta: Record<string, unknown> | undefined): string[] {
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];

  const cause = (meta?.driverAdapterError as { cause?: Record<string, unknown> } | undefined)
    ?.cause;
  const constraint = cause?.constraint as { fields?: string[]; index?: string } | undefined;
  if (constraint?.fields?.length) return constraint.fields;

  const table = typeof cause?.table === 'string' ? cause.table : undefined;
  const index = constraint?.index;
  if (table && index?.startsWith(`${table}_`) && index.endsWith('_key')) {
    return index.slice(table.length + 1, -'_key'.length).split('_');
  }
  return [];
}
