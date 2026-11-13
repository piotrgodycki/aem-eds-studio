import type { ReactNode } from "react";

/**
 * The agent's answers are Markdown. This renders the part of it agents use
 * (paragraphs, headings, lists, tables, code, bold, italic, links) as React
 * elements, never as an HTML string, so nothing in an answer can run.
 */

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/;

function inline(text: string): ReactNode[] {
	return text.split(INLINE).map((part, i) => {
		const key = `${i}-${part.length}`;
		if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
		if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
		if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
		const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
		if (link)
			return (
				<a key={key} href={link[2]} target="_blank" rel="noreferrer">
					{link[1]}
				</a>
			);
		return part;
	});
}

/** The cells of a `| a | b |` row. */
const cells = (line: string) =>
	line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((c) => c.trim());

const isTableRule = (line = "") => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const LIST = /^\s*([-*•]|\d+[.)])\s+/;
const HEADING = /^(#{1,4})\s+(.*)$/;

export function Markdown(props: { text: string }) {
	const lines = props.text.replace(/\r\n/g, "\n").split("\n");
	const blocks: ReactNode[] = [];
	let i = 0;
	const startsBlock = (line: string, next?: string) =>
		!line.trim() ||
		line.startsWith("```") ||
		HEADING.test(line) ||
		LIST.test(line) ||
		(line.trim().startsWith("|") && isTableRule(next));

	while (i < lines.length) {
		const line = lines[i];
		const key = `b${i}`;
		if (!line.trim()) {
			i++;
		} else if (line.startsWith("```")) {
			const code: string[] = [];
			for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
			i++;
			blocks.push(
				<pre key={key}>
					<code>{code.join("\n")}</code>
				</pre>,
			);
		} else if (line.trim().startsWith("|") && isTableRule(lines[i + 1])) {
			const head = cells(line);
			const rows: string[][] = [];
			for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++)
				rows.push(cells(lines[i]));
			blocks.push(
				<div key={key} className="md-table">
					<table>
						<thead>
							<tr>
								{head.map((h, c) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: columns never move
									<th key={c}>{inline(h)}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, r) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: rows never move
								<tr key={r}>
									{row.map((cell, c) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: columns never move
										<td key={c}>{inline(cell)}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>,
			);
		} else if (HEADING.test(line)) {
			blocks.push(
				<p key={key} className="md-heading">
					{inline(line.replace(HEADING, "$2"))}
				</p>,
			);
			i++;
		} else if (LIST.test(line)) {
			const ordered = /^\s*\d/.test(line);
			const items: string[] = [];
			for (; i < lines.length && LIST.test(lines[i]); i++) items.push(lines[i].replace(LIST, ""));
			const List = ordered ? "ol" : "ul";
			blocks.push(
				<List key={key}>
					{items.map((item, n) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: items never move
						<li key={n}>{inline(item)}</li>
					))}
				</List>,
			);
		} else {
			const para: string[] = [];
			for (; i < lines.length && (para.length === 0 || !startsBlock(lines[i], lines[i + 1])); i++)
				para.push(lines[i]);
			blocks.push(<p key={key}>{inline(para.join(" "))}</p>);
		}
	}
	return <div className="msg-text md">{blocks}</div>;
}
