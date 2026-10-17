import { z } from "zod";

export const noteDraftSchema = z.object({
  title: z.string().trim().min(1, "Give this note a title."),
  content: z.string().trim().min(1, "Add some content before saving."),
  tags: z
    .array(z.string().trim().min(1, "Tags cannot be empty.").refine((tag) => !tag.includes(","), "Tags cannot contain commas."))
    .default([]),
});

export const noteSchema = noteDraftSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  pinned: z.boolean().default(false),
});

export const notesSchema = z.array(noteSchema);

export type NoteDraft = z.input<typeof noteDraftSchema>;
export type Note = z.infer<typeof noteSchema>;
export type NoteSort = "updated" | "created" | "title";

export type NoteFilters = {
  query: string;
  tags: string[];
  sort: NoteSort;
  pinnedOnly?: boolean;
};

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createNote(
  draft: NoteDraft,
  options: { id?: string; now?: string } = {},
): Note {
  const parsed = noteDraftSchema.parse(draft);
  const timestamp = options.now ?? new Date().toISOString();
  return {
    ...parsed,
    tags: normalizeTags(parsed.tags),
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    pinned: false,
  };
}

export function updateNote(note: Note, draft: NoteDraft, now = new Date().toISOString()): Note {
  const parsed = noteDraftSchema.parse(draft);
  return { ...note, ...parsed, tags: normalizeTags(parsed.tags), updatedAt: now };
}

export function filterAndSortNotes(notes: Note[], filters: NoteFilters): Note[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const selectedTags = filters.tags.map((tag) => tag.toLocaleLowerCase());
  const matching = notes.filter((note) => {
    if (filters.pinnedOnly && !note.pinned) return false;
    if (query && !`${note.title}\n${note.content}`.toLocaleLowerCase().includes(query)) return false;
    if (selectedTags.length && !note.tags.some((tag) => selectedTags.includes(tag.toLocaleLowerCase()))) {
      return false;
    }
    return true;
  });

  return matching.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (filters.sort === "title") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    const dateKey = filters.sort === "created" ? "createdAt" : "updatedAt";
    return b[dateKey].localeCompare(a[dateKey]);
  });
}

export function getAvailableTags(notes: Note[]): string[] {
  const tags = new Map<string, string>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = tag.toLocaleLowerCase();
      if (!tags.has(key)) tags.set(key, tag);
    }
  }
  return [...tags.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}