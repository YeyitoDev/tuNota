import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { Canvas } from '@/components/canvas/Canvas'
import { ensureSeed } from '@/lib/db'
import { useUIStore } from '@/store/useUIStore'

export default function App() {
  const selectNote = useUIStore((s) => s.selectNote)

  useEffect(() => {
    ensureSeed().then((seed) => {
      if (seed && !useUIStore.getState().currentNoteId) {
        selectNote(seed.notebookId, seed.sectionId, seed.noteId)
      }
    })
  }, [selectNote])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="relative min-h-0 flex-1">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>
        </div>
      </main>
    </div>
  )
}
