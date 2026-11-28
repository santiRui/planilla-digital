const test = require("node:test")
const assert = require("node:assert/strict")
const { gamesForKnockoutPhase, startingKnockoutPhase, seededBracket, readyNextRound } = require("./olympic-playoffs.ts")
const { selectOlympicPlayoffTeams } = require("./olympic-zones.ts")

test("the configured best-of is selected for each playoff phase", () => {
  const bestOf = { octavos: 3, cuartos: 5, semifinal: 3, final: 7 }
  for (const [phase, games] of Object.entries(bestOf)) {
    assert.equal(gamesForKnockoutPhase(phase, bestOf), games)
  }
  assert.throws(() => gamesForKnockoutPhase("octavos", { ...bestOf, octavos: 0 }))
  assert.throws(() => gamesForKnockoutPhase("final", { ...bestOf, final: 1.5 }))
})

test("the number of qualifiers selects final, semifinal, quarters or round of sixteen", () => {
  for (const [count, phase] of [[2, "final"], [3, "semifinal"], [4, "semifinal"], [5, "cuartos"],
    [8, "cuartos"], [9, "octavos"], [14, "octavos"], [16, "octavos"]]) {
    assert.equal(startingKnockoutPhase(count), phase)
  }
  assert.throws(() => startingKnockoutPhase(17))
})

test("14 teams form eight ordered octavos series, with top two seeds advancing by bye", () => {
  const seeds = Array.from({ length: 14 }, (_, i) => `seed-${i + 1}`)
  const bracket = seededBracket(seeds)
  assert.equal(bracket.length, 8)
  assert.deepEqual(bracket.slice(0, 2), [
    { index: 1, home: "seed-1", away: null },
    { index: 2, home: "seed-8", away: "seed-9" },
  ])
  assert.deepEqual(bracket.filter((s) => !s.away).map((s) => s.home), ["seed-1", "seed-2"])
  assert.deepEqual(readyNextRound(bracket.map((s) => ({
    series_index: s.index, winner_team_id: s.away ? null : s.home,
  }))), [])
  assert.deepEqual(readyNextRound([
    { series_index: 1, winner_team_id: "seed-1" },
    { series_index: 2, winner_team_id: "seed-8" },
    ...bracket.slice(2).map((s) => ({ series_index: s.index, winner_team_id: null })),
  ]), [{ index: 1, home: "seed-1", away: "seed-8" }])
})

test("eight qualifiers create four series and advance neighboring winners only", () => {
  const bracket = seededBracket(Array.from({ length: 8 }, (_, i) => `s${i + 1}`))
  assert.deepEqual(bracket.map((s) => [s.home, s.away]), [
    ["s1", "s8"], ["s4", "s5"], ["s2", "s7"], ["s3", "s6"],
  ])
  assert.deepEqual(readyNextRound([
    { series_index: 1, winner_team_id: "s1" },
    { series_index: 2, winner_team_id: "s5" },
    { series_index: 3, winner_team_id: null },
    { series_index: 4, winner_team_id: "s6" },
  ]), [{ index: 1, home: "s1", away: "s5" }])
})

test("five winners and three losers make Villa-Peñarol and Moro-Galacticos, with the intended semifinal paths", () => {
  const standing = (teamId) => ({ teamId, points: 10, pointsFor: 100, pointsAgainst: 90 })
  const ganadores = ["Villa 20", "Moro Bulls", "BEN10", "Salta Nets", "Defensores"].map(standing)
  const perdedores = ["Lamadrid", "Galacticos", "Peñarol"].map(standing)
  const seeds = selectOlympicPlayoffTeams(ganadores, perdedores, 5, 3).map((row) => row.teamId)
  const bracket = seededBracket(seeds)
  assert.deepEqual(bracket.map((series) => [series.home, series.away]), [
    ["Villa 20", "Peñarol"],
    ["Salta Nets", "Defensores"],
    ["Moro Bulls", "Galacticos"],
    ["BEN10", "Lamadrid"],
  ])
  assert.deepEqual(readyNextRound(bracket.map((series) => ({
    series_index: series.index, winner_team_id: series.home,
  }))), [
    { index: 1, home: "Villa 20", away: "Salta Nets" },
    { index: 2, home: "Moro Bulls", away: "BEN10" },
  ])
})

test("every supported total has unique entrants, correct byes and a complete path to the final", () => {
  for (let count = 2; count <= 16; count++) {
    const teams = Array.from({ length: count }, (_, i) => `s${i + 1}`)
    const bracket = seededBracket(teams)
    assert.equal(bracket.length, 2 ** Math.ceil(Math.log2(count)) / 2)
    assert.equal(bracket.filter((series) => !series.away).length, bracket.length * 2 - count)
    assert.equal(new Set(bracket.flatMap((series) => series.away ? [series.home, series.away] : [series.home])).size, count)
    let round = bracket.map((series) => ({ series_index: series.index, winner_team_id: series.home }))
    while (round.length > 1) {
      const next = readyNextRound(round)
      assert.equal(next.length, round.length / 2)
      round = next.map((series) => ({ series_index: series.index, winner_team_id: series.home }))
    }
    assert.equal(round[0].winner_team_id, "s1")
  }
})
