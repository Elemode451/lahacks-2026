import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seratone — Music Discovery Through Brain Response",
  description:
    "Recommending music based on vibes and cortical overlap rather than algorithmic trends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
