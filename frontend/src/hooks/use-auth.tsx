import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { getToken } from "@/api/client"
import { login as apiLogin, logout as apiLogout, getMe } from "@/api/auth"

interface AuthState {
  username: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    getMe()
      .then((data) => setUsername(data.username))
      .catch(() => setUsername(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (user: string, pass: string) => {
    await apiLogin(user, pass)
    setUsername(user)
  }, [])

  const logout = useCallback(() => {
    apiLogout()
    setUsername(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        username,
        isAuthenticated: !!username,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
