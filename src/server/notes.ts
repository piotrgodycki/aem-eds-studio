/**
 * Changes waiting for a draft's next version. In review, what you ask for is
 * collected here; nothing runs until you choose to make the next version, which
 * takes them all at once. Kept per project in ~/.aem-eds-studio/notes/.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { studioHome } from "./paths.js";

export interface Note {
	id: string;
	text: string;
	at: string;
}

type Notes = Record<string, Note[]>;

const file = (projectId: string) => path.join(studioHome(), "notes", `${projectId}.json`);

async function read(projectId: string): Promise<Notes> {
	if (!existsSync(file(projectId))) return {};
	try {
		return JSON.parse(await readFile(file(projectId), "utf-8")) as Notes;
	} catch {
		return {};
	}
}

async function write(projectId: string, notes: Notes) {
	await mkdir(path.dirname(file(projectId)), { recursive: true });
	const tmp = `${file(projectId)}.${process.pid}.tmp`;
	await writeFile(tmp, `${JSON.stringify(notes, null, 2)}\n`);
	await rename(tmp, file(projectId));
}

/** One change at a time per project, so two quick adds never overwrite each other. */
let queue: Promise<unknown> = Promise.resolve();
function change<T>(projectId: string, fn: (notes: Notes) => T): Promise<T> {
	const next = queue.then(async () => {
		const notes = await read(projectId);
		const result = fn(notes);
		await write(projectId, notes);
		return result;
	});
	queue = next.catch(() => {});
	return next;
}

export async function listNotes(projectId: string, draft: string): Promise<Note[]> {
	return (await read(projectId))[draft] ?? [];
}

export function addNote(projectId: string, draft: string, text: string): Promise<Note[]> {
	return change(projectId, (notes) => {
		notes[draft] = [
			...(notes[draft] ?? []),
			{ id: randomUUID(), text, at: new Date().toISOString() },
		];
		return notes[draft];
	});
}

export function removeNotes(projectId: string, draft: string, ids: string[]): Promise<Note[]> {
	return change(projectId, (notes) => {
		notes[draft] = (notes[draft] ?? []).filter((n) => !ids.includes(n.id));
		if (!notes[draft].length) delete notes[draft];
		return notes[draft] ?? [];
	});
}

/** The notes as one request for the agent: a single note as it is, several as a list. */
export function asFeedback(notes: Note[]): string {
	return notes.length === 1 ? notes[0].text : notes.map((n) => `- ${n.text}`).join("\n");
}
