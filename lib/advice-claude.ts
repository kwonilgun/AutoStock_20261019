/** 오늘 자문의 Claude Messages 본문. 서버 키와 브라우저 키가 같은 필드를 쓴다. */
export function claudeAdviceBody(model: string, system: string, user: string) {
  return {
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: "user" as const, content: user }],
  };
}

/** 브라우저에서 Anthropic을 직접 부를 때 필요한 헤더. 키는 이 객체에만 담는다. */
export function browserClaudeHeaders(apiKey: string, workspaceId: string, version = "2023-06-01"): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": version,
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (workspaceId) headers["anthropic-workspace-id"] = workspaceId;
  return headers;
}
