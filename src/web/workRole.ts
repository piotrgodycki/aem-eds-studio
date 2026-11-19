import { useEffect, useState } from "react";
import type { ProjectTab } from "./router.js";

/**
 * What the person at this device does on the team. It only arranges the
 * project: the first screen and the order of the tabs. Nothing is locked, and
 * it is kept in this browser, so each person (and each paired phone) has their own.
 */
export type WorkRole = "manager" | "qa" | "developer" | "content";

export const ROLES: Array<[role: WorkRole, label: string]> = [
	["manager", "Manager"],
	["qa", "QA"],
	["developer", "Developer"],
	["content", "Content author"],
];

/** Each role's tabs, the first one its starting screen; the others go under More. */
export const ROLE_TABS: Record<WorkRole, ProjectTab[]> = {
	manager: ["report", "performance", "drafts", "board"],
	qa: ["check", "drafts", "performance", "overview"],
	developer: ["chat", "drafts", "blocks", "templates", "agents", "overview"],
	content: ["authoring", "templates", "drafts", "overview"],
};

const KEY = "studio.workRole";
const EVENT = "studio-work-role";

/** The role saved in this browser; null when none is picked yet or storage is closed. */
export function readWorkRole(): WorkRole | null {
	try {
		const v = localStorage.getItem(KEY);
		return ROLES.some(([r]) => r === v) ? (v as WorkRole) : null;
	} catch {
		return null;
	}
}

/** The role, and a way to change it that every open part of the page hears. */
export function useWorkRole(): [WorkRole | null, (r: WorkRole) => void] {
	const [role, setRole] = useState(readWorkRole);
	useEffect(() => {
		const on = () => setRole(readWorkRole());
		window.addEventListener(EVENT, on);
		window.addEventListener("storage", on);
		return () => {
			window.removeEventListener(EVENT, on);
			window.removeEventListener("storage", on);
		};
	}, []);
	const save = (r: WorkRole) => {
		try {
			localStorage.setItem(KEY, r);
		} catch {
			// Storage closed (a private window): the role holds until the page reloads.
		}
		setRole(r);
		window.dispatchEvent(new Event(EVENT));
	};
	return [role, save];
}

/** Where a project opens for this role: its first tab. A developer starts on the chat, as before. */
export const homeTab = (role: WorkRole | null): ProjectTab => ROLE_TABS[role ?? "developer"][0];
