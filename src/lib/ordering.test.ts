// Standings screen (spec §8.5): "own person appears first" — see ordering.ts for why this is a
// single generic helper shared by the radar chips, the radar's selected-people list, and the
// ribbon rows, rather than three copies of the same hoist.
import { describe, expect, it } from 'vitest'
import { ownPersonFirst } from './ordering'

interface Person {
  id: string
  name: string
}

const byId = (person: Person) => person.id

describe('ownPersonFirst', () => {
  it('moves the own person to index 0 and keeps everyone else in their existing relative order', () => {
    const people: Person[] = [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Carol' },
      { id: 'd', name: 'Dave' },
    ]

    const result = ownPersonFirst(people, 'c', byId)

    expect(result.map((p) => p.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('is a no-op (aside from returning a new array) when the own person is already first', () => {
    const people: Person[] = [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]

    const result = ownPersonFirst(people, 'a', byId)

    expect(result.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('leaves the array unchanged when the own person is absent from the list', () => {
    const people: Person[] = [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Carol' },
    ]

    const result = ownPersonFirst(people, 'not-in-list', byId)

    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('leaves the array unchanged when ownUserId is null or undefined', () => {
    const people: Person[] = [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]

    expect(ownPersonFirst(people, null, byId).map((p) => p.id)).toEqual(['a', 'b'])
    expect(ownPersonFirst(people, undefined, byId).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('returns an empty array unchanged, without crashing, when given an empty list', () => {
    const result = ownPersonFirst<Person>([], 'a', byId)

    expect(result).toEqual([])
  })

  it('does not mutate the input array', () => {
    const people: Person[] = [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Carol' },
    ]
    const original = [...people]

    ownPersonFirst(people, 'c', byId)

    expect(people).toEqual(original)
  })

  it('works on plain strings (the radar\'s selectedIds shape), using the identity function', () => {
    const ids = ['a', 'b', 'c']

    const result = ownPersonFirst(ids, 'b', (id) => id)

    expect(result).toEqual(['b', 'a', 'c'])
  })
})
