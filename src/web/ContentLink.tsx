import { useEffect, useState } from "react";
import { api, type ContentInfo, type ContentLink, type Project } from "./api.js";
import { Icon } from "./Icon.js";

const SHORT: Record<ContentLink["source"], string> = { da: "DA", ue: "UE" };
const LONG: Record<ContentLink["source"], string> = {
	da: "Document Authoring",
	ue: "Universal Editor",
};

/** The project's content link, read again when its saved one changes. */
export function useContent(project: Pick<Project, "id" | "content">): ContentInfo | null {
	const [info, setInfo] = useState<ContentInfo | null>(null);
	const saved = JSON.stringify(project.content ?? null);
	useEffect(() => {
		void saved;
		api.content(project.id).then(setInfo, () => setInfo(null));
	}, [project.id, saved]);
	return info;
}

/** Opens the site's pages where authors edit them, in a new tab. */
export function EditContent(props: { link: ContentLink; iconOnly?: boolean; className?: string }) {
	const label = `Edit content in ${SHORT[props.link.source]}`;
	return (
		<a
			className={props.className ?? "btn btn-outline btn-sm"}
			href={props.link.url}
			target="_blank"
			rel="noreferrer"
			title={`${label}: ${props.link.url}`}
			aria-label={label}
		>
			<Icon name="pencil" size={14} />
			{!props.iconOnly && <> {label} ↗</>}
		</a>
	);
}

/** Project settings: where authors edit the pages, found from the repository or pasted. */
export function ContentSetting(props: { project: Project; onSaved: (p: Project) => void }) {
	const info = useContent(props.project);
	const [source, setSource] = useState<ContentLink["source"]>("da");
	const [url, setUrl] = useState("");
	const [error, setError] = useState("");
	const [saved, setSaved] = useState(false);
	useEffect(() => {
		if (!info) return;
		setSource(info.link?.source ?? (info.detected === "ue" ? "ue" : "da"));
		setUrl(info.link?.url ?? "");
	}, [info]);
	const save = async (link: ContentLink | null) => {
		setError("");
		try {
			props.onSaved(await api.setContent(props.project.id, link));
			setSaved(true);
		} catch (e) {
			setError((e as Error).message);
		}
	};
	return (
		<section className="settings-section">
			<h3>Content</h3>
			<p className="muted small">
				Where authors edit this site's pages. The studio links to it from the project and the
				review.
			</p>
			<form
				className="content-setting"
				onSubmit={(e) => {
					e.preventDefault();
					void save(url.trim() ? { source, url: url.trim() } : null);
				}}
			>
				<fieldset className="seg">
					<legend className="sr-only">Where the content is edited</legend>
					{(["da", "ue"] as const).map((s) => (
						<button
							key={s}
							type="button"
							className={source === s ? "on" : ""}
							aria-pressed={source === s}
							onClick={() => {
								setSource(s);
								setSaved(false);
							}}
						>
							{LONG[s]}
						</button>
					))}
				</fieldset>
				<div className="row">
					<textarea
						rows={1}
						className="mono"
						aria-label="Content link"
						placeholder={
							source === "da"
								? "https://da.live/edit#/owner/site"
								: "https://experience.adobe.com/#/@org/aem/editor/canvas/…"
						}
						value={url}
						onChange={(e) => {
							setUrl(e.target.value.replace(/\s+/g, ""));
							setSaved(false);
						}}
					/>
					<button type="submit" className="btn btn-outline btn-sm">
						Save
					</button>
				</div>
			</form>
			{info && !info.saved && info.link && (
				<p className="muted small">
					<span className="ok-text">Found from the repository.</span> Save it to keep it, or change
					it.
				</p>
			)}
			{info?.detected === "other" && !info.saved && (
				<p className="muted small">
					This site's content is in another place (its fstab.yaml), so there is no DA or Universal
					Editor link to find.
				</p>
			)}
			{source === "ue" && !url && (
				<p className="muted small">
					Paste the Universal Editor's address from your browser, with your AEM author in it.
				</p>
			)}
			{info?.warning && <p className="warn-text small">{info.warning}</p>}
			{saved && !error && <p className="muted small">Saved.</p>}
			{error && <p className="error small">{error}</p>}
		</section>
	);
}
