import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Good Morning!",
  description: "The boss is here.",
  icons: {
    icon: '/goodmorning.png', // <-- Added favicon link here
    apple: '/goodmorning.png', // Optional: for iOS home screen bookmarks
  },
};

// This locks the screen on mobile devices so frantic clicking 
// doesn't cause the browser to zoom in or shift around.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Also helps push the app under the notch on modern phones
  viewportFit: "cover", 
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* 
        overscroll-none prevents the "pull-to-refresh" bounce effect 
        on mobile browsers when swiping up or down
      */}
      <body className="overscroll-none">{children}</body>
    </html>
  );
}