import { authorizedFetch } from "@/api/httpClient";
import { config } from "@/lib/electron";

export interface PairedDevice {
  device_id?: string;
  device_id_1?: string;
  device_id_2?: string;
  device_name?: string;
  paired_at?: string;
  status?: string;
  firmware_version?: string;
  mac_address?: string;
  last_online?: string;
}

export interface PairedDevicesResponse {
  success: boolean;
  devices: PairedDevice[];
}

/**
 * Get all devices paired with the current user account.
 */
export async function getPairedDevices(): Promise<PairedDevice[]> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("Backend URL is not configured");
  }

  try {
    const response = await authorizedFetch(
      `${backendUrl}/devices/get_paired_devices`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
      {
        purpose: "check device pairing",
        retryOnAuthError: true,
      },
    );

    if (!response.ok) {
      let errorMessage = `Failed to get paired devices: ${response.statusText}`;
      try {
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          if (errorData?.detail) {
            errorMessage = errorData.detail;
          } else if (errorData?.message) {
            errorMessage = errorData.message;
          }
        } catch {}
      } catch {}
      throw new Error(errorMessage);
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error("Invalid JSON response from server");
    }

    if (Array.isArray(data)) {
      return data;
    }

    if (data.data && Array.isArray(data.data)) {
      return data.data;
    }

    if (data.success && Array.isArray(data.devices)) {
      return data.devices;
    }

    if (data.devices && Array.isArray(data.devices)) {
      return data.devices;
    }

    if (data.device_id) {
      return [data];
    }

    return [];
  } catch (error) {
    throw error;
  }
}

/**
 * Check if the current device (from DEVICE_ID env) is paired.
 */
export async function isCurrentDevicePaired(): Promise<boolean> {
  const deviceId = config.DEVICE_ID;
  if (!deviceId) {
    return false;
  }

  try {
    const devices = await getPairedDevices();
    return devices.some(
      (device) =>
        device.device_id === deviceId ||
        device.device_id_1 === deviceId ||
        device.device_id_2 === deviceId,
    );
  } catch (error: any) {
    return false;
  }
}

/**
 * Check if the user has any paired device.
 */
export async function hasAnyPairedDevice(): Promise<boolean> {
  try {
    const devices = await getPairedDevices();
    return devices.length > 0;
  } catch (error: any) {
    return false;
  }
}

/**
 * Verify if the authenticated user has a backend account.
 * Forces token refresh to avoid using stale tokens from previous users.
 */
export async function checkUserHasBackendAccount(): Promise<boolean> {
  const backendUrl = config.BACKEND_URL;
  if (!backendUrl) {
    return false;
  }

  try {
    const response = await authorizedFetch(
      `${backendUrl}/devices/get_paired_devices`,
      {
        method: "GET",
      },
      {
        purpose: "verify account",
        retryOnAuthError: false,
        forceRefresh: true,
      },
    );

    if (!response.ok) {
      return false;
    }

    const responseData = await response.json();
    const devices = responseData?.data || [];
    return Array.isArray(devices) && devices.length > 0;
  } catch (error: any) {
    return false;
  }
}
