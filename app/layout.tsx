import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/ui";
export const metadata: Metadata = {
  title: "Auto Audit · Interview Scheduler",
  icons: { icon: "/favicon.svg" },
  description:
    "Kelola gelombang interview, jadwal, dan peserta dalam satu tempat.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
