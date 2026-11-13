/**
 * The widths a draft is reviewed at: the devices of Chrome DevTools' device
 * toolbar, so a review matches what a developer checks in Chrome, plus a
 * full HD desktop. Only the width matters; the preview's height fills the window.
 */

export type DeviceKind = "desktop" | "tablet" | "mobile";

export interface Device {
	name: string;
	width: number;
}

export const KINDS = [
	{ id: "desktop", label: "Desktop", icon: "desktop" },
	{ id: "tablet", label: "Tablet", icon: "tablet" },
	{ id: "mobile", label: "Mobile", icon: "phone" },
] as const satisfies ReadonlyArray<{ id: DeviceKind; label: string; icon: string }>;

export const DEVICES: Record<DeviceKind, Device[]> = {
	desktop: [
		{ name: "Laptop with MDPI screen", width: 1280 },
		{ name: "Laptop with HiDPI screen", width: 1440 },
		{ name: "Full HD", width: 1920 },
	],
	tablet: [
		{ name: "iPad Mini", width: 768 },
		{ name: "iPad Air", width: 820 },
		{ name: "Asus Zenbook Fold", width: 853 },
		{ name: "Surface Pro 7", width: 912 },
		{ name: "iPad Pro", width: 1024 },
	],
	mobile: [
		{ name: "Galaxy Z Fold 5", width: 344 },
		{ name: "Samsung Galaxy S8+", width: 360 },
		{ name: "iPhone SE", width: 375 },
		{ name: "iPhone 12 Pro", width: 390 },
		{ name: "Pixel 7", width: 412 },
		{ name: "Samsung Galaxy S20 Ultra", width: 412 },
		{ name: "iPhone XR", width: 414 },
		{ name: "iPhone 14 Pro Max", width: 430 },
		{ name: "Surface Duo", width: 540 },
	],
};

/** The widths the review used before there was a choice. */
export const DEFAULT_DEVICE: Record<DeviceKind, string> = {
	desktop: "Laptop with HiDPI screen",
	tablet: "iPad Mini",
	mobile: "iPhone 12 Pro",
};
