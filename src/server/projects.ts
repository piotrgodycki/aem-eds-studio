import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cloneRepo } from "./github.js";
import { projectsFile, workspacesDir } from "./paths.js";
import {
	type Agent,
	InputError,
	agent as agentName,
	model as modelName,
	repo as repoName,
} from "./validate.js";

export interface Project {
	id: string;
	name: string;
	/** Absolute path of the project's folder (a local folder or the studio's clone). */
	path: string;
	source: { type: "local" } | { type: "github"; repo: string };
	/** The project's default model; a job can override it. */
	model?: { agent?: Agent; model?: string };
	addedAt: string;
}

/** The markers `eds` itself looks for to recognise an Edge Delivery project. */
const EDS_MARKERS = [
	"fstab.yaml",
	"head.html",
	"helix-query.yaml",
	"component-definition.json",
	"paths.json",
	"scripts/scripts.js",
	"scripts/aem.js",
];

export function isEdsProject(dir: string): boolean {
	return EDS_MARKERS.some((m) => existsSync(path.join(dir, m)));
}

export async function readProjects(): Promise<Project[]> {
	const file = projectsFile();
	if (!existsSync(file)) return [];
	return JSON.parse(await readFile(file, "utf-8")) as Project[];
}

async function writeProjects(list: Project[]): Promise<void> {
	const file = projectsFile();
	await mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`);
	await rename(tmp, file);
}

export async function getProject(id: string): Promise<Project | undefined> {
	return (await readProjects()).find((p) => p.id === id);
}

export async function addLocalProject(dir: unknown): Promise<Project> {
	if (typeof dir !== "string" || !path.isAbsolute(dir))
		throw new InputError("Give the project's full folder path.");
	const abs = path.resolve(dir);
	if (!existsSync(abs)) throw new InputError(`There's no folder at ${abs}.`);
	if (!isEdsProject(abs))
		throw new InputError(
			`${abs} doesn't look like an Edge Delivery project (no fstab.yaml, head.html or scripts/aem.js).`,
		);
	const list = await readProjects();
	const existing = list.find((p) => p.path === abs);
	if (existing) return existing;
	const project: Project = {
		id: randomUUID(),
		name: path.basename(abs),
		path: abs,
		source: { type: "local" },
		addedAt: new Date().toISOString(),
	};
	await writeProjects([...list, project]);
	return project;
}

export async function addGithubProject(fullName: string): Promise<Project> {
	const list = await readProjects();
	const existing = list.find((p) => p.source.type === "github" && p.source.repo === fullName);
	if (existing) return existing;
	const dest = path.join(workspacesDir(), ...fullName.split("/"));
	if (!existsSync(dest)) {
		await mkdir(path.dirname(dest), { recursive: true });
		await cloneRepo(fullName, dest);
	}
	if (!isEdsProject(dest))
		throw new InputError(
			`${fullName} doesn't look like an Edge Delivery project (no fstab.yaml, head.html or scripts/aem.js).`,
		);
	const project: Project = {
		id: randomUUID(),
		name: fullName,
		path: dest,
		source: { type: "github", repo: fullName },
		addedAt: new Date().toISOString(),
	};
	await writeProjects([...list, project]);
	return project;
}

export async function updateProject(id: string, patch: Pick<Project, "model">): Promise<Project> {
	const list = await readProjects();
	const p = list.find((x) => x.id === id);
	if (!p) throw new InputError("No such project.");
	p.model = patch.model;
	await writeProjects(list);
	return p;
}

/** Forget a project. Its folder (and the studio's clone) stay on disk. */
export async function removeProject(id: string): Promise<boolean> {
	const list = await readProjects();
	const next = list.filter((p) => p.id !== id);
	if (next.length === list.length) return false;
	await writeProjects(next);
	return true;
}

// ── Settings export / import ──

/** A project's settings as a file a teammate can import. Never holds secrets. */
export interface ProjectSettings {
	format: "aem-eds-studio/project";
	version: 1;
	name: string;
	/** owner/name on GitHub, when the project has one: import clones it. */
	repo: string | null;
	/** The folder on the machine it was exported from (a hint for local projects). */
	path?: string;
	model?: { agent?: Agent; model?: string };
	exportedAt: string;
}

export function exportSettings(p: Project, repo: string | null): ProjectSettings {
	return {
		format: "aem-eds-studio/project",
		version: 1,
		name: p.name,
		repo,
		...(p.source.type === "local" ? { path: p.path } : {}),
		...(p.model ? { model: p.model } : {}),
		exportedAt: new Date().toISOString(),
	};
}

/** Check an imported file: only known fields, with the values the studio accepts. */
export function parseSettings(raw: unknown): ProjectSettings {
	const s = raw as Partial<ProjectSettings> | null;
	if (!s || typeof s !== "object" || s.format !== "aem-eds-studio/project")
		throw new InputError("That isn't an aem-eds-studio project file.");
	if (s.version !== 1)
		throw new InputError(`Unsupported project file version ${String(s.version)}.`);
	const m = (s.model ?? {}) as Record<string, unknown>;
	return {
		format: "aem-eds-studio/project",
		version: 1,
		name: typeof s.name === "string" ? s.name.slice(0, 120) : "project",
		repo: s.repo ? repoName(s.repo) : null,
		...(typeof s.path === "string" ? { path: s.path } : {}),
		model: { agent: agentName(m.agent), model: modelName(m.model) },
		exportedAt: typeof s.exportedAt === "string" ? s.exportedAt : new Date().toISOString(),
	};
}

/**
 * Create the project from a settings file, or update it when it is already
 * here (same GitHub repository or same folder).
 */
export async function importSettings(
	s: ProjectSettings,
	repoOf: (p: Project) => Promise<string | null>,
): Promise<{ project: Project; created: boolean }> {
	const list = await readProjects();
	let existing: Project | undefined;
	for (const p of list) {
		if ((s.repo && (await repoOf(p)) === s.repo) || (s.path && p.path === s.path)) {
			existing = p;
			break;
		}
	}
	let project: Project;
	let created = false;
	if (existing) project = existing;
	else if (s.repo) {
		project = await addGithubProject(s.repo);
		created = true;
	} else if (s.path && existsSync(s.path)) {
		project = await addLocalProject(s.path);
		created = true;
	} else
		throw new InputError(
			"This project is a local folder on another machine and has no GitHub repository to clone. Push it to GitHub, or open the folder here.",
		);
	if (s.model && (s.model.agent || s.model.model))
		project = await updateProject(project.id, { model: s.model });
	return { project, created };
}
