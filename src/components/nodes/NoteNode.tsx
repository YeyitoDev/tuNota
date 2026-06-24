import { memo, useEffect, useRef, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { GripVertical, Lightbulb, Trash2 } from 'lucide-react'
import { updateBlock } from '@/lib/db'
import { cn } from '@/lib/utils'
import type { Block, IdeaContent, TextContent } from '@/types'

export interface NoteNodeData {
  block: Block
  onDelete: (id: string) => void
  onResizeEnd: (id: string, width: number, height: number) => void
}

function NoteNodeImpl({ data, selected }: NodeProps) {
  const { block, onDelete, onResizeEnd } = data as unknown as NoteNodeData
  const isIdea = block.type === 'idea'
  const initial = (block.content as TextContent | IdeaContent)?.text ?? ''
  const [text, setText] = useState(initial)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (initial === '') taRef.current?.focus()
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persist(next: string) {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      updateBlock(block.id, { content: { text: next } })
    }, 350)
  }

  return (
    <div className="group h-full w-full">
      <NodeResizer
        isVisible={!!selected}
        minWidth={160}
        minHeight={88}
        lineClassName="!border-sage/70"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-sage !bg-card"
        onResizeEnd={(_, p) => onResizeEnd(block.id, p.width, p.height)}
      />
      <div
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded-xl border transition-shadow',
          selected ? 'shadow-cozy' : 'shadow-soft',
          isIdea
            ? 'border-ocre/40 bg-[hsl(36_72%_93%)]'
            : 'border-border bg-card',
        )}
      >
        <div className="node-drag-handle flex cursor-grab items-center gap-1 px-2 py-1 active:cursor-grabbing">
          {isIdea ? (
            <Lightbulb className="h-3.5 w-3.5 text-ocre" />
          ) : (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/70" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {isIdea ? 'Idea' : 'Nota'}
          </span>
          <button
            onClick={() => onDelete(block.id)}
            className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            persist(e.target.value)
          }}
          onBlur={() => {
            if (timer.current) window.clearTimeout(timer.current)
            updateBlock(block.id, { content: { text } })
          }}
          placeholder={isIdea ? 'Tu idea r\u00e1pida...' : 'Escribe...'}
          className="nodrag nowheel h-full w-full resize-none bg-transparent px-3 pb-3 pt-0.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  )
}

export const NoteNode = memo(NoteNodeImpl)
