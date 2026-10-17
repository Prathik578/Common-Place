import { notesSchema, type Note } from "@/lib/knowledge-base";

export const NOTES_STORAGE_KEY = "commonplace.notes.v1";

type NotesStorage = Pick<Storage, "getItem" | "setItem">;

export function readNotes(storage: NotesStorage): Note[] {
  const serialized = storage.getItem(NOTES_STORAGE_KEY);
  if (serialized === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Your saved notes could not be read. Your browser storage may be damaged.");
  }

  const result = notesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Your saved notes have an unexpected format. They have been left untouched.");
  }
  return result.data;
}

export function writeNotes(storage: NotesStorage, notes: Note[]): void {
  const serialized = JSON.stringify(notesSchema.parse(notes));
  try {
    storage.setItem(NOTES_STORAGE_KEY, serialized);
  } catch {
    throw new Error("Your notes could not be saved. Check your browser storage and try again.");
  }
}