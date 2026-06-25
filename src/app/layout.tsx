import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getToken } from "#/lib/auth-server";
import { ConvexClientProvider } from "#/components/ConvexClientProvider";
import { ServiceWorkerRegistrar } from "#/components/ServiceWorkerRegistrar";
import { InstallPrompt } from "#/components/InstallPrompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shareit",
  description: "File storage for humans and agents.",
  applicationName: "Shareit",
  appleWebApp: {
    capable: true,
    title: "Shareit",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider initialToken={token}>
          {children}
        </ConvexClientProvider>
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
