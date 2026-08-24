// Drag-to-reorder list for People and Rules (spec §8.7). Built on the Pointer Events API, which
// unifies mouse and touch input in one event stream — spec is explicit that this "must work with
// touch, not just mouse," and Pointer Events is the one API that covers both without a library.
// Up/down buttons are offered alongside the drag handle as an equivalent, keyboard-reachable way
// to do the same thing — a physical iPhone still benefits from having a fallback that needs no
// precise gesture.
import {
  useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { RADIUS, type ThemeSurfaces } from '../../theme'

export interface ReorderableItem {
  id: string
}

interface ReorderableListProps<T extends ReorderableItem> {
  theme: ThemeSurfaces
  items: T[]
  /** Fixed row height in px — used to translate drag distance into a target index. */
  rowHeight: number
  renderItem: (item: T, index: number) => ReactNode
  /** Called with the full new id order once a drag or button move settles. */
  onReorder: (orderedIds: string[]) => void
}

/** Generic drag-reorder shell. Renders `renderItem` for each row plus a handle + up/down pair. */
export function ReorderableList<T extends ReorderableItem>({
  theme, items, rowHeight, renderItem, onReorder,
}: ReorderableListProps<T>) {
  const [liveOrder, setLiveOrder] = useState<T[] | null>(null)
  const dragState = useRef<{ id: string; pointerId: number; startClientY: number; startIndex: number } | null>(null)

  const displayed = liveOrder ?? items

  function commitOrder(nextOrder: T[]) {
    setLiveOrder(null)
    onReorder(nextOrder.map((item) => item.id))
  }

  function moveByOffset(index: number, offset: number) {
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= items.length) return
    const next = [...items]
    const [moved] = next.splice(index, 1)
    next.splice(targetIndex, 0, moved)
    commitOrder(next)
  }

  function handlePointerDown(item: T, index: number) {
    return (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragState.current = {
        id: item.id, pointerId: event.pointerId, startClientY: event.clientY, startIndex: index,
      }
      setLiveOrder(items)
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const baseOrder = liveOrder ?? items

    // Target index is computed from the ORIGINAL start index plus total delta since pointer-down,
    // not incrementally — incremental deltas compound rounding error over a long drag.
    const deltaRows = Math.round((event.clientY - drag.startClientY) / rowHeight)
    const targetIndex = clamp(drag.startIndex + deltaRows, 0, baseOrder.length - 1)
    const currentIndex = baseOrder.findIndex((item) => item.id === drag.id)
    if (targetIndex === currentIndex) return

    const next = [...baseOrder]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(targetIndex, 0, moved)
    setLiveOrder(next)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragState.current = null
    commitOrder(liveOrder ?? items)
  }

  return (
    <div>
      {displayed.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2" style={{ minHeight: rowHeight }}>
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={handlePointerDown(item, index)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="flex items-center justify-center"
            style={{
              width: 26,
              height: rowHeight,
              flexShrink: 0,
              background: 'none',
              border: 'none',
              color: theme.muted,
              cursor: 'grab',
              touchAction: 'none',
            }}
          >
            <GripVertical size={16} />
          </button>

          <div className="flex-1 min-w-0">{renderItem(item, index)}</div>

          <div className="flex flex-col" style={{ flexShrink: 0 }}>
            <StepArrowButton
              theme={theme}
              direction="up"
              disabled={index === 0}
              onClick={() => moveByOffset(index, -1)}
            />
            <StepArrowButton
              theme={theme}
              direction="down"
              disabled={index === displayed.length - 1}
              onClick={() => moveByOffset(index, 1)}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function StepArrowButton({
  theme, direction, disabled, onClick,
}: {
  theme: ThemeSurfaces
  direction: 'up' | 'down'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === 'up' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      aria-label={direction === 'up' ? 'Move up' : 'Move down'}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center"
      style={{
        width: 22,
        height: 17,
        borderRadius: RADIUS.checkbox,
        background: 'none',
        border: 'none',
        color: disabled ? theme.hairline : theme.muted,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <Icon size={13} />
    </button>
  )
}
