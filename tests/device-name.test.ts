import { describe, expect, it } from "vitest";
import { deviceName } from "../src/web/deviceName.js";

const UA = {
	iphone:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
	iphoneChrome:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
	ipadDesktop:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
	pixel:
		"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
	windowsEdge:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
};

describe("the name a paired device gets", () => {
	it("names the kind of device and the browser", () => {
		expect(deviceName(UA.iphone, true)).toBe("iPhone · Safari");
		expect(deviceName(UA.iphoneChrome, true)).toBe("iPhone · Chrome");
		expect(deviceName(UA.windowsEdge, false)).toBe("Windows PC · Edge");
		expect(deviceName(UA.ipadDesktop, false)).toBe("Mac · Safari");
	});
	it("tells an iPad asking for desktop pages from a Mac by its touch screen", () => {
		expect(deviceName(UA.ipadDesktop, true)).toBe("iPad · Safari");
	});
	it("uses the model where the browser shares it", () => {
		expect(deviceName(UA.pixel, true)).toBe("Android phone · Chrome");
		expect(deviceName(UA.pixel, true, "Pixel 8")).toBe("Pixel 8 · Chrome");
	});
});
