const assert = require("node:assert/strict")
const test = require("node:test")
const { eventsToBackUp } = require("./planilla-local-backup.ts")

test("keeps unsent and in-flight plays but not confirmed history", () => {
  const events = [
    { id: "confirmed", type: "shot" },
    { id: "offline", type: "foul" },
    { id: "in-flight", type: "rebound" },
  ]
  assert.deepEqual(
    eventsToBackUp(events, new Set(["confirmed"]), ["offline"]),
    events.slice(1),
  )
})

test("never discards a queued retry even if its confirmation arrives later", () => {
  const event = { id: "pending", type: "free_throw" }
  assert.deepEqual(eventsToBackUp([event], new Set(["pending"]), ["pending"]), [event])
  assert.deepEqual(eventsToBackUp([event], new Set(["pending"]), []), [])
})

test("keeps all events when there is no server confirmation (offline or mock match)", () => {
  const events = Array.from({ length: 80 }, (_, i) => ({ id: `local-${i}` }))
  assert.deepEqual(eventsToBackUp(events, new Set(), []), events)
})
