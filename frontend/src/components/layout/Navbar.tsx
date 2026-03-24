import { Link, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  Building2,
  FileText,
  Scan,
  RefreshCw,
  Brain,
  Settings,
  LogOut,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useTheme } from "@/hooks/use-theme"
import { withBase } from "@/api/client"
import { cn } from "@/lib/utils"

const navLinks = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/scrape-jobs", label: "Scrape Jobs", icon: Scan },
  { to: "/conversions", label: "Conversions", icon: RefreshCw },
  { to: "/knowledge", label: "Knowledge", icon: Brain },
  { to: "/settings", label: "Settings", icon: Settings },
]

export function Navbar() {
  const location = useLocation()
  const { logout } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6">
        <Link to="/" className="mr-6 flex items-center gap-2 font-semibold">
          <FileText className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">SSC Finance</span>
        </Link>

        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive =
              link.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(link.to)
            return (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <link.icon className="h-4 w-4" />
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <a
            href={withBase("/docs")}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden md:inline">API</span>
          </a>
          <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
