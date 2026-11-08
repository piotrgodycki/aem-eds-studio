/**
 * What pages in the window may ask for. The studio only copies to the
 * clipboard (*Copy log*); everything else (camera, microphone, location,
 * notifications…) is denied, and the block preview iframe gets nothing.
 */
const STUDIO_MAY = new Set(["clipboard-sanitized-write"]);

export function allowPermission(permission: string, requestingUrl: string, studioOrigin: string) {
	if (!STUDIO_MAY.has(permission)) return false;
	try {
		return new URL(requestingUrl).origin === studioOrigin;
	} catch {
		return false;
	}
}
