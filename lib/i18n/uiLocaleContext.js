"use client";

import { createContext } from "react";

// The server and hydration render share this snapshot. The provider restores
// the browser preference synchronously before paint, without a network request.
export const UiLocaleContext = createContext({ locale: "en", ready: false });
