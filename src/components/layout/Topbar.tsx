import { useLiveQuery } from 'dexie-react-hooks'
import { MousePointerClick, Sparkles } from 'lucide-react'
import { db, renameNote } from '@/lib/db'
import { useUIStore } from '@/store/useUIStore'
import { EditableLabel } from '@/components/ui/editable-label'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/utils'

export function Topbar() {
  const currentNoteId = useUIStore((s) => s.currentNoteId)
  const note = useLiveQuery(
    () => (currentNoteId ? db.notes.get(currentNoteId) : undefined),
    [currentNoteId],
  )
  const section = useLiveQuery(
    () => (note ? db.sections.get(note.sectionId) : undefined),
    [note?.sectionId],
  )
  const notebook = useLiveQuery(
    () => (section ? db.notebooks.get(section.notebookId) : undefined),
    [section?.notebookId],
  )

  return (
    <header className="flex items-center gap-3 border-b border-border bg-card/70 px-5 py-3 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {notebook && (
            <span className="truncate">
              {notebook.emoji} {notebook.name}
            </span>
          )}
          {section && <span className="opacity-40">/</span>}
          {section && <span className="truncate">{section.name}</span>}
        </div>
        {note ? (
          <EditableLabel
            value={note.title}
            onSubmit={(v) => renameNote(note.id, v)}
            className="block truncate font-serif text-xl font-semibold text-foreground"
          />
        ) : (
          <div className="font-serif text-xl font-semibold text-muted-foreground">
            tuNota
          </div>
        )}
      </div>

      <div className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground md:flex">
        <MousePointerClick className="h-3.5 w-3.5" />
        Click = nota \u00b7 Ctrl+Click = idea
      </div>

      {note && (
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:block">
          editado {formatRelative(note.updatedAt)}
        </span>
      )}

      <Button variant="outline" size="sm" disabled className="gap-1.5">
        <Sparkles className="h-4 w-4 text-ocre" /> IA (pronto)
      </Button>
    </header>
  )
}
