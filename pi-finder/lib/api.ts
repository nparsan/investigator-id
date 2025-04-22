import { type ApiResponse } from "./constants"

export async function fetchResults(
  zipCode: string,
  radius: number,
  indications: string[],
  page = 1,
  startYear?: number,
  endYear?: number,
): Promise<ApiResponse> {
  // Basic argument validation (client‑side)
  if (!/^[0-9]{5}$/.test(zipCode)) {
    throw new Error("Invalid ZIP code. Please enter a valid 5‑digit ZIP code.")
  }

  const params = new URLSearchParams({
    zip: zipCode,
    radius: String(radius),
    page: String(page),
  })

  if (indications.length) {
    params.set("indications", indications.join(","))
  }

  if (startYear) params.set("startYear", String(startYear))
  if (endYear) params.set("endYear", String(endYear))

  const res = await fetch(`/api/investigators?${params.toString()}`, {
    // You may tune cache options here if needed
    method: "GET",
  })

  // Handle HTTP‑level errors
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }

  // Parse successful response
  return (await res.json()) as ApiResponse
}
