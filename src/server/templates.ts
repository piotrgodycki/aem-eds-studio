import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TemplateSpec } from "./validate.js";

/**
 * The template builder's specs, kept in the project's tmp/eds-cli/templates/ (not
 * committed) while they are being built. `eds template preview` reads them from there.
 */

const dir = (projectPath: string) => path.join(projectPath, "tmp", "eds-cli", "templates");

export const specFile = (projectPath: string, name: string) =>
	path.join(dir(projectPath), `${name}.json`);

export async function listTemplates(projectPath: string): Promise<TemplateSpec[]> {
	if (!existsSync(dir(projectPath))) return [];
	const files = (await readdir(dir(projectPath))).filter((f) => f.endsWith(".json")).sort();
	const specs: TemplateSpec[] = [];
	for (const f of files) {
		try {
			specs.push(JSON.parse(await readFile(path.join(dir(projectPath), f), "utf-8")));
		} catch {
			// a spec that doesn't read is left out of the list
		}
	}
	return specs;
}

export async function saveTemplate(projectPath: string, spec: TemplateSpec): Promise<void> {
	await mkdir(dir(projectPath), { recursive: true });
	await writeFile(specFile(projectPath, spec.name), `${JSON.stringify(spec, null, 2)}\n`);
}

/** A block's fields from its UE model, in order, for the builder's starting content. */
export async function blockFields(
	projectPath: string,
	block: string,
): Promise<Array<{ name: string; label: string }>> {
	const file = path.join(projectPath, "blocks", block, `_${block}.json`);
	if (!existsSync(file)) return [];
	try {
		const parsed = JSON.parse(await readFile(file, "utf-8"));
		const model = (parsed.models ?? []).find((m: { id: string }) => m.id === block);
		return (model?.fields ?? [])
			.filter((f: { component: string }) => f.component !== "tab" && f.component !== "container")
			.map((f: { name: string; label?: string }) => ({ name: f.name, label: f.label ?? f.name }));
	} catch {
		return [];
	}
}
