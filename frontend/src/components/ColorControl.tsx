import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  parseColor
} from "@heroui/react";
import type { Param } from "@/types/app";
import { cn } from "@/util/cn";
import { nameForHex, normalizeHex, swatchesForParam } from "@/util/colors";

type Props = {
  param: Param;
  value: any;
  onChange: (v: string) => void;
  compact?: boolean;
};

/**
 * Turns a HeroUI color into a hex string the studio stores.
 *
 * @param color - Color from the picker or field
 */
const hexFrom = (color: { toString: (format: "hex") => string }) => color.toString("hex").toUpperCase();

/**
 * A hex field and a color area for one studio colour.
 *
 * @param props.param - Colour param
 * @param props.value - Current hex
 * @param props.onChange - Hex setter
 * @param props.compact - Hide the duplicate label when the parent already titles the control
 */
const ColorControl = ({ param: p, value: cur, onChange, compact }: Props) => {
  const swatches = swatchesForParam(p);
  const hex = normalizeHex(String(cur || p.defaultHex || ""));
  if (!hex) {
    return (
      <input
        className="color-hex-input"
        aria-label={`${p.label} hex`}
        placeholder="No colour in the prompt"
        value={String(cur || "")}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  const color = parseColor(hex);

  return (
    <div className={cn("color-control", compact && "color-control-compact")}>
      {compact ? null : (
        <div className="color-meta">
          <span className="color-label">{p.label}</span>
          <span className="color-name">{nameForHex(hex, swatches)}</span>
        </div>
      )}
      <ColorPicker
        value={color}
        onChange={(next) => {
          const value = hexFrom(next);
          if (value !== hex) onChange(value);
        }}
      >
        <ColorField aria-label={`${p.label} hex`} className="color-hex-field">
          <ColorField.Group>
            <ColorField.Prefix>
              <ColorPicker.Trigger aria-label={`Pick ${p.label}`} className="color-hex-chip">
                <ColorSwatch size="xs" />
              </ColorPicker.Trigger>
            </ColorField.Prefix>
            <ColorField.Input />
          </ColorField.Group>
        </ColorField>
        <ColorPicker.Popover className="color-pop">
          <ColorArea
            aria-label={`${p.label} area`}
            className="max-w-full"
            colorSpace="hsb"
            xChannel="saturation"
            yChannel="brightness"
          >
            <ColorArea.Thumb />
          </ColorArea>
          <ColorSlider channel="hue" className="w-full" colorSpace="hsb" aria-label="Hue">
            <ColorSlider.Track>
              <ColorSlider.Thumb />
            </ColorSlider.Track>
          </ColorSlider>
          <div className="color-channels">
            {(["red", "green", "blue"] as const).map((channel) => (
              <ColorField key={channel} aria-label={channel} channel={channel} colorSpace="rgb">
                <ColorField.Group>
                  <ColorField.Input />
                </ColorField.Group>
                <span className="color-channel-label">{channel[0].toUpperCase()}</span>
              </ColorField>
            ))}
          </div>
          <ColorSwatchPicker aria-label={`${p.label} swatches`}>
            {swatches.map((s) => (
              <ColorSwatchPicker.Item key={s.hex} color={s.hex} aria-label={s.name}>
                <ColorSwatchPicker.Swatch />
              </ColorSwatchPicker.Item>
            ))}
          </ColorSwatchPicker>
        </ColorPicker.Popover>
      </ColorPicker>
    </div>
  );
};

export { ColorControl };
