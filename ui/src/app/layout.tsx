import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { CompanyProvider } from "@/contexts/company-context";
import { EventProvider } from "@/contexts/event-context";
import { AuthGate } from "@/components/auth-gate";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Blitzscale OS | GTM Engine",
  description: "AI-powered Go-To-Market Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AuthProvider>
          <CompanyProvider>
            <AuthGate>
              <EventProvider>
                {children}
              </EventProvider>
            </AuthGate>
          </CompanyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
