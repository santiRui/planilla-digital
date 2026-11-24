// El servidor conserva el historial completo; en el dispositivo guardamos
// solo jugadas que aún pueden necesitar un reintento de sincronización.
export function eventsToBackUp<T extends { id: string }>(
  events: readonly T[],
  confirmedIds: ReadonlySet<string>,
  pendingIds: readonly string[],
): T[] {
  const pending = new Set(pendingIds)
  return events.filter((event) => pending.has(event.id) || !confirmedIds.has(event.id))
}
