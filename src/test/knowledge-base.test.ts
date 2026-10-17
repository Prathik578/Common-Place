import { describe, expect, it } from "vitest";
import {
  createNote,
  filterAndSortNotes,
  getAvailableTags,
  noteDraftSchema,
  updateNote,
} from "@/lib/knowledge-base";
import { NOTES_STORAGE_KEY, readNotes, writeNotes } from "@/lib/knowledge-storage";

function makeNote(id: string, title: string, content: string, tags: string[], date: string) {
  return createNote({ title, content, tags }, { id, now: date });
}

describe("note operations", () => {
  it("requires non-empty title and content and normalizes duplicate tags", () => {
    expect(noteDraftSchema.safeParse({ title: "  ", content: "A note", tags: [] }).success).toBe(
      false,
    );
    expect(noteDraftSchema.safeParse({ title: "A note", content: "  ", tags: [] }).success).toBe(
      false,
    );
    expect(
      createNote(
        { title: "  Title ", content: " Note ", tags: ["Book", " book "] },
        { now: "2026-10-17T00:00:00.000Z" },
      ).tags,
    ).toEqual(["Book"]);
  });

  it("preserves created time and pinned state when editing", () => {
    const original = makeNote("a", "Before", "Text", [], "2026-01-01T00:00:00.000Z");
    const edited = updateNote(
      { ...original, pinned: true },
      { title: "After", content: "Changed", tags: ["new"] },
      "2026-02-01T00:00:00.000Z",
    );
    expect(edited.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(edited.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(edited.pinned).toBe(true);
  });

  it("searches titles and content without case sensitivity", () => {
    const notes = [
      makeNote("a", "FIELD guide", "A quiet afternoon", [], "2026-01-01T00:00:00.000Z"),
      makeNote("b", "Elsewhere", "Learned about FIELD recordings", [], "2026-02-01T00:00:00.000Z"),
    ];
    expect(
      filterAndSortNotes(notes, { query: "field", tags: [], sort: "updated" }).map(
        (note) => note.id,
      ),
    ).toEqual(["b", "a"]);
    expect(
      filterAndSortNotes(notes, { query: "QUIET", tags: [], sort: "updated" }).map(
        (note) => note.id,
      ),
    ).toEqual(["a"]);
  });

  it("uses OR semantics for multiple selected tags and sorts by the chosen field", () => {
    const notes = [
      makeNote("a", "Zebra", "One", ["writing"], "2026-02-01T00:00:00.000Z"),
      makeNote("b", "apple", "Two", ["reading"], "2026-01-01T00:00:00.000Z"),
      makeNote("c", "Other", "Three", ["music"], "2026-03-01T00:00:00.000Z"),
    ];
    expect(
      filterAndSortNotes(notes, { query: "", tags: ["writing", "reading"], sort: "title" }).map(
        (note) => note.id,
      ),
    ).toEqual(["b", "a"]);
    expect(
      filterAndSortNotes(notes, { query: "", tags: [], sort: "created" }).map((note) => note.id),
    ).toEqual(["c", "a", "b"]);
    expect(getAvailableTags(notes)).toEqual(["music", "reading", "writing"]);
  });

  it("pins matching notes first and supports a pinned-only filter", () => {
    const notes = [
      makeNote("a", "A", "Text", [], "2026-01-01T00:00:00.000Z"),
      { ...makeNote("b", "B", "Text", [], "2026-02-01T00:00:00.000Z"), pinned: true },
    ];
    expect(
      filterAndSortNotes(notes, { query: "", tags: [], sort: "updated" }).map((note) => note.id),
    ).toEqual(["b", "a"]);
    expect(
      filterAndSortNotes(notes, { query: "", tags: [], sort: "updated", pinnedOnly: true }).map(
        (note) => note.id,
      ),
    ).toEqual(["b"]);
  });
});

describe("browser persistence", () => {
  it("round-trips a note through storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const note = makeNote(
      "persisted",
      "A thought",
      "A useful detail",
      ["work"],
      "2026-01-01T00:00:00.000Z",
    );
    writeNotes(storage, [note]);
    expect(readNotes(storage)).toEqual([note]);
    expect(values.has(NOTES_STORAGE_KEY)).toBe(true);
  });

  it("fails clearly on damaged saved data and blocked storage", () => {
    const broken = { getItem: () => "{bad json", setItem: () => {} };
    expect(() => readNotes(broken)).toThrow(/could not be read/i);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeNotes(full, [])).toThrow(/could not be saved/i);
  });
});
