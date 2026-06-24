import Dexie, { type Table } from 'dexie'
import { nanoid } from 'nanoid'
import type {
  Block,
  BlockType,
  Note,
  Notebook,
  NoteLink,
  Section,
} from '@/types'

export class TuNotaDB extends Dexie {
  notebooks!: Table<Notebook, string>
  sections!: Table<Section, string>
  notes!: Table<Note, string>
  blocks!: Table<Block, string>
  links!: Table<NoteLink, string>

  constructor() {
    super('tunota')
    this.version(1).stores({
      notebooks: 'id, order, createdAt',
      sections: 'id, notebookId, order, createdAt',
      notes: 'id, sectionId, updatedAt, createdAt',
      blocks: 'id, noteId, updatedAt',
      links: 'id, sourceNoteId, targetNoteId',
    })
  }
}

export const db = new TuNotaDB()

const now = () => Date.now()

/* ---------- Notebooks ---------- */
export async function createNotebook(name = 'Nuevo libro', emoji = '\u{1F4D3}') {
  const order = await db.notebooks.count()
  const nb: Notebook = { id: nanoid(), name, emoji, order, createdAt: now() }
  await db.notebooks.add(nb)
  return nb
}

export async function renameNotebook(id: string, name: string) {
  await db.notebooks.update(id, { name })
}

export async function deleteNotebook(id: string) {
  const sections = await db.sections.where('notebookId').equals(id).toArray()
  await Promise.all(sections.map((s) => deleteSection(s.id)))
  await db.notebooks.delete(id)
}

/* ---------- Sections ---------- */
export async function createSection(notebookId: string, name = 'Nueva secci\u00f3n') {
  const order = await db.sections.where('notebookId').equals(notebookId).count()
  const s: Section = { id: nanoid(), notebookId, name, order, createdAt: now() }
  await db.sections.add(s)
  return s
}

export async function renameSection(id: string, name: string) {
  await db.sections.update(id, { name })
}

export async function deleteSection(id: string) {
  const notes = await db.notes.where('sectionId').equals(id).toArray()
  await Promise.all(notes.map((n) => deleteNote(n.id)))
  await db.sections.delete(id)
}

/* ---------- Notes ---------- */
export async function createNote(sectionId: string, title = 'Nota sin t\u00edtulo') {
  const t = now()
  const note: Note = { id: nanoid(), sectionId, title, createdAt: t, updatedAt: t }
  await db.notes.add(note)
  return note
}

export async function renameNote(id: string, title: string) {
  await db.notes.update(id, { title, updatedAt: now() })
}

export async function touchNote(id: string) {
  await db.notes.update(id, { updatedAt: now() })
}

export async function deleteNote(id: string) {
  await db.blocks.where('noteId').equals(id).delete()
  await db.links.where('sourceNoteId').equals(id).delete()
  await db.links.where('targetNoteId').equals(id).delete()
  await db.notes.delete(id)
}

/* ---------- Blocks ---------- */
const DEFAULT_SIZE: Record<BlockType, { width: number; height: number }> = {
  text: { width: 248, height: 132 },
  idea: { width: 230, height: 132 },
  image: { width: 268, height: 220 },
  table: { width: 340, height: 168 },
}

function defaultContent(type: BlockType): Block['content'] {
  switch (type) {
    case 'text':
      return { text: '' }
    case 'idea':
      return { text: '' }
    case 'image':
      return { prompt: '', status: 'idle' }
    case 'table':
      return {
        rows: [
          ['', ''],
          ['', ''],
        ],
      }
  }
}

export async function createBlock(
  noteId: string,
  type: BlockType,
  x: number,
  y: number,
): Promise<Block> {
  const t = now()
  const size = DEFAULT_SIZE[type]
  const block: Block = {
    id: nanoid(),
    noteId,
    type,
    x: Math.round(x),
    y: Math.round(y),
    width: size.width,
    height: size.height,
    content: defaultContent(type),
    createdAt: t,
    updatedAt: t,
  }
  await db.blocks.add(block)
  await touchNote(noteId)
  return block
}

export async function updateBlock(id: string, changes: Partial<Block>) {
  await db.blocks.update(id, { ...changes, updatedAt: now() })
}

export async function moveBlock(id: string, x: number, y: number) {
  await db.blocks.update(id, { x: Math.round(x), y: Math.round(y) })
}

export async function resizeBlock(id: string, width: number, height: number) {
  await db.blocks.update(id, {
    width: Math.round(width),
    height: Math.round(height),
  })
}

export async function deleteBlock(id: string) {
  await db.blocks.delete(id)
}

/* ---------- First-run seed ---------- */
export async function ensureSeed() {
  const count = await db.notebooks.count()
  if (count > 0) return null

  const nb = await createNotebook('Mi primer libro', '\u{1F33F}')
  const section = await createSection(nb.id, 'Ideas r\u00e1pidas')
  const note = await createNote(section.id, 'Bienvenida a tuNota')

  await createBlock(note.id, 'text', 80, 80).then((b) =>
    updateBlock(b.id, {
      content: {
        text: 'Haz click en cualquier parte del lienzo para crear una nota.\n\nArrastra para mover · doble click para editar.',
      },
    }),
  )
  await createBlock(note.id, 'idea', 360, 120).then((b) =>
    updateBlock(b.id, {
      content: { text: 'Ctrl + Click abrir\u00e1 el men\u00fa r\u00e1pido (pronto).' },
    }),
  )

  return { notebookId: nb.id, sectionId: section.id, noteId: note.id }
}
