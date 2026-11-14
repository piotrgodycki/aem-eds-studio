import type { Ticket } from "./api.js";

/**
 * The ticket a draft starts for, in a project that names its branches after
 * tickets: Feature or Bug, and the number after the key. The branch becomes
 * feature/CURLY-111 or bug/CURLY-111.
 */
export function TicketField(props: {
	ticketKey: string;
	value: Ticket;
	onChange: (t: Ticket) => void;
}) {
	const { value } = props;
	return (
		<div className="ticket-field">
			<select
				aria-label="Feature or bug"
				value={value.type}
				onChange={(e) => props.onChange({ ...value, type: e.target.value as Ticket["type"] })}
			>
				<option value="feature">Feature</option>
				<option value="bug">Bug</option>
			</select>
			<span className="ticket-number mono">
				{props.ticketKey}-
				<input
					inputMode="numeric"
					aria-label={`${props.ticketKey} ticket number`}
					placeholder="111"
					value={value.number}
					onChange={(e) => props.onChange({ ...value, number: e.target.value.replace(/\D/g, "") })}
				/>
			</span>
			{value.number && (
				<span className="muted small mono">
					{value.type}/{props.ticketKey}-{value.number}
				</span>
			)}
		</div>
	);
}

/** Whether drafts in this project start on a ticket's branch. */
export const usesTickets = (project: { ticketKey?: string; source: { type: string } }) =>
	!!project.ticketKey && project.source.type === "github";
