import { describe, it, expect } from 'vitest'
import { SpendTracker } from '../src/spend-tracker.js'

describe('SpendTracker.unrecord', () => {
  it('removes the most recent matching entry', () => {
    const tracker = new SpendTracker()
    tracker.record(50)
    tracker.record(100)
    tracker.record(50)

    tracker.unrecord(50)
    // Should remove one 50-sat entry (the last one)
    expect(tracker.recentSpend()).toBe(150) // 50 + 100
  })

  it('does nothing for non-matching amount', () => {
    const tracker = new SpendTracker()
    tracker.record(50)
    tracker.unrecord(999)
    expect(tracker.recentSpend()).toBe(50)
  })

  it('does nothing for zero or negative amounts', () => {
    const tracker = new SpendTracker()
    tracker.record(50)
    tracker.unrecord(0)
    tracker.unrecord(-10)
    expect(tracker.recentSpend()).toBe(50)
  })

  it('restores budget after failed payment', () => {
    const tracker = new SpendTracker()
    const limit = 100

    // Simulate tryRecord then failed payment
    expect(tracker.tryRecord(80, limit)).toBe(true)
    tracker.unrecord(80)

    // Budget should be fully available again
    expect(tracker.tryRecord(80, limit)).toBe(true)
  })
})
