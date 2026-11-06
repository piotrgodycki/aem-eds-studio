import os from "node:os";
import path from "node:path";

/** Where the studio keeps its state: projects, cloned workspaces. Never inside a project. */
export function studioHome(): string {
	return process.env.AEM_EDS_STUDIO_HOME ?? path.join(os.homedir(), ".aem-eds-studio");
}

export const projectsFile = () => path.join(studioHome(), "projects.json");
export const workspacesDir = () => path.join(studioHome(), "workspaces");
