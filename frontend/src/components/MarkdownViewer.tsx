import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Copy, Check, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface MarkdownViewerProps {
  content: string
  fileName?: string
}

export function MarkdownViewer({ content, fileName }: MarkdownViewerProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    toast.success("Copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = fileName || "document.md"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border bg-background p-6 overflow-auto max-h-[75vh]">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </div>
    </div>
  )
}
