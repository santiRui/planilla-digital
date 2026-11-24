const assert = require("node:assert/strict")
const test = require("node:test")
const { snapshotTeamNumbers, validateTeamSelection } = require("./preplanilla-state.ts")

const roster = Array.from({ length: 6 }, (_, index) => ({
  id: `player-${index + 1}`,
  team_id: "home",
  jersey_number: index + 10,
}))
const clientRoster = roster.map((player) => ({ id: player.id, jerseyNumber: player.jersey_number }))
const rosterById = () => new Map(roster.map((player) => [player.id, { ...player }]))
const state = () => ({
  confirmed: true,
  selectedPlayerIds: roster.map((player) => player.id),
  jerseyByPlayerId: {},
  starters: roster.slice(0, 5).map((player) => player.id),
  captainId: "player-1",
})

test("stores the number of every selected player, including unchanged numbers", () => {
  const selection = state()
  selection.jerseyByPlayerId = { "player-2": 99, "not-selected": 55 }
  const snapshot = snapshotTeamNumbers(selection, clientRoster)
  assert.deepEqual(snapshot.jerseyByPlayerId, {
    "player-1": 10, "player-2": 99, "player-3": 12,
    "player-4": 13, "player-5": 14, "player-6": 15,
  })
  assert.deepEqual(snapshot.starters, selection.starters)
  assert.equal(selection.jerseyByPlayerId["player-1"], undefined)
})

test("requires exactly five eligible starters and their captain", () => {
  const incomplete = state()
  incomplete.starters.pop()
  assert.equal(validateTeamSelection(incomplete, "home", "local", rosterById())?.status, 400)
  const wrongCaptain = state()
  wrongCaptain.captainId = "player-6"
  assert.equal(validateTeamSelection(wrongCaptain, "home", "local", rosterById())?.status, 400)
  const wrongTeam = state()
  assert.equal(validateTeamSelection(wrongTeam, "away", "visitante", rosterById())?.status, 400)
})

test("rejects duplicate or unsaved jerseys, then accepts the persisted selection", () => {
  const selection = state()
  const saved = snapshotTeamNumbers(selection, clientRoster)
  assert.equal(validateTeamSelection(saved, "home", "local", rosterById()), null)

  saved.jerseyByPlayerId["player-2"] = 10
  assert.match(validateTeamSelection(saved, "home", "local", rosterById()).error, /repetidos/)

  saved.jerseyByPlayerId["player-2"] = 99
  assert.equal(validateTeamSelection(saved, "home", "local", rosterById())?.status, 409)
  const updated = rosterById()
  updated.get("player-2").jersey_number = 99
  assert.equal(validateTeamSelection(saved, "home", "local", updated), null)
})
