export const TRANSFORM_PRESETS = {
    epochMillisToISO8601: "(v) => new Date(parseInt(v)).toISOString()",
    epochSecsToISO8601: "(v) => new Date(parseInt(v) * 1000).toISOString()",
    ISO8601ToEpochMillis: "(v) => new Date(v).getTime()",
    ISO8601ToEpochSecs: "(v) => Math.round(new Date(v).getTime() / 1000)",
} as const;

export const TRANSFORM_PRESET_LABELS: Record<
    keyof typeof TRANSFORM_PRESETS,
    string
> = {
    epochMillisToISO8601: "Epoch Ms to ISO 8601",
    epochSecsToISO8601: "Epoch Secs to ISO 8601",
    ISO8601ToEpochMillis: "ISO 8601 to Epoch Ms",
    ISO8601ToEpochSecs: "ISO 8601 to Epoch Secs",
};
