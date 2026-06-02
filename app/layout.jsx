import "./globals.css";

export const metadata = {
  title: "Vifsy App",
  description: "AI social media assistant for small businesses",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
