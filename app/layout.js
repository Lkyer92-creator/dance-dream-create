import './globals.css';

export const metadata = {
  title: 'DDC Dream Disect Create',
  description: "DDC Dream Disect Create — a director's studio for building AI music videos scene by scene, with real fal.ai video generation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
