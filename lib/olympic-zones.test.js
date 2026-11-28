const test = require("node:test")
const assert = require("node:assert/strict")
const {
  selectOlympicPlayoffTeams, sortOlympicStandings, splitOlympicZones, matchPairKey, unplayedCrossZonePairs,
} = require("./olympic-zones.ts")

const row = (teamId, points, diff) => ({ teamId, points, pointsFor: 100 + diff, pointsAgainst: 100 })
const game = (homeTeamId, awayTeamId, homeScore, awayScore) => ({
  homeTeamId, awayTeamId, homeScore, awayScore, status: "finalizado",
})

test("six winners means three of each zone; combined rankings keep their points and differential", () => {
  const zoneA = [row("Moro", 11, 74), row("Defensores", 10, 20), row("San Martin", 10, 43), row("Galacticos", 9, -45)]
  const zoneB = [row("Villa", 12, 105), row("Ben10", 11, 46), row("Salta", 10, 11), row("Lanadrid", 9, -32)]
  const split = splitOlympicZones([zoneA, zoneB], 6, [game("Defensores", "San Martin", 53, 48)])
  assert.deepEqual(split.perZone, [3, 3])
  assert.deepEqual(split.winners.map((r) => r.teamId), ["Villa", "Moro", "Ben10", "Defensores", "San Martin", "Salta"])
  assert.equal(split.winners.find((r) => r.teamId === "Moro").pointsFor - split.winners.find((r) => r.teamId === "Moro").pointsAgainst, 74)
})

test("without head-to-head, tied teams use point differential", () => {
  assert.deepEqual(sortOlympicStandings([row("A", 10, 4), row("B", 10, 20)], []).map((r) => r.teamId), ["B", "A"])
})

test("an odd qualification gives the extra place to the stronger next team", () => {
  const result = splitOlympicZones(
    [[row("A1", 12, 5), row("A2", 9, 15), row("A3", 8, 4)],
      [row("B1", 11, 4), row("B2", 9, 24), row("B3", 8, 3)]],
    3,
    [],
  )
  assert.deepEqual(result.perZone, [1, 2])
  assert.deepEqual(result.winners.map((r) => r.teamId), ["A1", "B1", "B2"])
})

test("playoff quotas take exactly the best from each zone and seed them by carried standings", () => {
  const ganadores = sortOlympicStandings(
    [row("G1", 12, 15), row("G3", 10, 40), row("G2", 10, 5)],
    [game("G2", "G3", 51, 49)],
  )
  const perdedores = [row("P1", 11, 20), row("P2", 9, 10)]
  const selected = selectOlympicPlayoffTeams(ganadores, perdedores, 2, 1)
  assert.deepEqual(selected.map((r) => r.teamId), ["G1", "G2", "P1"])
  assert.equal(selected[0].pointsFor - selected[0].pointsAgainst, 15)
  assert.throws(() => selectOlympicPlayoffTeams(ganadores, perdedores, 4, 1))
  assert.throws(() => selectOlympicPlayoffTeams(ganadores, perdedores, 1, 0))
})

test("five G and three P preserve zone ranks: Villa is first and Peñarol eighth", () => {
  const ganadores = [
    row("Villa 20", 12, 125), row("Moro Bulls", 11, 74), row("BEN10", 11, 46),
    row("Salta Nets", 10, 91), row("Defensores", 10, 20),
  ]
  const perdedores = [
    row("Lamadrid", 9, -32), row("Galacticos", 9, -45), row("Peñarol", 9, 21),
  ]
  const selected = selectOlympicPlayoffTeams(ganadores, perdedores, 5, 3)
  assert.deepEqual(selected.map((r) => r.teamId), [
    "Villa 20", "Moro Bulls", "BEN10", "Salta Nets", "Defensores",
    "Lamadrid", "Galacticos", "Peñarol",
  ])
})

test("only missing cross-zone pairs are created, once per round per team", () => {
  const played = new Set([matchPairKey("B1", "A1")])
  const pairs = unplayedCrossZonePairs(["A1", "A2", "A3"], ["B1", "B2", "B3"], played)
  assert.equal(pairs.length, 8)
  assert.equal(pairs.some((p) => p.home === "A1" && p.away === "B1"), false)
  for (let round = 1; round <= 3; round++) {
    const teams = pairs.filter((p) => p.round === round).flatMap((p) => [p.home, p.away])
    assert.equal(new Set(teams).size, teams.length)
  }
})

test("unequal original zones still schedule at most one game per team per round", () => {
  const pairs = unplayedCrossZonePairs(["A1", "A2", "A3", "A4"], ["B1", "B2", "B3"], new Set())
  assert.equal(pairs.length, 12)
  for (let round = 1; round <= 4; round++) {
    const teams = pairs.filter((p) => p.round === round).flatMap((p) => [p.home, p.away])
    assert.equal(new Set(teams).size, teams.length)
  }
})
