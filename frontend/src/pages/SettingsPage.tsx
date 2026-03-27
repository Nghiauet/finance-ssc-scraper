import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Trash2,
  Pencil,
  Zap,
  Star,
  Eye,
  Brain,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import {
  listLLMConfigs,
  createLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  testLLMConfig,
  testLLMEndpoint,
} from "@/api/llm-configs"
import type { LLMConfig } from "@/types"
import { toast } from "sonner"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function SettingsPage() {
  useDocumentTitle("Settings")
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<LLMConfig | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testingEndpoint, setTestingEndpoint] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [modelName, setModelName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [maxTokens, setMaxTokens] = useState("4096")
  const [configType, setConfigType] = useState("vision")
  const [embeddingDimension, setEmbeddingDimension] = useState("768")
  const [isDefault, setIsDefault] = useState(false)

  const { data: configs, isLoading } = useQuery({
    queryKey: ["llm-configs"],
    queryFn: () => listLLMConfigs(),
  })

  const createMutation = useMutation({
    mutationFn: createLLMConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] })
      closeDialog()
      toast.success("Configuration created")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateLLMConfig>[1] }) =>
      updateLLMConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] })
      closeDialog()
      toast.success("Configuration updated")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLLMConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llm-configs"] })
      toast.success("Configuration deleted")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => {
    setEditingConfig(null)
    setName("")
    setBaseUrl("")
    setModelName("")
    setApiKey("")
    setMaxTokens("4096")
    setConfigType("vision")
    setEmbeddingDimension("768")
    setIsDefault(false)
    setDialogOpen(true)
  }

  const openEdit = (config: LLMConfig) => {
    setEditingConfig(config)
    setName(config.name)
    setBaseUrl(config.base_url)
    setModelName(config.model_name)
    setApiKey("")
    setMaxTokens(String(config.max_tokens))
    setConfigType(config.config_type)
    setEmbeddingDimension(String(config.embedding_dimension || 768))
    setIsDefault(config.is_default)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingConfig(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const dimValue = configType === "embedding" ? parseInt(embeddingDimension) : null
    if (editingConfig) {
      updateMutation.mutate({
        id: editingConfig.id,
        data: {
          name,
          base_url: baseUrl,
          model_name: modelName,
          api_key: apiKey || undefined,
          max_tokens: parseInt(maxTokens),
          config_type: configType,
          embedding_dimension: dimValue,
          is_default: isDefault,
        },
      })
    } else {
      createMutation.mutate({
        name,
        base_url: baseUrl,
        model_name: modelName,
        api_key: apiKey,
        max_tokens: parseInt(maxTokens),
        config_type: configType,
        embedding_dimension: dimValue,
        is_default: isDefault,
      })
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const result = await testLLMConfig(id)
      if (result.ok) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed")
    } finally {
      setTestingId(null)
    }
  }

  const handleTestEndpoint = async () => {
    if (!baseUrl || !modelName || (!apiKey && !editingConfig)) {
      toast.error("Fill in Base URL, Model Name, and API Key to test")
      return
    }
    setTestingEndpoint(true)
    try {
      // For editing, if no new api_key provided, use a placeholder — backend needs the saved key
      // So for edit without new key, fall back to the saved config test
      if (editingConfig && !apiKey) {
        const result = await testLLMConfig(editingConfig.id)
        if (result.ok) {
          toast.success(result.message)
        } else {
          toast.error(result.message)
        }
      } else {
        const result = await testLLMEndpoint({
          base_url: baseUrl,
          model_name: modelName,
          api_key: apiKey,
          config_type: configType,
        })
        if (result.ok) {
          toast.success(result.message)
        } else {
          toast.error(result.message)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed")
    } finally {
      setTestingEndpoint(false)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage LLM configurations for document conversion and embeddings</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Configuration
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !configs?.length ? (
        <EmptyState
          title="No LLM configurations"
          message="Add an OpenAI-compatible LLM configuration to start converting documents."
        />
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Model</th>
                <th className="p-3 font-medium">Base URL</th>
                <th className="p-3 font-medium">Default</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((config) => (
                <tr key={config.id} className="border-b hover:bg-accent/50 transition-colors">
                  <td className="p-3 font-medium">{config.name}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      config.config_type === "vision"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}>
                      {config.config_type === "vision" ? <Eye className="h-3 w-3" /> : <Brain className="h-3 w-3" />}
                      {config.config_type}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {config.model_name}
                    {config.config_type === "embedding" && config.embedding_dimension && (
                      <span className="ml-1.5 text-xs text-muted-foreground/60">({config.embedding_dimension}d)</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate p-3 text-muted-foreground">{config.base_url}</td>
                  <td className="p-3">
                    {config.is_default && (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleTest(config.id)}
                        disabled={testingId === config.id}
                      >
                        {testingId === config.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(config)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        title="Delete configuration?"
                        description="This will permanently delete this LLM configuration."
                        confirmLabel="Delete"
                        onConfirm={() => deleteMutation.mutate(config.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? "Edit Configuration" : "Add Configuration"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-name">Name</Label>
              <Input
                id="cfg-name"
                placeholder="e.g. GPT-4o Vision"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-type">Type</Label>
              <Select value={configType} onValueChange={setConfigType}>
                <SelectTrigger id="cfg-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vision">Vision (PDF conversion)</SelectItem>
                  <SelectItem value="embedding">Embedding (RAG search)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-url">Base URL</Label>
              <Input
                id="cfg-url"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-model">Model Name</Label>
              <Input
                id="cfg-model"
                placeholder="e.g. gpt-4o"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-key">
                API Key {editingConfig && "(leave empty to keep current)"}
              </Label>
              <Input
                id="cfg-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required={!editingConfig}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-tokens">Max Tokens</Label>
              <Input
                id="cfg-tokens"
                type="number"
                min="256"
                max="128000"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>
            {configType === "embedding" && (
              <div className="space-y-1.5">
                <Label htmlFor="cfg-dim">Embedding Dimension</Label>
                <Input
                  id="cfg-dim"
                  type="number"
                  min="64"
                  max="8192"
                  value={embeddingDimension}
                  onChange={(e) => setEmbeddingDimension(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must match the model output dimension. Changing this requires re-embedding all documents.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="cfg-default"
                checked={isDefault}
                onCheckedChange={(v) => setIsDefault(!!v)}
              />
              <Label htmlFor="cfg-default" className="text-sm font-normal">
                Set as default for this type
              </Label>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={handleTestEndpoint}
                disabled={testingEndpoint}
                className="sm:mr-auto"
              >
                {testingEndpoint ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-1.5 h-4 w-4" />
                )}
                Test Endpoint
              </Button>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                {editingConfig ? "Save Changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
