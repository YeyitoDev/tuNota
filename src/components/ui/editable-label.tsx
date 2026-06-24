import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onSubmit: (value: string) => void
  className?: string
  inputClassName?: string
}

export function EditableLabel({ value, onSubmit, className, inputClassName }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])

  function commit() {
    const v = draft.trim()
    if (v && v !== value) onSubmit(v)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={cn(
          'w-full rounded border border-input bg-card px-1.5 py-0.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring',
          inputClassName,
        )}
      />
    )
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      title="Doble click para renombrar"
      className={cn('cursor-text', className)}
    >
      {value || 'Sin t\u00edtulo'}
    </span>
  )
}
