import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CheckCircle2, XCircle } from "lucide-react"
import type { BatchConversionError } from "@/types"

interface BatchResultDialogProps {
  open: boolean
  onClose: () => void
  title: string
  successCount: number
  errors: BatchConversionError[]
}

export function BatchResultDialog({
  open,
  onClose,
  title,
  successCount,
  errors,
}: BatchResultDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {successCount > 0 && (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{successCount} job{successCount !== 1 ? "s" : ""} created successfully</span>
                </div>
              )}
              {errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>{errors.length} failed</span>
                  </div>
                  <div className="max-h-48 overflow-auto rounded border bg-destructive/5 p-2">
                    {errors.map((err, i) => (
                      <div key={i} className="border-b last:border-0 py-1.5 text-xs">
                        <span className="font-medium">
                          {err.ticker || err.document_id.slice(0, 8)}
                        </span>
                        {err.report_name && (
                          <span className="ml-1 text-muted-foreground truncate">
                            {err.report_name}
                          </span>
                        )}
                        <div className="mt-0.5 text-destructive">{err.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Close</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
