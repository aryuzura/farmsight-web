
const API_BASE_URL = "http://127.0.0.1:8000";

export async function fetchApi(endpoint) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);

    if (!response.ok) {
      throw new Error(
        `Gagal mengambil ${endpoint}: HTTP ${response.status}`
      );
    }

    const data = await response.json();

    // Respons boleh berupa array atau objek JSON.
    if (
      data === null ||
      typeof data !== "object"
    ) {
      throw new Error(
        `Format respons ${endpoint} harus berupa array atau objek JSON`
      );
    }

    return data;
  } catch (error) {
    console.error(`Error pada ${endpoint}:`, error);
    throw error;
  }
}