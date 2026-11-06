import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cloneRepo } from "./github.js";
import { projectsFile, workspacesDir } from "./paths.js";
import { type Agent, InputError } from "./validate.js";

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
