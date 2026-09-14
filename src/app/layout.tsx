import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
export const metadata: Metadata = { title:{ default:"EVENT MANAGEMENT SYSTEM", template:"%s | EVENT MANAGEMENT SYSTEM" }, description:"チケット確保から実来場までを追跡するイベント運営管理システム", applicationName:"EVENT MANAGEMENT SYSTEM", manifest:"/manifest.webmanifest", appleWebApp:{ capable:true, statusBarStyle:"default", title:"Event Manager" } };
export const viewport: Viewport = { themeColor:"#0d766e", width:"device-width", initialScale:1 };
export default function RootLayout({ children }: Readonly<{ children:React.ReactNode }>) { return <html lang="ja"><body>{children}<ServiceWorkerRegistration /></body></html>; }
