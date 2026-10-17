import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  ArrowDownAZ,
  ArrowUpDown,
  Bookmark,
  Check,
  ChevronDown,
  FileText,
  Hash,
  Layers3,
  Menu,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { filterAndSortNotes, getAvailableTags, noteDraftSchema, type Note, type NoteSort, createNote, updateNote } from "@/lib/knowledge-base";
import { readNotes, writeNotes } from "@/lib/knowledge-storage";
import { MarkdownContent } from "@/lib/markdown";

const searchValue = z.object({
  q: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sort: z.string().optional(),
  pinned: z.boolean().optional(),
}).transform((value) => ({
  q: value.q ?? "",
  tags: value.tags ?? [],
  sort: value.sort === "created" || value.sort === "title" ? value.sort : "updated",
  pinned: value.pinned ?? false,
}));

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => searchValue.parse({
    q: typeof search.q === "string" ? search.q : "",
    tags: Array.isArray(search.tags) ? search.tags.filter((tag): tag is string => typeof tag === "string") : [],
    sort: typeof search.sort === "string" ? search.sort : "updated",
    pinned: search.pinned === true || search.pinned === "true",
  }),
  head: () => ({
    meta: [
      { title: "Commonplace — Personal Knowledge Base" },
      { name: "description", content: "A quiet place to gather your notes, thoughts, and references." },
      { property: "og:title", content: "Commonplace — Personal Knowledge Base" },
      { property: "og:description", content: "A quiet place to gather your notes, thoughts, and references." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeWorkspace,
});

type DraftFields = { title: string; content: string; tags: string };
const emptyDraft: DraftFields = { title: "", content: "", tags: "" };

function KnowledgeWorkspace() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftFields>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = readNotes(window.localStorage);
      setNotes(stored);
      if (stored.length) setSelectedId(stored[0]?.id ?? null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Your saved notes could not be read.");
    } finally {
      setIsReady(true);
    }
  }, []);

  const tags = useMemo(() => getAvailableTags(notes), [notes]);
  const visibleNotes = useMemo(
    () => filterAndSortNotes(notes, { query: search.q, tags: search.tags, sort: search.sort as NoteSort, pinnedOnly: search.pinned }),
    [notes, search.q, search.tags, search.sort, search.pinned],
  );
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;

  function updateSearch(patch: Partial<typeof search>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }) });
  }

  function persist(nextNotes: Note[]) {
    try {
      writeNotes(window.localStorage, nextNotes);
      setNotes(nextNotes);
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Your notes could not be saved.");
      return false;
    }
  }

  function startCreate() {
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
    setTagInput("");
    setTagError("");
    setEditorTab("write");
    setDialogOpen(true);
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setDraft({ title: note.title, content: note.content, tags: note.tags.join(", ") });
    setFormError("");
    setTagInput("");
    setTagError("");
    setEditorTab("write");
    setDialogOpen(true);
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) {
      setTagInput("");
      setTagError("");
      return;
    }
    if (tag.includes(",")) {
      setTagError("Tags cannot include commas.");
      return;
    }
    const currentTags = parseDraftTags(draft.tags);
    if (currentTags.some((existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setTagError("That tag is already on this note.");
      return;
    }
    setDraft((current) => ({ ...current, tags: [...currentTags, tag].join(", ") }));
    setTagInput("");
    setTagError("");
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const parsed = noteDraftSchema.safeParse({
      title: draft.title,
      content: draft.content,
      tags: parseDraftTags(draft.tags),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the note details and try again.");
      setEditorTab("write");
      return;
    }

    const original = editingId ? notes.find((note) => note.id === editingId) : undefined;
    const saved = original ? updateNote(original, parsed.data) : createNote(parsed.data);
    const nextNotes = original ? notes.map((note) => note.id === original.id ? saved : note) : [saved, ...notes];
    if (!persist(nextNotes)) return;
    setSelectedId(saved.id);
    setDialogOpen(false);
  }

  function togglePinned(note: Note) {
    persist(notes.map((item) => item.id === note.id ? { ...item, pinned: !item.pinned } : item));
  }

  function deleteNote() {
    if (!deletingId) return;
    const remaining = notes.filter((note) => note.id !== deletingId);
    if (persist(remaining)) {
      setSelectedId((current) => current === deletingId ? (remaining[0]?.id ?? null) : current);
      setDeletingId(null);
    }
  }

  const emptyCollection = notes.length === 0 && isReady && !storageError;

  return (
    <div className="workspace-shell min-h-screen md:flex">
      <aside className="workspace-sidebar flex shrink-0 flex-col md:sticky md:top-0 md:h-screen md:w-64" aria-label="Knowledge workspace">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 md:px-6">
          <a href="/" className="flex items-center gap-3 text-inherit no-underline" aria-label="Commonplace home">
            <span className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Layers3 size={18} aria-hidden="true" /></span>
            <span className="text-[15px] font-semibold tracking-[0.02em]">commonplace</span>
          </a>
          <Button variant="ghost" size="icon" className="size-9 text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground md:hidden" aria-label={mobileFiltersOpen ? "Close filters" : "Open filters"} onClick={() => setMobileFiltersOpen((open) => !open)}>
            {mobileFiltersOpen ? <X /> : <Menu />}
          </Button>
        </div>

        <div className={`${mobileFiltersOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:flex`}>
          <div className="px-3 pt-6">
            <p className="workspace-sidebar-muted mb-2 px-3 text-[10px] font-semibold uppercase">Library</p>
            <button type="button" onClick={() => updateSearch({ pinned: false, tags: [] })} aria-current={!search.pinned && search.tags.length === 0 ? "page" : undefined} className={`flex h-10 w-full items-center gap-3 rounded px-3 text-left text-sm transition-colors ${!search.pinned && search.tags.length === 0 ? "bg-white/10 text-sidebar-foreground" : "workspace-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"}`}>
              <FileText size={16} /><span className="flex-1">All notes</span><span className="text-xs opacity-70">{notes.length}</span>
            </button>
            <button type="button" onClick={() => updateSearch({ pinned: !search.pinned, tags: [] })} aria-pressed={search.pinned} className={`flex h-10 w-full items-center gap-3 rounded px-3 text-left text-sm transition-colors ${search.pinned ? "bg-white/10 text-sidebar-foreground" : "workspace-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"}`}>
              <Bookmark size={16} /><span className="flex-1">Pinned</span><span className="text-xs opacity-70">{notes.filter((note) => note.pinned).length}</span>
            </button>
          </div>

          <div className="mt-8 flex-1 overflow-y-auto px-3">
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="workspace-sidebar-muted text-[10px] font-semibold uppercase">Your tags</p>
              <span className="workspace-sidebar-muted text-xs">{tags.length}</span>
            </div>
            {tags.length ? <div className="space-y-0.5">
              {tags.map((tag) => {
                const active = search.tags.some((selected) => selected.toLocaleLowerCase() === tag.toLocaleLowerCase());
                const count = notes.filter((note) => note.tags.some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase())).length;
                return <button type="button" key={tag} aria-pressed={active} onClick={() => updateSearch({ pinned: false, tags: active ? search.tags.filter((value) => value.toLocaleLowerCase() !== tag.toLocaleLowerCase()) : [...search.tags, tag] })} className={`flex h-9 w-full items-center gap-3 rounded px-3 text-left text-sm transition-colors ${active ? "bg-white/10 text-sidebar-foreground" : "workspace-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"}`}>
                  <Hash size={15} /><span className="flex-1 truncate">{tag}</span><span className="text-xs opacity-70">{count}</span>
                </button>;
              })}
            </div> : <p className="workspace-sidebar-muted px-3 py-2 text-xs">Tags you add to notes will appear here.</p>}
          </div>

          <div className="border-t border-white/10 px-5 py-4 text-xs workspace-sidebar-muted">
            <p>{isReady ? `${notes.length} ${notes.length === 1 ? "note" : "notes"} in your library` : "Your private library"}</p>
            <p className="mt-1 opacity-70">Saved on this device</p>
          </div>
        </div>
      </aside>

      <main className="workspace-main min-w-0 flex-1">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span>Library</span><span aria-hidden="true">/</span><span className="max-w-48 truncate text-foreground">{search.pinned ? "Pinned" : search.tags.length ? search.tags.join(" · ") : "All notes"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-primary" /> Saved privately</span>
            <Button onClick={startCreate} className="h-9 gap-2"><Plus size={16} />New note</Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-8 sm:px-7 sm:pt-10 lg:px-10">
          <section className="mb-8 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-primary"><Sparkles size={14} /> Your second brain</p>
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">A place for every thought.</h1>
              <p className="mt-2 text-sm text-muted-foreground">Keep the useful things you don’t want to forget.</p>
            </div>
            <p className="pb-1 text-sm text-muted-foreground">{notes.length} {notes.length === 1 ? "note" : "notes"} <span className="px-1.5">·</span> {tags.length} {tags.length === 1 ? "tag" : "tags"}</p>
          </section>

          {storageError && <div className="mb-5 flex items-start gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert"><FileText size={17} className="mt-0.5 shrink-0" /><p>{storageError} Your saved notes have not been changed.</p></div>}

          <section aria-label="Search and sort notes" className="mb-5 flex flex-wrap items-center gap-2.5 border-b border-border pb-4">
            <div className="relative min-w-[220px] flex-1 basis-60">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label="Search notes" value={search.q} onChange={(event) => updateSearch({ q: event.target.value })} placeholder="Search your notes…" className="h-10 border-border bg-card pl-9 pr-9" />
              {search.q && <Button type="button" variant="ghost" size="icon" aria-label="Clear search" onClick={() => updateSearch({ q: "" })} className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground"><X size={15} /></Button>}
            </div>
            <Button type="button" variant={search.pinned ? "secondary" : "outline"} aria-pressed={search.pinned} onClick={() => updateSearch({ pinned: !search.pinned })} className="h-10 gap-2"><Pin size={15} />Pinned</Button>
            <Select value={search.sort} onValueChange={(value) => updateSearch({ sort: value })}>
              <SelectTrigger className="h-10 w-[178px] bg-card" aria-label="Sort notes"><ArrowUpDown size={15} className="mr-2 shrink-0 text-muted-foreground" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="created">Recently created</SelectItem>
                <SelectItem value="title">Title, A to Z</SelectItem>
              </SelectContent>
            </Select>
            {search.tags.length > 0 && <Button type="button" variant="ghost" onClick={() => updateSearch({ tags: [] })} className="h-9 gap-2 text-muted-foreground"><X size={14} />Clear tags</Button>}
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(310px,0.82fr)_minmax(0,1.6fr)]">
            <section aria-label="Notes list" className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{visibleNotes.length} {visibleNotes.length === 1 ? "result" : "results"}</p>
                <span className="text-xs text-muted-foreground">Newest first</span>
              </div>
              {!isReady ? <div className="flex min-h-52 items-center justify-center text-sm text-muted-foreground" role="status">Opening your library…</div> : visibleNotes.length ? <div className="space-y-2">
                {visibleNotes.map((note) => <NoteListItem key={note.id} note={note} selected={selectedNote?.id === note.id} query={search.q} onSelect={() => { setSelectedId(note.id); setMobileFiltersOpen(false); }} />)}
              </div> : <EmptyNotes filtered={!emptyCollection} query={search.q} onCreate={startCreate} onClear={() => updateSearch({ q: "", tags: [], pinned: false })} />}
            </section>

            <section aria-label="Selected note" className="min-h-[420px] min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 xl:pl-8">
              {selectedNote ? <article className="mx-auto max-w-3xl">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><FileText size={14} /><span>Note</span><span>·</span><span>Edited {formatDate(selectedNote.updatedAt)}</span></div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={selectedNote.pinned ? "Unpin note" : "Pin note"} aria-pressed={selectedNote.pinned} onClick={() => togglePinned(selectedNote)} className={selectedNote.pinned ? "text-primary" : "text-muted-foreground"}><Pin size={16} /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Edit note" onClick={() => startEdit(selectedNote)} className="text-muted-foreground"><MoreHorizontal size={17} /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Delete note" onClick={() => setDeletingId(selectedNote.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={16} /></Button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {selectedNote.tags.map((tag) => <button key={tag} type="button" onClick={() => updateSearch({ pinned: false, tags: search.tags.some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase()) ? search.tags : [...search.tags, tag] })} className="inline-flex h-6 items-center gap-1 rounded-sm bg-accent/70 px-2 text-[11px] font-medium text-accent-foreground hover:bg-accent"><Tag size={11} />{tag}</button>)}
                </div>
                <h2 className="mb-5 break-words text-3xl font-semibold leading-tight sm:text-4xl">{selectedNote.title}</h2>
                <MarkdownContent content={selectedNote.content} />
                <div className="mt-12 border-t border-border pt-4 text-xs text-muted-foreground">Created {new Date(selectedNote.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
              </article> : <EmptyReader hasNotes={notes.length > 0} onCreate={startCreate} />}
            </section>
          </div>
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="editor-dialog gap-0 border-border p-0 sm:rounded-md" aria-describedby="note-editor-description">
          <DialogHeader className="border-b border-border px-5 py-4 text-left sm:px-7">
            <DialogTitle className="text-lg">{editingId ? "Edit note" : "Create a note"}</DialogTitle>
            <DialogDescription id="note-editor-description" className="text-xs">Write it down. You can tidy it up later.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveNote} className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
            <div><label htmlFor="note-title" className="mb-2 block text-xs font-semibold">Title</label><Input id="note-title" autoFocus maxLength={180} placeholder="A thought worth keeping" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} aria-invalid={!!formError && !draft.title.trim()} /></div>
            <div>
              <div className="mb-2 flex items-center justify-between"><label htmlFor="note-content" className="text-xs font-semibold">Note</label><div className="flex gap-1"><Button type="button" variant={editorTab === "write" ? "secondary" : "ghost"} size="sm" onClick={() => setEditorTab("write")} className="h-7 px-2.5 text-xs">Write</Button><Button type="button" variant={editorTab === "preview" ? "secondary" : "ghost"} size="sm" onClick={() => setEditorTab("preview")} className="h-7 px-2.5 text-xs">Preview</Button></div></div>
              {editorTab === "write" ? <Textarea id="note-content" aria-label="Note content" maxLength={50000} placeholder="Start with a sentence…" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} className="min-h-56 resize-y font-mono text-sm leading-6" /> : <div className="min-h-56 border border-input bg-background px-3 py-3 text-sm">{draft.content.trim() ? <MarkdownContent content={draft.content} /> : <p className="text-muted-foreground">Nothing to preview just yet.</p>}</div>}
            </div>
            <div>
              <label htmlFor="note-tags" className="mb-2 block text-xs font-semibold">Tags <span className="font-normal text-muted-foreground">· separate with commas</span></label>
              <div className="flex gap-2"><Input id="note-tags" aria-label="Tags separated by commas" placeholder="ideas, reading, work" value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /><Button type="button" variant="outline" onClick={() => { const value = tagInput || draft.tags.trim(); if (tagInput) addTag(); else { setTagInput(value); } }} className="gap-1.5"><Plus size={14} />Add tag</Button></div>
              {tagInput && <div className="mt-2 flex gap-2"><Input aria-label="New tag name" autoFocus placeholder="Tag name" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} /><Button type="button" size="sm" onClick={addTag} aria-label="Confirm new tag"><Check size={15} /></Button></div>}
              {tagError && <p className="mt-1 text-xs text-destructive" role="alert">{tagError}</p>}
              {parseDraftTags(draft.tags).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{parseDraftTags(draft.tags).map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-xs text-accent-foreground">{tag}<button type="button" onClick={() => setDraft((current) => ({ ...current, tags: parseDraftTags(current.tags).filter((item) => item !== tag).join(", ") }))} aria-label={`Remove ${tag} tag`} className="ml-1 rounded-sm hover:text-destructive"><X size={12} /></button></span>)}</div>}
            </div>
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            <DialogFooter className="gap-2 border-t border-border pt-4 sm:space-x-2"><Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit">{editingId ? "Save changes" : "Save note"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this note?</AlertDialogTitle><AlertDialogDescription>This note will be removed from this device. This can’t be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep note</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); deleteNote(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete note</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NoteListItem({ note, selected, query, onSelect }: { note: Note; selected: boolean; query: string; onSelect: () => void }) {
  const excerpt = note.content.replace(/[#>*`_~\[\]()]/g, "").replace(/\s+/g, " ").trim();
  return <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined} className={`note-card-shadow group block w-full rounded-sm border px-4 py-4 text-left transition-colors ${selected ? "border-primary/60 bg-card" : "border-border bg-card/70 hover:border-primary/40 hover:bg-card"}`}>
    <div className="mb-2 flex items-start justify-between gap-3"><h3 className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-5"><HighlightedText text={note.title} query={query} /></h3>{note.pinned && <Pin size={14} className="mt-0.5 shrink-0 text-primary" aria-label="Pinned" />}</div>
    <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{query && note.content.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? <HighlightedText text={excerpt} query={query} /> : excerpt || "No preview text"}</p>
    <div className="mt-3 flex items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap gap-1">{note.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{tag}</span>)}{note.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{note.tags.length - 3}</span>}</div><span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(note.updatedAt)}</span></div>
  </button>;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  if (!term) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, "ig"));
  return <>{parts.map((part, index) => part.toLocaleLowerCase() === term.toLocaleLowerCase() ? <mark key={index} className="rounded-sm bg-primary/20 text-foreground">{part}</mark> : part)}</>;
}

function EmptyNotes({ filtered, query, onCreate, onClear }: { filtered: boolean; query: string; onCreate: () => void; onClear: () => void }) {
  if (filtered) return <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center"><span className="mb-4 flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground"><Search size={18} /></span><h3 className="text-sm font-semibold">{query ? "No notes found" : "Nothing in this view"}</h3><p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">{query ? `Nothing matches “${query}”. Try a different phrase or clear your filters.` : "No notes match these filters just yet."}</p><Button type="button" variant="ghost" onClick={onClear} className="mt-3 h-8 gap-1.5 text-xs">Clear filters<X size={13} /></Button></div>;
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-sm border border-dashed border-border px-5 text-center"><span className="mb-4 flex size-11 items-center justify-center rounded-full bg-secondary text-primary"><FileText size={19} /></span><h3 className="text-sm font-semibold">Your library starts here</h3><p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">Save a thought, a reference, or anything you’d like to find again.</p><Button type="button" variant="outline" onClick={onCreate} className="mt-4 h-9 gap-2"><Plus size={15} />Write your first note</Button></div>;
}

function EmptyReader({ hasNotes, onCreate }: { hasNotes: boolean; onCreate: () => void }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><span className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-primary"><FileText size={20} /></span><h3 className="text-sm font-semibold">{hasNotes ? "Choose a note to read" : "Your thoughts, in one place"}</h3><p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">{hasNotes ? "Select a note from your library to open it here." : "A simple space for the things you learn, notice, and want to remember."}</p>{!hasNotes && <Button type="button" variant="ghost" onClick={onCreate} className="mt-3 gap-1.5 text-xs">Create a note<ChevronDown size={14} className="-rotate-90" /></Button>}</div>;
}

function parseDraftTags(value: string): string[] {
  const seen = new Set<string>();
  return value.split(",").map((tag) => tag.trim()).filter((tag) => {
    if (!tag || tag.includes(",")) return false;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}