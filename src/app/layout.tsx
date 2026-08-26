import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// The HoloTwin overlay type system, self-hosted exactly as the reference does
// it: Saira drives the display/UI text (titles, labels, numbers, buttons),
// Barlow carries body copy. Self-hosted rather than next/font/google so a
// compile never waits on the network.
const saira = localFont({
  // Variable font — one file covers every weight the overlays use.
  src: "./fonts/saira-latin.woff2",
  weight: "300 700",
  variable: "--font-saira",
  display: "swap",
});

const barlow = localFont({
  src: [
    { path: "./fonts/barlow-latin-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/barlow-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/barlow-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/barlow-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/barlow-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HoloTwin — Everport Terminal Services",
  description:
    "Operational digital twin of Everport Terminal Services, Berths 226-236, Port of Los Angeles.",
};

export const viewport: Viewport = {
  themeColor: "#030b14",
  // The experience fills the viewport and handles its own gestures.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${saira.variable} ${barlow.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
