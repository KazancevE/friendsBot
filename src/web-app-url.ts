/** Bump when miniapp/admin static assets change to bust Telegram WebView cache. */
export const WEB_APP_CACHE_VERSION = "20260830";

export const miniAppUrl = (publicUrl: string) => {
  const origin = publicUrl.replace(/\/$/, "");
  return `${origin}/app/?v=${WEB_APP_CACHE_VERSION}`;
};

export const adminAppUrl = (publicUrl: string) => {
  const origin = publicUrl.replace(/\/$/, "");
  return `${origin}/admin/?v=${WEB_APP_CACHE_VERSION}`;
};
