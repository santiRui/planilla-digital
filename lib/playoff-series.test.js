const test = require("node:test")
const assert = require("node:assert/strict")
const { seriesResult, normalNextMatchups, normalOpeningSeries } = require("./playoff-series.ts")

const game = (home, away, homeScore, awayScore, status = "finalizado") => ({
  home_team_id: home, away_team_id: away, home_score: homeScore, away_score: awayScore, status,
})
const series = (index, winner) => ({ series_index: index, winner_team_id: winner })

test("two straight wins finish best-of-three; the unplayed third game does not change the winner", () => {
  const result = seriesResult(
    { home_team_id: "A", away_team_id: "B", best_of: 3 },
    [game("A", "B", 80, 70), game("B", "A", 64, 76), game("A", "B", null, null, "programado")],
  )
  assert.equal(result.homeWins, 2)
  assert.equal(result.winner, "A")
  assert.equal(result.finishedGames, 2)
  assert.equal(result.allPlayed, false)
})

test("split best-of-three needs the deciding game", () => {
  const result = seriesResult(
    { home_team_id: "A", away_team_id: "B", best_of: 3 },
    [game("A", "B", 80, 70), game("B", "A", 79, 67)],
  )
  assert.equal(result.winner, null)
})

test("a normal bracket advances A vs C after quarters 1 and 4, then both semifinals produce the final", () => {
  const quarters = [series(1, "A"), series(2, null), series(3, null), series(4, "C")]
  assert.deepEqual(normalNextMatchups("cuartos", quarters, new Set()), [
    { index: 1, home: "A", away: "C" },
  ])
  quarters[1].winner_team_id = "B"
  quarters[2].winner_team_id = "D"
  assert.deepEqual(normalNextMatchups("cuartos", quarters, new Set([1])), [
    { index: 2, home: "B", away: "D" },
  ])
  assert.deepEqual(normalNextMatchups("semifinal", [series(1, "A"), series(2, "B")], new Set()), [
    { index: 1, home: "A", away: "B" },
  ])
  assert.deepEqual(normalNextMatchups("semifinal", [series(1, "A"), series(2, "B")], new Set([1])), [])
})

test("finished tied games cannot be counted as losses", () => {
  assert.throws(() => seriesResult(
    { home_team_id: "A", away_team_id: "B", best_of: 3 },
    [game("A", "B", 60, 60)],
  ))
})

test("normal quarters keep four indexed series with eight, seven, six or five teams", () => {
  for (let count = 5; count <= 8; count++) {
    const ids = Array.from({ length: count }, (_, i) => `seed-${i + 1}`)
    const opening = normalOpeningSeries(ids, 8)
    assert.equal(opening.length, 4)
    assert.deepEqual(opening.map((row) => row.seriesIndex), [1, 2, 3, 4])
    assert.deepEqual(opening.filter((row) => row.winnerPreset).map((row) => row.home),
      ids.slice(0, 8 - count))
    assert.equal(opening[3].home, "seed-4")
    assert.equal(opening[3].away, "seed-5")
  }
  assert.throws(() => normalOpeningSeries(["A", "B", "C", "D"], 8))
})

test("normal semifinals with three teams keep a first-seed bye and create a final after the other result", () => {
  const opening = normalOpeningSeries(["A", "B", "C"], 4)
  assert.deepEqual(opening, [
    { home: "A", away: null, winnerPreset: "A", seriesIndex: 1 },
    { home: "B", away: "C", winnerPreset: null, seriesIndex: 2 },
  ])
  assert.deepEqual(normalNextMatchups("semifinal", [series(1, "A"), series(2, "C")], new Set()), [
    { index: 1, home: "A", away: "C" },
  ])
})
