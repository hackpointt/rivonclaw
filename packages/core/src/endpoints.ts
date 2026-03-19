// Cloud service base domains
export const API_BASE_URL = "https://api.rivonclaw.com";
export const API_BASE_URL_CN = "https://api.zhuazhuaai.cn";
export const TELEMETRY_URL = "https://t.rivonclaw.com/";
export const TELEMETRY_URL_CN = "https://t.zhuazhuaai.cn/";

/**
 * Return the API base URL for the given language/locale.
 * Overridable for staging/testing:
 *   - Node.js (Desktop): set env RIVONCLAW_API_BASE_URL
 *   - Browser (Panel):   call setApiBaseUrlOverride() at init time
 */
let _apiBaseUrlOverride: string | undefined;

/** Override the API base URL globally (call from Panel init to support staging). */
export function setApiBaseUrlOverride(url: string): void {
	_apiBaseUrlOverride = url;
}

export function getApiBaseUrl(lang: string): string {
	if (_apiBaseUrlOverride) return _apiBaseUrlOverride;
	const nodeOverride = typeof process !== "undefined" ? process.env.RIVONCLAW_API_BASE_URL : undefined;
	if (nodeOverride) return nodeOverride;
	return lang === "zh" ? API_BASE_URL_CN : API_BASE_URL;
}

/** Return the GraphQL endpoint URL for the given language/locale. */
export function getGraphqlUrl(lang: string): string {
	return `${getApiBaseUrl(lang)}/graphql`;
}

/** Return the telemetry endpoint URL for the given locale. */
export function getTelemetryUrl(locale: string): string {
	return locale === "zh" ? TELEMETRY_URL_CN : TELEMETRY_URL;
}
