export type PreplanillaTeamSelection = {
  selectedPlayerIds: string[]
  jerseyByPlayerId: Record<string, number>
  starters: string[]
  captainId: string | null
  confirmed: boolean
}

export type RosterPlayer = { id: string; team_id: string; jersey_number: number }

export function snapshotTeamNumbers<T extends PreplanillaTeamSelection>(
  state: T,
  roster: readonly { id: string; jerseyNumber: number }[],
): T {
  const playersById = new Map(roster.map((player) => [player.id, player]))
  const numbers = state.selectedPlayerIds.map((id) => {
    const player = playersById.get(id)
    if (!player) throw new Error("Hay un jugador seleccionado que ya no pertenece al equipo.")
    return [id, state.jerseyByPlayerId[id] ?? player.jerseyNumber] as const
  })
  return { ...state, jerseyByPlayerId: Object.fromEntries(numbers) }
}

export function validateTeamSelection(
  state: PreplanillaTeamSelection,
  teamId: string,
  label: string,
  rosterById: ReadonlyMap<string, RosterPlayer>,
): { error: string; status: number } | null {
  const selected = new Set(state.selectedPlayerIds)
  const starters = new Set(state.starters)
  if (!state.confirmed || selected.size < 5 || selected.size !== state.selectedPlayerIds.length ||
    starters.size !== 5 || state.starters.length !== 5 ||
    [...starters].some((id) => !selected.has(id)) ||
    !state.captainId || !starters.has(state.captainId)) {
    return { error: `Completá y confirmá cinco iniciales y el capitán del equipo ${label}.`, status: 400 }
  }
  if ([...selected, ...Object.keys(state.jerseyByPlayerId)].some((id) => rosterById.get(id)?.team_id !== teamId)) {
    return { error: `Hay jugadores del equipo ${label} que no pertenecen al partido.`, status: 400 }
  }
  const numbers = state.selectedPlayerIds.map((id) =>
    state.jerseyByPlayerId[id] ?? rosterById.get(id)!.jersey_number)
  if (new Set(numbers).size !== numbers.length) {
    return { error: `Hay números repetidos entre los jugadores del equipo ${label}.`, status: 400 }
  }
  if (Object.entries(state.jerseyByPlayerId).some(([id, number]) => rosterById.get(id)?.jersey_number !== number)) {
    return { error: `Los dorsales del equipo ${label} aún no están guardados en la base. Volvé a intentar el envío.`, status: 409 }
  }
  return null
}
