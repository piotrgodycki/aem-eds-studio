import { createContext, useContext, useEffect, useState } from "react";

/** Where the studio switches to its phone layout (the side menu becomes a drawer). */
const PHONE = "(max-width: 760px)";

/** True on a phone-sized screen, following rotation and resizing. */
export function usePhone(): boolean {
	const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
	useEffect(() => {
		const query = matchMedia(PHONE);
		const change = () => setPhone(query.matches);
		query.addEventListener("change", change);
		return () => query.removeEventListener("change", change);
	}, []);
	return phone;
}

/** Opens the side menu's drawer: on a phone a page's own bar holds the menu button. */
export const OpenMenu = createContext<() => void>(() => {});
export const useOpenMenu = () => useContext(OpenMenu);
