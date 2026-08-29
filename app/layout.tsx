import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "thatmanipalkid",
  description: "Split restaurant bills in real time",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
