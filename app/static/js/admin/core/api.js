export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = "请求失败";
    try {
      const payload = await response.json();
      message = payload.message || message;
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.json();
}
