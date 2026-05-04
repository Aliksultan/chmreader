import { Inter, Amiri_Quran, Lora, Space_Mono } from "next/font/google";
import "./globals.css";
import { ReaderProvider } from "@/context/ReaderContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic", "latin-ext"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic", "latin-ext"],
});

const amiri = Amiri_Quran({
  variable: "--font-amiri",
  weight: "400",
  subsets: ["arabic"],
});

export const metadata = {
  title: "Kütüphane",
  description: "İslami ilimler için premium okuma platformu",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceMono.variable} ${lora.variable} ${amiri.variable} antialiased`}>
        <ReaderProvider>
          {children}
        </ReaderProvider>
      </body>
    </html>
  );
}
