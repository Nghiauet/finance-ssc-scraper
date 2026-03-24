import { FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"

interface EmptyStateProps {
  title: string
  message: string
  actionLabel?: string
  actionTo?: string
}

export function EmptyState({ title, message, actionLabel, actionTo }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileQuestion className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {actionLabel && actionTo && (
        <Button asChild className="mt-4">
          <Link to={actionTo}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  )
}
