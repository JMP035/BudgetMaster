import { useEffect, useState } from "react";
import { Keyboard, KeyboardEvent, Platform } from "react-native";

/** Alto actual del teclado en px (0 si está oculto). Necesario con edge-to-edge: la ventana ya no se redimensiona. */
export function useKeyboardHeight(): number {
    const [height, setHeight] = useState(0);
    useEffect(() => {
        const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
        const s1 = Keyboard.addListener(showEvt, (e: KeyboardEvent) => setHeight(e.endCoordinates.height));
        const s2 = Keyboard.addListener(hideEvt, () => setHeight(0));
        return () => { s1.remove(); s2.remove(); };
    }, []);
    return height;
}
