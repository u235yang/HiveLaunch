import { applyPatch, type Operation } from 'rfc6902'

/**
 * Apply JSON Patch operations with upsert semantics.
 * If a 'replace' operation fails because the path doesn't exist,
 * it falls back to an 'add' operation.
 */
export function applyUpsertPatch(target: object, ops: Operation[]): void {
  ops.forEach((op) => {
    const [error] = applyPatch(target, [op])

    if (op.op === 'replace' && error?.name === 'MissingError') {
      applyPatch(target, [{ ...op, op: 'add' }])
    }
  })
}
