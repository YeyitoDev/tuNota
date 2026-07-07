import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Leaf } from 'lucide-react'
import { NoteNode } from '@/components/nodes/NoteNode'
import { createBlock, db, deleteBlock, moveBlock, resizeBlock } from '@/lib/db'
import { useUIStore } from '@/store/useUIStore'
import type { Block } from '@/types'

const nodeTypes: NodeTypes = { text: NoteNode, idea: NoteNode }

export function Canvas() {
  const currentNoteId = useUIStore((s) => s.currentNoteId)
  const [nodes, setNodes] = useState<Node[]>([])
  const { screenToFlowPosition } = useReactFlow()

  const removeNode = useCallback((id: string) => {
    deleteBlock(id)
    setNodes((ns) => ns.filter((n) => n.id !== id))
  }, [])

  const persistResize = useCallback(
    (id: string, width: number, height: number) => {
      resizeBlock(id, width, height)
    },
    [],
  )

  const buildNode = useCallback(
    (b: Block): Node => ({
      id: b.id,
      type: b.type,
      position: { x: b.x, y: b.y },
      data: { block: b, onDelete: removeNode, onResizeEnd: persistResize },
      width: b.width,
      height: b.height,
      dragHandle: '.node-drag-handle',
    }),
    [removeNode, persistResize],
  )

  useEffect(() => {
    let active = true
    if (!currentNoteId) {
      setNodes([])
      return
    }
    db.blocks
      .where('noteId')
      .equals(currentNoteId)
      .toArray()
      .then((bs) => {
        if (active) setNodes(bs.map(buildNode))
      })
    return () => {
      active = false
    }
  }, [currentNoteId, buildNode])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === 'remove') deleteBlock(c.id)
    }
    setNodes((ns) => applyNodeChanges(changes, ns))
  }, [])

  const onPaneClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!currentNoteId) return
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const type = e.ctrlKey || e.metaKey ? 'idea' : 'text'
      createBlock(currentNoteId, type, pos.x - 8, pos.y - 8).then((b) =>
        setNodes((ns) => [...ns, buildNode(b)]),
      )
    },
    [currentNoteId, screenToFlowPosition, buildNode],
  )

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    moveBlock(node.id, node.position.x, node.position.y)
  }, [])

  if (!currentNoteId) {
    return (
      <div className="paper-texture flex h-full w-full flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage/15">
          <Leaf className="h-7 w-7 text-sage" />
        </span>
        <p className="max-w-xs font-serif text-lg text-foreground">
          Selecciona o crea una nota
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Tus ideas viven dentro de libros y secciones, como un cuaderno tranquilo.
        </p>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={onPaneClick}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={2.5}
      zoomOnDoubleClick={false}
      deleteKeyCode={['Backspace', 'Delete']}
      className="paper-texture"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={18}
        size={1}
        color="hsl(33, 20%, 80%)"
      />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.type === 'idea' ? 'hsl(34, 69%, 61%)' : 'hsl(12, 42%, 58%)')}
        maskColor="rgba(245, 239, 230, 0.55)"
        className="!rounded-xl !border !border-border !bg-card/80"
      />
    </ReactFlow>
  )
}
