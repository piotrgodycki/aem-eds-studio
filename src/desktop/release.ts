// Release facts the updater needs, kept free of Electron so they can be tested.

export const REPO = "piotrgodycki/aem-eds-studio";

/** The installer a user downloads by hand when the app can't update itself. */
export function downloadUrl(platform: string, arch: string): string {
	const name =
		platform === "darwin"
			? `AEM-EDS-Studio-mac-${arch === "arm64" ? "arm64" : "x64"}.dmg`
			: "AEM-EDS-Studio-win-x64.exe";
	return `https://github.com/${REPO}/releases/latest/download/${name}`;
}

/** Squirrel.Mac only installs a signed app; Windows (NSIS) and Linux update unsigned. */
export function updatesInPlace(platform: string, signed: boolean): boolean {
	return platform !== "darwin" || signed;
}

/** `studioSigned` is set in the packaged package.json by `npm run release:mac`, which signs. */
export function isSignedBuild(pkgJson: string): boolean {
	try {
		return JSON.parse(pkgJson).studioSigned === true;
	} catch {
		return false;
	}
}
