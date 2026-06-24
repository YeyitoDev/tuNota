import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderPlus,
  Leaf,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  createNote,
  createNotebook,
  createSection,
  db,
  deleteNote,
  deleteNotebook,
  deleteSection,
  renameNote,
  renameNotebook,
  renameSection,
} from '@/lib/db'
import { useUIStore } from '@/store/useUIStore'
import { EditableLabel } from '@/components/ui/editable-label'
import { cn } from '@/lib/utils'
import type { Notebook, Section } from '@/types'

export function Sidebar() {
  const notebooks = useLiveQuery(() => db.notebooks.orderBy('order').toArray(), [])

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-secondary/50">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage/20">
          <Leaf className="h-5 w-5 text-sage" />
        </span>
        <div className="leading-tight">
          <div className="font-serif text-lg font-semibold text-foreground">tuNota</div>
          <div className="text-[11px] text-muted-foreground">ideas que respiran</div>
        </div>
      </div>

      <div className="scrollbar-cozy flex-1 overflow-y-auto px-2 pb-4">
        {notebooks?.map((nb) => (
          <NotebookItem key={nb.id} notebook={nb} />
        ))}
        {notebooks && notebooks.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Crea tu primer libro para empezar.
          </p>
        )}
        <button
          onClick={() => createNotebook()}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Nuevo libro
        </button>
      </div>
    </aside>
  )
}

function NotebookItem({ notebook }: { notebook: Notebook }) {
  const expanded = useUIStore((s) => !!s.expandedNotebooks[notebook.id])
  const toggle = useUIStore((s) => s.toggleNotebook)
  const sections = useLiveQuery(
    () => db.sections.where('notebookId').equals(notebook.id).sortBy('order'),
    [notebook.id],
  )

  return (
    <div className="select-none">
      <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-secondary">
        <button onClick={() => toggle(notebook.id)} className="text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <span className="text-base">{notebook.emoji ?? '\u{1F4D3}'}</span>
        <EditableLabel
          value={notebook.name}
          onSubmit={(v) => renameNotebook(notebook.id, v)}
          className="flex-1 truncate text-sm font-semibold text-foreground"
        />
        <button
          title="A\u00f1adir secci\u00f3n"
          onClick={() => {
            createSection(notebook.id)
            if (!expanded) toggle(notebook.id)
          }}
          className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-card hover:text-foreground group-hover:opacity-100"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <button
          title="Eliminar libro"
          onClick={() => {
            if (window.confirm(`Eliminar "${notebook.name}" y todo su contenido?`))
              deleteNotebook(notebook.id)
          }}
          className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="ml-3 border-l border-border/70 pl-2">
          {sections?.map((s) => (
            <SectionItem key={s.id} section={s} notebookId={notebook.id} />
          ))}
          {sections && sections.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin secciones a\u00fan</p>
          )}
        </div>
      )}
    </div>
  )
}

function SectionItem({ section, notebookId }: { section: Section; notebookId: string }) {
  const expanded = useUIStore((s) => !!s.expandedSections[section.id])
  const toggle = useUIStore((s) => s.toggleSection)
  const currentNoteId = useUIStore((s) => s.currentNoteId)
  const selectNote = useUIStore((s) => s.selectNote)
  const notes = useLiveQuery(
    () => db.notes.where('sectionId').equals(section.id).reverse().sortBy('updatedAt'),
    [section.id],
  )

  return (
    <div className="select-none">
      <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-secondary">
        <button onClick={() => toggle(section.id)} className="text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <EditableLabel
          value={section.name}
          onSubmit={(v) => renameSection(section.id, v)}
          className="flex-1 truncate text-sm font-medium text-foreground/90"
        />
        <button
          title="Nueva nota"
          onClick={async () => {
            const n = await createNote(section.id)
            if (!expanded) toggle(section.id)
            selectNote(notebookId, section.id, n.id)
          }}
          className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-card hover:text-foreground group-hover:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          title="Eliminar secci\u00f3n"
          onClick={() => {
            if (window.confirm(`Eliminar la secci\u00f3n "${section.name}"?`))
              deleteSection(section.id)
          }}
          className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="ml-3 border-l border-border/70 pl-2">
          {notes?.map((n) => (
            <NoteRow
              key={n.id}
              title={n.title}
              active={currentNoteId === n.id}
              onSelect={() => selectNote(notebookId, section.id, n.id)}
              onRename={(v) => renameNote(n.id, v)}
              onDelete={() => {
                if (window.confirm(`Eliminar la nota "${n.title}"?`)) deleteNote(n.id)
              }}
            />
          ))}
          {notes && notes.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin notas a\u00fan</p>
          )}
        </div>
      )}
    </div>
  )
}

function NoteRow({
  title,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  title: string
  active: boolean
  onSelect: () => void
  onRename: (value: string) => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition',
        active
          ? 'bg-primary/15 text-foreground'
          : 'text-foreground/80 hover:bg-secondary',
      )}
    >
      <FileText
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <EditableLabel value={title} onSubmit={onRename} className="flex-1 truncate" />
      <button
        title="Eliminar nota"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}
