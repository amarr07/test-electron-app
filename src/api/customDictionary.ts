import { authorizedFetch } from "@/api/httpClient";
import { config } from "@/lib/electron";

export interface CustomDictionaryWord {
  id: string;
  user_id: string;
  corrected_phrase: string;
  original_phrase?: string | null;
  memory_id?: string | null;
  reason?: string | null;
  created_at: string;
  updated_at: string;
}

interface CustomDictionaryListResponse {
  success: boolean;
  data: CustomDictionaryWord[];
  error?: string;
  message?: string;
}

interface CustomDictionaryResponse {
  success: boolean;
  error?: string;
  message?: string;
}

interface CreateWordRequest {
  corrected_phrase: string;
  original_phrase?: string;
  memory_id?: string;
  reason?: string;
}

/**
 * Fetches all custom dictionary words, sorted alphabetically.
 */
export async function getCustomDictionaryWords(): Promise<
  CustomDictionaryWord[]
> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/memories/custom_dictionary`,
    undefined,
    { purpose: "get custom dictionary words" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to get custom dictionary words: ${text || response.statusText}`,
    );
  }

  const parsed = (await response.json()) as CustomDictionaryListResponse;
  if (!parsed.success) {
    throw new Error(parsed.error || "Failed to load custom dictionary words.");
  }

  const words = parsed.data || [];
  words.sort((a, b) =>
    a.corrected_phrase
      .toLowerCase()
      .localeCompare(b.corrected_phrase.toLowerCase()),
  );

  return words;
}

/**
 * Adds a new word/phrase to custom dictionary for transcription corrections.
 */
export async function addCustomDictionaryWord(
  correctedPhrase: string,
  options?: {
    originalPhrase?: string;
    memoryId?: string;
    reason?: string;
  },
): Promise<boolean> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const normalizedPhrase = correctedPhrase.trim();
  if (!normalizedPhrase) {
    throw new Error("Corrected phrase cannot be empty");
  }

  const requestBody: CreateWordRequest = {
    corrected_phrase: normalizedPhrase,
    original_phrase: options?.originalPhrase || "",
    memory_id: options?.memoryId || undefined,
    reason: options?.reason || undefined,
  };

  const response = await authorizedFetch(
    `${backendUrl}/memories/custom_dictionary`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
    { purpose: "add custom dictionary word" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to add word: ${text || response.statusText}`);
  }

  const parsed = (await response.json()) as CustomDictionaryResponse;
  return parsed.success === true;
}

/**
 * Deletes a custom dictionary word by ID.
 */
export async function deleteCustomDictionaryWord(
  wordId: string,
): Promise<boolean> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured.");
  }

  const response = await authorizedFetch(
    `${backendUrl}/memories/custom_dictionary/${wordId}`,
    {
      method: "DELETE",
    },
    { purpose: "delete custom dictionary word" },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete word: ${text || response.statusText}`);
  }

  const parsed = (await response.json()) as CustomDictionaryResponse;
  return parsed.success === true;
}
