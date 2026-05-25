export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = "请求失败";
    let details = [];
    try {
      const payload = await response.json();
      message = payload.message || message;
      details = Array.isArray(payload.errors) ? payload.errors : [];
    } catch (error) {
      message = response.statusText || message;
    }
    const requestError = new Error(message);
    requestError.details = details;
    throw requestError;
  }
  return response.json();
}
