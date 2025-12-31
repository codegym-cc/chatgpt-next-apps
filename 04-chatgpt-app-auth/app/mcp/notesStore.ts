import crypto from "node:crypto";

export type Note = {
  id: string;
  title: string;
  body: string;
  updatedAt: string; // ISO
};

type NotesByUser = Map<string, Note[]>;
const notesByUser: NotesByUser = new Map();

export function ensureSeedNotes(userId: string) {
  if (notesByUser.has(userId)) return;

  notesByUser.set(userId, [
    {
      id: "n1",
      title: "First note",
      body: "This is your first private note.",
      updatedAt: new Date().toISOString(),
    },
  ]);
}

export function listNotes(userId: string): Array<{ id: string; title: string; updatedAt: string }> {
  ensureSeedNotes(userId);
  const notes = notesByUser.get(userId) ?? [];
  return notes.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt }));
}

export function addNote(userId: string, params: { title: string; body: string }): { ok: true; noteId: string } {
  ensureSeedNotes(userId);

  const noteId = `n_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const now = new Date().toISOString();

  const note: Note = {
    id: noteId,
    title: params.title,
    body: params.body,
    updatedAt: now,
  };

  const arr = notesByUser.get(userId) ?? [];
  arr.unshift(note);
  notesByUser.set(userId, arr);

  return { ok: true, noteId };
}

export function publicTeaserNotes(): Array<{ id: string; title: string; updatedAt: string }> {
  return [
    { id: "demo1", title: "Public example note", updatedAt: "2025-01-01T00:00:00Z" },
  ];
}