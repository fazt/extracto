import type { Metadata } from "next";
import { Inter, Signika } from "next/font/google";
import "./globals.css";

// Workhorse de interfaz para etiquetas, campos y cifras.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// La marca, a la medida que dio el ranking del comp aprobado (cap 12,1px ≈ 17px).
const signika = Signika({
  variable: "--font-signika",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Extracto",
  description:
    "Sube una factura, un recibo o un contrato, corrige lo que el modelo leyó mal y pregúntale a tu archivo.",
};

// Se ejecuta antes de pintar: sin esto, el tema guardado llegaría tarde y la
// pantalla daría un fogonazo claro antes de oscurecerse.
const TEMA_INICIAL = `try{var t=localStorage.getItem("extracto:tema");document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${signika.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
