const test = require("node:test")
const assert = require("node:assert/strict")
const { isStaffActorId, coachEjectedByTechnicals } = require("./mesa-foul-rules.ts")

test("two bench technicals do not eject coach and use staff identifiers", () => {
  assert.equal(isStaffActorId("bench-team-id"), true)
  assert.equal(isStaffActorId("tech-team-id"), true)
  assert.equal(isStaffActorId("player-id"), false)
  assert.equal(coachEjectedByTechnicals(0, 2), false)
})

test("coach ejection requires three bench, two coach, or two bench plus one coach", () => {
  for (const [coach, bench, ejected] of [
    [0, 3, true], [2, 0, true], [1, 2, true],
    [1, 1, false], [0, 2, false], [1, 0, false],
  ]) {
    assert.equal(coachEjectedByTechnicals(coach, bench), ejected)
  }
})
