import type { IconName } from "./Icon.js";
import type { ProjectTab } from "./router.js";
import type { WorkRole } from "./workRole.js";

/**
 * The chat is where every role starts. It is the same chat for everyone and
 * nothing is locked, but its welcome is shaped for the person: what to ask, and
 * which screen to open. The agent hears the role too (chat.ts on the server).
 */

/** A starter fills in a question, opens the New block form, a file picker, or a screen. */
export type Starter = {
	icon: IconName;
	title: string;
	hint: string;
} & ({ text: string; attach?: true } | { blocks: true } | { tab: ProjectTab });

const DEVELOPER: Starter[] = [
	{
		icon: "design",
		title: "Build a block from a design",
		hint: "Paste a Figma or web link",
		blocks: true,
	},
	{
		icon: "paperclip",
		title: "Match a screenshot",
		hint: "Attach an image and describe it",
		text: "Make a block that looks like the attached screenshot.",
		attach: true,
	},
	{
		icon: "chat",
		title: "What's in this project?",
		hint: "The blocks it has and what they do",
		text: "Which blocks does this project have, and what is each one for?",
	},
	{
		icon: "branch",
		title: "Talk through a pull request",
		hint: "Drag one in from the side menu",
		text: "What does the attached pull request change, and what should a developer check?",
	},
];

export const ROLE_CHAT: Record<
	WorkRole,
	{ heading: (project: string) => string; lead: string; starters: Starter[] }
> = {
	developer: {
		heading: (p) => `What should we build in ${p}?`,
		lead: "Describe it in your own words, ask about the project, or bring a design, a screenshot or a pull request. Nothing changes until you say yes.",
		starters: DEVELOPER,
	},
	manager: {
		heading: (p) => `What do you want to know about ${p}?`,
		lead: "Ask in plain words about progress, what waits and what it would take. The agent reads the project, nothing changes.",
		starters: [
			{
				icon: "usage",
				title: "Status for the meeting",
				hint: "Done, waiting, risks, in a few lines",
				text: "Write a short status of this project for a meeting: what was done lately, what waits on someone, and the risks.",
			},
			{
				icon: "history",
				title: "What changed this week?",
				hint: "In plain words, no code",
				text: "What changed in this project in the last 7 days? Say it in plain words for a manager.",
			},
			{
				icon: "help",
				title: "How big is a change?",
				hint: "Blocks and pages it touches",
				text: "I want to change the hero on every page. Which blocks and how many pages would that touch, and how big is it to build and test?",
			},
			{
				icon: "plus",
				title: "New issue",
				hint: "The agent writes it, you accept it",
				tab: "report",
			},
		],
	},
	qa: {
		heading: (p) => `What should we check in ${p}?`,
		lead: "Ask what to test and where, or how to reproduce something. Report problems from a draft's review with Select.",
		starters: [
			{
				icon: "check",
				title: "What should I test today?",
				hint: "Drafts ready and what they touch",
				text: "Which drafts are ready for QA, and what should I check in each: the blocks, the pages and the devices?",
			},
			{
				icon: "devices",
				title: "Where is a block used?",
				hint: "Name it with @",
				text: "On which pages is @ used, and which of them should I test first?",
			},
			{
				icon: "help",
				title: "How do I reproduce this?",
				hint: "Attach a screenshot",
				text: "How do I reproduce what the attached screenshot shows, and which block is it in?",
				attach: true,
			},
			{
				icon: "eye",
				title: "Pages with problems",
				hint: "The page check and slow pages",
				tab: "check",
			},
		],
	},
	content: {
		heading: (p) => `What do you want to change in ${p}?`,
		lead: "Ask which block fits, what to type in it, or which pages need fixing. The agent reads the site, nothing changes until you say yes.",
		starters: [
			{
				icon: "design",
				title: "Which block for this?",
				hint: "Say what the page needs",
				text: "Which block should I use for a list of questions and answers, and what do I type in it?",
			},
			{
				icon: "pencil",
				title: "What do I type in a block?",
				hint: "Name it with @",
				text: "What do I type in the table of @, row by row?",
			},
			{
				icon: "copy",
				title: "The site's blocks",
				hint: "Copy a table into your page",
				tab: "authoring",
			},
			{ icon: "eye", title: "Pages to fix", hint: "What the page check found", tab: "authoring" },
		],
	},
};
