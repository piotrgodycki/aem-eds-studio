import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEds } from "../src/server/eds.js";
import { conflict, getJob, startJob, stopAll, waitForJob } from "../src/server/jobs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let tmp: string;

beforeAll(async () => {
	tmp = await mkdtemp(path.join(os.tmpdir(), "studio-par-"));
	for (const d of ["a", "b"]) {
		await mkdir(path.join(tmp, d));
		await writeFile(path.join(tmp, d, "fstab.yaml"), "mountpoints: {}\n");
	}
	process.env.EDS_BIN = path.join(here, "fixtures", "fake-eds.mjs");
	process.env.FAKE_EDS_DELAY = "400";
	resetEds();
});
afterAll(async () => {
	stopAll();
	process.env.FAKE_EDS_DELAY = "";
	await rm(tmp, { recursive: true, force: true });
});

const gen = (project: string, name: string) =>
	startJob({
		projectId: project,
		cwd: path.join(tmp, project),
		kind: "new draft",
		block: name,
		args: ["block", "from-design", "--sample", "--name", name, "--draft"],
		locks: [`project:${project}:block:${name}`],
	});

describe("locks", () => {
	it("a block lock waits for the same block or its project, nothing else", () => {
		expect(conflict("project:a:block:hero", ["project:a:block:hero"])).toBe("project:a:block:hero");
		expect(conflict("project:a:block:hero", ["project:a"])).toBe("project:a");
		expect(conflict("project:a", ["project:a:block:cards"])).toBe("project:a:block:cards");
		expect(
			conflict("project:a:block:hero", ["project:a:block:cards", "project:b"]),
		).toBeUndefined();
		expect(conflict("project:a", ["project:ab"])).toBeUndefined();
	});
});

describe("several projects and blocks at once", () => {
	it("runs different blocks and projects in parallel, queues the same block", async () => {
		const a1 = await gen("a", "hero");
		const a2 = await gen("a", "cards");
		const b1 = await gen("b", "hero");
		const a3 = await gen("a", "hero"); // same block as a1
		expect([a1, a2, b1].map((j) => j.status)).toEqual(["running", "running", "running"]);
		expect(a3.status).toBe("queued");
		expect(a3.waitingFor).toBe('block "hero" is busy');

		await waitForJob(a1.id);
		expect(getJob(a3.id)?.status).toBe("running"); // started as soon as hero was free
		const done = await Promise.all([a2, b1, a3].map((j) => waitForJob(j.id)));
		expect(done.map((j) => j.status)).toEqual(["done", "done", "done"]);
	});

	it("git work (accept) waits for the project's block jobs, and they wait for it", async () => {
		const g = await gen("a", "hero");
		const accept = await startJob({
			projectId: "a",
			cwd: path.join(tmp, "a"),
			kind: "accept",
			args: ["draft", "accept", "hero"],
			locks: ["project:a"],
		});
		const other = await gen("a", "cards");
		const elsewhere = await gen("b", "cards");
		expect(accept.status).toBe("queued");
		expect(other.status).toBe("queued"); // behind the project-wide accept
		expect(elsewhere.status).toBe("running"); // another project is not affected
		await waitForJob(g.id);
		expect(getJob(accept.id)?.status).not.toBe("queued");
		await waitForJob(accept.id);
		await waitForJob(other.id);
		await waitForJob(elsewhere.id);
	});
});
