import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  currentNotebookId: string | null
  currentSectionId: string | null
  currentNoteId: string | null
  expandedNotebooks: Record<string, boolean>
  expandedSections: Record<string, boolean>
  setNotebook: (id: string | null) => void
  setSection: (id: string | null) => void
  setNote: (id: string | null) => void
  toggleNotebook: (id: string) => void
  toggleSection: (id: string) => void
  selectNote: (notebookId: string, sectionId: string, noteId: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentNotebookId: null,
      currentSectionId: null,
      currentNoteId: null,
      expandedNotebooks: {},
      expandedSections: {},
      setNotebook: (id) => set({ currentNotebookId: id }),
      setSection: (id) => set({ currentSectionId: id }),
      setNote: (id) => set({ currentNoteId: id }),
      toggleNotebook: (id) =>
        set((s) => ({
          expandedNotebooks: {
            ...s.expandedNotebooks,
            [id]: !s.expandedNotebooks[id],
          },
        })),
      toggleSection: (id) =>
        set((s) => ({
          expandedSections: {
            ...s.expandedSections,
            [id]: !s.expandedSections[id],
          },
        })),
      selectNote: (notebookId, sectionId, noteId) =>
        set({
          currentNotebookId: notebookId,
          currentSectionId: sectionId,
          currentNoteId: noteId,
        }),
    }),
    { name: 'tunota-ui' },
  ),
)
