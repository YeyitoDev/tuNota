export type BlockType = 'text' | 'idea' | 'image' | 'table'

export interface Notebook {
  id: string
  name: string
  emoji?: string
  color?: string
  order: number
  createdAt: number
}

export interface Section {
  id: string
  notebookId: string
  name: string
  color?: string
  order: number
  createdAt: number
}

export interface Note {
  id: string
  sectionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface TextContent {
  text: string
}

export interface IdeaContent {
  text: string
}

export interface ImageContent {
  prompt?: string
  url?: string
  alt?: string
  status?: 'idle' | 'loading' | 'done' | 'error'
}

export interface TableContent {
  rows: string[][]
}

export type BlockContent = TextContent | IdeaContent | ImageContent | TableContent

export interface Block {
  id: string
  noteId: string
  type: BlockType
  x: number
  y: number
  width: number
  height: number
  content: BlockContent
  color?: string
  createdAt: number
  updatedAt: number
}

export interface NoteLink {
  id: string
  sourceNoteId: string
  targetNoteId: string
}
