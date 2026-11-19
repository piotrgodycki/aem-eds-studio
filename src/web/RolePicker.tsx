import { href } from "./router.js";
import { ROLE_TABS, ROLES, useWorkRole, type WorkRole } from "./workRole.js";

/**
 * "You work as" in the side menu: the role that arranges each project for the
 * person at this device. Picking one opens that role's first screen of the
 * project on screen, if any. Nothing is locked by it.
 */
export function RolePicker(props: { projectId?: string }) {
	const [role, setRole] = useWorkRole();
	return (
		<label className="role-picker">
			<span className="muted small">You work as</span>
			<select
				value={role ?? ""}
				onChange={(e) => {
					const r = e.target.value as WorkRole;
					setRole(r);
					if (!props.projectId) return;
					const first = ROLE_TABS[r][0];
					location.hash =
						first === "chat"
							? href.project(props.projectId)
							: `${href.project(props.projectId)}/${first}`;
				}}
			>
				{!role && <option value="">Pick your role</option>}
				{ROLES.map(([r, label]) => (
					<option key={r} value={r}>
						{label}
					</option>
				))}
			</select>
		</label>
	);
}
