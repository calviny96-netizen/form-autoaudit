import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/ui";
export const metadata: Metadata = {
  title: "Auto Audit · Calendar & Booking",
  icons: { icon: "/favicon.svg" },
  description:
    "Manage calendars, appointments, and bookings in one shared workspace.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
