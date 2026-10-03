import localFont from "next/font/local";

// Brand type: Sentinel (serif) + PP Mori (sans), self-hosted per the Figma.
// Font files are licensed to Kathryn; confirm web-embedding terms before a
// public production launch.

export const serif = localFont({
  src: [
    { path: "./fonts/Sentinel-Book.otf", weight: "400", style: "normal" },
    { path: "./fonts/Sentinel-BookItalic.otf", weight: "400", style: "italic" },
    { path: "./fonts/Sentinel-Semibold.otf", weight: "500", style: "normal" },
  ],
  variable: "--font-serif",
});

export const sans = localFont({
  src: [
    { path: "./fonts/PPMori-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/PPMori-SemiBold.otf", weight: "600", style: "normal" },
  ],
  variable: "--font-sans",
});

export const glassboxFonts = `${serif.variable} ${sans.variable}`;
