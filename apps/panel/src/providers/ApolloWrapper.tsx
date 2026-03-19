import { useMemo, useEffect, useState } from "react";
import { ApolloProvider } from "@apollo/client/react";
import { useTranslation } from "react-i18next";
import { setApiBaseUrlOverride } from "@rivonclaw/core";
import { createApolloClient } from "../api/apollo-client.js";

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [ready, setReady] = useState(false);

  // Fetch API base URL from Desktop before creating Apollo client.
  // This allows RIVONCLAW_API_BASE_URL (staging) to propagate to the Panel.
  useEffect(() => {
    fetch("/api/app/api-base-url")
      .then(r => r.json())
      .then((data: { apiBaseUrl?: string }) => {
        if (data.apiBaseUrl) setApiBaseUrlOverride(data.apiBaseUrl);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const client = useMemo(
    () => ready ? createApolloClient(i18n.language) : null,
    [i18n.language, ready],
  );

  if (!client) return null;

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
