import { authorizedFetch } from "@/api/httpClient";
import { config } from "@/lib/electron";

export type TaskStatus = "pending" | "completed" | "archived";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  user_id: string;
  task_name: string;
  details?: string;
  owner?: string;
  owner_ids?: string[];
  due_date?: string;
  confidence_score?: number;
  quick_win?: boolean;
  source_memory_ids?: string[];
  associated_project_id?: string;
  status: TaskStatus;
  approval_status?: string;
  priority: TaskPriority;
  tags?: string[];
  ai_generated?: boolean;
  ai_generated_by?: string;
  estimated_time_minutes?: number;
  actual_time_minutes?: number;
  important: boolean;
  external_id?: string;
  source?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  archived_at?: string;
  memory_details?: Array<{
    id?: string;
    title?: string;
    created_at?: string;
  }>;
}

export interface MemoryTaskGroup {
  memory_id: string;
  memory_title?: string;
  memory_created_at?: string;
  tasks: Task[];
}

interface TasksResponse {
  success: boolean;
  data: {
    grouped_data: MemoryTaskGroup[];
    non_memory_tasks: Task[];
    pagination?: {
      next_cursor?: string | null;
      has_more?: boolean;
      page?: number;
      limit?: number;
      total?: number;
    };
  };
}

interface CreateTaskPayload {
  task_name: string;
  details?: string;
  priority?: TaskPriority;
  due_date?: string;
  tags?: string[];
  important?: boolean;
  source_memory_ids?: string[];
}

interface UpdateTaskPayload {
  id: string;
  task_name?: string;
  details?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  tags?: string[];
  important?: boolean;
  completed_at?: string;
}

/**
 * Fetches tasks grouped by memory or as standalone tasks.
 * Supports pagination and filtering by importance.
 */
export async function getTasks({
  page = 1,
  limit = 20,
  cursor,
  importantOnly,
}: {
  page?: number;
  limit?: number;
  cursor?: string;
  importantOnly?: boolean;
} = {}): Promise<{
  groupedTasks: MemoryTaskGroup[];
  nonMemoryTasks: Task[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const params = new URLSearchParams();

  if (importantOnly === true) {
    params.set("important_only", "true");
  } else {
    params.set("page", page.toString());
    params.set("limit", limit.toString());
    if (cursor) {
      params.set("cursor", cursor);
    }
  }

  const response = await authorizedFetch(
    `${backendUrl}/tasks/grouped?${params.toString()}`,
    undefined,
    { purpose: "view reminders" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch tasks: ${text || response.statusText}`);
  }

  const parsed = (await response.json()) as TasksResponse;
  if (!parsed.success) {
    throw new Error("Failed to load tasks.");
  }

  const pagination = parsed.data.pagination ?? {};
  return {
    groupedTasks: parsed.data.grouped_data ?? [],
    nonMemoryTasks: parsed.data.non_memory_tasks ?? [],
    nextCursor: pagination.next_cursor ?? null,
    hasMore: Boolean(pagination.has_more),
  };
}

/**
 * Creates a new task/reminder.
 */
export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/tasks/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    { purpose: "create reminders" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create task: ${text || response.statusText}`);
  }

  const parsed = await response.json();

  if (parsed.data && Array.isArray(parsed.data)) {
    return parsed.data[0];
  }
  return parsed;
}

/**
 * Updates task properties. Status updates use separate endpoint.
 */
export async function updateTask(payload: UpdateTaskPayload): Promise<Task> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const { id, status, ...body } = payload;

  if (status !== undefined) {
    const response = await authorizedFetch(
      `${backendUrl}/tasks/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task_ids: [id],
          status: status,
        }),
      },
      { purpose: "update reminders" },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to update task status: ${text || response.statusText}`,
      );
    }

    return {
      ...payload,
      id,
      status,
      updated_at: new Date().toISOString(),
    } as Task;
  }

  const response = await authorizedFetch(
    `${backendUrl}/tasks/?task_id=${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { purpose: "update reminders" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update task: ${text || response.statusText}`);
  }

  const parsed = await response.json();
  return parsed.data || parsed;
}

/**
 * Archives a task (soft delete).
 */
export async function deleteTask(taskId: string): Promise<void> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/tasks/archive`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task_ids: [taskId],
      }),
    },
    { purpose: "delete reminders" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete task: ${text || response.statusText}`);
  }
}

/**
 * Updates multiple tasks with the same changes in a single request.
 */
export async function bulkUpdateTasks(
  taskIds: string[],
  updates: Partial<UpdateTaskPayload>,
): Promise<Task[]> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/tasks/bulk-update`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task_ids: taskIds,
        updates,
      }),
    },
    { purpose: "update reminders" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to bulk update tasks: ${text || response.statusText}`,
    );
  }

  const parsed = await response.json();
  return parsed.data || parsed;
}

/**
 * Delete tasks by date range (for Today/Yesterday/Earlier sections).
 * Uses DELETE /tasks/range endpoint.
 */
export async function deleteTasksByDateRange({
  startDate,
  endDate,
  importantOnly = false,
}: {
  startDate: string;
  endDate: string;
  importantOnly?: boolean;
}): Promise<void> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/tasks/range`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        important_only: importantOnly,
      }),
    },
    { purpose: "delete reminders by date range" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to delete tasks by date range: ${text || response.statusText}`,
    );
  }
}
