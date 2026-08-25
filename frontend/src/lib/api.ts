/**
 * API client — thin typed wrapper over fetch.
 *
 * Handles bearer-token injection and transparent refresh: on a 401 the client
 * exchanges the refresh token once and replays the original request. Concurrent
 * 401s share a single in-flight refresh so we never stampede /auth/refresh.
 */
import type {
  Channel,
  LoginResponse,
  Message,
  User,
  Workspace,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const USER_KEY = "user";

// ── Token storage ────────────────────────────────────────────────────
export const tokens = {
  get access() {
    return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
  },
  save(data: LoginResponse) {
    localStorage.setItem(ACCESS_KEY, data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  },
  cachedUser(): User | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Shared in-flight refresh, so N parallel 401s trigger exactly one refresh. */
let refreshInFlight: Promise<boolean> | null = null;

async function runRefresh(): Promise<boolean> {
  const refresh_token = tokens.refresh;
  if (!refresh_token) return false;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });
  if (!res.ok) return false;

  tokens.save((await res.json()) as LoginResponse);
  return true;
}

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    // FastAPI validation errors arrive as a list of {loc, msg, type}
    if (Array.isArray(detail) && detail.length) {
      return detail.map((d: { msg?: string }) => d.msg ?? "Invalid input").join(", ");
    }
    return res.statusText || `Request failed (${res.status})`;
  } catch {
    return res.statusText || `Request failed (${res.status})`;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Send as multipart/form-data instead of JSON. */
  form?: FormData;
  /** Internal — prevents infinite refresh recursion. */
  _retried?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, form, _retried, headers, ...rest } = opts;

  const finalHeaders: Record<string, string> = {
    ...((headers as Record<string, string>) ?? {}),
  };
  const access = tokens.access;
  if (access) finalHeaders.Authorization = `Bearer ${access}`;
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 && !_retried && tokens.refresh) {
    if (await refreshOnce()) {
      return request<T>(path, { ...opts, _retried: true });
    }
    tokens.clear();
    throw new ApiError("Session expired — please sign in again", 401);
  }

  if (!res.ok) throw new ApiError(await extractError(res), res.status);

  // 204 No Content
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}

// ── Endpoints ────────────────────────────────────────────────────────
export const api = {
  auth: {
    async login(email: string, password: string): Promise<LoginResponse> {
      // OAuth2PasswordRequestForm expects form-encoded `username` / `password`
      const form = new FormData();
      form.append("username", email);
      form.append("password", password);
      const data = await request<LoginResponse>("/auth/login", {
        method: "POST",
        form,
      });
      tokens.save(data);
      return data;
    },
    register(payload: {
      email: string;
      display_name: string;
      username?: string;
      password: string;
    }): Promise<User> {
      return request<User>("/auth/register", { method: "POST", body: payload });
    },
    me(): Promise<User> {
      return request<User>("/auth/me");
    },
    async logout(): Promise<void> {
      try {
        await request<void>("/auth/logout", { method: "POST" });
      } finally {
        tokens.clear();
      }
    },
  },

  workspaces: {
    list(): Promise<Workspace[]> {
      return request<Workspace[]>("/workspaces/");
    },
    create(payload: {
      name: string;
      slug: string;
      description?: string;
    }): Promise<Workspace> {
      return request<Workspace>("/workspaces/", { method: "POST", body: payload });
    },
  },

  channels: {
    list(workspaceId: string): Promise<Channel[]> {
      return request<Channel[]>(`/channels/workspace/${workspaceId}`);
    },
    create(payload: {
      workspace_id: string;
      name: string;
      description?: string;
      type?: string;
    }): Promise<Channel> {
      return request<Channel>("/channels/", { method: "POST", body: payload });
    },
    members(channelId: string): Promise<User[]> {
      return request<User[]>(`/channels/${channelId}/members`);
    },
    createDM(payload: {
      workspace_id: string;
      member_ids: string[];
    }): Promise<Channel> {
      return request<Channel>("/channels/dm", { method: "POST", body: payload });
    },
  },

  messages: {
    list(channelId: string, before?: string, limit = 50): Promise<Message[]> {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (before) qs.set("before", before);
      return request<Message[]>(`/messages/channel/${channelId}?${qs}`);
    },
    send(payload: {
      channel_id: string;
      content: string;
      thread_id?: string;
    }): Promise<Message> {
      return request<Message>("/messages/", { method: "POST", body: payload });
    },
    edit(messageId: string, content: string): Promise<Message> {
      return request<Message>(`/messages/${messageId}`, {
        method: "PATCH",
        body: { content },
      });
    },
    remove(messageId: string): Promise<void> {
      return request<void>(`/messages/${messageId}`, { method: "DELETE" });
    },
    react(messageId: string, emoji: string): Promise<{ action: string }> {
      return request<{ action: string }>(`/messages/${messageId}/react`, {
        method: "POST",
        body: { emoji },
      });
    },
  },

  users: {
    search(q = ""): Promise<User[]> {
      return request<User[]>(`/users/?q=${encodeURIComponent(q)}`);
    },
  },

  files: {
    upload(file: File): Promise<{ url?: string; name: string }> {
      const form = new FormData();
      form.append("file", file);
      return request<{ url?: string; name: string }>("/files/upload", {
        method: "POST",
        form,
      });
    },
  },
};
