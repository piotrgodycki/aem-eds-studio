import { useEffect, useRef, useState } from "react";
import { api, type Inventory, type Project, type TemplateSpec } from "./api.js";
import { Icon } from "./Icon.js";

type Section = TemplateSpec["sections"][number];
type Block = Section["blocks"][number];
/** Where a block sits: its section and its place in it. */
type At = [section: number, block: number];

/** header and footer come from the site's /nav and /footer, not from the template. */
const CHROME = new Set(["header", "footer"]);

/** A template's name from its title: "Product detail" is product-detail. */
const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^[^a-z]+|-+$/g, "");

const names = (text: string) =>
	text
		.split(/[\s,]+/)
		.map((s) => s.trim().toLowerCase())
		.filter((s) => /^[a-z][a-z0-9-]*$/.test(s));

/**
 * The Templates tab: the project's templates, and the builder for one. Blocks on
 * the left, the template's sections and blocks in order in the middle, and the
 * picked block's starting content or the whole page's preview on the right.
 */
export function Templates(props: { project: Project }) {
	const { project } = props;
	const [list, setList] = useState<TemplateSpec[] | null>(null);
	const [open, setOpen] = useState<TemplateSpec | null>(null);
	const [newName, setNewName] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		api.templates(project.id).then(setList, (e: Error) => setError(e.message));
	}, [project.id]);

	if (open) return <Builder project={project} start={open} onBack={() => setOpen(null)} />;
	return (
		<section className="panel templates">
			<span className="eyebrow">
				<Icon name="copy" size={13} /> Page templates
			</span>
			<p className="muted small">
				Order the sections and blocks of a page, with each block's starting content. Authors start
				new pages from it.
			</p>
			{list?.length ? (
				<ul className="overview-blocks">
					{list.map((t) => (
						<li key={t.name}>
							<code>{t.name}</code>
							<span className="muted small">
								{t.title} · {t.sections.length} sections
							</span>
							<button
								type="button"
								className="btn btn-ghost btn-sm push-right"
								onClick={() => setOpen(t)}
							>
								Open
							</button>
						</li>
					))}
				</ul>
			) : (
				list && <p className="muted small">No templates yet.</p>
			)}
			<form
				className="row"
				onSubmit={(e) => {
					e.preventDefault();
					const name = slug(newName);
					if (name) setOpen({ name, title: newName.trim(), sections: [{ style: [], blocks: [] }] });
				}}
			>
				<input
					aria-label="The new template's name"
					placeholder="Product detail"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
				/>
				<button type="submit" className="btn btn-accent btn-sm" disabled={!slug(newName)}>
					<Icon name="plus" size={14} /> New template
				</button>
			</form>
			{error && <p className="error small">{error}</p>}
		</section>
	);
}

function Builder(props: { project: Project; start: TemplateSpec; onBack: () => void }) {
	const { project } = props;
	const [spec, setSpec] = useState(props.start);
	const [picked, setPicked] = useState<At | null>(null);
	const [side, setSide] = useState<"content" | "preview">("preview");
	const [width, setWidth] = useState<"desktop" | "phone">("desktop");
	const [preview, setPreview] = useState<string | null>(null);
	// Bumped after each save to reload the preview: the project's CSP may block the kit's own reload.
	const [saved, setSaved] = useState(0);
	const [inv, setInv] = useState<Inventory | null>(null);
	const [error, setError] = useState("");
	const drag = useRef<{ from?: At; block?: string } | null>(null);

	useEffect(() => {
		api.inventory(project.id).then(setInv, () => setInv(null));
	}, [project.id]);

	// Saved a moment after the last change. The preview starts after the first save
	// and reloads after each one.
	useEffect(() => {
		const t = setTimeout(async () => {
			try {
				await api.saveTemplate(project.id, spec);
				setError("");
				setSaved((n) => n + 1);
				if (!preview) setPreview((await api.templatePreview(project.id, spec.name)).url);
			} catch (e) {
				setError((e as Error).message);
			}
		}, 400);
		return () => clearTimeout(t);
	}, [spec, project.id, preview]);

	const change = (fn: (sections: Section[]) => void) => {
		const sections = structuredClone(spec.sections);
		fn(sections);
		setSpec({ ...spec, sections });
	};
	const add = (name: string, to: At) =>
		change((s) => s[to[0]].blocks.splice(to[1], 0, { name, variant: [], fields: {} }));
	const move = (from: At, to: At) =>
		change((s) => {
			const [b] = s[from[0]].blocks.splice(from[1], 1);
			const at = from[0] === to[0] && from[1] < to[1] ? to[1] - 1 : to[1];
			s[to[0]].blocks.splice(at, 0, b);
		});
	const drop = (to: At) => {
		const d = drag.current;
		drag.current = null;
		if (d?.block) add(d.block, to);
		else if (d?.from) move(d.from, to);
	};
	const block = picked ? spec.sections[picked[0]]?.blocks[picked[1]] : undefined;
	const palette = (inv?.blocks ?? []).map((b) => b.name).filter((n) => !CHROME.has(n));

	return (
		<div className="tpl">
			<div className="tpl-head">
				<button type="button" className="btn btn-ghost btn-sm" onClick={props.onBack}>
					<Icon name="back" size={14} /> Templates
				</button>
				<label className="muted small">
					Title{" "}
					<input value={spec.title} onChange={(e) => setSpec({ ...spec, title: e.target.value })} />
				</label>
				<code className="muted small">/templates/{spec.name}</code>
			</div>
			<div className="tpl-cols">
				<section className="panel tpl-palette">
					<span className="label">Blocks in this project</span>
					{palette.map((n) => (
						<button
							key={n}
							type="button"
							className="tpl-chip"
							draggable
							onDragStart={() => {
								drag.current = { block: n };
							}}
							onClick={() => {
								const last = spec.sections.length - 1;
								add(n, [last, spec.sections[last].blocks.length]);
							}}
							title="Drag into a section, or click to add at the end"
						>
							<code>{n}</code>
							<Icon name="plus" size={13} />
						</button>
					))}
					{inv && !palette.length && <p className="muted small">The project has no blocks yet.</p>}
				</section>

				<section className="panel tpl-sections">
					<span className="label">The template, top to bottom</span>
					{spec.sections.map((s, si) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: a drop target, the buttons inside do the work
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: sections have no id of their own
							key={si}
							className="tpl-section"
							onDragOver={(e) => e.preventDefault()}
							onDrop={() => drop([si, s.blocks.length])}
						>
							<div className="tpl-section-head">
								<span className="muted small">Section {si + 1}</span>
								<label className="muted small push-right">
									style{" "}
									<input
										className="mono"
										placeholder="none"
										defaultValue={s.style.join(", ")}
										onBlur={(e) => change((x) => (x[si].style = names(e.target.value)))}
									/>
								</label>
								{spec.sections.length > 1 && (
									<button
										type="button"
										className="icon-btn icon-btn-sm"
										aria-label={`Remove section ${si + 1}`}
										onClick={() => {
											setPicked(null);
											change((x) => x.splice(si, 1));
										}}
									>
										<Icon name="close" size={12} />
									</button>
								)}
							</div>
							{s.blocks.map((b, bi) => (
								<BlockRow
									// biome-ignore lint/suspicious/noArrayIndexKey: a block may repeat, its place is its identity
									key={`${si}-${bi}`}
									block={b}
									on={picked?.[0] === si && picked[1] === bi}
									first={si === 0 && bi === 0}
									last={si === spec.sections.length - 1 && bi === s.blocks.length - 1}
									onPick={() => {
										setPicked([si, bi]);
										setSide("content");
									}}
									onDragStart={() => {
										drag.current = { from: [si, bi] };
									}}
									onDrop={() => drop([si, bi])}
									onUp={() =>
										move(
											[si, bi],
											bi > 0 ? [si, bi - 1] : [si - 1, spec.sections[si - 1].blocks.length],
										)
									}
									onDown={() =>
										bi < s.blocks.length - 1
											? move([si, bi], [si, bi + 2])
											: move([si, bi], [si + 1, 0])
									}
									onVariant={(variant) => change((x) => (x[si].blocks[bi].variant = variant))}
									onRemove={() => {
										setPicked(null);
										change((x) => x[si].blocks.splice(bi, 1));
									}}
								/>
							))}
							{!s.blocks.length && <p className="muted small">Drop a block here.</p>}
						</div>
					))}
					<button
						type="button"
						className="btn btn-ghost btn-sm tpl-add"
						onClick={() => change((s) => s.push({ style: [], blocks: [] }))}
					>
						<Icon name="plus" size={14} /> Add a section
					</button>
				</section>

				<section className="panel tpl-side">
					<div className="row">
						<fieldset className="seg seg-sm">
							<legend className="sr-only">Show</legend>
							<button
								type="button"
								className={side === "content" ? "on" : ""}
								onClick={() => setSide("content")}
							>
								Block content
							</button>
							<button
								type="button"
								className={side === "preview" ? "on" : ""}
								onClick={() => setSide("preview")}
							>
								Preview
							</button>
						</fieldset>
						{side === "preview" && (
							<fieldset className="seg seg-sm push-right">
								<legend className="sr-only">Width</legend>
								<button
									type="button"
									className={width === "desktop" ? "on" : ""}
									onClick={() => setWidth("desktop")}
								>
									Desktop
								</button>
								<button
									type="button"
									className={width === "phone" ? "on" : ""}
									onClick={() => setWidth("phone")}
								>
									Phone
								</button>
							</fieldset>
						)}
					</div>
					{side === "content" &&
						(block && picked ? (
							<BlockContent
								project={project}
								block={block}
								onChange={(fields) =>
									change((x) => (x[picked[0]].blocks[picked[1]].fields = fields))
								}
							/>
						) : (
							<p className="muted small">
								Pick a block in the template to set its starting content.
							</p>
						))}
					{side === "preview" &&
						(preview ? (
							<div className={`tpl-frame ${width}`}>
								<iframe key={saved} title={`${spec.title}, preview`} src={preview} />
							</div>
						) : (
							<p className="muted small">Starting the preview…</p>
						))}
					<p className="muted small">
						The page with the project's own blocks, and the site's header and footer from /nav and
						/footer. It updates as you change the template.
					</p>
				</section>
			</div>
			{error && <p className="error small">{error}</p>}
			<p className="muted small">
				Kept in the project's tmp/eds-cli/templates/ while you build it. Saving it to AEM, as a
				content package or to local AEM on localhost:4502, comes next.
			</p>
		</div>
	);
}

function BlockRow(props: {
	block: Block;
	on: boolean;
	first: boolean;
	last: boolean;
	onPick: () => void;
	onDragStart: () => void;
	onDrop: () => void;
	onUp: () => void;
	onDown: () => void;
	onVariant: (variant: string[]) => void;
	onRemove: () => void;
}) {
	const { block } = props;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target, the buttons inside do the work
		<div
			className={`tpl-block${props.on ? " on" : ""}`}
			draggable
			onDragStart={props.onDragStart}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.stopPropagation();
				props.onDrop();
			}}
		>
			<Icon name="menu" size={13} />
			<button type="button" className="tpl-block-name" onClick={props.onPick}>
				<code>{block.name}</code>
			</button>
			<input
				className="mono"
				aria-label={`${block.name}'s variant`}
				placeholder="variant"
				defaultValue={block.variant.join(", ")}
				onBlur={(e) => props.onVariant(names(e.target.value))}
			/>
			<span className="push-right" />
			<button
				type="button"
				className="icon-btn icon-btn-sm"
				aria-label="Move up"
				disabled={props.first}
				onClick={props.onUp}
			>
				<Icon name="chevron" size={12} className="up" />
			</button>
			<button
				type="button"
				className="icon-btn icon-btn-sm"
				aria-label="Move down"
				disabled={props.last}
				onClick={props.onDown}
			>
				<Icon name="chevron" size={12} />
			</button>
			<button
				type="button"
				className="icon-btn icon-btn-sm"
				aria-label={`Remove ${block.name}`}
				onClick={props.onRemove}
			>
				<Icon name="close" size={12} />
			</button>
		</div>
	);
}

/** The picked block's starting content, one field per row of its UE model. */
function BlockContent(props: {
	project: Project;
	block: Block;
	onChange: (fields: Record<string, string>) => void;
}) {
	const { block } = props;
	const [fields, setFields] = useState<Array<{ name: string; label: string }> | null>(null);
	useEffect(() => {
		api.blockFields(props.project.id, block.name).then(setFields, () => setFields([]));
	}, [props.project.id, block.name]);
	if (!fields) return <p className="muted small">Reading the block's fields…</p>;
	// A block without a model gets one free text field.
	const list = fields.length ? fields : [{ name: "content", label: "Content" }];
	return (
		<div className="tpl-fields">
			<strong>
				<code>{block.name}</code>: starting content
			</strong>
			{list.map((f) => (
				<label key={f.name} className="small">
					<span className="muted">{f.label}</span>
					<input
						value={block.fields[f.name] ?? ""}
						placeholder="Empty, the author fills it"
						onChange={(e) => {
							const next = { ...block.fields, [f.name]: e.target.value };
							if (!e.target.value) delete next[f.name];
							props.onChange(next);
						}}
					/>
				</label>
			))}
			<p className="muted small">
				{fields.length
					? `Fields from blocks/${block.name}/_${block.name}.json.`
					: "This block has no Universal Editor model, so it takes one text field."}{" "}
				Empty blocks show the block's own sample in the preview.
			</p>
		</div>
	);
}
