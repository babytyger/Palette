type ServerEvent = {
  event: string;
  data: any;
};

/**
 * Reads a server-sent event response and calls back for each event.
 *
 * @param response - Fetch response whose body is an event stream
 * @param onEvent - Called with each parsed event
 */
const readEventStream = async (response: Response, onEvent: (event: ServerEvent) => void) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("This browser cannot read the generation stream.");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      onEvent({ event, data: JSON.parse(dataLines.join("\n")) });
    }
  }
};

export { readEventStream };
