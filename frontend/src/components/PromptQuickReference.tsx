import { paramsFromConfig } from "@lib/compiler";
import { AppSelect } from "@/components/AppSelect";
import { configKeysToFix, promptPlaceholders, readPromptDraft, snakeConfigKey } from "@/util/params";
import { typeEmoji } from "@/util/format";

type Props = {
  raw: string;
  onParamType?: (key: string, type: "text" | "image") => void;
  onFix?: () => void;
};

/**
 * Lists the config values and components found in a prompt JSON document.
 *
 * @param props.raw - Prompt text or JSON from the editor
 * @param props.onParamType - Called when a text value is switched to an image, or back
 * @param props.onFix - Writes missing placeholders into the config
 */
const PromptQuickReference = ({ raw, onParamType, onFix }: Props) => {
  let body = <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>Paste a prompt. Its config values and components appear here.</p>;
  let missing: string[] = [];
  let roughKeys: string[] = [];
  let configError = "";
  const text = String(raw || "").trim();
  if (text) {
    const draft = readPromptDraft(text);
    const config = draft?.config || {};
    const paramTypes = draft?.paramTypes || {};
    const typedConfig = Object.fromEntries(Object.entries(config).map(([key, value]) => [
      key,
      paramTypes[key] ? { value, type: paramTypes[key] } : value
    ]));
    const params = paramsFromConfig(typedConfig, draft?.systemPrompt || "");
    const entries = Object.entries(config);
    const components = draft?.components || [];
    const covered = new Set<string>();
    for (const [key, value] of entries) {
      covered.add(key);
      const bare = String(value).replace(/^\{\{/, "").replace(/\}\}$/, "").trim();
      if (bare) covered.add(bare);
    }
    missing = promptPlaceholders(draft?.systemPrompt || "").filter((id) => !covered.has(id));
    roughKeys = configKeysToFix(text);
    configError = draft?.configError || "";
    if (!entries.length && !components.length && !missing.length) {
      body = <p style={{ color: "var(--faint)", margin: 0, fontSize: 13 }}>{draft?.configError || "No config values or components in this prompt yet."}</p>;
    } else {
      body = (
        <div className="qref-list">
          {entries.map(([key, value], index) => {
            const param = params[index];
            const level = param?.type === "image" || param?.type === "text" ? param.type : "";
            return (
              <div key={key} className="qref-row">
                {onParamType && level ? (
                  <AppSelect
                    size="sm"
                    className="w-[7.5rem] shrink-0"
                    value={level}
                    ariaLabel={`${key} parameter type`}
                    options={[{ value: "text", label: "Text" }, { value: "image", label: "Image" }]}
                    onChange={(next) => onParamType(key, next === "image" ? "image" : "text")}
                  />
                ) : (
                  <span className={`param-type-badge ${param?.type || ""}`}>{typeEmoji[param?.type || ""] || "·"} {param?.type || "value"}</span>
                )}
                <div>
                  <b>{key}</b>
                  <small>
                    {value || "(empty)"}
                    {snakeConfigKey(key) !== key ? ` · rename to ${snakeConfigKey(key)}` : ""}
                  </small>
                </div>
              </div>
            );
          })}
          {components.map((name, index) => (
            <div key={`${name}-${index}`} className="qref-row">
              <span className="param-type-badge">component</span>
              <div>
                <b>{name}</b>
                <small>Component</small>
              </div>
            </div>
          ))}
          {missing.map((id) => (
            <div key={id} className="qref-row">
              <span className="param-type-badge">{"{{ }}"}</span>
              <div>
                <b>{id}</b>
                <small>Placeholder in the prompt. It is not a config value yet.</small>
              </div>
            </div>
          ))}
        </div>
      );
    }
  }
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h2>Quick reference</h2>
        <span className="btn-row">
          {onFix && !configError && (missing.length > 0 || roughKeys.length > 0) ? <button className="btn small" type="button" onClick={onFix}>Fix</button> : null}
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{onParamType ? "Text can stay text, or switch to an image" : "From the prompt JSON"}</span>
        </span>
      </div>
      <div className="card-body">{body}</div>
    </div>
  );
};

export { PromptQuickReference };
