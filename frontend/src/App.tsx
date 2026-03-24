import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/hooks/use-auth"
import { ThemeProvider } from "@/hooks/use-theme"
import { ProtectedRoute } from "@/components/layout/ProtectedRoute"
import { AppLayout } from "@/components/layout/AppLayout"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { CompaniesPage } from "@/pages/CompaniesPage"
import { CompanyDetailPage } from "@/pages/CompanyDetailPage"
import { DocumentsPage } from "@/pages/DocumentsPage"
import { DocumentDetailPage } from "@/pages/DocumentDetailPage"
import { ScrapeJobsPage } from "@/pages/ScrapeJobsPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { ConversionsPage } from "@/pages/ConversionsPage"
import { KnowledgeBasePage } from "@/pages/KnowledgeBasePage"
import { getBasename } from "@/api/client"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <BrowserRouter basename={getBasename()}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route path="/companies/:id" element={<CompanyDetailPage />} />
                  <Route path="/documents" element={<DocumentsPage />} />
                  <Route path="/documents/:id" element={<DocumentDetailPage />} />
                  <Route path="/scrape-jobs" element={<ScrapeJobsPage />} />
                  <Route path="/conversions" element={<ConversionsPage />} />
                  <Route path="/knowledge" element={<KnowledgeBasePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
