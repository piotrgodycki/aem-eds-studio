import type { ReactNode } from "react";

/**
 * An issue's text as the person will see it in the tracker: headings, lists,
 * checklists and paragraphs, with **bold** and `code`. It shows text the person
 * typed, so it never builds a link or any HTML from it: only React text nodes.
 */

function inline(text: string): ReactNode[] {
	return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((part, i) => {
		const key = `${i}-${part.length}`;
		if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
		if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
		return part;
	});
}

export function IssueText(props: { text: string }) {
	const out: ReactNode[] = [];
	let list: { ordered: boolean; items: ReactNode[] } | null = null;
	const close = (key: string) => {
		if (!list) return;
		out.push(list.ordered ? <ol key={key}>{list.items}</ol> : <ul key={key}>{list.items}</ul>);
		list = null;
	};
	props.text.split("\n").forEach((line, i) => {
		const key = `l${i}`;
		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		const check = /^\s*[-*]\s+\[( |x)\]\s+(.*)$/i.exec(line);
		const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		const item = (ordered: boolean, content: ReactNode) => {
			if (list && list.ordered !== ordered) close(`${key}-c`);
			if (!list) list = { ordered, items: [] };
			list.items.push(<li key={key}>{content}</li>);
		};
		if (heading) {
			close(`${key}-c`);
			out.push(<h4 key={key}>{inline(heading[1])}</h4>);
		} else if (check)
			item(
				false,
				<>
					{check[1].trim() ? "☑ " : "☐ "}
					{inline(check[2])}
				</>,
			);
		else if (bullet) item(false, inline(bullet[1]));
		else if (numbered) item(true, inline(numbered[1]));
		else if (line.trim()) {
			close(`${key}-c`);
			out.push(<p key={key}>{inline(line)}</p>);
		} else close(`${key}-c`);
	});
	close("end");
	return <div className="md">{out}</div>;
}
