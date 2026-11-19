import { useEffect, useRef } from "react";
import { Icon } from "./Icon.js";

/**
 * The issue's text as a small rich text editor: headings, paragraphs, bullet,
 * numbered and check lists, bold and code. That is what GitHub, Jira and Azure
 * DevOps all have, so whatever is made here survives in each. The editor keeps
 * Markdown as its value, which the server turns into each tracker's format.
 *
 * The page is built from text nodes only, never from an HTML string, and a paste
 * comes in as plain text, so nothing pasted or typed can run.
 */

const CHECK = /^([☐☑])\s?/;

/** One line of Markdown's **bold** and `code` as DOM nodes. */
function inlineNodes(text: string): Node[] {
	return text
		.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/)
		.filter(Boolean)
		.map((part) => {
			if (/^`[^`]+`$/.test(part)) {
				const el = document.createElement("code");
				el.textContent = part.slice(1, -1);
				return el;
			}
			if (/^\*\*[^*]+\*\*$/.test(part)) {
				const el = document.createElement("strong");
				el.textContent = part.slice(2, -2);
				return el;
			}
			return document.createTextNode(part);
		});
}

const element = (tag: string, children: Node[]) => {
	const el = document.createElement(tag);
	el.append(...children);
	return el;
};

/** Markdown (the subset agents write) as editable DOM. */
export function markdownToNodes(markdown: string): Node[] {
	const out: Node[] = [];
	let list: HTMLElement | null = null;
	for (const line of markdown.split("\n")) {
		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		const check = /^\s*[-*]\s+\[( |x)\]\s+(.*)$/i.exec(line);
		const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		const item = (tag: "ul" | "ol", children: Node[]) => {
			if (!list || list.tagName.toLowerCase() !== tag) {
				list = document.createElement(tag);
				out.push(list);
			}
			list.append(element("li", children));
		};
		if (check)
			item("ul", [
				document.createTextNode(check[1].trim() ? "☑ " : "☐ "),
				...inlineNodes(check[2]),
			]);
		else if (bullet) item("ul", inlineNodes(bullet[1]));
		else if (numbered) item("ol", inlineNodes(numbered[1]));
		else {
			list = null;
			if (heading) out.push(element("h4", inlineNodes(heading[1])));
			else if (line.trim()) out.push(element("p", inlineNodes(line)));
		}
	}
	return out;
}

/** An element's text with its bold and code written back as Markdown. */
function inlineMarkdown(node: Node): string {
	let text = "";
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? "";
		else if (child instanceof HTMLElement) {
			const tag = child.tagName.toLowerCase();
			const inner = inlineMarkdown(child);
			if (tag === "br") text += " ";
			else if (!inner.trim()) text += inner;
			else if (tag === "strong" || tag === "b") text += `**${inner.trim()}**`;
			else if (tag === "code") text += `\`${inner.trim()}\``;
			else text += inner;
		}
	}
	return text.replace(/\s+/g, " ");
}

/** The editor's DOM back to Markdown. */
export function nodesToMarkdown(root: HTMLElement): string {
	const lines: string[] = [];
	for (const child of Array.from(root.childNodes)) {
		if (!(child instanceof HTMLElement)) {
			const text = child.textContent?.trim();
			if (text) lines.push(text, "");
			continue;
		}
		const tag = child.tagName.toLowerCase();
		if (tag === "ul" || tag === "ol") {
			Array.from(child.children).forEach((li, i) => {
				const text = inlineMarkdown(li).trim();
				const check = CHECK.exec(text);
				if (check) lines.push(`- [${check[1] === "☑" ? "x" : " "}] ${text.slice(check[0].length)}`);
				else lines.push(tag === "ol" ? `${i + 1}. ${text}` : `- ${text}`);
			});
			lines.push("");
		} else if (/^h[1-6]$/.test(tag)) lines.push(`## ${inlineMarkdown(child).trim()}`, "");
		else {
			const text = inlineMarkdown(child).trim();
			if (text) lines.push(text, "");
		}
	}
	return lines.join("\n").trim();
}

/** The toolbar's commands, the ones every tracker can show. */
const TOOLS: Array<[label: string, glyph: string, run: () => void]> = [
	["Heading", "H", () => document.execCommand("formatBlock", false, "h4")],
	["Bold", "B", () => document.execCommand("bold")],
	[
		"Code",
		"</>",
		() => {
			const text = window.getSelection()?.toString();
			if (text) document.execCommand("insertText", false, `\`${text}\``);
		},
	],
	["Bullet list", "•", () => document.execCommand("insertUnorderedList")],
	["Numbered list", "1.", () => document.execCommand("insertOrderedList")],
	[
		"Checklist",
		"☐",
		() => {
			document.execCommand("insertUnorderedList");
			document.execCommand("insertText", false, "☐ ");
		},
	],
];

export function IssueEditor(props: {
	/** Markdown. A new value from outside (the agent's rewrite) replaces the content. */
	value: string;
	onChange: (markdown: string) => void;
	/** The person selected part of the text, for "change just this". */
	onSelect: (text: string) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const own = useRef("");
	useEffect(() => {
		// Only a value the editor didn't produce itself (the agent's text) is put back in.
		if (!ref.current || props.value === own.current) return;
		ref.current.replaceChildren(...markdownToNodes(props.value));
		own.current = props.value;
	}, [props.value]);
	const changed = () => {
		if (!ref.current) return;
		own.current = nodesToMarkdown(ref.current);
		props.onChange(own.current);
	};
	return (
		<div className="issue-editor">
			<div className="issue-editor-tools" role="toolbar" aria-label="Formatting">
				{TOOLS.map(([label, glyph, run]) => (
					<button
						key={label}
						type="button"
						className="icon-btn icon-btn-sm"
						aria-label={label}
						title={label}
						// Keep the selection in the editor when the button is pressed.
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => {
							run();
							changed();
						}}
					>
						{glyph}
					</button>
				))}
				<span className="muted small push-right">
					<Icon name="pencil" size={12} /> Edit the text here, or select a sentence to ask the agent
				</span>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: rich text needs an editable div, an input holds plain text only */}
			<div
				ref={ref}
				className="issue-editor-text md"
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-multiline="true"
				aria-label="The issue's text"
				tabIndex={0}
				onInput={changed}
				onPaste={(e) => {
					e.preventDefault();
					document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
				}}
				onMouseUp={() => {
					const text = window.getSelection()?.toString().trim() ?? "";
					if (text) props.onSelect(text.slice(0, 500));
				}}
			/>
		</div>
	);
}
