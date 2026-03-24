import { Outlet } from "react-router-dom"
import { Navbar } from "./Navbar"
import { Toaster } from "@/components/ui/sonner"

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <Toaster richColors position="top-right" />
    </div>
  )
}
