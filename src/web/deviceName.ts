function browserOf(ua: string): string {
	if (/EdgA?\/|EdgiOS/.test(ua)) return "Edge";
	if (/OPR\/|OPiOS/.test(ua)) return "Opera";
	if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
	if (/Firefox|FxiOS/.test(ua)) return "Firefox";
	if (/Chrome|CriOS/.test(ua)) return "Chrome";
	if (/Safari/.test(ua)) return "Safari";
	return "browser";
}

/**
 * A name for the device being paired, from what its browser tells: the model
 * where it does (Chrome on Android), else the kind of device, and the browser.
 * No browser reveals the name its owner gave it, so the field stays editable.
 */
export function deviceName(ua: string, touch: boolean, model?: string): string {
	const kind = /iPhone/.test(ua)
		? "iPhone"
		: /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) // iPadOS asks for desktop pages as a Mac
			? "iPad"
			: /Android/.test(ua)
				? /Mobile/.test(ua)
					? "Android phone"
					: "Android tablet"
				: /Macintosh|Mac OS/.test(ua)
					? "Mac"
					: /Windows/.test(ua)
						? "Windows PC"
						: /Linux/.test(ua)
							? "Linux PC"
							: "Device";
	return `${model?.trim() || kind} · ${browserOf(ua)}`;
}
