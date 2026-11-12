/**
 * What pages in the window may ask for. The studio copies to the clipboard
 * (*Copy log*) and shows a preview full screen; everything else (camera,
 * microphone, location, notifications…) is denied, and the block preview
 * iframe gets nothing.
 */
const STUDIO_MAY = new Set(["clipboard-sanitized-write", "fullscreen"]);

export function allowPermission(permission: string, requestingUrl: string, studioOrigin: string) {
	if (!STUDIO_MAY.has(permission)) return false;
	try {
		return new URL(requestingUrl).origin === studioOrigin;
	} catch {
		return false;
	}
}
